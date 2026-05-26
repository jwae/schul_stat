<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import apiClient from "../services/apiClient";
import HelpOverlay from "./HelpOverlay.vue";

interface Props {
  managementToken?: string;
  isManagementSessionActive?: boolean;
  managementSchools?: any[];
  managementSchoolSources?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  managementToken: "",
  isManagementSessionActive: false,
  managementSchools: () => [],
  managementSchoolSources: () => [],
});

const emit = defineEmits<{
  (e: "bootstrap-updated", data: any): void;
  (e: "feedback", data: any): void;
}>();

const managementSaving = ref<boolean>(false);
const loadingOverlayOpen = ref<boolean>(false);
const currentActionLabel = ref<string>("");
const schoolImportInput = ref<HTMLInputElement | null>(null);
const schoolTableImportInput = ref<HTMLInputElement | null>(null);
const selectedManagementSchoolSourceId = ref<string>("");
const localFeedbackError = ref<string>("");
const localFeedbackNotice = ref<string>("");
let localFeedbackTimeoutId: any = null;
const sortKey = ref<string>("school_name");
const sortDirection = ref<string>("asc");
const schoolSelectionModalOpen = ref<boolean>(false);
const helpOverlayOpen = ref<boolean>(false);
const importResultDialogOpen = ref<boolean>(false);
const importResultDialogTitle = ref<string>("");
const importResultDialogBody = ref<string>("");
const schoolImportPreviewModalOpen = ref<boolean>(false);
const schoolImportPreviewData = ref<any[]>([]);
const schoolImportRawCsv = ref<string>("");
const schoolImportFileName = ref<string>("");
const schoolImportOverwriteExisting = ref<boolean>(true);
const schoolTableImportPreviewModalOpen = ref<boolean>(false);
const schoolTableImportPreviewData = ref<any[]>([]);
const schoolTableImportFileName = ref<string>("");
const schoolTableImportRawCsv = ref<string>("");
const schoolTableImportOverwriteExisting = ref<boolean>(false);
const deleteAllSchoolsConfirmOpen = ref<boolean>(false);
const importInfoOverlayOpen = ref<boolean>(false);
const schoolSourceForm = reactive({
  snr: "",
  db_host: "",
  db_port: 3306,
  db_name: "",
  db_user: "",
  db_password_enc: "",
  is_active: true,
});
const schoolSelectionFilters = reactive({
  snr: "",
  name: "",
  city: "",
});
const currentTestStatusBySourceId = reactive<Record<number, { server_status: string; db_status: string }>>({});
const helpOverlayItems: string[] = [
  "Hier werden die Schulserver-Quellen fuer den Snapshot-Abruf gepflegt.",
  "Neue Schulen lassen sich oben anlegen, bestehende Eintraege in der Tabelle aendern, aktivieren oder loeschen.",
  "Verbindungen testen prueft alle aktiven Schulen und faerbt danach die Punkte bei Online und DB.",
  "Im Feld Server wird der komplette SVWS-Zielhost eingetragen, bei Bedarf inklusive Protokoll und Port, z. B. https://svws.example.de:8443.",
];

function normalizeSchoolSourcePort(value: unknown): number {
  const port = Number(value || 3306);
  return Number.isInteger(port) && port > 0 ? port : 3306;
}

const availableSchoolsForSource = computed<any[]>(() => {
  const selectedId = String(selectedManagementSchoolSourceId.value || "").trim();
  const selectedSource = props.managementSchoolSources.find(
    (entry) => String(entry.source_id) === selectedId,
  );
  const selectedSchoolId = String(selectedSource?.snr || schoolSourceForm.snr || "").trim();

  return props.managementSchools.filter((school) => {
    const schoolId = String(school.snr || "").trim();
    if (!schoolId) return false;
    if (schoolId === selectedSchoolId) return true;
    return !props.managementSchoolSources.some((source) => String(source.snr || "").trim() === schoolId);
  });
});

const selectedSchoolForSource = computed<any | null>(() => {
  const selectedSnr = String(schoolSourceForm.snr || "").trim();
  if (!selectedSnr) return null;
  return props.managementSchools.find((school) => String(school?.snr || "").trim() === selectedSnr) || null;
});

