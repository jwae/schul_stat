import { ref, computed } from "vue";
import { authStore } from "../authStore";
import { kpiService } from "../services/apiService";
import { useGlobalFilters } from "./useGlobalFilters";
import type { DazRow } from "../types";

export function useDaz() {
  const filters = useGlobalFilters();
  const loadingDaz = ref<boolean>(false);
  const errorDaz = ref<string>("");
  const selectedSnapshotForDaz = ref<string>("");
  const dazRows = ref<DazRow[]>([]);
  const dazLowerThreshold = ref<number>(3);
  const dazUpperThreshold = ref<number>(10);

  async function loadDaz(termId: number = 0, source: string = "", snapId: string = "") {
    if (!authStore.token) return;
    if (!selectedSnapshotForDaz.value) return;
    const selectedValue = String(selectedSnapshotForDaz.value || "").trim();
    const normalizedSnapId = String(snapId || "").trim();
    const derivedSnapId = selectedValue && !/^\d{4}-\d{2}-\d{2}$/.test(selectedValue) ? selectedValue : "";
    const effectiveSnapId = normalizedSnapId || derivedSnapId;
    const fallbackSnapshotDate = effectiveSnapId ? "" : selectedValue;

    loadingDaz.value = true;
    errorDaz.value = "";
    try {
      const data = await kpiService.getDaz({
        schoolYear: filters.schoolYear.value,
        termNo: filters.termNo.value,
        termId: termId || undefined,
        snapId: effectiveSnapId || undefined,
        source: source || undefined,
        snapshotDate: fallbackSnapshotDate || undefined,
        city: filters.selectedCity.value || undefined,
        snr: filters.selectedSnr.value || undefined,
      });
      dazRows.value = data.rows || [];
    } catch (e: any) {
      dazRows.value = [];
      errorDaz.value =
        e?.response?.data?.error || e?.message || "Fehler beim Laden.";
    } finally {
      loadingDaz.value = false;
    }
  }

  const dazClassCodes = computed(() => {
    const set = new Set(dazRows.value.map((r) => r.class_code));
    return [...set].sort((a, b) => String(a).localeCompare(String(b)));
  });

  const schoolsInDazMatrix = computed(() => {
    const map = new Map<string, { city: string; snr: string; name: string }>();
    for (const r of dazRows.value) {
      if (!map.has(r.snr))
        map.set(r.snr, { city: r.city, snr: r.snr, name: r.name });
    }
    return [...map.values()].sort((a, b) =>
      String(a.snr).localeCompare(String(b.snr)),
    );
  });

  const dazMap = computed(() => {
    const m = new Map<string, number>();
    for (const r of dazRows.value) {
      m.set(`${r.snr}__${r.class_code}`, Number(r.daz));
    }
    return m;
  });

  function getDaz(snr: string, classCode: string): number {
    return dazMap.value.get(`${snr}__${classCode}`) ?? 0;
  }

  function totalDazForSchool(snr: string): number {
    let sum = 0;
    for (const c of dazClassCodes.value) sum += getDaz(snr, c);
    return sum;
  }

  function totalDazForClass(classCode: string): number {
    let sum = 0;
    for (const s of schoolsInDazMatrix.value) sum += getDaz(s.snr, classCode);
    return sum;
  }

  const grandTotalDaz = computed(() => {
    return dazRows.value.reduce((sum, r) => sum + Number(r.daz), 0);
  });

  function dazCellClass(value: number | string): string {
    const v = Number(value);
    if (v === 0) return "";
    if (v <= dazLowerThreshold.value) return "cell-low";
    if (v >= dazUpperThreshold.value) return "cell-high";
    return "";
  }

  return {
    loadingDaz,
    errorDaz,
    selectedSnapshotForDaz,
    dazRows,
    dazLowerThreshold,
    dazUpperThreshold,
    loadDaz,
    dazClassCodes,
    schoolsInDazMatrix,
    getDaz,
    totalDazForSchool,
    totalDazForClass,
    grandTotalDaz,
    dazCellClass,
  };
}
