<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

interface Props {
  host?: string;
  port?: number;
  database?: string;
  dbUser?: string;
  dbPassword?: string;
  error?: string;
  errorDetails?: string;
  errorCode?: string;
  connecting?: boolean;
  serverConnected?: boolean;
  serverStatus?: string;
}

const props = withDefaults(defineProps<Props>(), {
  host: "",
  port: 3306,
  database: "",
  dbUser: "",
  dbPassword: "",
  error: "",
  errorDetails: "",
  errorCode: "",
  connecting: false,
  serverConnected: false,
  serverStatus: "",
});

const emit = defineEmits<{
  (e: "update:host", value: string): void;
  (e: "update:port", value: number): void;
  (e: "update:database", value: string): void;
  (e: "update:dbUser", value: string): void;
  (e: "update:dbPassword", value: string): void;
  (e: "connect"): void;
  (e: "continue"): void;
}>();

const databaseSettingsCollapse = ref<HTMLElement | null>(null);
const showDatabaseSettings = ref<boolean>(false);

const hostModel = computed<string>({
  get: () => props.host,
  set: (value) => emit("update:host", value),
});

const portModel = computed<number>({
  get: () => props.port,
  set: (value) => emit("update:port", value),
});

const databaseModel = computed<string>({
  get: () => props.database,
  set: (value) => emit("update:database", value),
});

const dbUserModel = computed<string>({
  get: () => props.dbUser,
  set: (value) => emit("update:dbUser", value),
});

const dbPasswordModel = computed<string>({
  get: () => props.dbPassword,
  set: (value) => emit("update:dbPassword", value),
});

function handleDatabaseSettingsShown() {
  showDatabaseSettings.value = true;
}

function handleDatabaseSettingsHidden() {
  showDatabaseSettings.value = false;
}

onMounted(() => {
  if (databaseSettingsCollapse.value) {
    databaseSettingsCollapse.value.addEventListener("shown.bs.collapse", handleDatabaseSettingsShown);
    databaseSettingsCollapse.value.addEventListener("hidden.bs.collapse", handleDatabaseSettingsHidden);
  }
});

onBeforeUnmount(() => {
  if (databaseSettingsCollapse.value) {
    databaseSettingsCollapse.value.removeEventListener("shown.bs.collapse", handleDatabaseSettingsShown);
    databaseSettingsCollapse.value.removeEventListener("hidden.bs.collapse", handleDatabaseSettingsHidden);
  }
});
</script>

<template src="./DatabaseConnectPanel.html"></template>
<style scoped src="./DatabaseConnectPanel.css"></style>