const filteredAvailableSchoolsForSource = computed<any[]>(() => {
  const snrFilter = String(schoolSelectionFilters.snr || "").trim().toLowerCase();
  const nameFilter = String(schoolSelectionFilters.name || "").trim().toLowerCase();
  const cityFilter = String(schoolSelectionFilters.city || "").trim().toLowerCase();

  return [...availableSchoolsForSource.value]
    .filter((school) => {
      const snr = String(school?.snr || "").trim().toLowerCase();
      const name = String(school?.name || "").trim().toLowerCase();
      const city = String(school?.city || "").trim().toLowerCase();

      if (snrFilter && !snr.includes(snrFilter)) return false;
      if (nameFilter && !name.includes(nameFilter)) return false;
      if (cityFilter && !city.includes(cityFilter)) return false;
      return true;
    })
    .sort((a, b) => String(a?.snr || "").localeCompare(String(b?.snr || ""), "de", { numeric: true }));
});

const managementSchoolNameBySnr = computed<Record<string, string>>(() => {
  const entries: Record<string, string> = {};
  for (const school of props.managementSchools) {
    const snr = String(school?.snr || "").trim();
    if (!snr) continue;
    entries[snr] = String(school?.name || school?.school_name || "").trim();
  }
  return entries;
});

const sortedManagementSchoolSources = computed<any[]>(() => {
  const directionFactor = sortDirection.value === "desc" ? -1 : 1;

  return [...props.managementSchoolSources].sort((a, b) => {
    const aValue = sortableValue(a, sortKey.value);
    const bValue = sortableValue(b, sortKey.value);

    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * directionFactor;
    }

    return String(aValue).localeCompare(String(bValue), "de", { numeric: true }) * directionFactor;
  });
});

const canTestSchoolSource = computed<boolean>(() => {
  if (selectedManagementSchoolSourceId.value) return true;
  return Boolean(
    String(schoolSourceForm.db_host || "").trim() &&
    String(schoolSourceForm.db_name || "").trim() &&
    String(schoolSourceForm.db_user || "").trim(),
  );
});

function emitFeedback(error: string = "", notice: string = "") {
  localFeedbackError.value = String(error || "");
  localFeedbackNotice.value = String(notice || "");
}

function clearLocalFeedbackTimer() {
  if (!localFeedbackTimeoutId) return;
  clearTimeout(localFeedbackTimeoutId);
  localFeedbackTimeoutId = null;
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

function formatSchoolSourceName(value: string | null | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "Ohne Name";
  if (text.length <= 15) return text;
  return `${text.slice(0, 15)}...`;
}

function formatImportPreviewSchoolName(value: string | null | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= 20) return text;
  return `${text.slice(0, 20)}...`;
}

function buildSchoolSourcePayload(source: any) {
  return {
    snr: String(source?.snr || "").trim(),
    db_host: String(source?.db_host || "").trim(),
    db_port: normalizeSchoolSourcePort(source?.db_port ?? 3306),
    db_name: String(source?.db_name || "").trim(),
    db_user: String(source?.db_user || "").trim(),
    db_password_enc: String(source?.db_password_enc || "").trim(),
    is_active: true,
  };
}

