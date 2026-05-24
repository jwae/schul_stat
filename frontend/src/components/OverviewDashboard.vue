<script setup lang="ts">
import JSZip from "jszip";
import EChartPanel from "./EChartPanel.vue";
import type { OverviewData } from "../types";

interface Props {
  selectedSnapshot?: string;
  overview?: OverviewData | null;
  totalStudentsOverview?: number;
  specialNeedsOverview?: number;
  specialNeedsPercentOverview?: number;
  efOverview?: number;
  efPercentOverview?: number;
  migrationPercentOverview?: number;
  nationalityPercentOverview?: number;
  hTrackPercentOverview?: number;
  genderChartOption?: any;
  gradeChartOption?: any;
  supportChartOption?: any;
  efChartOption?: any;
  migrationChartOption?: any;
  nationalityChartOption?: any;
  religionChartOption?: any;
  educationTrackChartOption?: any;
  hTrackGradeChartOption?: any;
}

const props = withDefaults(defineProps<Props>(), {
  selectedSnapshot: "",
  overview: null,
  totalStudentsOverview: 0,
  specialNeedsOverview: 0,
  specialNeedsPercentOverview: 0,
  efOverview: 0,
  efPercentOverview: 0,
  migrationPercentOverview: 0,
  nationalityPercentOverview: 0,
  hTrackPercentOverview: 0,
  genderChartOption: null,
  gradeChartOption: null,
  supportChartOption: null,
  efChartOption: null,
  migrationChartOption: null,
  nationalityChartOption: null,
  religionChartOption: null,
  educationTrackChartOption: null,
  hTrackGradeChartOption: null,
});

function csvValue(value: string | number | null | undefined): string {
  const normalized = String(value ?? "");
  if (!/[;"\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function csvFromRows(rows: Array<Array<string | number | null | undefined>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvValue).join(";")).join("\r\n")}`;
}

async function downloadCsvBundle() {
  if (!props.overview) return;

  const zip = new JSZip();
  const data = props.overview;

  const kpiRows: Array<Array<string | number>> = [
    ["kpi", "wert", "bezug"],
    ["Gesamtschuelerzahl", props.totalStudentsOverview, "SuS"],
    ["Foerderbedarf absolut", props.specialNeedsOverview, "SuS"],
    ["Foerderbedarf Prozent", props.specialNeedsPercentOverview, "%"],
    ["Erstfoerderung absolut", props.efOverview, "SuS"],
    ["Erstfoerderung Prozent", props.efPercentOverview, "%"],
    ["Migrationshintergrund Prozent", props.migrationPercentOverview, "%"],
    ["Deutsch Prozent", props.nationalityPercentOverview, "%"],
    ["§132c Prozent", props.hTrackPercentOverview, "%"],
  ];

  const breakdownRows: Array<Array<string | number>> = [
    ["bereich", "kategorie", "wert"],
    ...(data.genderBreakdown || []).map((item) => ["Geschlecht", item.name, item.value]),
    ...(data.gradeBreakdown || []).map((item) => ["Jahrgaenge", item.name, item.value]),
    ...(data.supportBreakdown || []).map((item) => ["Foerderbedarf", item.name, item.value]),
    ...(data.efBreakdown || []).map((item) => ["Erstfoerderung", item.name, item.value]),
    ...(data.migrationBreakdown || []).map((item) => ["Migrationshintergrund", item.name, item.value]),
    ...(data.nationalityBreakdown || []).map((item) => ["Staatsangehoerigkeit", item.name, item.value]),
    ...(data.religionBreakdown || []).map((item) => ["Konfession", item.name, item.value]),
    ...(data.educationTrackBreakdown || []).map((item) => ["§132c-Anteil", item.name, item.value]),
  ];

  const hTrackRows: Array<Array<string | number>> = [
    ["jahrgang", "wert"],
    ...(data.hTrackGradeBreakdown || []).map((item) => [item.name, item.value]),
  ];

  zip.file("uebersicht-foe-migr-staat-132c.csv", csvFromRows(kpiRows));
  zip.file("uebersicht-breakdowns.csv", csvFromRows(breakdownRows));
  zip.file("uebersicht-h132c-je-jahrgang.csv", csvFromRows(hTrackRows));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "uebersicht-export.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<template src="./OverviewDashboard.html"></template>
<style scoped src="./OverviewDashboard.css"></style>
