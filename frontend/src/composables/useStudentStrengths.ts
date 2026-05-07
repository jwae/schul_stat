import { ref, computed } from "vue";
import { authStore } from "../authStore";
import { kpiService } from "../services/apiService";
import { useGlobalFilters } from "./useGlobalFilters";
import type { StudentStrengthRow } from "../types";

export function useStudentStrengths() {
  const filters = useGlobalFilters();
  const loadingStrengths = ref<boolean>(false);
  const errorStrengths = ref<string>("");
  const strengthRows = ref<StudentStrengthRow[]>([]);
  const selectedSnapshotForStrengths = ref<string>("");

  const filteredStrengthRows = computed(() => {
    let out = strengthRows.value;
    if (filters.selectedCity.value)
      out = out.filter((r) => (r.city || "") === filters.selectedCity.value);
    if (filters.selectedSnr.value) out = out.filter((r) => r.snr === filters.selectedSnr.value);
    // Matrix view: we want to see ALL years of the snapshot type, so no single-date filter here
    return out;
  });

  const snapshotsStrength = computed(() => {
    const map = new Map<string, string>();
    for (const r of filteredStrengthRows.value) {
      if (!map.has(r.snapshotDate)) {
        map.set(r.snapshotDate, r.snapshotLabel || r.snapshotDate);
      }
    }
    // Sort descending by date to show newest first
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, label]) => ({ date, label }));
  });

  const schoolsInStrengthMatrix = computed(() => {
    const map = new Map<string, { snr: string; name: string; city: string }>();
    for (const r of filteredStrengthRows.value) {
      if (!map.has(r.snr))
        map.set(r.snr, { snr: r.snr, name: r.name, city: r.city });
    }
    return [...map.values()].sort((a, b) =>
      String(a.snr).localeCompare(String(b.snr)),
    );
  });

  function getStrengthStudents(snr: string, snapshotDate: string): number {
    const hit = filteredStrengthRows.value.find(
      (r) => r.snr === snr && r.snapshotDate === snapshotDate,
    );
    return hit ? Number(hit.students) : 0;
  }

  function totalStrengthForSnapshot(snapshotDate: string): number {
    return filteredStrengthRows.value
      .filter((r) => r.snapshotDate === snapshotDate)
      .reduce((sum, r) => sum + Number(r.students), 0);
  }

  const grandTotalStrengths = computed(() => {
    return filteredStrengthRows.value.reduce(
      (sum, r) => sum + Number(r.students),
      0,
    );
  });

  async function loadStrengths(snapshotName: string = "") {
    if (!authStore.token) return;
    loadingStrengths.value = true;
    errorStrengths.value = "";
    try {
      const data = await kpiService.getStudentStrengths({
        snapshotName: snapshotName || undefined,
        city: filters.selectedCity.value || undefined,
        snr: filters.selectedSnr.value || undefined,
      });
      strengthRows.value = data.rows || [];
    } catch (e: any) {
      strengthRows.value = [];
      errorStrengths.value =
        e?.response?.data?.error || e?.message || "Fehler beim Laden.";
    } finally {
      loadingStrengths.value = false;
    }
  }

  return {
    loadingStrengths,
    errorStrengths,
    strengthRows,
    selectedSnapshotForStrengths,
    filteredStrengthRows,
    snapshotsStrength,
    schoolsInStrengthMatrix,
    getStrengthStudents,
    totalStrengthForSnapshot,
    grandTotalStrengths,
    loadStrengths,
  };
}
