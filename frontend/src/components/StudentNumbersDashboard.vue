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

interface Props {
  selectedSnapshot?: string;
  loading?: boolean;
  error?: string;
  schoolTrendSeriesCount?: number;
  schoolTrendChartOption?: any;
  cumulativeSchoolTrendChartOption?: any;
  efTrendChartOption?: any;
  schoolTrendTerms?: SchoolTrendTerm[];
  schoolTrendSchools?: SchoolTrendSchool[];
  getSchoolTrendStudents: (snr: string, termId: number) => number | string;
}

withDefaults(defineProps<Props>(), {
  selectedSnapshot: "",
  loading: false,
  error: "",
  schoolTrendSeriesCount: 0,
  schoolTrendChartOption: null,
  cumulativeSchoolTrendChartOption: null,
  efTrendChartOption: null,
  schoolTrendTerms: () => [],
  schoolTrendSchools: () => [],
});
</script>

<template src="./StudentNumbersDashboard.html"></template>
<style scoped src="./StudentNumbersDashboard.css"></style>
