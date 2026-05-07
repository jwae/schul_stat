<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import apiClient from "../services/apiClient";
import HelpOverlay from "./HelpOverlay.vue";

interface Props {
  managementToken?: string;
  isManagementSessionActive?: boolean;
  schoolSources?: any[];
  snapshots?: any[];
  terms?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  managementToken: "",
  isManagementSessionActive: false,
  schoolSources: () => [],
  snapshots: () => [],
  terms: () => [],
});

const emit = defineEmits<{
  (e: "bootstrap-updated", data: any): void;
  (e: "feedback", data: any): void;
}>();

const sortKey = ref<string>("school_name");
const sortDirection = ref<string>("asc");
const selectedSnapshotKey = ref<string>("");
const savePreviewLog = ref<boolean>(false);
const managementSaving = ref<boolean>(false);
const currentActionType = ref<string>("");
const currentActionLabel = ref<string>("");
const currentProcessingSchool = ref<string>("");
const currentCompletedSources = ref<number>(0);
const currentTotalSources = ref<number>(0);
const importAbortRequested = ref<boolean>(false);
const awaitingFreshImportProgress = ref<boolean>(false);
let previewProgressTimerId: any = null;
const currentTestStatusBySourceId = reactive<Record<number, { server_status: string; db_status: string }>>({});
const checkedSchoolBySourceId = reactive<Record<number, boolean>>({});
const infoDialogOpen = ref<boolean>(false);
const infoDialogTitle = ref<string>("");
const infoDialogBody = ref<string>("");
const helpOverlayOpen = ref<boolean>(false);
const helpOverlayItems: string[] = [
  "Hier werden die Schulen eines Snapshots geprueft und ihre Statistikdaten importiert.",
  "Verbindungen testen prueft die angehakten Schulen und faerbt danach die Punkte bei Online und DB.",
  "Daten holen verarbeitet die angehakten Schulen mit gruener Server- und DB-Anzeige.",
  "Lehrerdaten holen importiert die Lehrerinformationen fuer die ausgewaehlten Schulen.",
];

const currentSchoolYearLabel = computed<string>(() => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month >= 2 && month <= 7) return `${year - 1}.02`;
  if (month === 1) return `${year - 1}.01`;
  return `${year}.01`;
});

const derivedSnapshotDate = computed<string>(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
});

const snapshotOptions = computed<any[]>(() => {
  const options: any[] = [];
  const seen = new Set<string>();

  for (const snapshot of props.snapshots) {
    const key = snapshotGroupKey(snapshot);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      snap_id: String(snapshot?.snap_id || "").trim(),
      label: formatSnapshotOptionLabel(snapshot),
      term_id: Number(snapshot?.term_id || 0),
      snapshot_date: String(snapshot?.snapshot_date || "").trim(),
      source: String(snapshot?.source || "").trim(),
    });
  }

  return options.sort((a, b) => String(a.label).localeCompare(String(b.label), "de", { numeric: true }));
});

const canAbortCurrentImport = computed<boolean>(() => {
  return managementSaving.value && currentActionType.value === "snapshot-import";
});

const isSnapshotImportOverlay = computed<boolean>(() => currentActionType.value === "snapshot-import");

const overlayTitle = computed<string>(() =>
  isSnapshotImportOverlay.value
    ? (
      String(currentActionLabel.value || "").toLowerCase().includes("lehrer")
        ? "Lehrerdaten importieren."
        : "Schuelerdaten importieren."
    )
    : "Bitte warten...",
);

const overlayBody = computed<string>(() =>
  isSnapshotImportOverlay.value
    ? (currentProcessingSchool.value || currentActionLabel.value || "Vorgang laeuft...")
    : (currentActionLabel.value || "Vorgang laeuft..."),
);

const overlayProgressCounter = computed<string>(() => {
  if (!isSnapshotImportOverlay.value || currentTotalSources.value <= 0) return "";
  const currentSchoolNumber = Math.min(currentCompletedSources.value + 1, currentTotalSources.value);
  return `Schule ${currentSchoolNumber} / ${currentTotalSources.value}`;
});

const overlayProgressPercent = computed<number>(() => {
  if (!isSnapshotImportOverlay.value || currentTotalSources.value <= 0) return 0;
  const activeOffset = currentProcessingSchool.value ? 1 : 0;
  const progressed = Math.max(
    0,
    Math.min(currentCompletedSources.value + activeOffset, currentTotalSources.value),
  );
  return Math.max(0, Math.min(100, Math.round((progressed / currentTotalSources.value) * 100)));
});

const sortedSchoolSources = computed<any[]>(() => {
  const factor = sortDirection.value === "desc" ? -1 : 1;

  return props.schoolSources
    .filter((source) => {
      const snr = String(source?.snr || "").trim();
      if (!snr) return false;
      if (!selectedSnapshotKey.value) return false;
      return selectedSnapshotRecordCountBySnr.value.has(snr) || selectedSnapshotImportedAtBySnr.value.has(snr);
    })
    .sort((a, b) => {
      const aValue = sortableValue(a, sortKey.value);
      const bValue = sortableValue(b, sortKey.value);

      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * factor;
      }

      return String(aValue).localeCompare(String(bValue), "de", { numeric: true }) * factor;
    });
});

const selectedSnapshotRecordCountBySnr = computed<Map<string, number>>(() => {
  const key = String(selectedSnapshotKey.value || "").trim();
  if (!key) return new Map<string, number>();

  const counts = new Map<string, number>();
  for (const snapshot of props.snapshots) {
    if (snapshotGroupKey(snapshot) !== key) continue;
    const snr = String(snapshot?.snr || "").trim();
    if (!snr) continue;
    counts.set(snr, Number(snapshot?.record_count || 0));
  }
  return counts;
});

