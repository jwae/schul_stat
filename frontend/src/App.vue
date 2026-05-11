<script setup lang="ts">
import {
  ref,
  onMounted,
  nextTick,
  computed,
  watch,
  type Ref,
} from "vue";
import { authStore, loadToken } from "./authStore";
import { useDatabaseLogin } from "./composables/useDatabaseLogin";
import { useDashboardNavigation } from "./composables/useDashboardNavigation";
import { useGlobalFilters } from "./composables/useGlobalFilters";
import { useSnapshots } from "./composables/useSnapshots";
import { useClassStrengths } from "./composables/useClassStrengths";
import { useDaz } from "./composables/useDaz";
import { useOverview } from "./composables/useOverview";
import { useTeachers } from "./composables/useTeachers";
import { useAuth } from "./composables/useAuth";

import DatabaseConnectPanel from "./components/DatabaseConnectPanel.vue";
import APPManagement from "./components/APPManagement.vue";
import EChartPanel from "./components/EChartPanel.vue";

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
const activeSnapshotTermId = ref<number>(0);
const activeSnapshotSource = ref<string>("");
const activeSnapshotId = ref<string>("");

function syncSnapshotSelections(value: string) {
  const nextValue = String(value || "");
  selectedSnapshotForClasses.value = nextValue;
  selectedSnapshotForDaz.value = nextValue;
  selectedSnapshotForOverview.value = nextValue;
  selectedSnapshotForTeachers.value = nextValue;
}

function findSnapshotOptionByDate(value: string) {
  const selectedValue = String(value || "");
  if (!selectedValue) return null;

  const matchingOptions = snapshotOptions.value.filter(
    (option) => snapshotOptionValue(option) === selectedValue,
  );
  if (!matchingOptions.length) return null;

  const optionByTermId = matchingOptions.find(
    (option) =>
      Number(option?.termId || 0) === Number(activeSnapshotTermId.value || 0)
      && String(option?.source || "").trim() === String(activeSnapshotSource.value || "").trim(),
  );
  if (optionByTermId) return optionByTermId;

  const optionByCurrentTerm = matchingOptions.find(
    (option) =>
      Number(option?.schoolYear || 0) === Number(schoolYear.value || 0)
      && Number(option?.termNo || 0) === Number(termNo.value || 0),
  );
  return optionByCurrentTerm || matchingOptions[0] || null;
}

function compareSnapshotOptionsByRecency(a: any, b: any): number {
  const schoolYearA = Number(a?.schoolYear || 0);
  const schoolYearB = Number(b?.schoolYear || 0);
  if (schoolYearA !== schoolYearB) return schoolYearB - schoolYearA;

  const termNoA = Number(a?.termNo || 0);
  const termNoB = Number(b?.termNo || 0);
  if (termNoA !== termNoB) return termNoB - termNoA;

  const dateA = String(a?.snapshotDate || "");
  const dateB = String(b?.snapshotDate || "");
  return dateB.localeCompare(dateA, "de", { numeric: true });
}

function applySnapshotOption(option: any) {
  if (!option) return;
  activeSnapshotId.value = String(option?.snapId || "").trim();
  activeSnapshotTermId.value = Number(option?.termId || 0);
  activeSnapshotSource.value = String(option?.source || "").trim();
  schoolYear.value = Number(option.schoolYear || 0);
  termNo.value = Number(option.termNo || 0);
  
  // Reset lower-level filters when snapshot changes
  selectedCity.value = "";
  selectedSnr.value = "";

  syncSnapshotSelections(snapshotOptionValue(option));
}

const activeSnapshotSelection = computed<string>({
  get() {
    return selectedSnapshotForOverview.value
      || selectedSnapshotForClasses.value
      || selectedSnapshotForDaz.value
      || selectedSnapshotForTeachers.value
      || "";
  },
  set(value: string) {
    const selectedOption = findSnapshotOptionByDate(value);
    if (selectedOption?.schoolYear || selectedOption?.termNo) {
      applySnapshotOption(selectedOption);
      return;
    }
    activeSnapshotId.value = "";
    activeSnapshotTermId.value = 0;
    activeSnapshotSource.value = "";
    
    // Reset filters
    selectedCity.value = "";
    selectedSnr.value = "";
    
    syncSnapshotSelections(value);
  },
});

