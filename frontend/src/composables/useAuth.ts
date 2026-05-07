import { ref, computed } from "vue";
import { authStore, setToken, clearToken } from "../authStore";
import { authService } from "../services/apiService";
import { registerUnauthorizedCallback } from "../services/apiClient";
import type { User, LoginResponse } from "../types";

export function useAuth() {
  const testLoginUsername = String(import.meta.env.VITE_DEV_LOGIN_USERNAME || "").trim();
  const testLoginPassword = String(import.meta.env.VITE_DEV_LOGIN_PASSWORD || "");
  const loginUsername = ref<string>(testLoginUsername);
  const loginPassword = ref<string>(testLoginPassword);
  const loginLoading = ref<boolean>(false);
  const loginError = ref<string>("");
  const pendingLogin = ref<LoginResponse | null>(null);

  const isAuthenticated = computed<boolean>(() => !!authStore.token);
  const currentUserLabel = computed<string>(() => {
    const name = (authStore.username || "").trim();
    const group = (authStore.groupName || "").trim();
    if (!name) return "";
    return group ? `${name} (${group})` : name;
  });

  const pendingLoginUser = computed<User | null>(() => pendingLogin.value?.user || null);
  const pendingLoginUserLabel = computed<string>(() => {
    const username = String(pendingLoginUser.value?.username || loginUsername.value || "").trim();
    const groupName = String(pendingLoginUser.value?.group_name || "").trim();
    if (!username) return "";
    return groupName ? `${username} (${groupName})` : username;
  });

  const isPendingAdmin = computed<boolean>(
    () => String(pendingLoginUser.value?.group_name || "").trim().toLowerCase() === "admin",
  );

  async function login() {
    loginLoading.value = true;
    loginError.value = "";
    pendingLogin.value = null;
    try {
      const data = await authService.login({
        username: loginUsername.value,
        password: loginPassword.value,
      });

      pendingLogin.value = {
        token: data?.token || "",
        user: data?.user || ({} as User),
      };
      loginPassword.value = testLoginPassword;
    } catch (e: any) {
      loginError.value =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        "Login fehlgeschlagen.";
    } finally {
      loginLoading.value = false;
    }
  }

  function continueAfterLogin(firstAllowedDashboard: { value: string }): string | null {
    if (!pendingLogin.value) return null;

    const token = pendingLogin.value.token || "";
    const user = pendingLogin.value.user || {};
    const username = user.username || loginUsername.value;
    const groupName = user.group_name || "";
    const dashboardKeys = Array.isArray(user.dashboards) ? user.dashboards : [];
    const dashboardPermissions = Array.isArray(user.dashboard_permissions)
      ? user.dashboard_permissions
      : [];

    setToken(token, username, groupName, dashboardKeys, dashboardPermissions, user.user_id || "");
    const view = firstAllowedDashboard.value || "uebersicht";
    pendingLogin.value = null;
    return view;
  }

  async function logout() {
    try {
      if (authStore.token) {
        await authService.logout();
      }
    } catch {
      // still clear local session
    } finally {
      clearToken();
    }
  }

  // Register the 401 interceptor callback to trigger logout automatically
  registerUnauthorizedCallback(logout);

  return {
    loginUsername,
    loginPassword,
    loginLoading,
    loginError,
    pendingLogin,
    isAuthenticated,
    currentUserLabel,
    pendingLoginUser,
    pendingLoginUserLabel,
    isPendingAdmin,
    login,
    continueAfterLogin,
    logout,
    testLoginPassword,
  };
}
