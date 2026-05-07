<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import apiClient from "../services/apiClient";

interface Props {
  managementToken?: string;
  isManagementSessionActive?: boolean;
  schoolSources?: any[];
  terms?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  managementToken: "",
  isManagementSessionActive: false,
  schoolSources: () => [],
  terms: () => [],
});

const emit = defineEmits<{
  (e: "bootstrap-updated", data: any): void;
  (e: "feedback", data: any): void;
}>();

const sortKey = ref<string>("school_name");
const sortDirection = ref<string>("asc");
const selectedTermLabel = ref<string>("");
const snapshotDate = ref<string>("");
const snapshotInfo = ref<string>("");
const managementSaving = ref<boolean>(false);
const currentActionLabel = ref<string>("");
const currentTestStatusBySourceId = reactive<Record<number, { server_status: string; db_status: string }>>({});
const infoDialogOpen = ref<boolean>(false);
const infoDialogTitle = ref<string>("");
const infoDialogBody = ref<string>("");

const currentSchoolYearLabel = computed<string>(() => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month >= 2 && month <= 7) return `${year - 1}.02`;
  if (month === 1) return `${year - 1}.01`;
  return `${year}.01`;
});

const termLabelOptions = computed<string[]>(() => {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const term of props.terms) {
    const label = String(term?.label || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels.sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
});

const sortedSchoolSources = computed<any[]>(() => {
  const factor = sortDirection.value === "desc" ? -1 : 1;

  return props.schoolSources
    .filter((source) => !!source?.is_active)
    .sort((a, b) => {
    const aValue = sortableValue(a, sortKey.value);
    const bValue = sortableValue(b, sortKey.value);

    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * factor;
    }

    return String(aValue).localeCompare(String(bValue), "de", { numeric: true }) * factor;
  });
});

function sortableValue(source: any, key: string): string | number {
  if (key === "db_port") return Number(source?.db_port || 0);
  if (key === "is_active") return source?.is_active ? 1 : 0;
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
  sortDirection.value = key === "is_active" ? "desc" : "asc";
}

function sortIndicator(key: string): string {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? " ^" : " v";
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

function managementAuthHeaders() {
  return props.managementToken
    ? { Authorization: `Bearer ${props.managementToken}` }
    : {};
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

function openInfoDialog(title: string, payload: any) {
  infoDialogTitle.value = String(title || "JSON-Info").trim() || "JSON-Info";
  infoDialogBody.value = JSON.stringify(payload, null, 2);
  infoDialogOpen.value = true;
}

function closeInfoDialog() {
  infoDialogOpen.value = false;
  infoDialogTitle.value = "";
  infoDialogBody.value = "";
}

function findSelectedTerm(): any | null {
  const label = String(selectedTermLabel.value || "").trim();
  if (!label) return null;

  const matchingTerms = props.terms.filter((term) => String(term?.label || "").trim() === label);
  if (!matchingTerms.length) return null;

  return [...matchingTerms].sort((a, b) => {
    const yearDiff = Number(b?.school_year || 0) - Number(a?.school_year || 0);
    if (yearDiff !== 0) return yearDiff;
    return Number(b?.term_no || 0) - Number(a?.term_no || 0);
  })[0];
}

function buildSnapshotPreviewPayload(): any {
  const term = findSelectedTerm();
  const snapshotDateValue = String(snapshotDate.value || "").trim();
  const activeSources = props.schoolSources.filter((source) => source?.is_active && String(source?.snr || "").trim());

  return {
    term: term
      ? {
          term_id: Number(term.term_id || 0),
          label: String(term.label || "").trim(),
          school_year: Number(term.school_year || 0),
          term_no: Number(term.term_no || 0),
        }
      : null,
    snapshot_date: snapshotDateValue,
    info: String(snapshotInfo.value || "").trim(),
    schools: activeSources.map((source) => ({
      snr: String(source?.snr || "").trim(),
    })),
  };
}

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
    currentActionLabel.value = "";
  }
}

async function handleConnectionTestAll() {
  managementSaving.value = true;
  currentActionLabel.value = "Verbindungen werden getestet...";
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/school-sources/test-all",
      {},
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
    currentActionLabel.value = "";
  }
}

async function handleClassesInfo(source: any) {
  if (!source?.source_id) return;

  managementSaving.value = true;
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
    currentActionLabel.value = "";
  }
}

async function handleSnapshotCreateAll() {
  const termLabel = String(selectedTermLabel.value || "").trim();
  const date = String(snapshotDate.value || "").trim();
  if (!termLabel) {
    emitFeedback("Bitte zuerst ein Schuljahr auswaehlen.", "");
    return;
  }
  if (!date) {
    emitFeedback("Bitte zuerst ein Snapshot-Datum auswaehlen.", "");
    return;
  }

  const payload = buildSnapshotPreviewPayload();
  if (!payload.term?.term_id) {
    emitFeedback("Es konnte keine term_id fuer das gewaehlte Schuljahr gefunden werden.", "");
    return;
  }
  if (!payload.schools.length) {
    emitFeedback("Es wurden keine aktiven Schulen mit gueltiger SNR gefunden.", "");
    return;
  }

  managementSaving.value = true;
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
    emit("bootstrap-updated", resp.data?.bootstrap || {});
    openInfoDialog(
      `Snapshot erstellt - ${termLabel} - ${date}`,
      {
        existed: !!resp.data?.existed,
        created_count: Number(resp.data?.created_count || 0),
        snapshot_ids: Array.isArray(resp.data?.created_snapshots)
          ? resp.data.created_snapshots.map((entry: any) => Number(entry?.snapshot_id || 0)).filter((id: number) => id > 0)
          : [],
        records: Array.isArray(resp.data?.created_snapshots) ? resp.data.created_snapshots : [],
      },
    );
    emitFeedback(
      "",
      `Existiert: ${resp.data?.existed ? "Ja" : "Nein"} | Neu angelegt: ${Number(resp.data?.created_count || 0)}`,
    );
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Snapshots konnten nicht angelegt werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionLabel.value = "";
  }
}

async function handleSnapshotFetchData() {
  const term = findSelectedTerm();
  const date = String(snapshotDate.value || "").trim();
  const activeSourceIds = props.schoolSources
    .filter((source) => source?.is_active && Number(source?.source_id || 0) > 0)
    .map((source) => Number(source.source_id || 0));

  if (!term?.term_id) {
    emitFeedback("Es konnte keine term_id fuer das gewaehlte Schuljahr gefunden werden.", "");
    return;
  }
  if (!date) {
    emitFeedback("Bitte zuerst ein Snapshot-Datum auswaehlen.", "");
    return;
  }
  if (!activeSourceIds.length) {
    emitFeedback("Es wurden keine aktiven Schulserver-Quellen gefunden.", "");
    return;
  }

  managementSaving.value = true;
  currentActionLabel.value = "Schuelerdaten werden importiert...";
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/snapshot-students/import",
      {
        term_id: Number(term.term_id || 0),
        snapshot_date: date,
        source_ids: activeSourceIds,
      },
      { headers: managementAuthHeaders() },
    );
    openInfoDialog("Daten holen - snapshot_student", {
      total_rows: Number(resp.data?.total_rows || 0),
      rows: Array.isArray(resp.data?.rows) ? resp.data.rows : [],
    });
    emitFeedback("", `${Number(resp.data?.total_rows || 0)} snapshot_student-Zeilen verarbeitet.`);
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die snapshot_student-Daten konnten nicht geladen werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
    currentActionLabel.value = "";
  }
}
</script>

<template src="./SnapshotCreateManagement.html"></template>
<style scoped src="./SnapshotManagement.css"></style>