const snapshotNameOptions = computed(() => {
  const entries = new Map<string, { value: string; label: string }>();
  for (const option of snapshotsForDropdown.value) {
    const value = snapshotOptionName(option);
    if (!value || entries.has(value)) continue;
    entries.set(value, { value, label: value });
  }
  return [...entries.values()].sort((a, b) => a.label.localeCompare(b.label, "de", { numeric: true }));
});


const snapshotNameSelection = computed<string>({
  get() {
    const selectedOption = findSnapshotOptionByDate(activeSnapshotSelection.value);
    return selectedOption ? snapshotOptionName(selectedOption) : "";
  },
  set(value: string) {
    const selectedName = String(value || "");
    const matchingOptions = snapshotsForDropdown.value.filter(
      (option) => snapshotOptionName(option) === selectedName,
    );
    if (!matchingOptions.length) return;
    const newestOption = [...matchingOptions].sort(compareSnapshotOptionsByRecency)[0];
    applySnapshotOption(newestOption);
  },
});

const schoolTermOptions = computed(() => {
  const optionMap = new Map<number, { value: string; label: string; schoolYear: number; termNo: number }>();
  for (const option of snapshotsForDropdown.value || []) {
    if (snapshotNameSelection.value && snapshotOptionName(option) !== snapshotNameSelection.value) continue;
    const termId = Number(option?.termId || 0);
    const optionSchoolYear = Number(option?.schoolYear || 0);
    const optionTermNo = Number(option?.termNo || 0);
    if (termId <= 0 || optionSchoolYear <= 0 || optionTermNo <= 0) continue;
    if (optionMap.has(termId)) continue;
    optionMap.set(termId, {
      value: String(termId),
      label: `${optionSchoolYear}.${String(optionTermNo).padStart(2, "0")}`,
      schoolYear: optionSchoolYear,
      termNo: optionTermNo,
    });
  }

  return [...optionMap.values()].sort((a, b) => {
    if (a.schoolYear !== b.schoolYear) return a.schoolYear - b.schoolYear;
    if (a.termNo !== b.termNo) return a.termNo - b.termNo;
    return Number(a.value) - Number(b.value);
  });
});

const schoolTermSelection = computed<string>({
  get() {
    const selectedOption = findSnapshotOptionByDate(activeSnapshotSelection.value);
    const selectedTermId = Number(selectedOption?.termId || 0);
    if (!selectedTermId) return "";
    const matchingOption = schoolTermOptions.value.find((option) => Number(option.value) === selectedTermId);
    return matchingOption?.value || "";
  },
  set(value: string) {
    const selectedOption = schoolTermOptions.value.find(
      (option) => option.value === String(value || ""),
    );
    if (!selectedOption) return;
    const matchingSnapshotOption = snapshotsForDropdown.value.find(
      (option) =>
        snapshotOptionName(option) === snapshotNameSelection.value
        && Number(option?.termId || 0) === Number(selectedOption.value),
    );
    if (matchingSnapshotOption) {
      applySnapshotOption(matchingSnapshotOption);
      return;
    }
    schoolYear.value = selectedOption.schoolYear;
    termNo.value = selectedOption.termNo;
  },
});

function selectedSnapshotOption() {
  return findSnapshotOptionByDate(activeSnapshotSelection.value);
}

// --- Lifecycle Actions ---
applyDbDefaults();
loadToken();

