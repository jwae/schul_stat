<script setup lang="ts">
import { computed, ref, watch } from "vue";
import apiClient from "../services/apiClient";

interface Props {
  managementToken?: string;
  isManagementSessionActive?: boolean;
  snapshots?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  managementToken: "",
  isManagementSessionActive: false,
  snapshots: () => [],
});

const emit = defineEmits<{
  (e: "feedback", data: any): void;
}>();

const loading = ref<boolean>(false);
const selectedSnapshotKey = ref<string>("");
const studentSectionOpen = ref<boolean>(false);
const teacherSectionOpen = ref<boolean>(false);
const studentSearch = ref<string>("");
const teacherSearch = ref<string>("");
const studentSearchColumn = ref<string>("");
const teacherSearchColumn = ref<string>("");
const studentSortKey = ref<string>("school_name");
const studentSortDirection = ref<string>("asc");
const teacherSortKey = ref<string>("school_name");
const teacherSortDirection = ref<string>("asc");
const snapshotStudents = ref<any[]>([]);
const snapshotTeachers = ref<any[]>([]);

const studentFilterColumns = [
  { key: "", label: "Alle Spalten" },
  { key: "snr", label: "SNR" },
  { key: "school_name", label: "Schule" },
  { key: "school_city", label: "Ort" },
  { key: "student_no", label: "SuS-Nr." },
  { key: "school_form_short", label: "SF" },
  { key: "education_track_sf", label: "BG" },
  { key: "class_label", label: "Klasse" },
  { key: "religion_label", label: "Religion" },
  { key: "nation_label", label: "Nation" },
];

const teacherFilterColumns = [
  { key: "", label: "Alle Spalten" },
  { key: "snr", label: "SNR" },
  { key: "school_name", label: "Schule" },
  { key: "teacher_no", label: "LNr." },
  { key: "teacher_city", label: "Wohnort" },
  { key: "nation_label", label: "Nation" },
];

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
    if (a.school_year !== b.school_year) return b.school_year - a.school_year;
    if (a.term_no !== b.term_no) return b.term_no - a.term_no;
    const dateCompare = String(b.snapshot_date).localeCompare(String(a.snapshot_date), "de", { numeric: true });
    if (dateCompare !== 0) return dateCompare;
    return String(b.imported_at || "").localeCompare(String(a.imported_at || ""), "de", { numeric: true });
  });
});

const selectedSnapshotOption = computed<any | null>(() =>
  snapshotOptions.value.find((option) => option.key === selectedSnapshotKey.value) || null,
);

const sortedSnapshotStudents = computed<any[]>(() => {
  const factor = studentSortDirection.value === "desc" ? -1 : 1;
  return [...snapshotStudents.value].sort((a, b) => compareValues(a, b, studentSortKey.value) * factor);
});

const sortedSnapshotTeachers = computed<any[]>(() => {
  const factor = teacherSortDirection.value === "desc" ? -1 : 1;
  return [...snapshotTeachers.value].sort((a, b) => compareValues(a, b, teacherSortKey.value) * factor);
});

const filteredSnapshotStudents = computed<any[]>(() => {
  const needle = String(studentSearch.value || "").trim().toLowerCase();
  if (!needle) return sortedSnapshotStudents.value;
  
  const col = studentSearchColumn.value;
  return sortedSnapshotStudents.value.filter((row) => {
    if (col) {
      const val = col === "class_label" ? formatClassLabel(row) : row[col];
      return String(val ?? "").toLowerCase().includes(needle);
    }
    return buildStudentSearchText(row).includes(needle);
  });
});

const filteredSnapshotTeachers = computed<any[]>(() => {
  const needle = String(teacherSearch.value || "").trim().toLowerCase();
  if (!needle) return sortedSnapshotTeachers.value;
  
  const col = teacherSearchColumn.value;
  return sortedSnapshotTeachers.value.filter((row) => {
    if (col) {
      return String(row[col] ?? "").toLowerCase().includes(needle);
    }
    return buildTeacherSearchText(row).includes(needle);
  });
});

watch(
  snapshotOptions,
  (options) => {
    if (!options.length) {
      selectedSnapshotKey.value = "";
      snapshotStudents.value = [];
      snapshotTeachers.value = [];
      return;
    }
    if (options.some((option) => option.key === selectedSnapshotKey.value)) return;
    selectedSnapshotKey.value = options[0].key;
  },
  { immediate: true },
);

watch(
  () => selectedSnapshotOption.value?.key || "",
  async (key) => {
    if (!props.isManagementSessionActive || !key || !selectedSnapshotOption.value) {
      snapshotStudents.value = [];
      snapshotTeachers.value = [];
      return;
    }
    await loadDbContents();
  },
  { immediate: true },
);

watch(
  () => props.isManagementSessionActive,
  async (isActive) => {
    if (!isActive || !selectedSnapshotOption.value) return;
    await loadDbContents();
  },
);

function managementAuthHeaders() {
  return props.managementToken
    ? { Authorization: `Bearer ${props.managementToken}` }
    : {};
}

