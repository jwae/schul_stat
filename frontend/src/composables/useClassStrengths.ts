import { ref, computed } from "vue";
import { authStore } from "../authStore";
import { kpiService } from "../services/apiService";
import { useGlobalFilters } from "./useGlobalFilters";
import type { ClassStrengthRow } from "../types";

export function useClassStrengths() {
  const filters = useGlobalFilters();
  const loadingClasses = ref<boolean>(false);
  const errorClasses = ref<string>("");
  const selectedSnapshotForClasses = ref<string>("");
  const classRows = ref<ClassStrengthRow[]>([]);
  const lowerThreshold = ref<number>(15);
  const upperThreshold = ref<number>(33);

  async function loadClassStrengths(termId: number = 0, source: string = "", snapId: string = "") {
    if (!authStore.token) return;
    if (!selectedSnapshotForClasses.value) return;
    const selectedValue = String(selectedSnapshotForClasses.value || "").trim();
    const normalizedSnapId = String(snapId || "").trim();
    const derivedSnapId = selectedValue && !/^\d{4}-\d{2}-\d{2}$/.test(selectedValue) ? selectedValue : "";
    const effectiveSnapId = normalizedSnapId || derivedSnapId;
    const fallbackSnapshotDate = effectiveSnapId ? "" : selectedValue;

    loadingClasses.value = true;
    errorClasses.value = "";
    try {
      const data = await kpiService.getClassStrengths({
        schoolYear: filters.schoolYear.value,
        termNo: filters.termNo.value,
        termId: termId || undefined,
        snapId: effectiveSnapId || undefined,
        source: source || undefined,
        snapshotDate: fallbackSnapshotDate || undefined,
        city: filters.selectedCity.value || undefined,
        snr: filters.selectedSnr.value || undefined,
      });
      classRows.value = data.rows || [];
    } catch (e: any) {
      classRows.value = [];
      errorClasses.value =
        e?.response?.data?.error || e?.message || "Fehler beim Laden.";
    } finally {
      loadingClasses.value = false;
    }
  }

  const classCodes = computed(() => {
    const set = new Set(classRows.value.map((r) => r.class_code));
    return [...set].sort((a, b) => String(a).localeCompare(String(b)));
  });

  const schoolsInClassMatrix = computed(() => {
    const map = new Map<string, { city: string; snr: string; name: string }>();
    for (const r of classRows.value) {
      if (!map.has(r.snr))
        map.set(r.snr, { city: r.city, snr: r.snr, name: r.name });
    }
    return [...map.values()].sort((a, b) =>
      String(a.snr).localeCompare(String(b.snr)),
    );
  });

  const classStrengthMap = computed(() => {
    const m = new Map<string, number>();
    for (const r of classRows.value) {
      m.set(`${r.snr}__${r.class_code}`, Number(r.students));
    }
    return m;
  });

  function getClassStudents(snr: string, classCode: string): number {
    return classStrengthMap.value.get(`${snr}__${classCode}`) ?? 0;
  }

  function totalForSchool(snr: string): number {
    let sum = 0;
    for (const c of classCodes.value) sum += getClassStudents(snr, c);
    return sum;
  }

  function totalForClass(classCode: string): number {
    let sum = 0;
    for (const s of schoolsInClassMatrix.value)
      sum += getClassStudents(s.snr, classCode);
    return sum;
  }

  const grandTotalClasses = computed(() => {
    return classRows.value.reduce((sum, r) => sum + Number(r.students), 0);
  });

  function classCellClass(value: number | string): string {
    const v = Number(value);
    if (v === 0) return "";
    if (v <= lowerThreshold.value) return "cell-low";
    if (v >= upperThreshold.value) return "cell-high";
    return "";
  }

  return {
    loadingClasses,
    errorClasses,
    selectedSnapshotForClasses,
    classRows,
    lowerThreshold,
    upperThreshold,
    loadClassStrengths,
    classCodes,
    schoolsInClassMatrix,
    getClassStudents,
    totalForSchool,
    totalForClass,
    grandTotalClasses,
    classCellClass,
  };
}
