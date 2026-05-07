<script setup lang="ts">
import { computed, ref, watch } from "vue";
import apiClient from "../services/apiClient";
import HelpOverlay from "./HelpOverlay.vue";

interface Props {
  managementToken?: string;
  isManagementSessionActive?: boolean;
  snapshots?: any[];
  schools?: any[];
  schoolSources?: any[];
  terms?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  managementToken: "",
  isManagementSessionActive: false,
  snapshots: () => [],
  schools: () => [],
  schoolSources: () => [],
  terms: () => [],
});

const emit = defineEmits<{
  (e: "bootstrap-updated", data: any): void;
  (e: "feedback", data: any): void;
}>();

const managementSaving = ref<boolean>(false);
const selectedSnapshotKey = ref<string>("");
const sortKey = ref<string>("school_name");
const sortDirection = ref<string>("asc");
const selectedTermLabel = ref<string>("");
const snapshotDate = ref<string>("");
const snapshotInfo = ref<string>("");
const deleteGroupDialogOpen = ref<boolean>(false);
const deleteGroupDialogLabel = ref<string>("");
const helpOverlayOpen = ref<boolean>(false);
const helpOverlayItems: string[] = [
  "Oben werden neue Snapshot-Staende fuer ein Schuljahr, ein Datum und eine Info angelegt.",
  "Im unteren Bereich wird ein vorhandener Snapshot ausgewaehlt und die enthaltenen Schulen werden verwaltet.",
  "Mit + wird eine Schule in den Snapshot aufgenommen, mit dem Muelleimer wieder entfernt.",
];

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
      term_id: Number(snapshot?.term_id || 0),
      snapshot_date: String(snapshot?.snapshot_date || "").trim(),
      school_year: Number(snapshot?.school_year || 0),
      term_no: Number(snapshot?.term_no || 0),
      imported_at: snapshot?.imported_at || null,
      info: String(snapshot?.info || "").trim(),
      source: String(snapshot?.source || "").trim(),
      label: formatSnapshotOptionLabel(snapshot),
    });
  }

  return options.sort((a, b) => {
    if (a.school_year !== b.school_year) return a.school_year - b.school_year;
    if (a.term_no !== b.term_no) return a.term_no - b.term_no;

    const dateCompare = String(a.snapshot_date).localeCompare(String(b.snapshot_date), "de", {
      numeric: true,
    });
    if (dateCompare !== 0) return dateCompare;

    return String(a.imported_at || "").localeCompare(String(b.imported_at || ""), "de", {
      numeric: true,
    });
  });
});

const selectedSnapshotOption = computed<any | null>(() =>
  snapshotOptions.value.find((option) => option.key === selectedSnapshotKey.value) || null,
);

const filteredSnapshots = computed<any[]>(() => {
  if (!selectedSnapshotKey.value) return [];
  return props.snapshots.filter((snapshot) => snapshotGroupKey(snapshot) === selectedSnapshotKey.value);
});

const selectedSnapshotBySnr = computed<Map<string, any>>(() => {
  const map = new Map<string, any>();
  for (const snapshot of filteredSnapshots.value) {
    const snr = String(snapshot?.snr || "").trim();
    if (!snr) continue;
    map.set(snr, snapshot);
  }
  return map;
});

const schoolRows = computed<any[]>(() =>
  props.schoolSources.map((schoolSource) => {
    const snr = String(schoolSource?.snr || "").trim();
    const snapshot = selectedSnapshotBySnr.value.get(snr) || null;

    return {
      source_id: Number(schoolSource?.source_id || 0),
      snr,
      school_name: String(schoolSource?.school_name || schoolSource?.name || "").trim(),
      city: String(schoolSource?.city || "").trim(),
      school_form_sf: String(schoolSource?.school_form_sf || "").trim(),
      db_name: String(schoolSource?.db_name || "").trim(),
      is_source_active: !!schoolSource?.is_active,
      is_in_snapshot: !!snapshot,
      snapshot_id: Number(snapshot?.snapshot_id || 0),
      snap_id: String(snapshot?.snap_id || selectedSnapshotOption.value?.snap_id || "").trim(),
      snapshot_date: String(snapshot?.snapshot_date || selectedSnapshotOption.value?.snapshot_date || "").trim(),
      imported_at: snapshot?.imported_at || null,
      info: String(snapshot?.info || "").trim(),
      source: String(snapshot?.source || "").trim(),
      record_count: Number(snapshot?.record_count || 0),
    };
  }),
);

const sortedSchoolRows = computed<any[]>(() => {
  const factor = sortDirection.value === "desc" ? -1 : 1;

  return [...schoolRows.value].sort((a, b) => {
    const aValue = sortableValue(a, sortKey.value);
    const bValue = sortableValue(b, sortKey.value);

    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * factor;
    }

    return String(aValue).localeCompare(String(bValue), "de", { numeric: true }) * factor;
  });
});

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

watch(
  termLabelOptions,
  (labels) => {
    if (!labels.length) {
      selectedTermLabel.value = "";
      return;
    }
    if (labels.includes(selectedTermLabel.value)) return;
    selectedTermLabel.value = labels.includes(currentSchoolYearLabel.value)
      ? currentSchoolYearLabel.value
      : labels[labels.length - 1];
  },
  { immediate: true },
);

