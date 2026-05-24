<script setup lang="ts">
import { computed } from "vue";

const emit = defineEmits<{
  (e: "action"): void;
}>();

const props = withDefaults(defineProps<{
  user?: any;
  userLabel?: string;
  emptyUserLabel?: string;
  connectedHost?: string;
  connectedPort?: string | number;
  connectedDatabase?: string;
  actionLabel?: string;
}>(), {
  user: null,
  userLabel: "",
  emptyUserLabel: "Nutzer",
  connectedHost: "",
  connectedPort: "",
  connectedDatabase: "",
  actionLabel: "",
});

const resolvedUserLabel = computed<string>(() => {
  const explicit = String(props.userLabel || "").trim();
  if (explicit) return explicit;

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

<template src="./UserSessionCard.html"></template>
<style scoped src="./UserSessionCard.css"></style>
