import { ref, computed } from "vue";
import { authStore } from "../authStore";
import { metaService } from "../services/apiService";
import type { School, Snapshot } from "../types";

// Shared state (Singleton Pattern)
const schoolYear = ref<number>(2024);
const termNo = ref<number>(1);
const schools = ref<School[]>([]);
const selectedCity = ref<string>("");
const selectedSnr = ref<string>("");
const snapshotOptions = ref<Snapshot[]>([]);

let schoolsRequestId = 0;

export function useGlobalFilters() {
  const cities = computed(() => {
    return [...new Set(schools.value.map((s) => s.city).filter(Boolean))].sort();
  });

  const schoolsFilteredForDropdown = computed(() => {
    const filtered = !selectedCity.value
      ? [...schools.value]
      : schools.value.filter((s) => (s.city || "") === selectedCity.value);
    return filtered.sort((a, b) => String(a?.snr || "").localeCompare(String(b?.snr || ""), "de", { numeric: true }));
  });

  async function loadSchools(activeSnapshotOption: Snapshot | null = null) {
    if (!authStore.token) return;
    const requestId = ++schoolsRequestId;
    try {
      const data = await metaService.getSchools({
        termId: Number(activeSnapshotOption?.termId || 0) || undefined,
        snapId: String(activeSnapshotOption?.snapId || "").trim() || undefined,
        snapshotDate: String(activeSnapshotOption?.snapshotDate || "").trim() || undefined,
        source: String(activeSnapshotOption?.source || "").trim() || undefined,
        schoolYear: schoolYear.value,
        termNo: termNo.value,
      });
      if (requestId !== schoolsRequestId) return;
      schools.value = data;

      const availableCities = new Set((schools.value || []).map((school) => String(school?.city || "").trim()).filter(Boolean));
      if (selectedCity.value && !availableCities.has(String(selectedCity.value || "").trim())) {
        selectedCity.value = "";
      }

      const availableSnrs = new Set((schools.value || []).map((school) => String(school?.snr || "").trim()).filter(Boolean));
      if (selectedSnr.value && !availableSnrs.has(String(selectedSnr.value || "").trim())) {
        selectedSnr.value = "";
      }
    } catch (error) {
       console.error("Failed to load schools", error);
    }
  }

  async function loadSnapshots() {
    if (!authStore.token) return;
    try {
      const data = await metaService.getSnapshots({});
      snapshotOptions.value = Array.isArray(data) ? data : [];
    } catch {
      snapshotOptions.value = [];
    }
  }

  function resetFilters() {
    selectedCity.value = "";
    selectedSnr.value = "";
  }

  return {
    schoolYear,
    termNo,
    schools,
    selectedCity,
    selectedSnr,
    snapshotOptions,
    cities,
    schoolsFilteredForDropdown,
    loadSchools,
    loadSnapshots,
    resetFilters,
  };
}
