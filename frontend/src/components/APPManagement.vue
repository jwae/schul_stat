<script setup lang="ts">
import { computed } from "vue";
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
const managementUserLabel = computed<string>(() => {
  const username = String(props.user?.username || "").trim();
  const groupName = String(props.user?.group_name || "").trim();
  if (!username) return "";
  return groupName ? `${username} (${groupName})` : username;
});
const connectionLabel = computed<string>(() => {
  const host = String(props.connectedHost || "").trim();
  const port = String(props.connectedPort || "").trim();
  if (!host && !port) return "";
  return port ? `${host}:${port}` : host;
});
</script>

<template src="./APPManagement.html"></template>
<style scoped src="./APPManagement.css"></style>
