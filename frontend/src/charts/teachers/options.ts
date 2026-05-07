import type { TeacherData } from "../../types";

/**
 * Common legend configuration for teacher charts.
 */
const commonLegend = {
  bottom: "0%",
  left: "center",
  type: "scroll",
  textStyle: {
    fontSize: 11
  }
};

/**
 * Builds ECharts option for Teacher Sex breakdown.
 */
export function buildTeacherSexChartOption(data: TeacherData) {
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Geschlecht",
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: data.sexBreakdown || [],
      },
    ],
  };
}

/**
 * Builds ECharts option for Teacher Age breakdown.
 * Styled as Donut for consistency with other demographic charts.
 */
export function buildTeacherAgeChartOption(data: TeacherData) {
  const chartData = data.ageBreakdown || [];
  return {
    tooltip: { trigger: "item" },
    legend: commonLegend,
    series: [
      {
        name: "Alter",
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
 * Builds ECharts option for Teacher City (Top 10).
 * Vertical column chart (Säulen).
 */
export function buildTeacherCityChartOption(data: TeacherData) {
  const chartData = [...(data.cityBreakdown || [])]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%", // More space for rotated labels
      top: "10%",
      containLabel: true
    },
    xAxis: { 
      type: "category", 
      data: chartData.map((d) => d.name),
      axisLabel: { 
        interval: 0,
        rotate: 30 // Rotate for better readability
      }
    },
    yAxis: { 
      type: "value",
      splitLine: { lineStyle: { type: "dashed" } }
    },
    series: [
      { 
        name: "Anzahl",
        data: chartData.map((d) => d.value), 
        type: "bar",
        colorBy: "data", // Automatically assign different colors to each bar
        itemStyle: { 
          borderRadius: [4, 4, 0, 0] // Rounded corners on top
        },
        barWidth: "50%"
      }
    ],
  };
}

/**
 * Builds ECharts option for Teacher Nationality breakdown.
 */
export function buildTeacherNationChartOption(data: TeacherData) {
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
        data: data.nationalityBreakdown || [],
      },
    ],
  };
}
