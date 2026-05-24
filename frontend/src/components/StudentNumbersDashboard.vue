<script setup lang="ts">
import EChartPanel from "./EChartPanel.vue";

interface SchoolTrendTerm {
  termId: number;
  termLabel: string;
}

interface SchoolTrendSchool {
  snr: string;
  name?: string;
}

interface EfTrendRow {
  termId: number;
  termLabel: string;
  snapshotDate: string;
  dazStudents: number;
}

interface Props {
  selectedSnapshot?: string;
  loading?: boolean;
  error?: string;
  schoolTrendSeriesCount?: number;
  schoolTrendChartOption?: any;
  cumulativeSchoolTrendChartOption?: any;
  efTrendChartOption?: any;
  efTrendRows?: EfTrendRow[];
  schoolTrendTerms?: SchoolTrendTerm[];
  schoolTrendSchools?: SchoolTrendSchool[];
  getSchoolTrendStudents: (snr: string, termId: number) => number | string;
}

const props = withDefaults(defineProps<Props>(), {
  selectedSnapshot: "",
  loading: false,
  error: "",
  schoolTrendSeriesCount: 0,
  schoolTrendChartOption: null,
  cumulativeSchoolTrendChartOption: null,
  efTrendChartOption: null,
  efTrendRows: () => [],
  schoolTrendTerms: () => [],
  schoolTrendSchools: () => [],
});

function csvValue(value: string | number | null | undefined): string {
  const normalized = String(value ?? "");
  if (!/[;"\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function totalForTerm(termId: number): number {
  return props.schoolTrendSchools.reduce((sum, school) => {
    const value = Number(props.getSchoolTrendStudents(school.snr, termId) || 0);
    return sum + value;
  }, 0);
}

function downloadCsvExport() {
  if (!props.schoolTrendSeriesCount) return;

  const header = [
    "SNR",
    "Schule",
    ...props.schoolTrendTerms.map((term) => term.termLabel),
  ];

  const lines = [
    header.map(csvValue).join(";"),
    ...props.schoolTrendSchools.map((school) => {
      const values = [
        school.snr,
        school.name || "-",
        ...props.schoolTrendTerms.map((term) => props.getSchoolTrendStudents(school.snr, term.termId) || "-"),
      ];
      return values.map(csvValue).join(";");
    }),
    [
      "Gesamt",
      "",
      ...props.schoolTrendTerms.map((term) => totalForTerm(term.termId)),
    ].map(csvValue).join(";"),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "schuelerzahlen-export.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadDazTrendCsvExport() {
  if (!props.efTrendRows.length) return;

  const lines = [
    ["Abschnitt", "Snapshot-Datum", "DAZ-Schueler (EF = 1)"].map(csvValue).join(";"),
    ...props.efTrendRows.map((row) =>
      [row.termLabel || "-", row.snapshotDate || "-", row.dazStudents].map(csvValue).join(";")
    ),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "daz-trend-export.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<template src="./StudentNumbersDashboard.html"></template>
<style scoped src="./StudentNumbersDashboard.css"></style>
