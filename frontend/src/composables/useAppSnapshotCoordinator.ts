import { computed, ref, type Ref } from "vue";
import type { Snapshot } from "../types";

type SnapshotValueGetter = (snapshot: Snapshot) => string;
type SnapshotNameGetter = (snapshot: Snapshot) => string;

interface UseAppSnapshotCoordinatorOptions {
  snapshotOptions: Ref<Snapshot[]>;
  snapshotsForDropdown: Ref<Snapshot[]>;
  firstAvailableSnapshotValue: () => string;
  hasSnapshotOptionValue: (value: string) => boolean;
  snapshotOptionValue: SnapshotValueGetter;
  snapshotOptionName: SnapshotNameGetter;
  schoolYear: Ref<number>;
  termNo: Ref<number>;
  selectedCity: Ref<string>;
  selectedSnr: Ref<string>;
  selectedSnapshotForClasses: Ref<string>;
  selectedSnapshotForDaz: Ref<string>;
  selectedSnapshotForOverview: Ref<string>;
  selectedSnapshotForTeachers: Ref<string>;
}

export function useAppSnapshotCoordinator(options: UseAppSnapshotCoordinatorOptions) {
  const {
    snapshotOptions,
    snapshotsForDropdown,
    firstAvailableSnapshotValue,
    hasSnapshotOptionValue,
    snapshotOptionValue,
    snapshotOptionName,
    schoolYear,
    termNo,
    selectedCity,
    selectedSnr,
    selectedSnapshotForClasses,
    selectedSnapshotForDaz,
    selectedSnapshotForOverview,
    selectedSnapshotForTeachers,
  } = options;

  const activeSnapshotTermId = ref<number>(0);
  const activeSnapshotSource = ref<string>("");
  const activeSnapshotId = ref<string>("");

  function syncSnapshotSelections(value: string) {
    const nextValue = String(value || "");
    selectedSnapshotForClasses.value = nextValue;
    selectedSnapshotForDaz.value = nextValue;
    selectedSnapshotForOverview.value = nextValue;
    selectedSnapshotForTeachers.value = nextValue;
  }

  function resetLowerLevelFilters() {
    selectedCity.value = "";
    selectedSnr.value = "";
  }

  function findSnapshotOptionByDate(value: string): Snapshot | null {
    const selectedValue = String(value || "");
    if (!selectedValue) return null;

    const matchingOptions = snapshotOptions.value.filter(
      (option) => snapshotOptionValue(option) === selectedValue,
    );
    if (!matchingOptions.length) return null;

    const optionByTermId = matchingOptions.find(
      (option) =>
        Number(option?.termId || 0) === Number(activeSnapshotTermId.value || 0)
        && String(option?.source || "").trim() === String(activeSnapshotSource.value || "").trim(),
    );
    if (optionByTermId) return optionByTermId;

    const optionByCurrentTerm = matchingOptions.find(
      (option) =>
        Number(option?.schoolYear || 0) === Number(schoolYear.value || 0)
        && Number(option?.termNo || 0) === Number(termNo.value || 0),
    );
    return optionByCurrentTerm || matchingOptions[0] || null;
  }

  function compareSnapshotOptionsByRecency(a: Snapshot, b: Snapshot): number {
    const schoolYearA = Number(a?.schoolYear || 0);
    const schoolYearB = Number(b?.schoolYear || 0);
    if (schoolYearA !== schoolYearB) return schoolYearB - schoolYearA;

    const termNoA = Number(a?.termNo || 0);
    const termNoB = Number(b?.termNo || 0);
    if (termNoA !== termNoB) return termNoB - termNoA;

    const dateA = String(a?.snapshotDate || "");
    const dateB = String(b?.snapshotDate || "");
    return dateB.localeCompare(dateA, "de", { numeric: true });
  }

  function applySnapshotOption(option: Snapshot | null) {
    if (!option) return;
    activeSnapshotId.value = String(option?.snapId || "").trim();
    activeSnapshotTermId.value = Number(option?.termId || 0);
    activeSnapshotSource.value = String(option?.source || "").trim();
    schoolYear.value = Number(option.schoolYear || 0);
    termNo.value = Number(option.termNo || 0);
    resetLowerLevelFilters();
    syncSnapshotSelections(snapshotOptionValue(option));
  }

  const activeSnapshotSelection = computed<string>({
    get() {
      return selectedSnapshotForOverview.value
        || selectedSnapshotForClasses.value
        || selectedSnapshotForDaz.value
        || selectedSnapshotForTeachers.value
        || "";
    },
    set(value: string) {
      const selectedOption = findSnapshotOptionByDate(value);
      if (selectedOption?.schoolYear || selectedOption?.termNo) {
        applySnapshotOption(selectedOption);
        return;
      }

      activeSnapshotId.value = "";
      activeSnapshotTermId.value = 0;
      activeSnapshotSource.value = "";
      resetLowerLevelFilters();
      syncSnapshotSelections(value);
    },
  });

  const snapshotNameOptions = computed(() => {
    const entries = new Map<string, { value: string; label: string }>();
    for (const option of snapshotsForDropdown.value) {
      const value = snapshotOptionName(option);
      if (!value || entries.has(value)) continue;
      entries.set(value, { value, label: value });
    }

    return [...entries.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "de", { numeric: true }),
    );
  });

  const snapshotNameSelection = computed<string>({
    get() {
      const selectedOption = findSnapshotOptionByDate(activeSnapshotSelection.value);
      return selectedOption ? snapshotOptionName(selectedOption) : "";
    },
    set(value: string) {
      const selectedName = String(value || "");
      const matchingOptions = snapshotsForDropdown.value.filter(
        (option) => snapshotOptionName(option) === selectedName,
      );
      if (!matchingOptions.length) return;

      const newestOption = [...matchingOptions].sort(compareSnapshotOptionsByRecency)[0];
      applySnapshotOption(newestOption);
    },
  });

  const schoolTermOptions = computed(() => {
    const optionMap = new Map<number, { value: string; label: string; schoolYear: number; termNo: number }>();
    for (const option of snapshotsForDropdown.value || []) {
      if (snapshotNameSelection.value && snapshotOptionName(option) !== snapshotNameSelection.value) continue;

      const optionTermId = Number(option?.termId || 0);
      const optionSchoolYear = Number(option?.schoolYear || 0);
      const optionTermNo = Number(option?.termNo || 0);
      if (optionTermId <= 0 || optionSchoolYear <= 0 || optionTermNo <= 0) continue;
      if (optionMap.has(optionTermId)) continue;

      optionMap.set(optionTermId, {
        value: String(optionTermId),
        label: `${optionSchoolYear}.${String(optionTermNo).padStart(2, "0")}`,
        schoolYear: optionSchoolYear,
        termNo: optionTermNo,
      });
    }

    return [...optionMap.values()].sort((a, b) => {
      if (a.schoolYear !== b.schoolYear) return a.schoolYear - b.schoolYear;
      if (a.termNo !== b.termNo) return a.termNo - b.termNo;
      return Number(a.value) - Number(b.value);
    });
  });

  const schoolTermSelection = computed<string>({
    get() {
      const selectedOption = findSnapshotOptionByDate(activeSnapshotSelection.value);
      const selectedTermId = Number(selectedOption?.termId || 0);
      if (!selectedTermId) return "";

      const matchingOption = schoolTermOptions.value.find(
        (option) => Number(option.value) === selectedTermId,
      );
      return matchingOption?.value || "";
    },
    set(value: string) {
      const selectedOption = schoolTermOptions.value.find(
        (option) => option.value === String(value || ""),
      );
      if (!selectedOption) return;

      const matchingSnapshotOption = snapshotsForDropdown.value.find(
        (option) =>
          snapshotOptionName(option) === snapshotNameSelection.value
          && Number(option?.termId || 0) === Number(selectedOption.value),
      );
      if (matchingSnapshotOption) {
        applySnapshotOption(matchingSnapshotOption);
        return;
      }

      schoolYear.value = selectedOption.schoolYear;
      termNo.value = selectedOption.termNo;
    },
  });

  function selectedSnapshotOption() {
    return findSnapshotOptionByDate(activeSnapshotSelection.value);
  }

  function ensureActiveSnapshot() {
    const defaultSnapshot = firstAvailableSnapshotValue();
    if (!activeSnapshotSelection.value || !hasSnapshotOptionValue(activeSnapshotSelection.value)) {
      const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
      if (defaultOption) applySnapshotOption(defaultOption);
      else syncSnapshotSelections(defaultSnapshot);
    }
  }

  return {
    activeSnapshotId,
    activeSnapshotSelection,
    activeSnapshotSource,
    activeSnapshotTermId,
    ensureActiveSnapshot,
    schoolTermOptions,
    schoolTermSelection,
    selectedSnapshotOption,
    snapshotNameOptions,
    snapshotNameSelection,
  };
}
