<script setup lang="ts">
interface SchoolMatrixRow {
  city?: string;
  snr: string;
  name?: string;
}

interface Props {
  classCodes?: string[];
  classRowsCount?: number;
  error?: string;
  grandTotalClasses?: number;
  lowerThreshold?: number;
  upperThreshold?: number;
  schoolsInClassMatrix?: SchoolMatrixRow[];
  getClassHeaderLabel: (classCode: string) => string;
  getClassStudents: (snr: string, classCode: string) => number;
  totalForClass: (classCode: string) => number;
  totalForSchool: (snr: string) => number;
  classCellClass: (value: number) => string | Record<string, boolean> | string[];
}

const props = withDefaults(defineProps<Props>(), {
  classCodes: () => [],
  classRowsCount: 0,
  error: "",
  grandTotalClasses: 0,
  lowerThreshold: 0,
  upperThreshold: 0,
  schoolsInClassMatrix: () => [],
});

const emit = defineEmits<{
  (e: "update:lowerThreshold", value: number): void;
  (e: "update:upperThreshold", value: number): void;
}>();

function updateLowerThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:lowerThreshold", Number(target?.value || 0));
}

function updateUpperThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:upperThreshold", Number(target?.value || 0));
}
</script>

<template src="./ClassStrengthDashboard.html"></template>
<style scoped src="./ClassStrengthDashboard.css"></style>