watch(
  () => props.isManagementSessionActive,
  (isActive) => {
    if (!isActive) return;
    if (!String(snapshotDate.value || "").trim()) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      snapshotDate.value = `${year}-${month}-${day}`;
    }
  },
  { immediate: true },
);

function managementAuthHeaders() {
  return props.managementToken
    ? { Authorization: `Bearer ${props.managementToken}` }
    : {};
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

async function createSnapshots() {
  const term = findSelectedTerm();
  if (!term?.term_id) {
    emitFeedback("Bitte zuerst ein gueltiges Schuljahr waehlen.", "");
    return;
  }

  const snapshotDateValue = String(snapshotDate.value || "").trim();
  if (!snapshotDateValue) {
    emitFeedback("Bitte zuerst ein Snapshot-Datum waehlen.", "");
    return;
  }

  const snapshotInfoValue = String(snapshotInfo.value || "").trim();
  if (!snapshotInfoValue) {
    emitFeedback("Bitte zuerst einen Info-Text eintragen.", "");
    return;
  }

  const activeSchoolSnrs = new Set(
    props.schoolSources
      .filter((source) => !!source?.is_active)
      .map((source) => String(source?.snr || "").trim())
      .filter(Boolean),
  );

  const schoolSnrs = props.schools
    .map((school) => String(school?.snr || "").trim())
    .filter((snr) => activeSchoolSnrs.has(snr))
    .filter(Boolean);

  if (!schoolSnrs.length) {
    emitFeedback("Es sind keine aktiven Schulen mit Snapshot-Quelle zum Anlegen vorhanden.", "");
    return;
  }

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/snapshots",
      {
        term_id: Number(term.term_id || 0),
        snapshot_date: snapshotDateValue,
        info: snapshotInfoValue,
        school_snrs: [...new Set(schoolSnrs)],
      },
      { headers: managementAuthHeaders() },
    );
    emit("bootstrap-updated", resp.data?.bootstrap || {});
    emitFeedback("", resp.data?.message || "Snapshot erfolgreich angelegt.");
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Snapshots konnten nicht angelegt werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
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
  if (info && source && info !== source) return `${baseLabel} - ${info} - ${source}`;
  if (info) return `${baseLabel} - ${info}`;
  if (source) return `${baseLabel} - ${source}`;
  return baseLabel;
}

async function deleteSelectedSnapshotGroup() {
  if (!selectedSnapshotOption.value) return;
  deleteGroupDialogLabel.value = selectedSnapshotOption.value.label;
  deleteGroupDialogOpen.value = true;
}

function closeDeleteGroupDialog() {
  if (managementSaving.value) return;
  deleteGroupDialogOpen.value = false;
  deleteGroupDialogLabel.value = "";
}

async function confirmDeleteSelectedSnapshotGroup() {
  if (!selectedSnapshotOption.value) {
    closeDeleteGroupDialog();
    return;
  }

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.delete("/api/auth/admin/snapshots", {
      params: {
        snapId: String(selectedSnapshotOption.value.snap_id || "").trim(),
      },
      headers: managementAuthHeaders(),
    });
    emit("bootstrap-updated", resp.data || {});
    emitFeedback("", "Gesamter Snapshot geloescht.");
    deleteGroupDialogOpen.value = false;
    deleteGroupDialogLabel.value = "";
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Der Snapshot-Stand konnte nicht geloescht werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}

function sortableValue(snapshot: any, key: string): string | number {
  if (
    key === "snapshot_id" ||
    key === "school_year" ||
    key === "term_no" ||
    key === "record_count" ||
    key === "is_in_snapshot"
  ) {
    return Number(snapshot?.[key] || 0);
  }
  return String(snapshot?.[key] || "").trim().toLowerCase();
}

function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }

  sortKey.value = key;
  sortDirection.value = key === "imported_at" ? "desc" : "asc";
}

function sortIndicator(key: string): string {
  if (sortKey.value !== key) return "";
  return sortDirection.value === "asc" ? "▲" : "▼";
}

function formatImportedAt(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE");
}

async function deleteSnapshot(snapshot: any) {
  if (!snapshot?.snapshot_id) return;
  const label = `${snapshot.school_name || snapshot.snr || "Unbekannt"} / ${snapshot.snapshot_date || "-"}`;
  if (!window.confirm(`Snapshot "${label}" wirklich loeschen?`)) return;

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.delete(`/api/auth/admin/snapshots/${snapshot.snapshot_id}`, {
      headers: managementAuthHeaders(),
    });
    emit("bootstrap-updated", resp.data || {});
    emitFeedback("", "Snapshot geloescht.");
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Der Snapshot konnte nicht geloescht werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}

async function addSchoolToSnapshot(school: any) {
  if (!selectedSnapshotOption.value?.snap_id || !school?.snr) return;

  managementSaving.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.post(
      "/api/auth/admin/snapshots/schools",
      {
        snap_id: String(selectedSnapshotOption.value.snap_id || "").trim(),
        school_snr: String(school.snr || "").trim(),
      },
      { headers: managementAuthHeaders() },
    );
    emit("bootstrap-updated", resp.data?.bootstrap || {});
    emitFeedback("", resp.data?.message || "Schule in Snapshot aufgenommen.");
  } catch (e: any) {
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die Schule konnte nicht in den Snapshot aufgenommen werden.",
      "",
    );
  } finally {
    managementSaving.value = false;
  }
}
</script>

<template src="./SnapshotManagement.html"></template>
<style scoped src="./SnapshotManagement.css"></style>