const selectedSnapshotImportedAtBySnr = computed<Map<string, string | null>>(() => {
  const key = String(selectedSnapshotKey.value || "").trim();
  if (!key) return new Map<string, string | null>();

  const values = new Map<string, string | null>();
  for (const snapshot of props.snapshots) {
    if (snapshotGroupKey(snapshot) !== key) continue;
    const snr = String(snapshot?.snr || "").trim();
    if (!snr) continue;
    values.set(snr, snapshot?.imported_at || null);
  }
  return values;
});

const selectedSnapshotTeacherCountBySnr = computed<Map<string, number>>(() => {
  const key = String(selectedSnapshotKey.value || "").trim();
  if (!key) return new Map<string, number>();

  const counts = new Map<string, number>();
  for (const snapshot of props.snapshots) {
    if (snapshotGroupKey(snapshot) !== key) continue;
    const snr = String(snapshot?.snr || "").trim();
    if (!snr) continue;
    counts.set(snr, Number(snapshot?.teacher_count || 0));
  }
  return counts;
});

function sortableValue(source: any, key: string): string | number {
  if (key === "db_port") return Number(source?.db_port || 0);
  if (key === "record_count") return Number(selectedSnapshotRecordCountBySnr.value.get(String(source?.snr || "").trim()) || 0);
  if (key === "teacher_count") return Number(selectedSnapshotTeacherCountBySnr.value.get(String(source?.snr || "").trim()) || 0);
  if (key === "imported_at") return String(selectedSnapshotImportedAtBySnr.value.get(String(source?.snr || "").trim()) || "").trim().toLowerCase();
  if (key === "server_status") return statusRank(getServerStatus(source));
  if (key === "db_status") return statusRank(getDatabaseStatus(source));
  return String(source?.[key] || "").trim().toLowerCase();
}

function recordCountForSource(source: any): number {
  return Number(selectedSnapshotRecordCountBySnr.value.get(String(source?.snr || "").trim()) || 0);
}

function teacherCountForSource(source: any): number {
  return Number(selectedSnapshotTeacherCountBySnr.value.get(String(source?.snr || "").trim()) || 0);
}

function importedAtForSource(source: any): string | null {
  return selectedSnapshotImportedAtBySnr.value.get(String(source?.snr || "").trim()) || null;
}

function isSourceChecked(source: any): boolean {
  const sourceId = Number(source?.source_id || 0);
  if (!sourceId) return false;
  return checkedSchoolBySourceId[sourceId] !== false;
}

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }

  sortKey.value = key;
  sortDirection.value = "asc";
}

function sortIndicator(key: string): string {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? "▲" : "▼";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE");
}

function statusLabel(isActive: boolean): string {
  return isActive ? "Aktiv" : "Inaktiv";
}

function getServerStatus(source: any): string {
  const sourceId = Number(source?.source_id || 0);
  if (!sourceId) return "unknown";
  return currentTestStatusBySourceId[sourceId]?.server_status || "unknown";
}

function getDatabaseStatus(source: any): string {
  const sourceId = Number(source?.source_id || 0);
  if (!sourceId) return "unknown";
  return currentTestStatusBySourceId[sourceId]?.db_status || "unknown";
}

function statusRank(status: string): number {
  if (status === "online") return 2;
  if (status === "offline") return 1;
  return 0;
}

function statusDotClass(status: string): string {
  if (status === "online") return "is-online";
  if (status === "offline") return "is-offline";
  return "is-unknown";
}

function statusDotLabel(status: string, scope: string): string {
  if (scope === "Online") {
    if (status === "online") return "Server online";
    if (status === "offline") return "Server offline";
    return "Server noch nicht getestet";
  }

  if (status === "online") return "DB online";
  if (status === "offline") return "DB offline";
  return "DB noch nicht getestet";
}

function emitFeedback(error: string = "", notice: string = "") {
  emit("feedback", { error, notice });
}

function openHelpOverlay() {
  helpOverlayOpen.value = true;
}

function closeHelpOverlay() {
  helpOverlayOpen.value = false;
}

function managementAuthHeaders() {
  return props.managementToken
    ? { Authorization: `Bearer ${props.managementToken}` }
    : {};
}

async function fetchManagementBootstrap(): Promise<any> {
  const resp = await apiClient.get("/api/auth/admin/bootstrap", {
    headers: managementAuthHeaders(),
  });
  return resp.data || {};
}

function setCurrentTestStatus(sourceId: number | string, serverStatus: string = "unknown", dbStatus: string = "unknown") {
  const id = Number(sourceId || 0);
  if (!id) return;
  currentTestStatusBySourceId[id] = {
    server_status: String(serverStatus || "unknown").trim() || "unknown",
    db_status: String(dbStatus || "unknown").trim() || "unknown",
  };
}

function clearObsoleteCurrentStatuses(sources: any[]) {
  const activeIds = new Set((sources || []).map((source) => Number(source?.source_id || 0)).filter(Boolean));
  for (const key of Object.keys(currentTestStatusBySourceId)) {
    if (!activeIds.has(Number(key))) {
      delete currentTestStatusBySourceId[Number(key)];
    }
  }
}

function clearCurrentTestStatuses() {
  for (const key of Object.keys(currentTestStatusBySourceId)) {
    delete currentTestStatusBySourceId[Number(key)];
  }
}

function openInfoDialog(title: string, payload: any) {
  infoDialogTitle.value = String(title || "JSON-Info").trim() || "JSON-Info";
  infoDialogBody.value = typeof payload === "string"
    ? payload
    : JSON.stringify(payload, null, 2);
  infoDialogOpen.value = true;
}

function closeInfoDialog() {
  infoDialogOpen.value = false;
  infoDialogTitle.value = "";
  infoDialogBody.value = "";
}

function shortenSchoolName(value: string | null | undefined, maxLength: number = 20): string {
  const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
}

