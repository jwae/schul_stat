<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { authStore } from "../authStore";
import apiClient from "../services/apiClient";
import DbContentsManagement from "./DbContentsManagement.vue";
import SchoolManagement from "./SchoolManagement.vue";
import SnapshotSchoolYearManagement from "./SnapshotSchoolYearManagement.vue";
import SnapshotManagement from "./SnapshotManagement.vue";
import type { User } from "../types";

const props = defineProps<{
  loginUsername?: string;
  loginPassword?: string;
  managementToken?: string;
  managementUser?: User | null;
  embedded?: boolean;
}>();

const managementLoading = ref<boolean>(false);
const managementSaving = ref<boolean>(false);
const managementError = ref<string>("");
const managementNotice = ref<string>("");
let feedbackTimeoutId: any = null;
const managementToken = ref<string>("");
const managementSessionUser = ref<User | null>(null);
const managementDashboards = ref<any[]>([]);
const managementGroups = ref<any[]>([]);
const managementUsers = ref<any[]>([]);
const managementSchools = ref<any[]>([]);
const managementSchoolSources = ref<any[]>([]);
const managementSnapshots = ref<any[]>([]);
const managementTerms = ref<any[]>([]);
const activeManagementTab = ref<string>("users");
const managementStats = ref({
  total_users: 0,
  active_users: 0,
  total_groups: 0,
  active_groups: 0,
  total_dashboards: 0,
  total_schools: 0,
  total_school_sources: 0,
  active_school_sources: 0,
  total_snapshots: 0,
  total_snapshot_schools: 0,
});
const selectedManagementGroupId = ref<string>("");
const selectedManagementUserId = ref<string>("");
const groupForm = reactive({
  group_name: "",
  group_description: "",
  is_active: true,
  dashboard_ids: [] as (string | number)[],
});
const userForm = reactive({
  group_id: "",
  user_fullname: "",
  username: "",
  email: "",
  password: "",
  is_active: true,
});

const canLoadUserManagement = computed<boolean>(
  () => !!String(props.loginUsername || "").trim() && !!String(props.loginPassword || "").trim(),
);
const hasExternalManagementSession = computed<boolean>(() => !!String(props.managementToken || "").trim());
const effectiveManagementToken = computed<string>(() =>
  String(hasExternalManagementSession.value ? props.managementToken : managementToken.value || "").trim(),
);
const effectiveManagementUser = computed<User | null>(() =>
  hasExternalManagementSession.value ? (props.managementUser || null) : managementSessionUser.value,
);
const isManagementSessionActive = computed<boolean>(() => !!effectiveManagementToken.value);
const managementSessionLabel = computed<string>(() => {
  const username = String(effectiveManagementUser.value?.username || "").trim();
  const groupName = String(effectiveManagementUser.value?.group_name || "").trim();
  if (!username) return "";
  return groupName ? `${username} (${groupName})` : username;
});
const currentManagedUserId = computed<string>(() =>
  String(effectiveManagementUser.value?.user_id || authStore.userId || "").trim(),
);
const isSelectedCurrentManagedUser = computed<boolean>(
  () => !!selectedManagementUserId.value && selectedManagementUserId.value === currentManagedUserId.value,
);
const activeManagementGroups = computed<any[]>(() =>
  managementGroups.value.filter((group) => group.is_active),
);

function defaultManagementGroupId(): string {
  const preferredGroup = activeManagementGroups.value.find(
    (group) => String(group.group_name || "").trim().toLowerCase() === "user",
  );
  if (preferredGroup?.group_id) return String(preferredGroup.group_id);
  return activeManagementGroups.value[0]?.group_id ? String(activeManagementGroups.value[0].group_id) : "";
}

function resetGroupForm() {
  activeManagementTab.value = "groups";
  groupForm.group_name = "";
  groupForm.group_description = "";
  groupForm.is_active = true;
  groupForm.dashboard_ids = [];
  selectedManagementGroupId.value = "";
}

function resetUserForm() {
  activeManagementTab.value = "users";
  userForm.group_id = defaultManagementGroupId();
  userForm.user_fullname = "";
  userForm.username = "";
  userForm.email = "";
  userForm.password = "";
  userForm.is_active = true;
  selectedManagementUserId.value = "";
}