async function persistSchoolSource(payload: any, sourceId?: string | number | null) {
  const hasSourceId = Boolean(String(sourceId || "").trim());
  const url = hasSourceId
    ? `/api/auth/admin/school-sources/${sourceId}`
    : "/api/auth/admin/school-sources";
  const method = hasSourceId ? "patch" : "post";
  return (apiClient as any)[method](url, payload, {
    headers: managementAuthHeaders(),
  });
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

function sortableValue(source: any, key: string): string | number {
  if (key === "is_active") return source?.is_active ? 1 : 0;
  if (key === "db_port") return Number(source?.db_port || 0);
  if (key === "server_status") return statusRank(getServerStatus(source));
  if (key === "db_status") return statusRank(getDatabaseStatus(source));
  return String(source?.[key] || "").trim().toLowerCase();
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
  return sortDirection.value === "asc" ? " ▲" : " ▼";
}

function sortIndicatorBadge(key: string): string {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? "▲" : "▼";
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

function resetSchoolSourceForm() {
  schoolSourceForm.snr = "";
  schoolSourceForm.db_host = "";
  schoolSourceForm.db_port = 3306;
  schoolSourceForm.db_name = "";
  schoolSourceForm.db_user = "";
  schoolSourceForm.db_password_enc = "";
  schoolSourceForm.is_active = true;
  selectedManagementSchoolSourceId.value = "";
}

function createManagementSchoolSource() {
  resetSchoolSourceForm();
  openSchoolSelectionModal();
}

function resetSchoolSelectionFilters() {
  schoolSelectionFilters.snr = "";
  schoolSelectionFilters.name = "";
  schoolSelectionFilters.city = "";
}

function openSchoolSelectionModal() {
  resetSchoolSelectionFilters();
  schoolSelectionModalOpen.value = true;
}

function closeSchoolSelectionModal() {
  schoolSelectionModalOpen.value = false;
}

function openHelpOverlay() {
  helpOverlayOpen.value = true;
}

function closeHelpOverlay() {
  helpOverlayOpen.value = false;
}

function openImportInfoOverlay() {
  importInfoOverlayOpen.value = true;
}

function closeImportInfoOverlay() {
  importInfoOverlayOpen.value = false;
}

function openImportResultDialog(title: string, body: string) {
  importResultDialogTitle.value = String(title || "Import-Ergebnis").trim() || "Import-Ergebnis";
  importResultDialogBody.value = String(body || "").trim();
  importResultDialogOpen.value = true;
}

function closeImportResultDialog() {
  importResultDialogOpen.value = false;
  importResultDialogTitle.value = "";
  importResultDialogBody.value = "";
}

function openSchoolImportPicker() {
  schoolImportInput.value?.click();
}

function openSchoolTableImportPicker() {
  schoolTableImportInput.value?.click();
}

function normalizeCsvHeaderKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findCsvHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeCsvHeaderKey(alias));
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

async function readCsvFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
  const utf8Text = utf8Decoder.decode(buffer);

  // Many CSV exports on Windows are cp1252/latin1 encoded. If UTF-8 decoding
  // produced replacement characters, try a more suitable fallback.
  if (utf8Text.includes("\uFFFD")) {
    try {
      return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    } catch {
      return new TextDecoder("iso-8859-1", { fatal: false }).decode(buffer);
    }
  }

  return utf8Text;
}

function detectCsvDelimiter(line: string) {
  const text = String(line || "");
  let inQuotes = false;
  let semicolonCount = 0;
  let commaCount = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (inQuotes) continue;
    if (char === ";") semicolonCount++;
    if (char === ",") commaCount++;
  }

  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvRows(csvText: string) {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Die CSV-Datei ist leer.");

  const delimiter = detectCsvDelimiter(lines[0]);

  function parseLine(line: string) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((value) => String(value || "").trim());
  }

  return {
    lines,
    headers: parseLine(lines[0]).map((header) => normalizeCsvHeaderKey(header)),
    parseLine,
  };
}

function selectSchoolForSource(school: any) {
  const snr = String(school?.snr || "").trim();
  if (!snr) return;
  schoolSourceForm.snr = snr;
  closeSchoolSelectionModal();
}

function validateManagementSchoolSourceForm(): string {
  if (!schoolSourceForm.snr) return "Bitte eine Schule auswaehlen.";
  if (!String(schoolSourceForm.db_host || "").trim()) return "Server (https://Server:Port) ist erforderlich.";
  if (!String(schoolSourceForm.db_name || "").trim()) return "Datenbank ist erforderlich.";
  if (!String(schoolSourceForm.db_user || "").trim()) return "DB-Benutzer ist erforderlich.";

  const schoolId = String(schoolSourceForm.snr || "").trim();
  const duplicate = props.managementSchoolSources.some((source) =>
    String(source.snr || "").trim() === schoolId &&
    String(source.source_id) !== String(selectedManagementSchoolSourceId.value || ""),
  );
  if (duplicate) return "Fuer diese Schule existiert bereits eine Schulserver-Quelle.";

  return "";
}

function editManagementSchoolSource(sourceId: string | number) {
  selectedManagementSchoolSourceId.value = String(sourceId || "");
}

watch(selectedManagementSchoolSourceId, (sourceId) => {
  if (!sourceId) {
    resetSchoolSourceForm();
    return;
  }

  const source = props.managementSchoolSources.find((entry) => String(entry.source_id) === String(sourceId));
  if (!source) return;

  schoolSourceForm.snr = source.snr ? String(source.snr) : "";
  schoolSourceForm.db_host = source.db_host || "";
  schoolSourceForm.db_port = normalizeSchoolSourcePort(source.db_port);
  schoolSourceForm.db_name = source.db_name || "";
  schoolSourceForm.db_user = source.db_user || "";
  schoolSourceForm.db_password_enc = "";
  schoolSourceForm.is_active = !!source.is_active;
});