function studentStatusLabel(value: string | number | null | undefined): string {
  const normalized = String(value ?? "").trim();
  const labels: Record<string, string> = {
    "0": "Aufnahme",
    "1": "Warteliste",
    "2": "Aktiv",
    "3": "Beurlaubt",
    "6": "Extern",
    "8": "Abschluss",
    "9": "Abgang",
  };
  return labels[normalized] || `Status ${normalized || "-"}`;
}

function formatProcessingSchoolLabel(snr: string | null | undefined, schoolName: string | null | undefined): string {
  const normalizedSnr = String(snr || "").trim();
  const shortenedSchoolName = shortenSchoolName(schoolName, 20);
  if (normalizedSnr && shortenedSchoolName) {
    return `${normalizedSnr} - ${shortenedSchoolName}`;
  }
  if (normalizedSnr) return normalizedSnr;
  return shortenedSchoolName;
}

async function loadPreviewProgress() {
  try {
    const resp = await apiClient.get(
      "/api/auth/admin/snapshot-students/preview-school-year/progress",
      { headers: managementAuthHeaders() },
    );
    const data = resp.data || {};
    if (!data.active) return;
    const action = String(data.action || "").trim() || "Vorgang laeuft...";
    const school = String(data.current_school || "").trim();
    const snr = String(data.current_snr || "").trim();
    const completedSources = Number(data.completed_sources || 0);
    const totalSources = Number(data.total_sources || 0);

    if (
      awaitingFreshImportProgress.value &&
      totalSources > 0 &&
      completedSources >= totalSources
    ) {
      return;
    }

    awaitingFreshImportProgress.value = false;
    importAbortRequested.value = !!data.abort_requested;
    currentCompletedSources.value = completedSources;
    currentTotalSources.value = totalSources;
    currentProcessingSchool.value = formatProcessingSchoolLabel(snr, school);
    currentActionLabel.value = action;
  } catch {
    // Fortschrittsanzeige ist rein informativ.
  }
}

function stopPreviewProgressPolling() {
  if (!previewProgressTimerId) return;
  clearInterval(previewProgressTimerId);
  previewProgressTimerId = null;
}

function startPreviewProgressPolling() {
  stopPreviewProgressPolling();
  currentProcessingSchool.value = "";
  importAbortRequested.value = false;
  loadPreviewProgress();
  previewProgressTimerId = setInterval(() => {
    loadPreviewProgress();
  }, 1000);
}

function formatMappedValue(mapping: any, idKey: string, labelKey: string, codeKey: string): string {
  if (!mapping || typeof mapping !== "object") return "-";
  const internalId = mapping[idKey];
  const label = String(mapping[labelKey] || "").trim();
  const code = String(mapping[codeKey] || "").trim();
  if (!internalId) return `nicht zugeordnet (extern: ${String(mapping.external_id || "-").trim() || "-"})`;
  const parts = [`${internalId}`];
  if (label) parts.push(label);
  if (code) parts.push(`[${code}]`);
  return parts.join(" | ");
}

function formatReligionLine(religion: any): string {
  if (!religion || typeof religion !== "object") return "Religion: -";
  const externalId = String(religion.external_id || "-").trim() || "-";
  const externalCode = String(religion?.external_entry?.code || "-").trim() || "-";
  return `Religion: extern ID ${externalId} | statistikKrz ${externalCode} -> intern ${formatMappedValue(religion, "religion_id", "name", "asd")}`;
}

function formatSupportFocusLine(label: string, focus: any): string {
  if (!focus || typeof focus !== "object") return `${label}: -`;
  const externalId = String(focus.external_id || "-").trim() || "-";
  if (externalId === "-") return `${label}: Nein`;
  const externalCode = String(focus?.external_entry?.code || "-").trim() || "-";
  return `${label}: extern ID ${externalId} | statistikKrz ${externalCode} -> intern ${formatMappedValue(focus, "support_focus_id", "name", "asd")}`;
}

function formatNationLine(nation: any): string {
  if (!nation || typeof nation !== "object") return "Nation: -";
  const externalId = String(nation.external_id || "-").trim() || "-";
  const externalCode = String(nation?.external_entry?.code || "-").trim() || "-";
  return `Nation: extern ID ${externalId} | kuerzel ${externalCode} -> intern ${formatMappedValue(nation, "nation_id", "label", "code")}`;
}

function hasUnmappedStudentData(student: any): boolean {
  const religionUnmapped = Boolean(
    String(student?.religion?.external_id || "").trim() &&
    !Number(student?.religion?.religion_id || 0),
  );
  const nationUnmapped = Boolean(
    String(student?.nation?.external_id || "").trim() &&
    !Number(student?.nation?.nation_id || 0),
  );
  const focus1Unmapped = Boolean(
    String(student?.support_focus1?.external_id || "").trim() &&
    !Number(student?.support_focus1?.support_focus_id || 0),
  );
  const focus2Unmapped = Boolean(
    String(student?.support_focus2?.external_id || "").trim() &&
    !Number(student?.support_focus2?.support_focus_id || 0),
  );
  return religionUnmapped || nationUnmapped || focus1Unmapped || focus2Unmapped;
}

