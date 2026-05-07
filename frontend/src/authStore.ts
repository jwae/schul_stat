import { reactive } from "vue";

export interface AuthStore {
  token: string;
  userId: string;
  username: string;
  groupName: string;
  dashboardKeys: string[];
  dashboardNames: Record<string, string>;
}

export const authStore: AuthStore = reactive({
  token: "",
  userId: "",
  username: "",
  groupName: "",
  dashboardKeys: [],
  dashboardNames: {},
});

function normalizeDashboardKeys(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v || "").trim()).filter(Boolean))];
}

function normalizeDashboardNames(value: any): Record<string, string> {
  if (!Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const key = String(entry.dashboard_key || entry.key || "").trim();
    const name = String(entry.dashboard_name || entry.name || "").trim();
    if (!key || !name) continue;
    out[key] = name;
  }
  return out;
}

export function setToken(token: string, username: string, groupName: string, dashboardKeys: string[], dashboardPermissions: any[] = [], userId: string | number = "") {
  authStore.token = token;
  authStore.userId = userId ? String(userId) : "";
  authStore.username = username || "";
  authStore.groupName = groupName || "";
  authStore.dashboardKeys = normalizeDashboardKeys(dashboardKeys);
  authStore.dashboardNames = normalizeDashboardNames(dashboardPermissions);
  localStorage.setItem("token", authStore.token);
  localStorage.setItem("userId", authStore.userId);
  localStorage.setItem("username", authStore.username);
  localStorage.setItem("groupName", authStore.groupName);
  localStorage.setItem("dashboardKeys", JSON.stringify(authStore.dashboardKeys));
  localStorage.setItem("dashboardNames", JSON.stringify(authStore.dashboardNames));
}

export function loadToken() {
  authStore.token = localStorage.getItem("token") || "";
  authStore.userId = localStorage.getItem("userId") || "";
  authStore.username = localStorage.getItem("username") || "";
  authStore.groupName = localStorage.getItem("groupName") || "";
  const rawDashboardKeys = localStorage.getItem("dashboardKeys");
  try {
    authStore.dashboardKeys = normalizeDashboardKeys(JSON.parse(rawDashboardKeys || "[]"));
  } catch {
    authStore.dashboardKeys = [];
  }
  const rawDashboardNames = localStorage.getItem("dashboardNames");
  try {
    const parsedNames = JSON.parse(rawDashboardNames || "{}");
    authStore.dashboardNames = parsedNames && typeof parsedNames === "object" ? parsedNames : {};
  } catch {
    authStore.dashboardNames = {};
  }
}

export function clearToken() {
  authStore.token = "";
  authStore.userId = "";
  authStore.username = "";
  authStore.groupName = "";
  authStore.dashboardKeys = [];
  authStore.dashboardNames = {};
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  localStorage.removeItem("username");
  localStorage.removeItem("groupName");
  localStorage.removeItem("dashboardKeys");
  localStorage.removeItem("dashboardNames");
}