async function initializeDashboard() {
  if (!isAuthenticated.value) return;
  enforceAllowedView();

  await loadSchools(selectedSnapshotOption());
  await loadSnapshots();

  const defaultSnapshot = firstAvailableSnapshotValue();
  if (!activeSnapshotSelection.value) {
    const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
    if (defaultOption) applySnapshotOption(defaultOption);
    else syncSnapshotSelections(defaultSnapshot);
  }

  await loadSchools(selectedSnapshotOption());

  if (view.value === "lehrerdaten") await loadTeacherData(activeSnapshotSelection.value, activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  else if (view.value === "klassenstaerken") await loadClassStrengths(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  else if (view.value === "daz") await loadDaz(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  else if (["uebersicht", "schuelerzahlen"].includes(view.value)) await loadOverview(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
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
  schools.value = [];
  classRows.value = [];
  dazRows.value = [];
  overview.value = null;
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
  schools.value = [];
  classRows.value = [];
  dazRows.value = [];
  overview.value = null;
  showAppManagement.value = false;
  databaseConnectionConfirmed.value = isDatabaseConfigured.value;
}

function applyFiltersReload() {
  if (!isAuthenticated.value) return;
  enforceAllowedView();
  if (!isAuthenticated.value || !canViewDashboard(view.value)) return;

  const snapshotPromise = (snapshotOptions.value.length === 0) ? loadSnapshots() : Promise.resolve();

  if (view.value === "lehrerdaten" && activeSnapshotSelection.value) {
    loadTeacherData(activeSnapshotSelection.value, activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  }

  Promise.all([snapshotPromise]).then(() => {
    const defaultSnapshot = firstAvailableSnapshotValue();
    if (!activeSnapshotSelection.value || !hasSnapshotOptionValue(activeSnapshotSelection.value)) {
      const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
      if (defaultOption) applySnapshotOption(defaultOption);
      else syncSnapshotSelections(defaultSnapshot);
    }

    loadSchools(selectedSnapshotOption());

    if (view.value === "klassenstaerken" && selectedSnapshotForClasses.value) loadClassStrengths(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
    if (["uebersicht", "schuelerzahlen"].includes(view.value) && selectedSnapshotForOverview.value) loadOverview(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
    if (view.value === "lehrerdaten" && !activeSnapshotSelection.value && selectedSnapshotForTeachers.value) loadTeacherData(selectedSnapshotForTeachers.value, activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  });
}

// --- Watchers ---
watch([selectedCity, selectedSnr, schoolYear, termNo], () => {
  if (!isAuthenticated.value) return;
  classRows.value = [];
  dazRows.value = [];
  overview.value = null;
  applyFiltersReload();
});

watch(view, (v: string) => {
  if (!isAuthenticated.value) return;
  if (!canViewDashboard(v)) {
    enforceAllowedView();
    return;
  }
  const defaultSnapshot = firstAvailableSnapshotValue();
  if (v === "schuelerstaerken" && !activeSnapshotSelection.value) {
    const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
    if (defaultOption) applySnapshotOption(defaultOption);
    else syncSnapshotSelections(defaultSnapshot);
  }
  if (v === "daz") {
    if (!activeSnapshotSelection.value) {
      const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
      if (defaultOption) applySnapshotOption(defaultOption);
      else syncSnapshotSelections(defaultSnapshot);
    }
    if (selectedSnapshotForDaz.value) loadDaz(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  }
  if (v === "klassenstaerken") {
    if (!activeSnapshotSelection.value) {
      const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
      if (defaultOption) applySnapshotOption(defaultOption);
      else syncSnapshotSelections(defaultSnapshot);
    }
    if (selectedSnapshotForClasses.value) loadClassStrengths(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  }
  if (v === "lehrerdaten") {
    if (!activeSnapshotSelection.value) {
      const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
      if (defaultOption) applySnapshotOption(defaultOption);
      else syncSnapshotSelections(defaultSnapshot);
    }
    if (activeSnapshotSelection.value) loadTeacherData(activeSnapshotSelection.value, activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  }
  if (["uebersicht", "schuelerzahlen"].includes(v)) {
    if (!activeSnapshotSelection.value) {
      const defaultOption = findSnapshotOptionByDate(defaultSnapshot);
      if (defaultOption) applySnapshotOption(defaultOption);
      else syncSnapshotSelections(defaultSnapshot);
    }
    if (selectedSnapshotForOverview.value) loadOverview(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  }
});

watch([activeSnapshotSelection, activeSnapshotId, activeSnapshotTermId, activeSnapshotSource], () => {
  if (!isAuthenticated.value) return;
  
  // 1. Reload metadata (Schools)
  loadSchools(selectedSnapshotOption());
  
  // 2. Reload current view data
  const v = view.value;
  if (["uebersicht", "schuelerzahlen"].includes(v)) {
    loadOverview(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  } else if (v === "lehrerdaten") {
    loadTeacherData(activeSnapshotSelection.value, activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  } else if (v === "klassenstaerken") {
    loadClassStrengths(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  } else if (v === "daz") {
    loadDaz(activeSnapshotTermId.value, activeSnapshotSource.value, activeSnapshotId.value);
  }
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