function formatSchoolYearPreviewReport(data: any): string {
  const lines: string[] = [];
  lines.push(`Snapshot-Datum: ${String(data?.snapshot_date || "-").trim() || "-"}`);
  lines.push(`Schuljahr: ${String(data?.term?.label || "-").trim() || "-"}`);
  lines.push(`Schulen: ${Number(data?.total_sources || 0)}`);
  lines.push(`Schueler gesamt: ${Number(data?.total_students || 0)}`);
  if (data?.log_saved) {
    lines.push(`Log-Ordner: ${String(data?.log_directory || "-").trim() || "-"}`);
    for (const file of Array.isArray(data?.log_files) ? data.log_files : []) {
      lines.push(`Log-Datei: ${String(file?.file_name || "-").trim() || "-"} | ${String(file?.path || "-").trim() || "-"}`);
    }
  }

  for (const source of Array.isArray(data?.sources) ? data.sources : []) {
    lines.push("");
    lines.push("=".repeat(72));
    lines.push(`Schule: ${String(source?.school_name || "-").trim() || "-"} | SNR ${String(source?.snr || "-").trim() || "-"}`);
    lines.push(`Quelle: ${String(source?.db_name || "-").trim() || "-"} | Abschnitt: ${String(source?.external_section_id || "-").trim() || "-"}`);
    lines.push(`Klassen: ${Number(source?.total_classes || 0)} | Schueler: ${Number(source?.total_students || 0)}`);

    const classes = Array.isArray(source?.classes) ? source.classes : [];
    if (classes.length) {
      lines.push(`Klassenliste: ${classes.map((entry: any) => `${entry.class_code} (Jg ${entry.grade})`).join(", ")}`);
    }

    const students = Array.isArray(source?.students) ? source.students : [];
    for (const student of students) {
      const marker = hasUnmappedStudentData(student) ? "[NICHT ZUGEORDNET] " : "";
      lines.push("");
      lines.push(`- ${marker}${String(student?.full_name || "-").trim() || "-"} | ID ${Number(student?.student_no || 0) || "-"}`);
      lines.push("  Quelldaten:");
      lines.push(`    Klasse: ${String(student?.class_code || "-").trim() || "-"} | Jahrgang: ${String(student?.grade || "-").trim() || "-"}`);
      lines.push(`    Geschlecht: ${String(student?.geschlecht || "-").trim() || "-"}`);
      lines.push(`    Klassenart: ${String(student?.klassenart || "-").trim() || "-"}`);
      lines.push(`    Schulgliederung: ${String(student?.schulgliederung || "-").trim() || "-"}`);
      lines.push(`    Fehlstunden gesamt: ${student?.fehlstunden_gesamt ?? "-"}`);
      lines.push(`    Migration: ${Number(student?.migration || 0) === 1 ? "ja" : "nein"} | Zieldifferent: ${Number(student?.target_different || 0) === 1 ? "ja" : "nein"}`);
      lines.push(`    ${formatReligionLine(student?.religion)}`);
      lines.push(`    ${formatNationLine(student?.nation)}`);
      lines.push(`    ${formatSupportFocusLine("Foerderschwerpunkt 1", student?.support_focus1)}`);
      lines.push(`    ${formatSupportFocusLine("Foerderschwerpunkt 2", student?.support_focus2)}`);
      lines.push("  Zieldaten:");
      lines.push(`    class_id: ${String(student?.class_code || "-").trim() || "-"} -> wird ueber class.class_code gemappt`);
      lines.push(`    school_form_id: ${student?.school_form_id ?? "-"}`);
      lines.push(`    education_track_id: ${student?.education_track_id ?? "-"}`);
      lines.push(`    sex_id: ${student?.sex_id ?? "-"}`);
      lines.push(`    ef: ${Number(student?.ef || 0) === 1 ? "ja" : "nein"} | special_needs: ${Number(student?.special_needs || 0) === 1 ? "ja" : "nein"}`);
      lines.push(`    religion_id: ${student?.religion?.religion_id ?? "-"}`);
      lines.push(`    nation_id: ${student?.nation?.nation_id ?? "-"}`);
      lines.push(`    support_focus1_id: ${student?.support_focus1?.support_focus_id ?? "-"}`);
      lines.push(`    support_focus2_id: ${student?.support_focus2?.support_focus_id ?? "-"}`);
    }
  }

  return lines.join("\n");
}

function snapshotGroupKey(snapshot: any): string {
  const snapId = String(snapshot?.snap_id || "").trim();
  if (snapId) return snapId;
  const termId = Number(snapshot?.term_id || 0);
  const snapshotDate = String(snapshot?.snapshot_date || "").trim();
  const source = String(snapshot?.source || "").trim();
  if (!termId || !snapshotDate) return "";
  return `${termId}__${snapshotDate}__${source}`;
}

function formatSnapshotOptionLabel(snapshot: any): string {
  const snapId = String(snapshot?.snap_id || "").trim();
  const schoolYear = Number(snapshot?.school_year || 0);
  const termNo = Number(snapshot?.term_no || 0);
  const snapshotDate = String(snapshot?.snapshot_date || "").trim() || "-";
  const info = String(snapshot?.info || "").trim();
  const source = String(snapshot?.source || "").trim();
  const baseLabel = `${schoolYear}.${String(termNo).padStart(2, "0")} - ${snapshotDate}${snapId ? ` (ID ${snapId})` : ""}`;
  if (info && source && info !== source) return `${baseLabel} - ${info}`;
  if (info) return `${baseLabel} - ${info}`;
  if (source) return `${baseLabel} - ${source}`;
  return baseLabel;
}

function findSelectedSnapshot(): any | null {
  const key = String(selectedSnapshotKey.value || "").trim();
  if (!key) return null;

  const option = snapshotOptions.value.find((entry) => entry.key === key) || null;
  if (!option) return null;

  const term = props.terms.find((entry) => Number(entry?.term_id || 0) === Number(option.term_id || 0)) || null;
  return {
    key: option.key,
    snap_id: String(option.snap_id || "").trim(),
    label: String(option.label || "").trim(),
    term_id: Number(option.term_id || 0),
    snapshot_date: String(option.snapshot_date || "").trim(),
    source: String(option.source || "").trim(),
    term,
  };
}