function applyManagementBootstrap(data: any) {
  managementDashboards.value = Array.isArray(data?.dashboards) ? data.dashboards : [];
  managementGroups.value = Array.isArray(data?.groups) ? data.groups : [];
  managementUsers.value = Array.isArray(data?.users) ? data.users : [];
  managementSchools.value = Array.isArray(data?.schools) ? data.schools : [];
  managementSchoolSources.value = Array.isArray(data?.school_sources) ? data.school_sources : [];
  managementSnapshots.value = Array.isArray(data?.snapshots) ? data.snapshots : [];
  managementTerms.value = Array.isArray(data?.terms) ? data.terms : [];
  managementStats.value = {
    total_users: Number(data?.stats?.total_users || 0),
    active_users: Number(data?.stats?.active_users || 0),
    total_groups: Number(data?.stats?.total_groups || 0),
    active_groups: Number(data?.stats?.active_groups || 0),
    total_dashboards: Number(data?.stats?.total_dashboards || 0),
    total_schools: Number(data?.stats?.total_schools || 0),
    total_school_sources: Number(data?.stats?.total_school_sources || 0),
    active_school_sources: Number(data?.stats?.active_school_sources || 0),
    total_snapshots: Number(data?.stats?.total_snapshots || 0),
    total_snapshot_schools: Number(data?.stats?.total_snapshot_schools || 0),
  };

  if (
    selectedManagementGroupId.value &&
    !managementGroups.value.some((group) => String(group.group_id) === selectedManagementGroupId.value)
  ) {
    resetGroupForm();
  }

  if (
    selectedManagementUserId.value &&
    !managementUsers.value.some((user) => String(user.user_id) === selectedManagementUserId.value)
  ) {
    resetUserForm();
  }
  if (!selectedManagementUserId.value && !userForm.group_id) {
    userForm.group_id = defaultManagementGroupId();
  }
}

function clearManagementSession() {
  if (hasExternalManagementSession.value) return;
  managementToken.value = "";
  managementSessionUser.value = null;
  managementError.value = "";
  managementNotice.value = "";
  managementDashboards.value = [];
  managementGroups.value = [];
  managementUsers.value = [];
  managementSchools.value = [];
  managementSchoolSources.value = [];
  managementSnapshots.value = [];
  managementTerms.value = [];
  managementStats.value = {
    total_users: 0,
    active_users: 0,
    total_groups: 0,
    active_groups: 0,
    total_dashboards: 0,
    total_schools: 0,
    total_school_sources: 0,
    active_school_sources: 0,
    total_snapshots: 0,
    total_snapshot_schools: 0,
  };
  resetGroupForm();
  resetUserForm();
}

function managementAuthHeaders() {
  return effectiveManagementToken.value
    ? { Authorization: `Bearer ${effectiveManagementToken.value}` }
    : {};
}

