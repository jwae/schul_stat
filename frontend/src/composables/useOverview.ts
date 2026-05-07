import { ref, computed, reactive } from "vue";
import { authStore } from "../authStore";
import { kpiService } from "../services/apiService";
import { formatSchoolSeriesLabel } from "../utils/formatters";
import { useGlobalFilters } from "./useGlobalFilters";
import type { OverviewData, SchoolStudentTrendItem, SchoolGradeTrendItem } from "../types";
import {
  buildEfChartOption,
  buildEfTrendOption,
  buildGenderChartOption,
  buildGradeChartOption,
  buildMigrationChartOption,
  buildNationalityChartOption,
  buildOverviewTrendOption,
  buildReligionChartOption,
  buildEducationTrackChartOption,
  buildHTrackGradeChartOption,
  buildSchoolTrendOption,
  buildSupportChartOption,
} from "../charts/overview/options";

export function useOverview() {
  const filters = useGlobalFilters();
  const loadingOverview = ref<boolean>(false);
  const errorOverview = ref<string>("");
  const selectedSnapshotForOverview = ref<string>("");
  const overview = ref<OverviewData | null>(null);
  const schoolTrendVisibilityBySnr = reactive<Record<string, boolean>>({});

  let overviewRequestId = 0;

  async function loadOverview(termId: number = 0, source: string = "", snapId: string = "") {
    if (!authStore.token) return;
    const requestId = ++overviewRequestId;

    if (!selectedSnapshotForOverview.value) {
      overview.value = null;
      return;
    }
    const selectedValue = String(selectedSnapshotForOverview.value || "").trim();
    const normalizedSnapId = String(snapId || "").trim();
    const derivedSnapId = selectedValue && !/^\d{4}-\d{2}-\d{2}$/.test(selectedValue) ? selectedValue : "";
    const effectiveSnapId = normalizedSnapId || derivedSnapId;
    const fallbackSnapshotDate = effectiveSnapId ? "" : selectedValue;

    loadingOverview.value = true;
    errorOverview.value = "";
    try {
      const data = await kpiService.getOverview({
        schoolYear: filters.schoolYear.value,
        termNo: filters.termNo.value,
        termId: termId || undefined,
        snapId: effectiveSnapId || undefined,
        source: source || undefined,
        snapshotDate: fallbackSnapshotDate || undefined,
        city: filters.selectedCity.value || undefined,
        snr: filters.selectedSnr.value || undefined,
      });
      if (requestId !== overviewRequestId) return;
      overview.value = data || null;
    } catch (e: any) {
      if (requestId !== overviewRequestId) return;
      overview.value = null;
      errorOverview.value =
        e?.response?.data?.error || e?.message || "Fehler beim Laden.";
    } finally {
      loadingOverview.value = false;
    }
  }

  const totalStudentsOverview = computed(() =>
    Number(overview.value?.totals?.totalStudents ?? 0),
  );

  function schoolTrendSeriesKey(row: any): string {
    return String(row?.snr || "").trim() || "-";
  }

  function schoolTrendSeriesLabel(row: any): string {
    return formatSchoolSeriesLabel(row?.snr, row?.schoolName);
  }

  function isSchoolTrendVisible(key: string): boolean {
    return schoolTrendVisibilityBySnr[String(key || "").trim()] !== false;
  }

  function setSchoolTrendVisible(key: string, checked: boolean) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return;
    schoolTrendVisibilityBySnr[normalizedKey] = !!checked;
  }

  const schoolTrendLegendEntries = computed(() => {
    const rows = Array.isArray(overview.value?.schoolStudentTrend)
      ? overview.value!.schoolStudentTrend!
      : [];
    const map = new Map<string, { key: string; label: string }>();
    for (const row of rows) {
      const key = schoolTrendSeriesKey(row);
      if (!key || map.has(key)) continue;
      map.set(key, {
        key,
        label: schoolTrendSeriesLabel(row),
      });
    }
    return [...map.values()];
  });

  const schoolTrendSeriesCount = computed(() => schoolTrendLegendEntries.value.length);

  const genderChartOption = computed(() => (overview.value ? buildGenderChartOption(overview.value) : null));
  const gradeChartOption = computed(() => (overview.value ? buildGradeChartOption(overview.value) : null));
  const supportChartOption = computed(() => (overview.value ? buildSupportChartOption(overview.value) : null));
  const efChartOption = computed(() => (overview.value ? buildEfChartOption(overview.value) : null));
  const religionChartOption = computed(() => (overview.value ? buildReligionChartOption(overview.value) : null));
  const educationTrackChartOption = computed(() => (overview.value ? buildEducationTrackChartOption(overview.value) : null));
  const hTrackGradeChartOption = computed(() => (overview.value ? buildHTrackGradeChartOption(overview.value) : null));
  const migrationChartOption = computed(() => (overview.value ? buildMigrationChartOption(overview.value) : null));
  const nationalityChartOption = computed(() => (overview.value ? buildNationalityChartOption(overview.value) : null));
  const overviewTrendChartOption = computed(() => (overview.value ? buildOverviewTrendOption(overview.value) : null));
  const efTrendChartOption = computed(() => (overview.value ? buildEfTrendOption(overview.value) : null));
  const schoolTrendChartOption = computed(() => (
    overview.value
      ? buildSchoolTrendOption(overview.value, {
          mode: "date",
          seriesKey: schoolTrendSeriesKey,
          seriesLabel: schoolTrendSeriesLabel,
          isVisible: isSchoolTrendVisible,
        })
      : null
  ));

  const schoolTrendBarChartOption = computed(() => (
    overview.value
      ? buildSchoolTrendOption(overview.value, {
          mode: "date",
          seriesKey: schoolTrendSeriesKey,
          seriesLabel: schoolTrendSeriesLabel,
          isVisible: isSchoolTrendVisible,
          chartType: "bar",
        })
      : null
  ));

  const parseTermLabel = (label: string) => {
    const match = String(label || "").match(/^(\d{4})\.(\d{1,2})$/);
    return match ? { schoolYear: Number(match[1]), termNo: Number(match[2]) } : null;
  };

  const schoolTrendTerms = computed(() => {
    const rows = overview.value?.schoolStudentTrend || [];
    return [...new Map(
      rows
        .filter((r) => r.termId)
        .map((r) => [String(r.termId), String(r.termLabel || r.snapshot_date)] as const)
    ).entries()]
      .sort((a, b) => {
        const pa = parseTermLabel(a[1]);
        const pb = parseTermLabel(b[1]);
        if (pa && pb) {
          if (pa.schoolYear !== pb.schoolYear) return pa.schoolYear - pb.schoolYear;
          return pa.termNo - pb.termNo;
        }
        return Number(a[0]) - Number(b[0]);
      })
      .map(([termId, termLabel]) => ({ termId, termLabel }));
  });

  const schoolTrendSchools = computed(() => {
    const rows = overview.value?.schoolStudentTrend || [];
    return [...new Map(
      rows.map((r) => [r.snr, { snr: r.snr, name: r.schoolName }] as const)
    ).values()]
      .sort((a, b) => String(a.snr).localeCompare(String(b.snr), "de", { numeric: true }));
  });

  function getSchoolTrendStudents(snr: string, termId: string): number {
    const row = (overview.value?.schoolStudentTrend || []).find(
      (r) => r.snr === snr && String(r.termId) === termId
    );
    return row ? Number(row.total_students) : 0;
  }

  function schoolTrendTermTotal(termId: string): number {
    return (overview.value?.schoolStudentTrend || [])
      .filter((r) => String(r.termId) === termId)
      .reduce((sum, r) => sum + Number(r.total_students), 0);
  }

  const cumulativeSchoolTrendChartOption = computed(() => {
    const terms = schoolTrendTerms.value;
    if (!terms.length) return null;

    const sectionLabels = terms.map((term) => term.termLabel);
    const sectionTotals = terms.map((term) => schoolTrendTermTotal(term.termId));

    return {
      animation: true,
      animationDuration: 1200,
      animationEasing: "cubicOut",
      animationDurationUpdate: 800,
      animationEasingUpdate: "cubicOut",
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: sectionLabels,
      },
      yAxis: { type: "value" },
      series: [
        {
          name: "Schueler gesamt je Abschnitt",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          data: sectionTotals,
        },
      ],
    };
  });

  const specialNeedsOverview = computed(() =>
    Number(overview.value?.totals?.specialNeeds ?? 0),
  );
  const specialNeedsPercentOverview = computed(() =>
    Number(overview.value?.totals?.specialNeedsPercent ?? 0),
  );

  const efOverview = computed(() => {
    const breakdown = overview.value?.efBreakdown || [];
    const match = breakdown.find((r) =>
      String(r?.name || "")
        .toLowerCase()
        .includes("in erstfoerderung"),
    );
    return Number(match?.value ?? 0);
  });

  const efPercentOverview = computed(() => {
    const total = totalStudentsOverview.value;
    return total ? Number(((efOverview.value / total) * 100).toFixed(1)) : 0;
  });

  const migrationOverview = computed(() => {
    const breakdown = overview.value?.migrationBreakdown || [];
    const match = breakdown.find((r) =>
      String(r?.name || "")
        .toLowerCase()
        .includes("mit migrationshintergrund"),
    );
    return Number(match?.value ?? 0);
  });

  const migrationPercentOverview = computed(() => {
    const total = totalStudentsOverview.value;
    return total ? Number(((migrationOverview.value / total) * 100).toFixed(1)) : 0;
  });

  const nationalityOverview = computed(() => {
    const breakdown = overview.value?.nationalityBreakdown || [];
    const match = breakdown.find((r) =>
      String(r?.name || "")
        .toLowerCase()
        .includes("deutschland"),
    );
    return Number(match?.value ?? 0);
  });

  const nationalityPercentOverview = computed(() => {
    const total = totalStudentsOverview.value;
    return total ? Number(((nationalityOverview.value / total) * 100).toFixed(1)) : 0;
  });

  const educationTrackTotalOverview = computed(() => {
    const breakdown = overview.value?.educationTrackBreakdown || [];
    return breakdown.reduce((sum, item) => sum + (item.value || 0), 0);
  });

  const educationTrackPercentOverview = computed(() => {
    const total = totalStudentsOverview.value;
    return total ? Number(((educationTrackTotalOverview.value / total) * 100).toFixed(1)) : 0;
  });

  const hTrackTotalOverview = computed(() => {
    const breakdown = overview.value?.hTrackGradeBreakdown || [];
    return breakdown.reduce((sum, item) => sum + (item.value || 0), 0);
  });

  const hTrackPercentOverview = computed(() => {
    const total = totalStudentsOverview.value;
    return total ? Number(((hTrackTotalOverview.value / total) * 100).toFixed(1)) : 0;
  });

  const schoolsInOverviewSnapshot = computed(() => {
    if (!selectedSnapshotForOverview.value || !overview.value) return 0;
    const trendRows = overview.value.schoolStudentTrend || [];
    const schoolKeys = new Set<string>();
    for (const row of trendRows) {
      schoolKeys.add(String(row.snr || "").trim());
    }
    return schoolKeys.size;
  });

  function updateSchoolTrendVisibility() {
    if (!overview.value) return;
    const validKeys = new Set(schoolTrendLegendEntries.value.map((entry) => entry.key));
    for (const entry of schoolTrendLegendEntries.value) {
      if (!(entry.key in schoolTrendVisibilityBySnr)) {
        schoolTrendVisibilityBySnr[entry.key] = true;
      }
    }
    for (const key of Object.keys(schoolTrendVisibilityBySnr)) {
      if (!validKeys.has(key)) {
        delete schoolTrendVisibilityBySnr[key];
      }
    }
  }

  function clearSchoolTrendVisibility() {
    for (const key of Object.keys(schoolTrendVisibilityBySnr)) {
      delete schoolTrendVisibilityBySnr[key];
    }
  }

  return {
    loadingOverview,
    errorOverview,
    selectedSnapshotForOverview,
    overview,
    schoolTrendVisibilityBySnr,
    loadOverview,
    totalStudentsOverview,
    schoolTrendLegendEntries,
    schoolTrendSeriesCount,
    genderChartOption,
    gradeChartOption,
    supportChartOption,
    efChartOption,
    religionChartOption,
    educationTrackChartOption,
    hTrackGradeChartOption,
    migrationChartOption,
    nationalityChartOption,
    overviewTrendChartOption,
    efTrendChartOption,
    schoolTrendChartOption,
    cumulativeSchoolTrendChartOption,
    schoolTrendBarChartOption,
    schoolTrendTerms,
    schoolTrendSchools,
    getSchoolTrendStudents,
    schoolTrendTermTotal,
    specialNeedsOverview,
    specialNeedsPercentOverview,
    efOverview,
    efPercentOverview,
    migrationOverview,
    migrationPercentOverview,
    nationalityOverview,
    nationalityPercentOverview,
    educationTrackTotalOverview,
    educationTrackPercentOverview,
    hTrackTotalOverview,
    hTrackPercentOverview,
    schoolsInOverviewSnapshot,
    isSchoolTrendVisible,
    setSchoolTrendVisible,
    updateSchoolTrendVisibility,
    clearSchoolTrendVisibility,
  };
}
