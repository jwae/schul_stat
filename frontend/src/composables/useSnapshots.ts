import { computed } from "vue";
import { getSnapshotValue, getSnapshotLabel, getSnapshotName } from "../utils/formatters";
import { useGlobalFilters } from "./useGlobalFilters";
import { useStudentStrengths } from "./useStudentStrengths";
import type { Snapshot } from "../types";

export function useSnapshots() {
  const filters = useGlobalFilters();
  const studentStrengths = useStudentStrengths();
  
  const snapshotsForDropdown = computed<Snapshot[]>(() => {
    const options = filters.snapshotOptions.value?.length
      ? filters.snapshotOptions.value
      : studentStrengths.snapshotsStrength.value.map((d) => ({
          snapshotDate: String(d?.date || ""),
          info: String(d?.label || "").trim() || undefined,
          schoolYear: 0,
          termNo: 0,
        }));

    return [...options]
      .sort((a, b) => {
      const aSchoolYear = Number(a?.schoolYear || 0);
      const bSchoolYear = Number(b?.schoolYear || 0);
      if (aSchoolYear !== bSchoolYear) return aSchoolYear - bSchoolYear;

      const aTermNo = Number(a?.termNo || 0);
      const bTermNo = Number(b?.termNo || 0);
      if (aTermNo !== bTermNo) return aTermNo - bTermNo;

      return getSnapshotValue(a).localeCompare(getSnapshotValue(b), "de", {
        numeric: true,
      });
    });
  });

  function firstAvailableSnapshotValue(): string {
    return snapshotsForDropdown.value.length
      ? getSnapshotValue(snapshotsForDropdown.value[0])
      : "";
  }

  function hasSnapshotOptionValue(value: string): boolean {
    const normalizedValue = String(value || "");
    return snapshotsForDropdown.value.some(
      (option) => getSnapshotValue(option) === normalizedValue,
    );
  }

  return {
    snapshotOptionValue: getSnapshotValue,
    snapshotOptionLabel: getSnapshotLabel,
    snapshotOptionName: getSnapshotName,
    snapshotsForDropdown,
    firstAvailableSnapshotValue,
    hasSnapshotOptionValue,
  };
}