function buildSnapshotPreviewPayload(): any {
  const selectedSnapshot = findSelectedSnapshot();
  const snapshotSources = props.schoolSources.filter((source) => {
    const snr = String(source?.snr || "").trim();
    if (!snr) return false;
    if (!selectedSnapshotKey.value) return false;
    return selectedSnapshotRecordCountBySnr.value.has(snr) || selectedSnapshotImportedAtBySnr.value.has(snr);
  });

  return {
    term: selectedSnapshot?.term
      ? {
          term_id: Number(selectedSnapshot.term.term_id || 0),
          label: String(selectedSnapshot.term.label || "").trim(),
          school_year: Number(selectedSnapshot.term.school_year || 0),
          term_no: Number(selectedSnapshot.term.term_no || 0),
        }
      : null,
    snapshot_date: String(selectedSnapshot?.snapshot_date || "").trim() || derivedSnapshotDate.value,
    info: String(selectedSnapshot?.source || "").trim(),
    schools: snapshotSources.map((source: any) => ({
      snr: String(source?.snr || "").trim(),
    })),
  };
}

watch(
  snapshotOptions,
  (options) => {
    if (!options.length) {
      selectedSnapshotKey.value = "";
      return;
    }
    if (options.some((option) => option.key === selectedSnapshotKey.value)) return;
    selectedSnapshotKey.value = options[0].key;
  },
  { immediate: true },
);

watch(selectedSnapshotKey, () => {
  clearCurrentTestStatuses();
});

watch(
  () => props.schoolSources,
  (sources) => {
    const activeIds = new Set<number>();
    for (const source of Array.isArray(sources) ? sources : []) {
      const sourceId = Number(source?.source_id || 0);
      if (!sourceId) continue;
      activeIds.add(sourceId);
      if (!(sourceId in checkedSchoolBySourceId)) {
        checkedSchoolBySourceId[sourceId] = true;
      }
    }
    for (const key of Object.keys(checkedSchoolBySourceId)) {
      if (!activeIds.has(Number(key))) {
        delete checkedSchoolBySourceId[Number(key)];
      }
    }
  },
  { immediate: true },
);

watch(
  () => props.schoolSources,
  (sources) => {
    clearObsoleteCurrentStatuses(sources);
  },
  { immediate: true },
);

async function handleConnectionTest(source: any) {
  if (!source?.source_id) return;

  managementSaving.value = true;
  currentActionType.value = "generic";
  currentActionLabel.value = "Verbindung wird getestet...";
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      `/api/auth/admin/school-sources/${source.source_id}/test`,
      {},
      { headers: managementAuthHeaders() },
    );
    setCurrentTestStatus(source.source_id, resp.data?.server_status, resp.data?.db_status);
    emit("bootstrap-updated", resp.data?.bootstrap || {});
    emitFeedback("", resp.data?.message || "Verbindung erfolgreich getestet.");
  } catch (e: any) {
    setCurrentTestStatus(source.source_id, "offline", "unknown");
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Der Verbindungstest ist fehlgeschlagen.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionType.value = "";
    currentActionLabel.value = "";
  }
}

async function handleConnectionTestAll() {
  const selectedSourceIds = sortedSchoolSources.value
    .filter((source) => isSourceChecked(source) && Number(source?.source_id || 0) > 0)
    .map((source) => Number(source.source_id || 0));

  if (!selectedSourceIds.length) {
    emitFeedback("Es wurden keine angehakten Schulen im Snapshot gefunden.", "");
    return;
  }

  managementSaving.value = true;
  currentActionType.value = "generic";
  currentActionLabel.value = "Ich teste, ob der SVWS-Server und die DB der angehakten Schulen erreichbar ist.";
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/school-sources/test-all",
      {
        source_ids: selectedSourceIds,
      },
      { headers: managementAuthHeaders() },
    );
    for (const result of Array.isArray(resp.data?.results) ? resp.data.results : []) {
      setCurrentTestStatus(result?.source_id, result?.server_status, result?.db_status);
    }
    emit("bootstrap-updated", resp.data?.bootstrap || {});
    emitFeedback("", resp.data?.message || "Verbindungstests abgeschlossen.");
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Verbindungstests sind fehlgeschlagen.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionType.value = "";
    currentActionLabel.value = "";
  }
}

async function handleClassesInfo(source: any) {
  if (!source?.source_id) return;

  managementSaving.value = true;
  currentActionType.value = "generic";
  currentActionLabel.value = "Schueler-Informationen werden geladen...";
  emitFeedback("", "");

  try {
    const resp = await apiClient.get(
      `/api/auth/admin/school-sources/${source.source_id}/classes-preview`,
      { headers: managementAuthHeaders() },
    );
    const label = String(source?.school_name || source?.snr || "Schueler").trim();
    openInfoDialog(`${label} - Schueler JSON`, resp.data?.payload ?? {});
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Schueler-JSON konnte nicht geladen werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionType.value = "";
    currentActionLabel.value = "";
  }
}

async function handleSnapshotCreateAll() {
  const selectedSnapshot = findSelectedSnapshot();
  if (!selectedSnapshot?.term_id) {
    emitFeedback("Bitte zuerst einen Snapshot auswaehlen.", "");
    return;
  }

  const payload = buildSnapshotPreviewPayload();
  if (!payload.term?.term_id) {
    emitFeedback("Es konnte keine term_id fuer das gewaehlte Schuljahr gefunden werden.", "");
    return;
  }
  if (!payload.schools.length) {
    emitFeedback("Es wurden keine Schulen des ausgewaehlten Snapshots mit gueltiger SNR gefunden.", "");
    return;
  }

  managementSaving.value = true;
  currentActionType.value = "generic";
  currentActionLabel.value = "Snapshot-Eintraege werden vorbereitet...";
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/snapshots/ensure",
      {
        term_id: payload.term.term_id,
        snapshot_date: payload.snapshot_date,
        info: payload.info,
        school_snrs: payload.schools.map((school: any) => String(school.snr || "").trim()).filter(Boolean),
      },
      { headers: managementAuthHeaders() },
    );
    const bootstrap = Array.isArray(resp.data?.snapshots)
      ? (resp.data || {})
      : await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
    emitFeedback(
      "",
      `Existiert: ${resp.data?.existed ? "Ja" : "Nein"} | Neu angelegt: ${Number(resp.data?.created_count || 0)}`,
    );
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Snapshot-Eintraege konnten nicht ergänzt werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionType.value = "";
    currentActionLabel.value = "";
  }
}

