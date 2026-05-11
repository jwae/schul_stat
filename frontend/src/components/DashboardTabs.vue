<script setup lang="ts">
interface DashboardTab {
  key: string;
  label: string;
}

interface Props {
  modelValue?: string;
  tabs?: DashboardTab[];
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
  tabs: () => [],
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

function selectTab(value: string) {
  emit("update:modelValue", value);
}
</script>

<template src="./DashboardTabs.html"></template>
<style scoped src="./DashboardTabs.css"></style>
