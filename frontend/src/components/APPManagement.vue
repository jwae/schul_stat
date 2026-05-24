<script setup lang="ts">
import { computed } from "vue";
import UserSessionCard from "./UserSessionCard.vue";
import UserManagementPanel from "./UserManagementPanel.vue";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{
  token?: string;
  user?: any;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
  showCloseButton?: boolean;
  closeLabel?: string;
}>();

const isAdminUser = computed<boolean>(
  () => String(props.user?.group_name || "").trim().toLowerCase() === "admin",
);
</script>

<template src="./APPManagement.html"></template>
<style scoped src="./APPManagement.css"></style>