async function handleSnapshotFetchData() {
  const selectedSnapshot = findSelectedSnapshot();
  const importEndpoint = "/api/auth/admin/snapshot-students/import-school-year";
  const activeSourceIds = props.schoolSources
    .filter((source) =>
      Number(source?.source_id || 0) > 0 &&
      isSourceChecked(source) &&
      getServerStatus(source) === "online" &&
      getDatabaseStatus(source) === "online"
    )
    .map((source) => Number(source.source_id || 0));

  if (!selectedSnapshot?.term_id) {
    emitFeedback("Es konnte kein gueltiger Snapshot gefunden werden.", "");
    return;
  }
  if (!activeSourceIds.length) {
    emitFeedback("Es wurden keine gecheckten Schulen mit gruener Online- und DB-Anzeige gefunden.", "");
    return;
  }

  managementSaving.value = true;
  currentActionType.value = "snapshot-import";
  currentActionLabel.value = "Schuelerdaten werden geladen und gespeichert...";
  currentProcessingSchool.value = "";
  currentCompletedSources.value = 0;
  currentTotalSources.value = activeSourceIds.length;
  importAbortRequested.value = false;
  awaitingFreshImportProgress.value = true;
  startPreviewProgressPolling();
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      importEndpoint,
      {
        snap_id: String(selectedSnapshot.snap_id || "").trim(),
        term_id: Number(selectedSnapshot.term_id || 0),
        snapshot_date: String(selectedSnapshot.snapshot_date || "").trim() || derivedSnapshotDate.value,
        source_ids: activeSourceIds,
        save_log: savePreviewLog.value,
      },
      { headers: managementAuthHeaders() },
    );
    const bootstrap = await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
    const sources = Array.isArray(resp.data?.sources) ? resp.data.sources : [];
    const statusTotals = new Map<string, number>(
      (Array.isArray(resp.data?.status_totals) ? resp.data.status_totals : [])
        .map((entry: any) => [String(entry?.status ?? "").trim(), Number(entry?.count || 0)]),
    );

    const statusSummaryText = statusTotals.size
      ? [...statusTotals.entries()]
        .sort((a, b) => {
          const aNum = Number(a[0]);
          const bNum = Number(b[0]);
          const aValid = Number.isFinite(aNum);
          const bValid = Number.isFinite(bNum);
          if (aValid && bValid) return aNum - bNum;
          if (aValid) return -1;
          if (bValid) return 1;
          return String(a[0]).localeCompare(String(b[0]), "de");
        })
        .map(([status, count]) => `${studentStatusLabel(status)}: ${count}`)
        .join(", ")
      : "keine Schueler gefunden";

    const lines = [
      `Snapshot: ${String(selectedSnapshot.label || "-").trim() || "-"}`,
      `Dauer gesamt: ${Number(resp.data?.duration_ms || 0)} ms`,
      `Schulen: ${Number(resp.data?.total_sources || 0)}`,
      `Schueler gesamt: ${Number(resp.data?.total_rows || 0)} (${statusSummaryText})`,
      "",
    ];
    if (savePreviewLog.value) {
      lines.push("Liste der Schueler:");
      lines.push("Nr. | Schuelernummer | Klasse | Jahrgang | Geschlecht | Gliederung | ReligionID | Migration | Staatsangehoerigkeit | Foerderschwerpunkt1ID | Foerderschwerpunkt2ID | Zieldifferent | Klassenart | Status");
    }

    for (const row of sources) {
      lines.push("");
      const schoolSummary = `${String(row?.snr || "-").trim() || "-"} | ${shortenSchoolName(row?.school_name || row?.snr || "-", 40) || "-"} | Schueler=${Number(row?.imported_students || 0)}`;
      const rowStatusCounts = new Map<string, number>(
        (Array.isArray(row?.status_counts) ? row.status_counts : [])
          .map((entry: any) => [String(entry?.status ?? "").trim(), Number(entry?.count || 0)]),
      );
      const rowStatusSummary = rowStatusCounts.size
        ? [...rowStatusCounts.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([status, count]) => `${studentStatusLabel(status)}: ${count}`)
          .join(", ")
        : "keine Statusdaten";
      lines.push(`${schoolSummary} (${rowStatusSummary})`);
      lines.push(`Dauer fuer den Import: ${Number(row?.import_duration_ms || 0)} ms`);
      if (String(row?.error || "").trim()) {
        lines.push(`Meldung: ${String(row.error || "").trim()}`);
        continue;
      }
      if (!savePreviewLog.value) {
        continue;
      }
      const students = Array.isArray(row?.students) ? row.students : [];
      if (!students.length) {
        lines.push("Keine Schueler importiert.");
        continue;
      }
      for (const student of students) {
        lines.push(
          `${Number(student?.row_no || 0) || "-"} | ${Number(student?.student_no || 0) || "-"} | ${String(student?.class_code || "-").trim() || "-"} | ${String(student?.jahrgang || "-").trim() || "-"} | ${String(student?.geschlecht || "-").trim() || "-"} | ${String(student?.schulgliederung || "-").trim() || "-"} | ${student?.religionID ?? "-"} | ${student?.migration ?? "-"} | ${student?.staatsangehoerigkeit ?? "-"} | ${student?.foerderschwerpunkt1ID ?? "-"} | ${student?.foerderschwerpunkt2ID ?? "-"} | ${student?.hatZieldifferentenUnterricht ?? "-"} | ${student?.klassenart ?? "-"} | ${student?.status ?? "-"}`,
        );
      }
    }

    managementSaving.value = false;
    stopPreviewProgressPolling();
    currentActionType.value = "";
    currentProcessingSchool.value = "";
    currentCompletedSources.value = 0;
    currentTotalSources.value = 0;
    currentActionLabel.value = "";
    importAbortRequested.value = false;
    awaitingFreshImportProgress.value = false;
    openInfoDialog("Schueler testen", lines.join("\n"));
    emitFeedback(
      "",
      `${Number(resp.data?.total_rows || 0)} Schueler nach snapshot_student importiert.${resp.data?.aborted ? " Import wurde kontrolliert beendet." : ""}${resp.data?.log_saved ? ` Log-Dateien: ${Number(resp.data?.log_files?.length || 0)}` : ""}`,
    );
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Schuelerdaten konnten nicht importiert werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    stopPreviewProgressPolling();
    currentActionType.value = "";
    currentProcessingSchool.value = "";
    currentCompletedSources.value = 0;
    currentTotalSources.value = 0;
    currentActionLabel.value = "";
    importAbortRequested.value = false;
    awaitingFreshImportProgress.value = false;
  }
}