watch(
  () => props.managementSchoolSources,
  (sources) => {
    if (!selectedManagementSchoolSourceId.value) return;
    const source = sources.find(
      (entry) => String(entry.source_id) === String(selectedManagementSchoolSourceId.value),
    );
    if (!source) {
      resetSchoolSourceForm();
      return;
    }

    schoolSourceForm.snr = source.snr ? String(source.snr) : "";
    schoolSourceForm.db_host = source.db_host || "";
    schoolSourceForm.db_port = normalizeSchoolSourcePort(source.db_port);
    schoolSourceForm.db_name = source.db_name || "";
    schoolSourceForm.db_user = source.db_user || "";
    schoolSourceForm.is_active = !!source.is_active;
  },
);

watch([localFeedbackError, localFeedbackNotice], ([error, notice]) => {
  clearLocalFeedbackTimer();
  if (!String(error || "").trim() && !String(notice || "").trim()) return;
  localFeedbackTimeoutId = setTimeout(() => {
    localFeedbackError.value = "";
    localFeedbackNotice.value = "";
    localFeedbackTimeoutId = null;
  }, 3200);
});

watch([schoolSelectionModalOpen, schoolImportPreviewModalOpen, schoolTableImportPreviewModalOpen, importResultDialogOpen, deleteAllSchoolsConfirmOpen, importInfoOverlayOpen], ([isSelectionOpen, isSourceImportOpen, isSchoolImportOpen, isResultOpen, isDeleteConfirmOpen, isImportInfoOpen]) => {
  if (typeof document === "undefined") return;
  document.body.style.overflow = isSelectionOpen || isSourceImportOpen || isSchoolImportOpen || isResultOpen || isDeleteConfirmOpen || isImportInfoOpen ? "hidden" : "";
});

watch(
  () => props.managementSchoolSources,
  (sources) => {
    clearObsoleteCurrentStatuses(sources);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearLocalFeedbackTimer();
  if (typeof document !== "undefined") {
    document.body.style.overflow = "";
  }
});

async function saveManagementSchoolSource() {
  const validationError = validateManagementSchoolSourceForm();
  if (validationError) {
    emitFeedback(validationError, "");
    return;
  }

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const payload = {
      ...buildSchoolSourcePayload(schoolSourceForm),
      is_active: schoolSourceForm.is_active,
    };
    const resp = await persistSchoolSource(payload, selectedManagementSchoolSourceId.value);
    const bootstrap = Array.isArray(resp.data?.school_sources)
      ? (resp.data || {})
      : await fetchManagementBootstrap();

    if (!selectedManagementSchoolSourceId.value && !resp.data?.created_source) {
      throw new Error("Die neue Schulserver-Quelle wurde vom Server nicht bestaetigt.");
    }

    emit("bootstrap-updated", bootstrap);
    emitFeedback(
      "",
      selectedManagementSchoolSourceId.value
        ? "Schulserver-Quelle aktualisiert."
        : "Schulserver-Quelle angelegt.",
    );
    resetSchoolSourceForm();
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Schulserver-Quelle konnte nicht gespeichert werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}

async function deleteManagementSchoolSource(source: any) {
  if (!source) return;
  if (!window.confirm(`Schulserver-Quelle fuer "${source.school_name || source.snr}" wirklich loeschen?`)) return;

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.delete(`/api/auth/admin/school-sources/${source.source_id}`, {
      headers: managementAuthHeaders(),
    });
    const bootstrap = Array.isArray(resp.data?.school_sources)
      ? (resp.data || {})
      : await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
    emitFeedback("", "Schulserver-Quelle geloescht.");
    resetSchoolSourceForm();
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Schulserver-Quelle konnte nicht geloescht werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}

async function deleteAllManagementSchoolSources() {
  const totalSources = props.managementSchoolSources.length;
  if (!totalSources) {
    emitFeedback("Es sind keine Dashboard-Schulen zum Loeschen vorhanden.", "");
    return;
  }
  if (!window.confirm(`Wirklich alle ${totalSources} Dashboard-Schulen loeschen?`)) return;

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    for (const source of props.managementSchoolSources) {
      const sourceId = Number(source?.source_id || 0);
      if (!sourceId) continue;
      await apiClient.delete(`/api/auth/admin/school-sources/${sourceId}`, {
        headers: managementAuthHeaders(),
      });
    }
    const bootstrap = await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
    emitFeedback("", `${totalSources} Dashboard-Schule(n) geloescht.`);
    resetSchoolSourceForm();
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Dashboard-Schulen konnten nicht geloescht werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}

async function deleteAllManagementSchools() {
  const totalSchools = props.managementSchools.length;
  if (!totalSchools) {
    emitFeedback("Es sind keine Schulen zum Loeschen vorhanden.", "");
    return;
  }
  deleteAllSchoolsConfirmOpen.value = true;
}

