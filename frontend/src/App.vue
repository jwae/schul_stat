<script setup lang="ts">
import {
  ref,
  onMounted,
  computed,
  watch,
} from "vue";
import { loadToken } from "./authStore";
import { useDatabaseLogin } from "./composables/useDatabaseLogin";
import { useDashboardNavigation } from "./composables/useDashboardNavigation";
import { useGlobalFilters } from "./composables/useGlobalFilters";
import { useSnapshots } from "./composables/useSnapshots";
import { useAppSnapshotCoordinator } from "./composables/useAppSnapshotCoordinator";
import { useClassStrengths } from "./composables/useClassStrengths";
import { useDaz } from "./composables/useDaz";
import { useOverview } from "./composables/useOverview";
import { useTeachers } from "./composables/useTeachers";
import { useAuth } from "./composables/useAuth";

import DatabaseConnectPanel from "./components/DatabaseConnectPanel.vue";
import APPManagement from "./components/APPManagement.vue";
import EChartPanel from "./components/EChartPanel.vue";
import DashboardFiltersPanel from "./components/DashboardFiltersPanel.vue";
import DashboardTabs from "./components/DashboardTabs.vue";
import ClassStrengthDashboard from "./components/ClassStrengthDashboard.vue";
import DazDashboard from "./components/DazDashboard.vue";
import OverviewDashboard from "./components/OverviewDashboard.vue";
import StudentNumbersDashboard from "./components/StudentNumbersDashboard.vue";
import TeachersDashboard from "./components/TeachersDashboard.vue";

// --- Composables Initialization ---
const {
  host, port, database, username: dbUsername, password: dbPassword,
  error, errorDetails, errorCode, connecting, serverConnected, serverStatus,
  connectedHost, connectedPort, connectedDatabase,
  applyDefaults: applyDbDefaults, connect: connectDb, isConfigured: isDbConfigured, loadStatus
} = useDatabaseLogin();

const {
  view, canViewDashboard, dashboardLabel, firstAllowedDashboard, enforceAllowedView
} = useDashboardNavigation();

const filters = useGlobalFilters();
const {
  schoolYear, termNo, schools, selectedCity, selectedSnr, snapshotOptions,
  cities, schoolsFilteredForDropdown, loadSchools, loadSnapshots
} = filters;


const {
  snapshotOptionValue, snapshotOptionLabel, snapshotOptionName, snapshotsForDropdown,
  firstAvailableSnapshotValue, hasSnapshotOptionValue
} = useSnapshots();

const {
  loadingClasses, errorClasses, selectedSnapshotForClasses, classRows,
  lowerThreshold, upperThreshold, loadClassStrengths, classCodes,
  schoolsInClassMatrix, getClassStudents, getClassHeaderLabel, totalForSchool, totalForClass,
  grandTotalClasses, classCellClass
} = useClassStrengths();

const {
  loadingDaz, errorDaz, selectedSnapshotForDaz, dazRows,
  dazLowerThreshold, dazUpperThreshold, loadDaz, dazClassCodes,
  schoolsInDazMatrix, getDaz, getDazClassHeaderLabel, totalDazForSchool, totalDazForClass,
  grandTotalDaz, dazCellClass
} = useDaz();

const overviewComposables = useOverview();
const {
  loadingOverview, errorOverview, selectedSnapshotForOverview, overview,
  loadOverview, totalStudentsOverview, schoolTrendLegendEntries, schoolTrendSeriesCount,
  genderChartOption, gradeChartOption, supportChartOption, efChartOption,
  religionChartOption, educationTrackChartOption, hTrackGradeChartOption, migrationChartOption, nationalityChartOption,

  efTrendChartOption, schoolTrendChartOption, cumulativeSchoolTrendChartOption, schoolTrendBarChartOption,
  schoolTrendTerms, schoolTrendSchools, getSchoolTrendStudents, schoolTrendTermTotal,
  specialNeedsOverview, specialNeedsPercentOverview, efOverview, efPercentOverview,
  migrationOverview, migrationPercentOverview, nationalityOverview, nationalityPercentOverview,
  educationTrackPercentOverview, hTrackPercentOverview,
  schoolsInOverviewSnapshot, updateSchoolTrendVisibility, clearSchoolTrendVisibility
} = overviewComposables;