function emitFeedback(error: string = "", notice: string = "") {
  emit("feedback", { error, notice });
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

function compareValues(a: any, b: any, key: string): number {
  const aValue = sortableValue(a, key);
  const bValue = sortableValue(b, key);
  if (typeof aValue === "number" && typeof bValue === "number") {
    return aValue - bValue;
  }
  return String(aValue).localeCompare(String(bValue), "de", { numeric: true });
}

function buildStudentSearchText(row: any): string {
  return [
    row?.snapshot_id,
    row?.snr,
    row?.school_name,
    row?.school_city,
    row?.student_no,
    row?.school_form_short,
    row?.school_form_label,
    row?.education_track_label,
    row?.class_grade,
    row?.class_parallel,
    row?.religion_label,
    row?.support_focus1_label,
    row?.support_focus2_label,
    row?.sex_label,
    row?.nation_label,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join(" ");
}

function buildTeacherSearchText(row: any): string {
  return [
    row?.snapshot_id,
    row?.snr,
    row?.school_name,
    row?.school_city,
    row?.teacher_no,
    row?.sex_label,
    row?.nation_label,
    row?.teacher_city,
    row?.age,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join(" ");
}

function sortableValue(row: any, key: string): string | number {
  if (["snapshot_id", "student_no", "teacher_no", "class_id", "age", "migration", "school_year", "term_no", "school_form_id", "education_track_id", "ef", "religion_id", "special_needs", "support_focus1_id", "support_focus2_id", "target_different", "nation_id"].includes(key)) {
    return Number(row?.[key] || 0);
  }
  if (key === "class_label") {
    return String(formatClassLabel(row) || "").trim().toLowerCase();
  }
  if (key === "migration_label") {
    return row?.migration ? 1 : 0;
  }
  return String(row?.[key] || "").trim().toLowerCase();
}

function toggleStudentSort(key: string) {
  if (studentSortKey.value === key) {
    studentSortDirection.value = studentSortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  studentSortKey.value = key;
  studentSortDirection.value = "asc";
}

function toggleTeacherSort(key: string) {
  if (teacherSortKey.value === key) {
    teacherSortDirection.value = teacherSortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  teacherSortKey.value = key;
  teacherSortDirection.value = "asc";
}

function sortIndicator(activeKey: string, currentKey: string, currentDirection: string): string {
  if (activeKey !== currentKey) return "";
  return currentDirection === "asc" ? " ^" : " v";
}

function formatClassLabel(row: any): string {
  const grade = String(row?.class_grade || "").trim();
  const parallel = String(row?.class_parallel || "").trim();
  if (grade && parallel) return `${grade}${parallel}`;
  return grade || parallel || "-";
}

function formatSexInitial(value: any): string {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.charAt(0).toUpperCase();
}

function formatFlag(value: any): string {
  return Number(value || 0) === 1 ? "J" : "N";
}

function truncateText(value: any, maxLength: number): string {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

async function loadDbContents() {
  if (!selectedSnapshotOption.value) return;

  loading.value = true;
  emitFeedback("", "");

  try {
    const resp = await apiClient.get("/api/auth/admin/db-contents", {
      params: {
        snapId: String(selectedSnapshotOption.value.snap_id || "").trim(),
      },
      headers: managementAuthHeaders(),
    });
    snapshotStudents.value = Array.isArray(resp.data?.snapshot_students) ? resp.data.snapshot_students : [];
    snapshotTeachers.value = Array.isArray(resp.data?.snapshot_teachers) ? resp.data.snapshot_teachers : [];
  } catch (e: any) {
    snapshotStudents.value = [];
    snapshotTeachers.value = [];
    emitFeedback(
      e?.response?.data?.error ||
      e?.message ||
      "Die DB-Inhalte konnten nicht geladen werden.",
      "",
    );
  } finally {
    loading.value = false;
  }
}

function toggleStudentSection() {
  studentSectionOpen.value = !studentSectionOpen.value;
}

function toggleTeacherSection() {
  teacherSectionOpen.value = !teacherSectionOpen.value;
}
</script>

<template src="./DbContentsManagement.html"></template>
<style scoped src="./SnapshotManagement.css"></style>
<style scoped>
.db-contents-table-wrap {
  max-height: 760px;
  overflow-y: auto;
}

.db-contents-table-wrap .snapshot-management-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
}

.db-contents-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 132px;
}

.db-contents-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.db-contents-toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: #526884;
  border-radius: 8px;
}

.db-contents-toggle-icon:hover {
  background: rgba(82, 104, 132, 0.08);
}

.db-contents-toggle-icon i {
  font-size: 16px;
  line-height: 1;
}

.db-contents-inline-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  min-width: 260px;
}

.db-contents-inline-filter-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #526884;
  white-space: nowrap;
}

.db-contents-column-select {
  height: 36px;
  padding: 0 12px;
  border: 1px solid #d7e1ee;
  border-radius: 10px;
  background: #f8fbff;
  font-size: 13px;
  color: #4d637f;
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.db-contents-column-select:focus {
  border-color: #7fa6d8;
  box-shadow: 0 0 0 3px rgba(127, 166, 216, 0.16);
}

.db-contents-inline-filter-input {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid #d7e1ee;
  border-radius: 10px;
  background: #f8fbff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  box-sizing: border-box;
}

.db-contents-inline-filter-input i {
  color: #7a8ea8;
  font-size: 13px;
}

.db-contents-inline-filter-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: #7a8ea8;
}

.db-contents-inline-filter-clear:hover {
  color: #4d637f;
}

.db-contents-inline-filter-clear i {
  font-size: 18px;
  line-height: 1;
}

.db-contents-inline-filter-input input {
  width: 220px;
  max-width: 100%;
  height: 36px;
  border: none;
  background: transparent;
  outline: none;
  box-shadow: none;
  padding: 0;
}

.db-contents-inline-filter-input:focus-within {
  border-color: #7fa6d8;
  box-shadow: 0 0 0 3px rgba(127, 166, 216, 0.16);
}
</style>
