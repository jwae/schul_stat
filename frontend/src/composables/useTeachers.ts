import { ref, computed } from "vue";
import { authStore } from "../authStore";
import { kpiService } from "../services/apiService";
import { useGlobalFilters } from "./useGlobalFilters";
import type { TeacherData } from "../types";
import {
  buildTeacherAgeChartOption,
  buildTeacherCityChartOption,
  buildTeacherNationChartOption,
  buildTeacherSexChartOption,
} from "../charts/teachers/options";

// Shared state (Singleton)
const loadingTeachers = ref<boolean>(false);
const errorTeachers = ref<string>("");
const teachersData = ref<TeacherData | null>(null);
const selectedSnapshotForTeachers = ref<string>("");

export function useTeachers() {
  const filters = useGlobalFilters();

  const teacherSexChartOption = computed(() => (teachersData.value ? buildTeacherSexChartOption(teachersData.value) : null));
  const teacherAgeChartOption = computed(() => (teachersData.value ? buildTeacherAgeChartOption(teachersData.value) : null));
  const teacherCityChartOption = computed(() => (teachersData.value ? buildTeacherCityChartOption(teachersData.value) : null));
  const teacherNationChartOption = computed(() => (teachersData.value ? buildTeacherNationChartOption(teachersData.value) : null));

  async function loadTeacherData(snapshotDate: string, termId: number = 0, source: string = "", snapId: string = "") {
    if (!authStore.token) return;
    const normalizedSnapId = String(snapId || "").trim();
    const normalizedSnapshotDate = String(snapshotDate || "").trim();
    const derivedSnapId = normalizedSnapshotDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedSnapshotDate)
      ? normalizedSnapshotDate
      : "";
    const effectiveSnapId = normalizedSnapId || derivedSnapId;
    if (!effectiveSnapId && !normalizedSnapshotDate) return;

    loadingTeachers.value = true;
    errorTeachers.value = "";
    try {
      const data = await kpiService.getTeachers({
        schoolYear: filters.schoolYear.value,
        termNo: filters.termNo.value,
        termId: termId || undefined,
        snapId: effectiveSnapId || undefined,
        source: source || undefined,
        snapshotDate: effectiveSnapId ? undefined : normalizedSnapshotDate,
        city: filters.selectedCity.value || undefined,
        snr: filters.selectedSnr.value || undefined,
      });
      teachersData.value = data || null;
    } catch (e: any) {
      teachersData.value = null;
      errorTeachers.value = e?.response?.data?.error || e?.message || "Fehler beim Laden der Lehrerdaten.";
    } finally {
      loadingTeachers.value = false;
    }
  }

  return {
    loadingTeachers,
    errorTeachers,
    teachersData,
    selectedSnapshotForTeachers,
    teacherSexChartOption,
    teacherAgeChartOption,
    teacherCityChartOption,
    teacherNationChartOption,
    loadTeacherData,
  };
}