const {
  loadingTeachers, errorTeachers, teachersData, selectedSnapshotForTeachers,
  teacherSexChartOption, teacherAgeChartOption, teacherCityChartOption, teacherNationChartOption,
  loadTeacherData
} = useTeachers();

const {
  loginUsername, loginPassword, loginLoading, loginError, pendingLogin,
  isAuthenticated, currentUserLabel, pendingLoginUser, pendingLoginUserLabel, isPendingAdmin,
  login: performLogin, continueAfterLogin: performContinueAfterLogin, logout: performLogout,
  testLoginPassword
} = useAuth();

// --- State and Computed ---
const databaseConnectionConfirmed = ref<boolean>(false);
const showAppManagement = ref<boolean>(false);

const isDatabaseConfigured = computed<boolean>(() => isDbConfigured.value);
const showDatabaseConnectStep = computed<boolean>(
  () => !isDatabaseConfigured.value || !databaseConnectionConfirmed.value,
);
const {
  activeSnapshotId,
  activeSnapshotSelection,
  activeSnapshotSource,
  activeSnapshotTermId,
  ensureActiveSnapshot,
  schoolTermOptions,
  schoolTermSelection,
  selectedSnapshotOption,
  snapshotNameOptions,
  snapshotNameSelection,
} = useAppSnapshotCoordinator({
  snapshotOptions,
  snapshotsForDropdown,
  firstAvailableSnapshotValue,
  hasSnapshotOptionValue,
  snapshotOptionValue,
  snapshotOptionName,
  schoolYear,
  termNo,
  selectedCity,
  selectedSnr,
  selectedSnapshotForClasses,
  selectedSnapshotForDaz,
  selectedSnapshotForOverview,
  selectedSnapshotForTeachers,
});

// --- Lifecycle Actions ---
applyDbDefaults();
loadToken();

async function initializeDashboard() {
  if (!isAuthenticated.value) return;
  enforceAllowedView();

  await loadSchools(selectedSnapshotOption());
  await loadSnapshots();

  ensureActiveSnapshot();

  await loadSchools(selectedSnapshotOption());
  await loadCurrentView();
}

async function login() {
  await performLogin();
  showAppManagement.value = false;
}

async function continueAfterLogin() {
  const nextView = performContinueAfterLogin({ value: firstAllowedDashboard.value });
  if (nextView) {
    view.value = nextView;
    showAppManagement.value = false;
    await initializeDashboard();
  }
}

async function connectDatabase() {
  const connected = await connectDb();
  if (!connected) return;

  await performLogout();
  resetDashboardData({ includeSchools: true });
  loginPassword.value = testLoginPassword;
  showAppManagement.value = false;
  databaseConnectionConfirmed.value = false;
  view.value = "uebersicht";
}

function continueAfterDatabaseConnect() {
  if (!isDatabaseConfigured.value) return;
  databaseConnectionConfirmed.value = true;
}

function backToDatabaseConnect() {
  loginError.value = "";
  loginPassword.value = testLoginPassword;
  databaseConnectionConfirmed.value = false;
  showAppManagement.value = false;
}

function logoutPendingManagementSession() {
  showAppManagement.value = false;
  pendingLogin.value = null;
  loginPassword.value = testLoginPassword;
  loginError.value = "";
}

async function logout() {
  await performLogout();
  resetDashboardData({ includeSchools: true });
  showAppManagement.value = false;
  databaseConnectionConfirmed.value = isDatabaseConfigured.value;
}

function resetDashboardData(options: { includeSchools?: boolean } = {}) {
  if (options.includeSchools) {
    schools.value = [];
  }
  classRows.value = [];
  dazRows.value = [];
  overview.value = null;
}