async function handleTeacherFetchData() {
  const selectedSnapshot = findSelectedSnapshot();
  const importEndpoint = "/api/auth/admin/snapshot-teachers/import-school-year";
  const activeSourceIds = props.schoolSources
    .filter((source) =>
      Number(source?.source_id || 0) > 0 &&
      isSourceChecked(source) &&
      getServerStatus(source) === "online" &&
      getDatabaseStatus(source) === "online"
    )
    .map((source) => Number(source.source_id || 0));

  if (!selectedSnapshot?.term_id) {
    emitFeedback("Es konnte kein gueltiger Snapshot gefunden werden.", "");
    return;
  }
  if (!activeSourceIds.length) {
    emitFeedback("Es wurden keine gecheckten Schulen mit gruener Online- und DB-Anzeige gefunden.", "");
    return;
  }

  managementSaving.value = true;
  currentActionType.value = "snapshot-import";
  currentActionLabel.value = "Lehrerdaten werden importiert...";
  currentProcessingSchool.value = "";
  currentCompletedSources.value = 0;
  currentTotalSources.value = activeSourceIds.length;
  importAbortRequested.value = false;
  awaitingFreshImportProgress.value = true;
  startPreviewProgressPolling();
  emitFeedback("", "");

  try {
    const importResp = await apiClient.post(
      importEndpoint,
      {
        snap_id: String(selectedSnapshot.snap_id || "").trim(),
        term_id: Number(selectedSnapshot.term_id || 0),
        snapshot_date: String(selectedSnapshot.snapshot_date || "").trim() || derivedSnapshotDate.value,
        source_ids: activeSourceIds,
      },
      { headers: managementAuthHeaders() },
    );

    const bootstrap = await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
    
    let summaryMessage = "Endstand Lehrer-Import (SNR | Name | Datensätze):\n\n";
    summaryMessage = "";
    summaryMessage += `Snapshot: ${String(selectedSnapshot.label || "-").trim() || "-"}\n`;
    summaryMessage += `Dauer gesamt: ${Number(importResp.data?.duration_ms || 0)} ms\n`;
    summaryMessage += `Schulen: ${Number(importResp.data?.total_sources || 0)}\n`;
    summaryMessage += `Lehrer gesamt: ${Number(importResp.data?.total_rows || 0)}\n`;
    if (Array.isArray(importResp.data?.results)) {
      for (const res of importResp.data.results) {
        const truncatedName = shortenSchoolName(res?.school_name || res?.snr || "-", 40) || "-";
        summaryMessage += `\n${String(res?.snr || "-").trim() || "-"} | ${truncatedName} | Lehrer=${Number(res?.imported_count || 0)}\n`;
        summaryMessage += `Dauer fuer den Import: ${Number(res?.import_duration_ms || 0)} ms\n`;
        if (String(res?.error || "").trim()) {
          summaryMessage += `Meldung: ${String(res.error || "").trim()}\n`;
        }
      }
    }
    summaryMessage += `\nGesamt: ${importResp.data?.total_rows || 0} Datensätze verarbeitet.`;

    summaryMessage = summaryMessage.replace(/\nGesamt:.*$/s, "");
    emitFeedback("", `Erfolg: ${Number(importResp.data?.total_rows || 0)} Lehrer wurden importiert.`);
    openInfoDialog("Lehrerdaten Import abgeschlossen", summaryMessage);
    
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Lehrerdaten konnten nicht verarbeitet werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    stopPreviewProgressPolling();
    currentActionType.value = "";
    currentProcessingSchool.value = "";
    currentCompletedSources.value = 0;
    currentTotalSources.value = 0;
    currentActionLabel.value = "";
    importAbortRequested.value = false;
    awaitingFreshImportProgress.value = false;
  }
}

