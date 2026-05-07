import { computed, ref, watch } from "vue";
import { connectionService } from "../services/apiService";
import type { ConnectionStatus } from "../types";

const STORAGE_KEY = "dbConnection";
const DEFAULT_CONNECTION = {
  host: "",
  port: 3306,
  database: "",
  username: "",
  password: "",
};

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONNECTION };
    const parsed = JSON.parse(raw);
    return {
      host: toTextValue(parsed?.host, DEFAULT_CONNECTION.host),
      port: Number(parsed?.port || DEFAULT_CONNECTION.port || 3306),
      database: toTextValue(parsed?.database, DEFAULT_CONNECTION.database),
      username: toTextValue(parsed?.username, DEFAULT_CONNECTION.username),
    };
  } catch {
    return { ...DEFAULT_CONNECTION };
  }
}

function storeConfig(config: { host: string; port: number; database: string; username: string }) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      host: String(config.host || "").trim(),
      port: Number(config.port || 3306),
      database: String(config.database || "").trim(),
      username: String(config.username || "").trim(),
    }),
  );
}

function toDisplayText(value: any, fallback: string = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const asJson = JSON.stringify(value);
    return asJson && asJson !== "{}" ? asJson : fallback;
  } catch {
    return fallback;
  }
}

function toTextValue(value: any, fallback: string = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function collectErrorHints(error: any, seen: Set<any> = new Set()): string[] {
  if (!error || seen.has(error)) return [];
  if (typeof error !== "object") return [String(error)];
  seen.add(error);

  const hints: string[] = [];
  const message = toDisplayText(error?.message, "");
  const code = toDisplayText(error?.code, "");

  if (message) hints.push(message);
  if (code) hints.push(code);

  if (error?.response?.data) {
    hints.push(toDisplayText(error.response.data.error, ""));
    hints.push(toDisplayText(error.response.data.details, ""));
    hints.push(toDisplayText(error.response.data.code, ""));
  }

  if (error?.cause) {
    hints.push(...collectErrorHints(error.cause, seen));
  }

  if (Array.isArray(error?.errors)) {
    for (const nested of error.errors) {
      hints.push(...collectErrorHints(nested, seen));
    }
  }

  return hints.filter(Boolean);
}

export function useDatabaseLogin() {
  const initial = loadStoredConfig();
  const host = ref<string>(toTextValue(initial.host, "localhost"));
  const port = ref<number>(Number(initial.port || 3306));
  const database = ref<string>(toTextValue(initial.database, "stats"));
  const username = ref<string>(toTextValue(initial.username, "root"));
  const password = ref<string>("");
  const error = ref<string>("");
  const errorDetails = ref<string>("");
  const errorCode = ref<string>("");
  const connecting = ref<boolean>(false);
  const serverConnected = ref<boolean>(false);
  const serverStatus = ref<string>("");
  const connectedHost = ref<string>("");
  const connectedPort = ref<number>(Number(initial.port || 3306));
  const connectedDatabase = ref<string>("");

  const isConfigured = computed<boolean>(() =>
    Boolean(connectedHost.value && connectedDatabase.value),
  );

  function applyDefaults() {
    host.value = toTextValue(DEFAULT_CONNECTION.host, "localhost");
    port.value = Number(DEFAULT_CONNECTION.port || 3306);
    database.value = toTextValue(DEFAULT_CONNECTION.database, "stats");
    username.value = toTextValue(DEFAULT_CONNECTION.username, "root");
    password.value = toTextValue(DEFAULT_CONNECTION.password, "");
  }

  function setRequestError(e: any, fallbackMessage: string) {
    const backendMessage = toDisplayText(e?.response?.data?.error, "");
    const axiosMessage = toDisplayText(e?.message, "");
    const detailsMessage = toDisplayText(e?.response?.data?.details, "");
    const serverCode = toDisplayText(e?.response?.data?.code, "");
    const genericAxios = /^Request failed with status code \d{3}$/i.test(axiosMessage);
    const networkHint = collectErrorHints(e).join(" ").toLowerCase();
    const hostNotReachable =
      networkHint.includes("enotfound") ||
      networkHint.includes("getaddrinfo") ||
      networkHint.includes("eai_again") ||
      networkHint.includes("econnrefused") ||
      networkHint.includes("etimedout") ||
      networkHint.includes("esockettimedout") ||
      networkHint.includes("econnreset") ||
      networkHint.includes("name or service not known") ||
      networkHint.includes("nodename nor servname");

    if (hostNotReachable) {
      error.value = "Server inkl. Port nicht erreichbar.";
    } else {
      error.value = toDisplayText(
        backendMessage,
        genericAxios ? fallbackMessage : toDisplayText(axiosMessage, fallbackMessage),
      );
    }
    errorDetails.value = detailsMessage;
    errorCode.value = serverCode;
  }

  function clearError() {
    error.value = "";
    errorDetails.value = "";
    errorCode.value = "";
  }

  watch([host, port], ([nextHost, nextPort]) => {
    const sameHost = String(nextHost || "").trim() === connectedHost.value;
    const samePort = Number(nextPort || 3306) === connectedPort.value;
    if (sameHost && samePort) return;

    serverConnected.value = false;
    serverStatus.value = "";
    connectedDatabase.value = "";
    clearError();
  });

  async function loadStatus() {
    try {
      const data: ConnectionStatus = await connectionService.getStatus();
      const defaults = data.defaults || {};

      if (!data.configured) {
        host.value = toTextValue(defaults.host, host.value || DEFAULT_CONNECTION.host);
        port.value = Number(defaults.port || port.value || DEFAULT_CONNECTION.port || 3306);
        database.value = toTextValue(defaults.database, database.value || DEFAULT_CONNECTION.database);
        username.value = toTextValue(defaults.username, username.value || DEFAULT_CONNECTION.username);
        password.value = toTextValue(defaults.password, password.value || DEFAULT_CONNECTION.password);
        return;
      }

      connectedHost.value = toTextValue(data.host, host.value);
      connectedPort.value = Number(data.port || port.value || 3306);
      connectedDatabase.value = toTextValue(
        data.database,
        database.value,
      );
      host.value = connectedHost.value;
      port.value = connectedPort.value;
      database.value = connectedDatabase.value;
      username.value = toTextValue(data.username, username.value);
      password.value = toTextValue(defaults.password, password.value || DEFAULT_CONNECTION.password);
      serverConnected.value = false;
      serverStatus.value = "";
      storeConfig({
        host: connectedHost.value,
        port: connectedPort.value,
        database: connectedDatabase.value,
        username: username.value,
      });
    } catch (e: any) {
      setRequestError(e, "Status konnte nicht geladen werden.");
    }
  }

  async function connect(): Promise<boolean> {
    connecting.value = true;
    clearError();
    const payload = {
      host: toTextValue(host.value),
      port: Number(port.value || 3306),
      database: toTextValue(database.value),
      username: toTextValue(username.value),
      password: toTextValue(password.value),
    };
    if (!payload.password) {
      connecting.value = false;
      error.value = "DB-Passwort ist erforderlich.";
      return false;
    }
    try {
      const data = await connectionService.connect(payload);
      connectedHost.value = toTextValue(data.host, payload.host);
      connectedPort.value = Number(data.port || payload.port || 3306);
      connectedDatabase.value = toTextValue(data.database, payload.database);
      host.value = connectedHost.value;
      port.value = connectedPort.value;
      database.value = connectedDatabase.value;
      username.value = toTextValue(payload.username);
      serverConnected.value = true;
      serverStatus.value = "Verbunden";
      storeConfig({
        host: connectedHost.value,
        port: connectedPort.value,
        database: connectedDatabase.value,
        username: username.value,
      });
      return true;
    } catch (e: any) {
      serverConnected.value = false;
      serverStatus.value = "Nicht verbunden";
      connectedDatabase.value = "";
      setRequestError(e, "Datenbank-Verbindung fehlgeschlagen.");
      return false;
    } finally {
      connecting.value = false;
    }
  }

  function resetConnection() {
    serverConnected.value = false;
    serverStatus.value = "";
    connectedHost.value = "";
    connectedDatabase.value = "";
    clearError();
  }

  applyDefaults();

  return {
    host,
    port,
    database,
    username,
    password,
    applyDefaults,
    error,
    errorDetails,
    errorCode,
    connecting,
    serverConnected,
    serverStatus,
    isConfigured,
    connectedHost,
    connectedPort,
    connectedDatabase,
    loadStatus,
    connect,
    resetConnection,
  };
}