async function loadCurrentView() {
  if (!isAuthenticated.value) return;

  const currentView = view.value;
  if (currentView === "lehrerdaten") {
    if (activeSnapshotSelection.value) {
      await loadTeacherData(
        activeSnapshotSelection.value,
        activeSnapshotTermId.value,
        activeSnapshotSource.value,
        activeSnapshotId.value,
      );
    }
    return;
  }

  if (currentView === "klassenstaerken") {
    if (selectedSnapshotForClasses.value) {
      await loadClassStrengths(
        activeSnapshotTermId.value,
        activeSnapshotSource.value,
        activeSnapshotId.value,
      );
    }
    return;
  }

  if (currentView === "daz") {
    if (selectedSnapshotForDaz.value) {
      await loadDaz(
        activeSnapshotTermId.value,
        activeSnapshotSource.value,
        activeSnapshotId.value,
      );
    }
    return;
  }

  if (["uebersicht", "schuelerzahlen"].includes(currentView) && selectedSnapshotForOverview.value) {
    await loadOverview(
      activeSnapshotTermId.value,
      activeSnapshotSource.value,
      activeSnapshotId.value,
    );
  }
}

function applyFiltersReload() {
  if (!isAuthenticated.value) return;
  enforceAllowedView();
  if (!isAuthenticated.value || !canViewDashboard(view.value)) return;

  const snapshotPromise = (snapshotOptions.value.length === 0) ? loadSnapshots() : Promise.resolve();

  Promise.all([snapshotPromise]).then(async () => {
    ensureActiveSnapshot();
    await loadSchools(selectedSnapshotOption());
    await loadCurrentView();
  });
}

const dashboardTabs = computed(() => {
  const tabKeys = [
    "uebersicht",
    "schuelerzahlen",
    "klassenstaerken",
    "daz",
    "lehrerdaten",
  ];

  return tabKeys
    .filter((tabKey) => canViewDashboard(tabKey))
    .map((tabKey) => ({
      key: tabKey,
      label: dashboardLabel(tabKey),
    }));
});

const dashboardSummaryItems = computed(() => {
  if (view.value === "klassenstaerken") {
    return [
      { label: "Schulen", value: schoolsInClassMatrix.value.length },
      { label: "Klassen", value: classCodes.value.length },
    ];
  }

  if (view.value === "daz") {
    return [
      { label: "Schulen", value: schoolsInDazMatrix.value.length },
      { label: "Klassen", value: dazClassCodes.value.length },
    ];
  }

  if (["uebersicht", "schuelerzahlen"].includes(view.value)) {
    return [
      { label: "Schulen", value: schoolsInOverviewSnapshot },
      { label: "Schueler", value: totalStudentsOverview },
    ];
  }

  if (view.value === "lehrerdaten") {
    return [
      { label: "Schulen", value: teachersData.value?.schoolCount || 0 },
      { label: "Lehrer Gesamt", value: teachersData.value?.totalTeachers || 0 },
    ];
  }

  return [];
});

const dashboardErrorMessage = computed(() => {
  if (view.value === "klassenstaerken") return errorClasses.value;
  if (["uebersicht", "schuelerzahlen"].includes(view.value)) return errorOverview.value;
  return "";
});

// --- Watchers ---
watch([selectedCity, selectedSnr, schoolYear, termNo], () => {
  if (!isAuthenticated.value) return;
  resetDashboardData();
  applyFiltersReload();
});

watch(view, (v: string) => {
  if (!isAuthenticated.value) return;
  if (!canViewDashboard(v)) {
    enforceAllowedView();
    return;
  }
  if (["schuelerstaerken", "daz", "klassenstaerken", "lehrerdaten", "uebersicht", "schuelerzahlen"].includes(v)) {
    ensureActiveSnapshot();
    void loadCurrentView();
  }
});

watch([activeSnapshotSelection, activeSnapshotId, activeSnapshotTermId, activeSnapshotSource], () => {
  if (!isAuthenticated.value) return;
  
  // 1. Reload metadata (Schools)
  void loadSchools(selectedSnapshotOption());
  
  // 2. Reload current view data
  void loadCurrentView();
});

watch(() => overview.value, () => {
  updateSchoolTrendVisibility();
});

onMounted(async () => {
  await loadStatus();
  if (isDatabaseConfigured.value && isAuthenticated.value) {
    enforceAllowedView();
    await initializeDashboard();
  }
});
</script>

<template src="./App.html"></template>
<style scoped src="./App.css"></style>




