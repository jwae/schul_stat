<script setup lang="ts">
interface SchoolMatrixRow {
  city?: string;
  snr: string;
  name?: string;
}

interface Props {
  dazClassCodes?: string[];
  dazRowsCount?: number;
  error?: string;
  grandTotalDaz?: number;
  dazLowerThreshold?: number;
  dazUpperThreshold?: number;
  schoolsInDazMatrix?: SchoolMatrixRow[];
  getDaz: (snr: string, classCode: string) => number;
  getDazClassHeaderLabel: (classCode: string) => string;
  totalDazForClass: (classCode: string) => number;
  totalDazForSchool: (snr: string) => number;
  dazCellClass: (value: number) => string | Record<string, boolean> | string[];
}

const props = withDefaults(defineProps<Props>(), {
  dazClassCodes: () => [],
  dazRowsCount: 0,
  error: "",
  grandTotalDaz: 0,
  dazLowerThreshold: 0,
  dazUpperThreshold: 0,
  schoolsInDazMatrix: () => [],
});

const emit = defineEmits<{
  (e: "update:dazLowerThreshold", value: number): void;
  (e: "update:dazUpperThreshold", value: number): void;
}>();

function updateDazLowerThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:dazLowerThreshold", Number(target?.value || 0));
}

function updateDazUpperThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:dazUpperThreshold", Number(target?.value || 0));
}
</script>

<template src="./DazDashboard.html"></template>
<style scoped src="./DazDashboard.css"></style>