function closeDeleteAllSchoolsConfirm() {
  deleteAllSchoolsConfirmOpen.value = false;
}

async function confirmDeleteAllManagementSchools() {
  const totalSchools = props.managementSchools.length;
  if (!totalSchools) {
    closeDeleteAllSchoolsConfirm();
    emitFeedback("Es sind keine Schulen zum Loeschen vorhanden.", "");
    return;
  }

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.delete("/api/auth/admin/schools", {
      headers: managementAuthHeaders(),
    });
    const bootstrap = Array.isArray(resp.data?.schools)
      ? (resp.data || {})
      : await fetchManagementBootstrap();
    closeDeleteAllSchoolsConfirm();
    emit("bootstrap-updated", bootstrap);
    emitFeedback("", `${totalSchools} Schule(n) geloescht.`);
    resetSchoolSourceForm();
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Schulen konnten nicht geloescht werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}

async function testManagementSchoolSource() {
  const draftPayload = {
    db_host: String(schoolSourceForm.db_host || "").trim(),
    db_port: normalizeSchoolSourcePort(schoolSourceForm.db_port),
    db_name: String(schoolSourceForm.db_name || "").trim(),
    db_user: String(schoolSourceForm.db_user || "").trim(),
    db_password_enc: String(schoolSourceForm.db_password_enc || ""),
  };

  if (!canTestSchoolSource.value) return;

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/school-sources/test-draft",
      draftPayload,
      { headers: managementAuthHeaders() },
    );
    emitFeedback(
      "",
      resp.data?.message || "Verbindung der Schulserver-Quelle erfolgreich getestet.",
    );
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Der Verbindungstest der Schulserver-Quelle ist fehlgeschlagen.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}

async function testAllManagementSchoolSources() {
  const activeSourceIds = props.managementSchoolSources
    .filter((source) => !!source?.is_active && Number(source?.source_id || 0) > 0)
    .map((source) => Number(source.source_id || 0));

  if (!activeSourceIds.length) {
    emitFeedback("Es wurden keine aktiven Schulen fuer den Sammeltest gefunden.", "");
    return;
  }

  managementSaving.value = true;
  loadingOverlayOpen.value = true;
  currentActionLabel.value = "Ich teste, ob der SVWS-Server und die DB der aktivierten Schulen erreichbar ist.";
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/school-sources/test-all",
      { source_ids: activeSourceIds },
      { headers: managementAuthHeaders() },
    );
    for (const result of Array.isArray(resp.data?.results) ? resp.data.results : []) {
      setCurrentTestStatus(result?.source_id, result?.server_status, result?.db_status);
    }
    const bootstrap = Array.isArray(resp.data?.school_sources)
      ? (resp.data || {})
      : await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
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
    loadingOverlayOpen.value = false;
    currentActionLabel.value = "";
  }
}

async function handleSchoolImportFileSelected(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  if (!file) return;

  try {
    schoolImportFileName.value = file.name;
    const csvText = await readCsvFileText(file);
    schoolImportRawCsv.value = csvText;

    const { lines, headers, parseLine } = parseCsvRows(csvText);
    const snrIdx = findCsvHeaderIndex(headers, ["snr"]);
    const hostIdx = findCsvHeaderIndex(headers, ["db_host", "dbhost", "host"]);
    const nameIdx = findCsvHeaderIndex(headers, ["db_name", "dbname", "datenbank"]);
    const userIdx = findCsvHeaderIndex(headers, ["db_user", "dbuser", "user", "benutzer"]);
    const passwordIdx = findCsvHeaderIndex(headers, ["db_passwd", "db_password_enc", "db_password", "passwort"]);

    if (snrIdx < 0) throw new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte 'snr'.");
    if (hostIdx < 0 || nameIdx < 0) throw new Error("Die CSV-Datei enthaelt nicht die erforderlichen Spalten 'db_host' und 'db_name'.");

    schoolImportPreviewData.value = lines.slice(1).map((line, index) => {
      const cells = parseLine(line);
      const snr = cells[snrIdx] || "";
      const schoolName = managementSchoolNameBySnr.value[snr] || "";
      const exists = props.managementSchoolSources.some(s => String(s.snr || "").trim() === snr);
      return {
        row_no: index + 2,
        snr,
        school_name: schoolName,
        db_host: hostIdx >= 0 ? cells[hostIdx] || "" : "",
        db_name: nameIdx >= 0 ? cells[nameIdx] || "" : "",
        db_user: userIdx >= 0 ? cells[userIdx] || "" : "",
        db_password_enc: passwordIdx >= 0 ? cells[passwordIdx] || "" : "",
        exists,
        selected: true,
      };
    }).filter(row => row.snr);

    if (!schoolImportPreviewData.value.length) throw new Error("Keine importierbaren Zeilen gefunden.");

    schoolImportOverwriteExisting.value = true;
    schoolImportPreviewModalOpen.value = true;
  } catch (e: any) {
    emitFeedback(e?.message || "Fehler beim Lesen der CSV-Datei.", "");
  } finally {
    if (input) input.value = "";
  }
}