async function handleSnapshotTest() {
  const selectedSnapshot = findSelectedSnapshot();
  const testEndpoint = "/api/auth/admin/snapshot-students/test-school-year";
  const activeSourceIds = props.schoolSources
    .filter((source) =>
      Number(source?.source_id || 0) > 0 &&
      isSourceChecked(source) &&
      getServerStatus(source) === "online" &&
      getDatabaseStatus(source) === "online"
    )
    .map((source) => Number(source.source_id || 0));

  if (!selectedSnapshot?.term_id) {
    emitFeedback("Es konnte kein gueltiger Snapshot gefunden werden.", "");
    return;
  }
  if (!activeSourceIds.length) {
    emitFeedback("Es wurden keine gecheckten Schulen mit gruener Online- und DB-Anzeige gefunden.", "");
    return;
  }

  managementSaving.value = true;
  currentActionType.value = "generic";
  currentActionLabel.value = "Schueler werden getestet...";
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      testEndpoint,
      {
        snap_id: String(selectedSnapshot.snap_id || "").trim(),
        term_id: Number(selectedSnapshot.term_id || 0),
        snapshot_date: String(selectedSnapshot.snapshot_date || "").trim() || derivedSnapshotDate.value,
        source_ids: activeSourceIds,
      },
      { headers: managementAuthHeaders() },
    );

    const sources = Array.isArray(resp.data?.sources) ? resp.data.sources : [];
    const statusTotals = new Map<string, number>(
      (Array.isArray(resp.data?.status_counts) ? resp.data.status_counts : [])
        .map((entry: any) => [String(entry?.status ?? "").trim(), Number(entry?.count || 0)]),
    );

    const statusSummaryText = statusTotals.size
      ? [...statusTotals.entries()]
        .sort((a, b) => {
          const aNum = Number(a[0]);
          const bNum = Number(b[0]);
          const aValid = Number.isFinite(aNum);
          const bValid = Number.isFinite(bNum);
          if (aValid && bValid) return aNum - bNum;
          if (aValid) return -1;
          if (bValid) return 1;
          return String(a[0]).localeCompare(String(b[0]), "de");
        })
        .map(([status, count]) => `Status ${status}: ${count}`)
        .join(", ")
      : "keine Schueler gefunden";

    const lines = [
      `Snapshot: ${String(selectedSnapshot.label || resp.data?.term?.label || "-").trim() || "-"}`,
      `Schuljahr/Abschnitt: ${String(resp.data?.term?.label || selectedSnapshot.label || "-").trim() || "-"}`,
      `Snapshot-Datum: ${String(resp.data?.snapshot_date || selectedSnapshot.snapshot_date || derivedSnapshotDate.value || "-").trim() || "-"}`,
      `Dauer gesamt: ${Number(resp.data?.duration_total_ms || resp.data?.duration_ms || 0)} ms`,
      `Schulen: ${Number(resp.data?.total_sources || 0)}`,
      `Schueler gesamt: ${Number(resp.data?.total_rows || 0)} (${statusSummaryText})`,
      "",
      "Liste der Schueler:",
      "Nr. | Schuelernummer | Name | Vorname | Klasse | Jahrgang | Geschlecht | Gliederung | ReligionID | Migration | Staatsangehoerigkeit | Foerderschwerpunkt1ID | Foerderschwerpunkt2ID | Zieldifferent | Klassenart | Status",
    ];

    for (const row of sources) {
      lines.push("");
      lines.push(
        `${String(row?.snr || "-").trim() || "-"} | ${shortenSchoolName(row?.school_name || row?.snr || "-", 40) || "-"} | Schueler=${Number(row?.imported_students || 0)}`,
      );
      if (String(row?.error || "").trim()) {
        lines.push(`FEHLER | ${String(row.error || "").trim()}`);
        continue;
      }
      const students = Array.isArray(row?.students) ? row.students : [];
      const countedStudents = students
        .filter((student: any) => !!student?.counted)
        .sort((a: any, b: any) => {
          const classCompare = String(a?.class_code || "").localeCompare(String(b?.class_code || ""), "de", { numeric: true });
          if (classCompare !== 0) return classCompare;
          const lastNameCompare = String(a?.nachname || "").localeCompare(String(b?.nachname || ""), "de", { numeric: true });
          if (lastNameCompare !== 0) return lastNameCompare;
          const firstNameCompare = String(a?.vorname || "").localeCompare(String(b?.vorname || ""), "de", { numeric: true });
          if (firstNameCompare !== 0) return firstNameCompare;
          return Number(a?.student_no || 0) - Number(b?.student_no || 0);
        });
      for (const student of countedStudents) {
        lines.push(
          `${Number(student?.row_no || 0) || "-"} | ${Number(student?.student_no || 0) || "-"} | ${String(student?.nachname || "-").trim() || "-"} | ${String(student?.vorname || "-").trim() || "-"} | ${String(student?.class_code || "-").trim() || "-"} | ${String(student?.jahrgang || "-").trim() || "-"} | ${String(student?.geschlecht || "-").trim() || "-"} | ${String(student?.schulgliederung || "-").trim() || "-"} | ${student?.religionID ?? "-"} | ${student?.migration ?? "-"} | ${student?.staatsangehoerigkeit ?? "-"} | ${student?.foerderschwerpunkt1ID ?? "-"} | ${student?.foerderschwerpunkt2ID ?? "-"} | ${student?.hatZieldifferentenUnterricht ?? "-"} | ${student?.klassenart ?? "-"} | ${student?.status ?? "-"}`,
        );
      }
    }
    openInfoDialog("Schueler testen", lines.join("\n"));
    emitFeedback("", "Test erfolgreich ausgefuehrt. Es wurden keine Daten in die DB geschrieben.");
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Der Test konnte nicht ausgefuehrt werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionType.value = "";
    currentActionLabel.value = "";
  }
}

async function handleAbortSnapshotImport() {
  if (!managementSaving.value || importAbortRequested.value) return;

  importAbortRequested.value = true;
  currentActionLabel.value = "Import wird nach aktueller Schule abgebrochen...";

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/snapshot-students/import-school-year/abort",
      {},
      { headers: managementAuthHeaders() },
    );
    emitFeedback("", resp.data?.message || "Import wird nach der aktuellen Schule beendet.");
  } catch (e: any) {
    importAbortRequested.value = false;
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Der Import konnte nicht abgebrochen werden.",
      "",
    );
  }
}

async function handleDeletePreviewLogs() {
  managementSaving.value = true;
  currentActionType.value = "generic";
  currentActionLabel.value = "Log-Dateien werden geloescht...";
  emitFeedback("", "");

  try {
    const resp = await apiClient.delete(
      "/api/auth/admin/snapshot-students/preview-school-year/logs",
      { headers: managementAuthHeaders() },
    );
    emitFeedback("", resp.data?.message || "Log-Dateien wurden geloescht.");
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Log-Dateien konnten nicht geloescht werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionType.value = "";
    currentActionLabel.value = "";
  }
}

</script>

<template src="./SnapshotSchoolYearManagement.html"></template>
<style scoped src="./SnapshotManagement.css"></style>
