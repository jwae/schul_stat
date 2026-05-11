<script setup lang="ts">
import EChartPanel from "./EChartPanel.vue";

interface Props {
  selectedSnapshot?: string;
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

withDefaults(defineProps<Props>(), {
  selectedSnapshot: "",
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
</script>

<template src="./OverviewDashboard.html"></template>
<style scoped src="./OverviewDashboard.css"></style>