async function handleSchoolTableImportFileSelected(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] || null;
  if (!file) return;

  try {
    schoolTableImportFileName.value = file.name;
    const csvText = await readCsvFileText(file);
    schoolTableImportRawCsv.value = csvText;
    const { lines, headers, parseLine } = parseCsvRows(csvText);
    const snrIdx = findCsvHeaderIndex(headers, ["snr"]);
    const nameIdx = findCsvHeaderIndex(headers, ["name"]);
    const cityIdx = findCsvHeaderIndex(headers, ["city"]);
    const ortIdx = findCsvHeaderIndex(headers, ["ort"]);
    const plzIdx = findCsvHeaderIndex(headers, ["plz", "postleitzahl"]);
    const strasseIdx = findCsvHeaderIndex(headers, ["strasse", "straße", "street"]);
    const schoolFormIdx = findCsvHeaderIndex(headers, ["schulform", "school_form"]);

    if (snrIdx < 0 || nameIdx < 0 || (cityIdx < 0 && ortIdx < 0)) {
      throw new Error("Die CSV-Datei muss die Spalten 'SNR', 'Name' und 'Ort/city' enthalten.");
    }

    schoolTableImportPreviewData.value = lines.slice(1).map((line, index) => {
      const cells = parseLine(line);
      const city = cityIdx >= 0 ? cells[cityIdx] || "" : ortIdx >= 0 ? cells[ortIdx] || "" : "";
      const ort = ortIdx >= 0 ? cells[ortIdx] || "" : city;
      return {
        row_no: index + 2,
        snr: cells[snrIdx] || "",
        name: cells[nameIdx] || "",
        city,
        plz: plzIdx >= 0 ? cells[plzIdx] || "" : "",
        ort,
        strasse: strasseIdx >= 0 ? cells[strasseIdx] || "" : "",
        school_form: schoolFormIdx >= 0 ? cells[schoolFormIdx] || "" : "",
        exists: props.managementSchools.some((school) => String(school?.snr || "").trim() === String(cells[snrIdx] || "").trim()),
        selected: true,
      };
    }).filter((row) => row.snr || row.name || row.city || row.ort);

    if (!schoolTableImportPreviewData.value.length) {
      throw new Error("Keine importierbaren Zeilen gefunden.");
    }

    schoolTableImportPreviewModalOpen.value = true;
  } catch (e: any) {
    emitFeedback(e?.message || "Fehler beim Lesen der Schul-CSV-Datei.", "");
  } finally {
    if (input) input.value = "";
  }
}

function closeSchoolTableImportPreview() {
  schoolTableImportPreviewModalOpen.value = false;
  schoolTableImportPreviewData.value = [];
  schoolTableImportFileName.value = "";
  schoolTableImportRawCsv.value = "";
  schoolTableImportOverwriteExisting.value = false;
}

function selectAllSchoolTableImportRows() {
  const shouldSelectAll = schoolTableImportPreviewData.value.some((row) => !row?.selected);
  for (const row of schoolTableImportPreviewData.value) {
    row.selected = shouldSelectAll;
  }
}

