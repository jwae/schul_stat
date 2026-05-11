<script setup lang="ts">
import { computed } from "vue";
import type { School } from "../types";

interface SelectOption {
  value: string;
  label: string;
}

interface SummaryItem {
  label: string;
  value: string | number;
}

interface Props {
  snapshotNameSelection?: string;
  schoolTermSelection?: string;
  selectedCity?: string;
  selectedSnr?: string;
  snapshotNameOptions?: SelectOption[];
  schoolTermOptions?: SelectOption[];
  cities?: string[];
  schoolsFilteredForDropdown?: School[];
  summaryItems?: SummaryItem[];
  errorMessage?: string;
}

const props = withDefaults(defineProps<Props>(), {
  snapshotNameSelection: "",
  schoolTermSelection: "",
  selectedCity: "",
  selectedSnr: "",
  snapshotNameOptions: () => [],
  schoolTermOptions: () => [],
  cities: () => [],
  schoolsFilteredForDropdown: () => [],
  summaryItems: () => [],
  errorMessage: "",
});

const emit = defineEmits<{
  (e: "update:snapshotNameSelection", value: string): void;
  (e: "update:schoolTermSelection", value: string): void;
  (e: "update:selectedCity", value: string): void;
  (e: "update:selectedSnr", value: string): void;
}>();

const snapshotNameSelectionModel = computed<string>({
  get: () => props.snapshotNameSelection,
  set: (value) => emit("update:snapshotNameSelection", value),
});

const schoolTermSelectionModel = computed<string>({
  get: () => props.schoolTermSelection,
  set: (value) => emit("update:schoolTermSelection", value),
});

const selectedCityModel = computed<string>({
  get: () => props.selectedCity,
  set: (value) => emit("update:selectedCity", value),
});

const selectedSnrModel = computed<string>({
  get: () => props.selectedSnr,
  set: (value) => emit("update:selectedSnr", value),
});
</script>

<template src="./DashboardFiltersPanel.html"></template>
<style scoped src="./DashboardFiltersPanel.css"></style>
