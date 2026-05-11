<script setup lang="ts">
import EChartPanel from "./EChartPanel.vue";

interface Props {
  activeSnapshotSelection?: string;
  loading?: boolean;
  error?: string;
  totalTeachers?: number;
  teacherSexChartOption?: any;
  teacherAgeChartOption?: any;
  teacherNationChartOption?: any;
  teacherCityChartOption?: any;
}

withDefaults(defineProps<Props>(), {
  activeSnapshotSelection: "",
  loading: false,
  error: "",
  totalTeachers: 0,
  teacherSexChartOption: null,
  teacherAgeChartOption: null,
  teacherNationChartOption: null,
  teacherCityChartOption: null,
});
</script>

<template src="./TeachersDashboard.html"></template>
<style scoped src="./TeachersDashboard.css"></style>