async function confirmSchoolTableImport() {
  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const selectedPreviewRows = schoolTableImportPreviewData.value.filter((row) => !!row?.selected);
    if (!selectedPreviewRows.length) {
      throw new Error("Bitte mindestens eine Zeile fuer den Import auswaehlen.");
    }

    const rowsForImport = schoolTableImportOverwriteExisting.value
      ? selectedPreviewRows
      : selectedPreviewRows.filter((row) => !row?.exists);
    if (!rowsForImport.length) {
      throw new Error("Mit deaktiviertem Ueberschreiben koennen nur neue ausgewaehlte Schulen importiert werden.");
    }

    const response = await apiClient.post(
      "/api/auth/admin/schools/import-csv",
      {
        csv_text: schoolTableImportRawCsv.value,
        overwrite_existing: schoolTableImportOverwriteExisting.value,
        selected_row_nos: rowsForImport.map((row) => Number(row?.row_no || 0)).filter((rowNo) => rowNo > 0),
      },
      { headers: managementAuthHeaders() },
    );

    const bootstrap = Array.isArray(response.data?.schools)
      ? (response.data || {})
      : await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);

    const createdEntries = Array.isArray(response.data?.created_entries) ? response.data.created_entries : [];
    const updatedEntries = Array.isArray(response.data?.updated_entries) ? response.data.updated_entries : [];
    const resultLines = [
      `CSV-Datei: ${schoolTableImportFileName.value}`,
      `Importiert gesamt: ${Number(response.data?.imported_count || 0)}`,
      `Neu angelegt: ${Number(response.data?.created_count || 0)}`,
      `Aktualisiert: ${Number(response.data?.updated_count || 0)}`,
    ];

    if (createdEntries.length) {
      resultLines.push("");
      resultLines.push("Neu angelegt:");
      for (const entry of createdEntries) {
        resultLines.push(
          `${String(entry?.snr || "").trim()} | ${String(entry?.name || "").trim()} | ${String(entry?.city || "").trim()}`,
        );
      }
    }

    if (updatedEntries.length) {
      resultLines.push("");
      resultLines.push("Aktualisiert:");
      for (const entry of updatedEntries) {
        resultLines.push(
          `${String(entry?.snr || "").trim()} | ${String(entry?.name || "").trim()} | ${String(entry?.city || "").trim()}`,
        );
      }
    }

    closeSchoolTableImportPreview();
    openImportResultDialog("CSV-Import (Schulen) abgeschlossen", resultLines.join("\n"));
    emitFeedback(
      "",
      `${Number(response.data?.imported_count || 0)} Schule(n) importiert. Neu: ${Number(response.data?.created_count || 0)}, aktualisiert: ${Number(response.data?.updated_count || 0)}.`,
    );
  } catch (e: any) {
    if (e?.response?.status === 409 && e?.response?.data?.needs_confirmation) {
      schoolTableImportOverwriteExisting.value = true;
      const existingSnrs = new Set(
        (Array.isArray(e.response.data?.existing_entries) ? e.response.data.existing_entries : [])
          .map((entry: any) => String(entry?.snr || "").trim())
          .filter(Boolean),
      );
      for (const row of schoolTableImportPreviewData.value) {
        row.exists = existingSnrs.has(String(row?.snr || "").trim());
      }
      emitFeedback("", e?.response?.data?.message || "Einige Schulen sind bereits vorhanden. Zum Ueberschreiben bitte erneut importieren.");
      return;
    }

    emitFeedback(e?.response?.data?.error || e?.message || "Der CSV-Import der Schulen ist fehlgeschlagen.", "");
  } finally {
    managementSaving.value = false;
  }
}

function cancelSchoolImport() {
  schoolImportPreviewModalOpen.value = false;
  schoolImportPreviewData.value = [];
  schoolImportRawCsv.value = "";
  schoolImportFileName.value = "";
  schoolImportOverwriteExisting.value = true;
}

function selectAllSchoolImportRows() {
  const shouldSelectAll = schoolImportPreviewData.value.some((row) => !row?.selected);
  for (const row of schoolImportPreviewData.value) {
    row.selected = shouldSelectAll;
  }
}

