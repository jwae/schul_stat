import { ref, computed } from "vue";
import { authStore } from "../authStore";

const dashboardOrder: string[] = ["uebersicht", "schuelerzahlen", "klassenstaerken", "daz", "lehrerdaten"];

const dashboardAliases: Record<string, string> = {
  overview: "uebersicht",
  uebersicht: "uebersicht",
  strengths: "schuelerstaerken",
  schuelerstaerken: "schuelerstaerken",
  classes: "klassenstaerken",
  klassenstaerken: "klassenstaerken",
  daz: "daz",
  schuelerzahlen: "schuelerzahlen",
  "schueler-zahlen": "schuelerzahlen",
  schuelerentwicklung: "schuelerzahlen",
  entwicklung: "schuelerzahlen",
  entwicklungsus: "schuelerzahlen",
  "entwicklung-sus": "schuelerzahlen",
  lehrerdaten: "lehrerdaten",
};

const dashboardLabelsFallback: Record<string, string> = {
  uebersicht: "Übersicht",
  lehrerdaten: "Lehrerdaten",
  schuelerstaerken: "Schülerstärken",
  klassenstaerken: "Klassenstärken",
  daz: "DAZ",
  schuelerzahlen: "Schuelerzahlen",
  overview: "Übersicht",
  strengths: "Schülerstärken",
  classes: "Klassenstärken",
};

const normalizeDashboardKey = (key: string): string => String(key || "")
  .trim()
  .toLowerCase();

const resolveDashboardKey = (key: string): string => dashboardAliases[normalizeDashboardKey(key)] || normalizeDashboardKey(key);

export function useDashboardNavigation() {
  const view = ref<string>("uebersicht");

  const allowedDashboardKeys = computed<string[]>(() =>
    [...new Set((authStore.dashboardKeys || []).map((key) => resolveDashboardKey(key)))],
  );

  const canViewDashboard = (key: string): boolean => {
    const resolved = resolveDashboardKey(key);
    if (resolved === "schuelerzahlen") {
      return allowedDashboardKeys.value.includes("uebersicht");
    }
    return allowedDashboardKeys.value.includes(resolved);
  };

  const dashboardLabel = (key: string): string => {
    const resolved = resolveDashboardKey(key);
    return (
      authStore.dashboardNames?.[resolved] ||
      authStore.dashboardNames?.[normalizeDashboardKey(key)] ||
      dashboardLabelsFallback[resolved] ||
      dashboardLabelsFallback[normalizeDashboardKey(key)] ||
      key
    );
  };

  const firstAllowedDashboard = computed<string>(
    () => dashboardOrder.find((key) => canViewDashboard(key)) || "",
  );

  function enforceAllowedView() {
    if (!authStore.token) return;
    if (!firstAllowedDashboard.value) return;
    if (!canViewDashboard(view.value)) {
      view.value = firstAllowedDashboard.value;
    }
  }

  return {
    view,
    dashboardOrder,
    canViewDashboard,
    dashboardLabel,
    firstAllowedDashboard,
    enforceAllowedView,
    resolveDashboardKey,
  };
}
