import type { OverviewData, KPIBreakdownItem, StudentTrendItem, SchoolStudentTrendItem, SchoolGradeTrendItem } from "../../types";

/**
 * Common legend configuration for all charts.
 */
const commonLegend = {
  bottom: "0%",
  left: "center",
  type: "scroll", // Useful if there are many items
  textStyle: {
    fontSize: 11
  }
};

const lineAnimation = {
  animation: true,
  animationDuration: 1200,
  animationEasing: "cubicOut",
  animationDurationUpdate: 800,
  animationEasingUpdate: "cubicOut",
};

/**
 * Builds ECharts option for Gender breakdown.
 */
export function buildGenderChartOption(data: OverviewData) {
  const chartData = data.genderBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Geschlecht",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"], // Move up slightly to make room for legend
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Grade (Jahrgänge) breakdown.
 */
export function buildGradeChartOption(data: OverviewData) {
  const chartData = data.gradeBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Jahrgang",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Support Needs.
 */
export function buildSupportChartOption(data: OverviewData) {
  const chartData = data.supportBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Förderbedarf",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Erstförderung (EF).
 */
export function buildEfChartOption(data: OverviewData) {
  const chartData = data.efBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Erstförderung",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Religion breakdown.
 */
export function buildReligionChartOption(data: OverviewData) {
  const chartData = data.religionBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Konfession",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: true,
        label: { 
          show: true,
          position: "outside",
          formatter: "{b}"
        },
        labelLine: { show: true },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Migration breakdown.
 */
export function buildMigrationChartOption(data: OverviewData) {
  const chartData = data.migrationBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Migration",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for H (§132c an RS) share of all students.
 */
export function buildEducationTrackChartOption(data: OverviewData) {
  const hTrackTotal = (data.hTrackGradeBreakdown || []).reduce(
    (sum, item) => sum + Number(item?.value || 0),
    0,
  );
  const totalStudents = Number(data?.totals?.totalStudents || 0);
  const remainingStudents = Math.max(0, totalStudents - hTrackTotal);
  const chartData = [
    { name: "H (§132c an RS)", value: hTrackTotal },
    { name: "Uebrige SuS", value: remainingStudents },
  ].filter((item) => item.value > 0);
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "§132c-Anteil",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Education Track "H" by Grade.
 */
export function buildHTrackGradeChartOption(data: OverviewData) {
  const chartData = data.hTrackGradeBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "H (§132c an RS)",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Nationality breakdown.
 */
export function buildNationalityChartOption(data: OverviewData) {
  const chartData = data.nationalityBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Staatsangehörigkeit",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: chartData,
      },
    ],
  };
}

/**
 * Builds ECharts option for Overall Student Trend.
 */
function sortStudentTrendItems<T extends { termId?: number; termLabel?: string; snapshot_date: string }>(rows: T[]): T[] {
  const parseTermLabel = (label: string) => {
    const match = String(label || "").match(/^(\d{4})\.(\d{1,2})$/);
    return match ? { schoolYear: Number(match[1]), termNo: Number(match[2]) } : null;
  };

  return [...rows].sort((a, b) => {
    const parsedA = parseTermLabel(String(a.termLabel || ""));
    const parsedB = parseTermLabel(String(b.termLabel || ""));
    if (parsedA && parsedB) {
      if (parsedA.schoolYear !== parsedB.schoolYear) return parsedA.schoolYear - parsedB.schoolYear;
      if (parsedA.termNo !== parsedB.termNo) return parsedA.termNo - parsedB.termNo;
    }

    const termIdA = Number(a.termId || 0);
    const termIdB = Number(b.termId || 0);
    if (termIdA && termIdB && termIdA !== termIdB) return termIdA - termIdB;

    return String(a.snapshot_date || "").localeCompare(String(b.snapshot_date || ""), "de", { numeric: true });
  });
}

function dedupeStudentTrendByTermLatest<T extends { termId?: number; termLabel?: string; snapshot_date: string }>(rows: T[]): T[] {
  const sorted = sortStudentTrendItems(rows || []);
  const byTerm = new Map<string, T>();

  for (const row of sorted) {
    const key = String(row.termLabel || row.snapshot_date || "").trim();
    if (!key) continue;
    const previous = byTerm.get(key);
    if (!previous) {
      byTerm.set(key, row);
      continue;
    }

    const prevDate = String(previous.snapshot_date || "").trim();
    const nextDate = String(row.snapshot_date || "").trim();
    if (nextDate.localeCompare(prevDate, "de", { numeric: true }) >= 0) {
      byTerm.set(key, row);
    }
  }

  return sortStudentTrendItems([...byTerm.values()]);
}

export function buildOverviewTrendOption(data: OverviewData) {
  const trend = dedupeStudentTrendByTermLatest(data.studentTrend || []);
  return {
    ...lineAnimation,
    tooltip: { trigger: "axis" },
    legend: { bottom: "0%" },
    xAxis: { type: "category", data: trend.map((t) => t.termLabel || t.snapshot_date) },
    yAxis: { type: "value" },
    series: [
      {
        name: "Schüler Gesamt",
        type: "line",
        smooth: true,
        data: trend.map((t) => t.total_students),
      },
    ],
  };
}

/**
 * Builds ECharts option for EF Trend.
 */
export function buildEfTrendOption(data: OverviewData) {
  const trend = dedupeStudentTrendByTermLatest(data.studentTrend || []);
  return {
    ...lineAnimation,
    tooltip: { trigger: "axis" },
    legend: { bottom: "0%" },
    xAxis: { type: "category", data: trend.map((t) => t.termLabel || t.snapshot_date) },
    yAxis: { type: "value" },
    series: [
      {
        name: "DAZ Schüler",
        type: "line",
        smooth: true,
        data: trend.map((t) => t.ef_students),
      },
    ],
  };
}

/**
 * Builds ECharts option for School-specific Trend or Distribution.
 */
export function buildSchoolTrendOption(
  data: OverviewData,
  config: {
    mode: "date" | "grade";
    seriesKey: (row: any) => string;
    seriesLabel: (row: any) => string;
    isVisible: (key: string) => boolean;
    chartType?: "line" | "bar";
  }
) {
  const isGradeMode = config.mode === "grade";
  const rows = isGradeMode ? (data.schoolGradeTrend || []) : (data.schoolStudentTrend || []);
  const parseTermLabel = (label: string) => {
    const match = String(label || "").match(/^(\d{4})\.(\d{1,2})$/);
    return match ? { schoolYear: Number(match[1]), termNo: Number(match[2]) } : null;
  };
  const xValues = isGradeMode
    ? [...new Set(rows.map((r: any) => r.grade))].sort()
    : [...new Map(
        rows
          .map((r: any) => [String(r.termId || ""), String(r.termLabel || r.snapshot_date || "")] as const)
          .filter(([value]) => Boolean(value))
      ).entries()]
        .sort((a, b) => {
          const parsedA = parseTermLabel(a[1]);
          const parsedB = parseTermLabel(b[1]);
          if (parsedA && parsedB) {
            if (parsedA.schoolYear !== parsedB.schoolYear) return parsedA.schoolYear - parsedB.schoolYear;
            if (parsedA.termNo !== parsedB.termNo) return parsedA.termNo - parsedB.termNo;
          }
          return Number(a[0]) - Number(b[0]);
        });
  
  const seriesMap = new Map<string, { name: string; data: (number | null)[] }>();

  for (const row of rows) {
    const key = config.seriesKey(row);
    if (!config.isVisible(key)) continue;

    if (!seriesMap.has(key)) {
      seriesMap.set(key, {
        name: config.seriesLabel(row),
        data: new Array(xValues.length).fill(null),
      });
    }

    const rowXValue = isGradeMode ? (row as any).grade : String((row as any).termId || "");
    const xIdx = isGradeMode
      ? xValues.indexOf(rowXValue)
      : xValues.findIndex(([value]) => value === rowXValue);
    if (xIdx !== -1) {
      seriesMap.get(key)!.data[xIdx] = row.total_students;
    }
  }

  return {
    ...lineAnimation,
    tooltip: { trigger: "axis" },
    legend: { 
      type: "scroll",
      bottom: "0%",
      left: "center",
      padding: [5, 10]
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      top: "10%",
      containLabel: true
    },
    xAxis: {
      type: "category",
      data: isGradeMode ? xValues : xValues.map(([, label]) => label),
    },
    yAxis: { type: "value" },
    series: [...seriesMap.values()].map((s) =>
      (config.chartType ?? "line") === "bar"
        ? { ...s, type: "bar" }
        : { ...s, type: "line", smooth: true, symbol: "circle", symbolSize: 6, connectNulls: true }
    ),
  };
}