async function confirmSchoolImport() {
  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const selectedPreviewRows = schoolImportPreviewData.value.filter((row) => !!row?.selected);
    if (!selectedPreviewRows.length) {
      throw new Error("Bitte mindestens eine Zeile fuer den Import auswaehlen.");
    }

    const rowsForImport = schoolImportOverwriteExisting.value
      ? selectedPreviewRows
      : selectedPreviewRows.filter((row) => !row?.exists);
    if (!rowsForImport.length) {
      throw new Error("Mit deaktiviertem Ueberschreiben koennen nur neue ausgewaehlte Schulen importiert werden.");
    }
    const skippedEntries = rowsForImport.filter((row) => !String(row?.school_name || "").trim());
    const importableRows = rowsForImport.filter((row) => String(row?.school_name || "").trim());
    if (!importableRows.length) {
      const skippedList = skippedEntries
        .map((row) => `Zeile ${Number(row?.row_no || 0)}: Schulnummer ${String(row?.snr || "").trim() || "-" } wurde in school nicht gefunden und uebersprungen.`)
        .join("\n");
      openImportResultDialog("CSV-Import (Schulserver) abgeschlossen", skippedList || "Keine importierbaren Schulserver-Zeilen gefunden.");
      emitFeedback("", `${skippedEntries.length} Zeile(n) wurden uebersprungen, weil die SNR in school nicht vorhanden ist.`);
      schoolImportPreviewModalOpen.value = false;
      return;
    }
    const createdEntries: any[] = [];
    const updatedEntries: any[] = [];
    let lastResponse: any = null;

    for (const row of importableRows) {
      const existingSource = props.managementSchoolSources.find(
        (source) => String(source?.snr || "").trim() === String(row?.snr || "").trim(),
      );
      const payload = buildSchoolSourcePayload({
        ...row,
        db_port: existingSource?.db_port ?? 3306,
      });
      lastResponse = await persistSchoolSource(payload, existingSource?.source_id || null);
      if (existingSource?.source_id) {
        updatedEntries.push(payload);
      } else {
        createdEntries.push(payload);
      }
    }

    schoolImportPreviewModalOpen.value = false;

    const bootstrap = Array.isArray(lastResponse?.data?.school_sources)
      ? (lastResponse.data || {})
      : await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
    const resultLines = [
      `CSV-Datei: ${schoolImportFileName.value}`,
      `Importiert gesamt: ${createdEntries.length + updatedEntries.length}`,
      `Neu angelegt: ${createdEntries.length}`,
      `Aktualisiert: ${updatedEntries.length}`,
    ];
    if (skippedEntries.length) {
      resultLines.push(`Uebersprungen: ${skippedEntries.length}`);
    }
    if (createdEntries.length) {
      resultLines.push("");
      resultLines.push("Neu angelegt:");
      for (const entry of createdEntries) {
        resultLines.push(`${String(entry?.snr || "").trim()} | ${String(entry?.db_host || "").trim()} | ${String(entry?.db_name || "").trim()}`);
      }
    }
    if (updatedEntries.length) {
      resultLines.push("");
      resultLines.push("Aktualisiert:");
      for (const entry of updatedEntries) {
        resultLines.push(`${String(entry?.snr || "").trim()} | ${String(entry?.db_host || "").trim()} | ${String(entry?.db_name || "").trim()}`);
      }
    }
    if (skippedEntries.length) {
      resultLines.push("");
      resultLines.push("Uebersprungen:");
      for (const row of skippedEntries) {
        resultLines.push(`Zeile ${Number(row?.row_no || 0)} | ${String(row?.snr || "").trim() || "-"} | SNR nicht in school gefunden`);
      }
    }
    openImportResultDialog("CSV-Import (Schulserver) abgeschlossen", resultLines.join("\n"));
    emitFeedback(
      "",
      `${createdEntries.length + updatedEntries.length} Schulserver-Quelle(n) importiert. Neu: ${createdEntries.length}, aktualisiert: ${updatedEntries.length}.${skippedEntries.length ? ` Uebersprungen: ${skippedEntries.length}.` : ""}`,
    );
  } catch (e: any) {
    emitFeedback(e?.response?.data?.error || e?.message || "Der CSV-Import der Schulserver-Quellen ist fehlgeschlagen.", "");
  } finally {
    managementSaving.value = false;
    schoolImportRawCsv.value = "";
    schoolImportFileName.value = "";
    if (!schoolImportPreviewModalOpen.value) {
      schoolImportOverwriteExisting.value = true;
    }
  }
}

async function toggleManagementSchoolSourceActive(source: any) {
  if (!source) return;

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.patch(
      `/api/auth/admin/school-sources/${source.source_id}`,
        {
        snr: String(source.snr || "").trim(),
        db_host: source.db_host,
        db_port: normalizeSchoolSourcePort(source.db_port),
        db_name: source.db_name,
        db_user: source.db_user,
        db_password_enc: "",
        is_active: !source.is_active,
      },
      { headers: managementAuthHeaders() },
    );
    const bootstrap = Array.isArray(resp.data?.school_sources)
      ? (resp.data || {})
      : await fetchManagementBootstrap();
    emit("bootstrap-updated", bootstrap);
    emitFeedback(
      "",
      `Schulserver-Quelle ${source.is_active ? "deaktiviert" : "aktiviert"}.`,
    );
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Der Status der Schulserver-Quelle konnte nicht geaendert werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}
</script>

<template src="./SchoolManagement.html"></template>
<style scoped src="./SchoolManagement.css"></style>