function isValidManagementEmail(value: string | null | undefined): boolean {
  const text = String(value || "").trim();
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function validateManagementGroupForm(): string {
  const name = String(groupForm.group_name || "").trim();
  if (!name) return "Gruppenname ist erforderlich.";

  const duplicate = managementGroups.value.some((group) =>
    String(group.group_name || "").trim().toLowerCase() === name.toLowerCase() &&
    String(group.group_id) !== String(selectedManagementGroupId.value || ""),
  );
  if (duplicate) return "Der Gruppenname ist bereits vergeben.";

  return "";
}

function validateManagementUserForm(): string {
  const username = String(userForm.username || "").trim();
  const email = String(userForm.email || "").trim();

  if (!username) return "Loginname ist erforderlich.";
  if (!userForm.group_id) return "Bitte eine Gruppe auswaehlen.";
  if (!activeManagementGroups.value.some((group) => String(group.group_id) === String(userForm.group_id))) {
    return "Bitte eine aktive Gruppe auswaehlen.";
  }
  if (!selectedManagementUserId.value && !String(userForm.password || "").trim()) {
    return "Fuer neue Benutzer ist ein Passwort erforderlich.";
  }
  if (email && !isValidManagementEmail(email)) return "Die E-Mail-Adresse ist ungueltig.";

  const duplicateUsername = managementUsers.value.some((user) =>
    String(user.username || "").trim().toLowerCase() === username.toLowerCase() &&
    String(user.user_id) !== String(selectedManagementUserId.value || ""),
  );
  if (duplicateUsername) return "Der Loginname ist bereits vergeben.";

  const duplicateEmail = email && managementUsers.value.some((user) =>
    String(user.email || "").trim().toLowerCase() === email.toLowerCase() &&
    String(user.user_id) !== String(selectedManagementUserId.value || ""),
  );
  if (duplicateEmail) return "Die E-Mail-Adresse ist bereits vergeben.";

  return "";
}

function editManagementGroup(groupId: string | number) {
  activeManagementTab.value = "groups";
  selectedManagementGroupId.value = String(groupId || "");
}

function editManagementUser(userId: string | number) {
  activeManagementTab.value = "users";
  selectedManagementUserId.value = String(userId || "");
}

watch(selectedManagementGroupId, (groupId) => {
  if (!groupId) {
    resetGroupForm();
    return;
  }

  const group = managementGroups.value.find((entry) => String(entry.group_id) === String(groupId));
  if (!group) return;

  groupForm.group_name = group.group_name || "";
  groupForm.group_description = group.group_description || "";
  groupForm.is_active = !!group.is_active;
  groupForm.dashboard_ids = Array.isArray(group.dashboard_ids) ? [...group.dashboard_ids] : [];
});

watch(selectedManagementUserId, (userId) => {
  if (!userId) {
    resetUserForm();
    return;
  }

  const user = managementUsers.value.find((entry) => String(entry.user_id) === String(userId));
  if (!user) return;

  userForm.group_id = user.group_id ? String(user.group_id) : "";
  userForm.user_fullname = user.user_fullname || "";
  userForm.username = user.username || "";
  userForm.email = user.email || "";
  userForm.password = "";
  userForm.is_active = !!user.is_active;
});

watch(
  () => props.managementToken,
  async (token) => {
    if (!String(token || "").trim()) return;
    await loadUserManagementData();
  },
  { immediate: true },
);

watch([managementError, managementNotice], ([errorMessage, noticeMessage]) => {
  if (feedbackTimeoutId) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }

  if (!errorMessage && !noticeMessage) return;

  feedbackTimeoutId = setTimeout(() => {
    managementError.value = "";
    managementNotice.value = "";
    feedbackTimeoutId = null;
  }, 6000);
});

onBeforeUnmount(() => {
  if (!feedbackTimeoutId) return;
  clearTimeout(feedbackTimeoutId);
  feedbackTimeoutId = null;
});

async function loadUserManagementData() {
  if (!effectiveManagementToken.value) return;

  managementLoading.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const resp = await apiClient.get("/api/auth/admin/bootstrap", {
      headers: managementAuthHeaders(),
    });
    applyManagementBootstrap(resp.data || {});
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Die Benutzerverwaltung konnte nicht geladen werden.";
  } finally {
    managementLoading.value = false;
  }
}

async function authenticateUserManagement() {
  if (hasExternalManagementSession.value) {
    await loadUserManagementData();
    return;
  }

  managementLoading.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const resp = await apiClient.post("/api/auth/login", {
      username: props.loginUsername,
      password: props.loginPassword,
    });
    const user = resp.data?.user || {};
    if (String(user.group_name || "").trim().toLowerCase() !== "admin") {
      managementToken.value = "";
      managementSessionUser.value = null;
      managementError.value = "Fuer die Benutzerverwaltung ist ein Admin-Login erforderlich.";
      return;
    }

    managementToken.value = String(resp.data?.token || "");
    managementSessionUser.value = user;
    await loadUserManagementData();
    managementNotice.value = "Benutzerverwaltung geladen.";
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Admin-Anmeldung fuer die Benutzerverwaltung fehlgeschlagen.";
  } finally {
    managementLoading.value = false;
  }
}

async function saveManagementGroup() {
  const validationError = validateManagementGroupForm();
  if (validationError) {
    managementError.value = validationError;
    managementNotice.value = "";
    return;
  }

  managementSaving.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const payload = {
      group_name: groupForm.group_name,
      group_description: groupForm.group_description,
      is_active: groupForm.is_active,
      dashboard_ids: groupForm.dashboard_ids,
    };
    const url = selectedManagementGroupId.value
      ? `/api/auth/admin/groups/${selectedManagementGroupId.value}`
      : "/api/auth/admin/groups";
    const method = selectedManagementGroupId.value ? "patch" : "post";
    const resp = await (apiClient as any)[method](url, payload, {
      headers: managementAuthHeaders(),
    });
    applyManagementBootstrap(resp.data || {});
    managementNotice.value = selectedManagementGroupId.value
      ? "Gruppe aktualisiert."
      : "Gruppe angelegt.";
    resetGroupForm();
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Die Gruppe konnte nicht gespeichert werden.";
  } finally {
    managementSaving.value = false;
  }
}

async function saveManagementUser() {
  const validationError = validateManagementUserForm();
  if (validationError) {
    managementError.value = validationError;
    managementNotice.value = "";
    return;
  }

  managementSaving.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const payload = {
      group_id: Number(userForm.group_id || 0),
      user_fullname: userForm.user_fullname,
      username: userForm.username,
      email: userForm.email,
      password: userForm.password,
      is_active: userForm.is_active,
    };
    const url = selectedManagementUserId.value
      ? `/api/auth/admin/users/${selectedManagementUserId.value}`
      : "/api/auth/admin/users";
    const method = selectedManagementUserId.value ? "patch" : "post";
    const resp = await (apiClient as any)[method](url, payload, {
      headers: managementAuthHeaders(),
    });
    applyManagementBootstrap(resp.data || {});
    managementNotice.value = selectedManagementUserId.value
      ? "Benutzer aktualisiert."
      : "Benutzer angelegt.";
    resetUserForm();
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Der Benutzer konnte nicht gespeichert werden.";
  } finally {
    managementSaving.value = false;
  }
}

async function toggleManagementGroupActive(group: any) {
  if (!group) return;

  managementSaving.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const resp = await apiClient.patch(
      `/api/auth/admin/groups/${group.group_id}`,
      {
        group_name: group.group_name,
        group_description: group.group_description,
        is_active: !group.is_active,
        dashboard_ids: group.dashboard_ids,
      },
      { headers: managementAuthHeaders() },
    );
    applyManagementBootstrap(resp.data || {});
    managementNotice.value = `Gruppe ${group.is_active ? "deaktiviert" : "aktiviert"}.`;
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Der Gruppenstatus konnte nicht geaendert werden.";
  } finally {
    managementSaving.value = false;
  }
}

async function toggleManagementUserActive(user: any) {
  if (!user) return;

  managementSaving.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const resp = await apiClient.patch(
      `/api/auth/admin/users/${user.user_id}`,
      {
        group_id: user.group_id,
        user_fullname: user.user_fullname,
        username: user.username,
        email: user.email,
        password: "",
        is_active: !user.is_active,
      },
      { headers: managementAuthHeaders() },
    );
    applyManagementBootstrap(resp.data || {});
    managementNotice.value = `Benutzer ${user.is_active ? "deaktiviert" : "aktiviert"}.`;
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Der Benutzerstatus konnte nicht geaendert werden.";
  } finally {
    managementSaving.value = false;
  }
}

async function deleteManagementGroup(group: any) {
  if (!group) return;
  if (!window.confirm(`Gruppe "${group.group_name}" wirklich loeschen?`)) return;

  managementSaving.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const resp = await apiClient.delete(`/api/auth/admin/groups/${group.group_id}`, {
      headers: managementAuthHeaders(),
    });
    applyManagementBootstrap(resp.data || {});
    managementNotice.value = "Gruppe geloescht.";
    resetGroupForm();
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Die Gruppe konnte nicht geloescht werden.";
  } finally {
    managementSaving.value = false;
  }
}

async function deleteManagementUser(user: any) {
  if (!user) return;
  if (!window.confirm(`Benutzer "${user.username}" wirklich loeschen?`)) return;

  managementSaving.value = true;
  managementError.value = "";
  managementNotice.value = "";

  try {
    const resp = await apiClient.delete(`/api/auth/admin/users/${user.user_id}`, {
      headers: managementAuthHeaders(),
    });
    applyManagementBootstrap(resp.data || {});
    managementNotice.value = "Benutzer geloescht.";
    resetUserForm();
  } catch (e: any) {
    managementError.value =
      e?.response?.data?.error ||
      e?.message ||
      "Der Benutzer konnte nicht geloescht werden.";
  } finally {
    managementSaving.value = false;
  }
}

function handleSchoolManagementFeedback(feedback: any) {
  managementError.value = String(feedback?.error || "");
  managementNotice.value = String(feedback?.notice || "");
}

function handleSnapshotManagementFeedback(feedback: any) {
  managementError.value = String(feedback?.error || "");
  managementNotice.value = String(feedback?.notice || "");
}
</script>

<template src="./UserManagementPanel.html"></template>
<style scoped src="./UserManagementPanel.css"></style>
