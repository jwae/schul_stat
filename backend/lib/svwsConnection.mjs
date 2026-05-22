import http from "node:http";
import https from "node:https";
import { existsSync } from "node:fs";

function createSvwsConnectionError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function laeuftInDockerContainer() {
  return process.env.RUNNING_IN_DOCKER === "true" || existsSync("/.dockerenv");
}

function ersetzeLokalenSvwsHostFuerDocker(basis) {
  if (!laeuftInDockerContainer()) {
    return basis;
  }

  if (/^localhost(?::|$)/i.test(basis)) {
    return basis.replace(/^localhost/i, "host.docker.internal");
  }

  if (/^127\.0\.0\.1(?::|$)/.test(basis)) {
    return basis.replace(/^127\.0\.0\.1/, "host.docker.internal");
  }

  return basis;
}

export function normalisiereSvwsHost(host) {
  const basis = String(host || "").trim();

  if (!basis) {
    return "";
  }

  if (/^https?:\/\//i.test(basis)) {
    const url = new URL(basis);
    url.hostname = ersetzeLokalenSvwsHostFuerDocker(url.hostname);
    return url.toString().replace(/\/+$/, "");
  }

  const dockerBasis = ersetzeLokalenSvwsHostFuerDocker(basis);
  const lowerBasis = dockerBasis.toLowerCase();
  const istLokalerHost =
    lowerBasis === "localhost" ||
    lowerBasis.startsWith("localhost:") ||
    lowerBasis === "127.0.0.1" ||
    lowerBasis.startsWith("127.0.0.1:") ||
    lowerBasis === "[::1]" ||
    lowerBasis.startsWith("[::1]:") ||
    lowerBasis === "::1";

  const protocol = istLokalerHost ? "http" : "https";
  return `${protocol}://${dockerBasis}`.replace(/\/+$/, "");
}

export async function requestSvws(urlString, benutzer, kennwort, timeoutMs = 5000) {
  const url = new URL(urlString);
  const client = url.protocol === "https:" ? https : http;

  return await new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${benutzer}:${kennwort}`).toString("base64")}`,
          "User-Agent": "smedia/1.0 (+school-media-manager)",
        },
        rejectUnauthorized: false,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 0,
            body,
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("RequestTimeout"));
    });

    request.on("error", reject);
    request.end();
  });
}

export async function requestSvwsJson(urlString, benutzer, kennwort, timeoutMs = 5000) {
  const response = await requestSvws(urlString, benutzer, kennwort, timeoutMs);
  let data = null;

  if (response.body) {
    try {
      data = JSON.parse(response.body);
    } catch {
      throw new Error(`Ungueltige JSON-Antwort von ${urlString}.`);
    }
  }

  return {
    statusCode: response.statusCode,
    data,
  };
}

export function createSvwsClient({ host, schule, user, passwort }) {
  const basisUrl = `${normalisiereSvwsHost(host)}/db/${encodeURIComponent(String(schule || "").trim())}`;

  return {
    async get(endpoint) {
      const pathPart = String(endpoint || "").startsWith("/") ? endpoint : `/${endpoint || ""}`;
      return await requestSvwsJson(`${basisUrl}${pathPart}`, String(user || "").trim(), String(passwort || ""), 5000);
    },
  };
}

export async function pruefeSvwsVerbindung({ host, schule, user, passwort, timeoutMs = 5000 }) {
  const basisUrl = normalisiereSvwsHost(host);
  const schema = String(schule || "").trim();
  const benutzer = String(user || "").trim();
  const kennwort = String(passwort || "");

  if (!basisUrl || !schema || !benutzer) {
    throw createSvwsConnectionError("Host, Schule und User werden benoetigt.");
  }

  const url = `${basisUrl}/db/${encodeURIComponent(schema)}/schule/stammdaten`;

  try {
    const response = await requestSvws(url, benutzer, kennwort, timeoutMs);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw createSvwsConnectionError(`SVWS-Endpunkt nicht erreichbar (HTTP ${response.statusCode}).`);
    }

    return {
      ok: true,
      meldung: "SVWS-Verbindung erfolgreich geprueft.",
      basisUrl,
      url,
      statusCode: response.statusCode,
    };
  } catch (error) {
    if (error?.statusCode) {
      throw error;
    }

    const fehlerCode = error?.cause?.code || error?.code || "";
    const ursacheText = error?.cause?.message || "";
    let fehlerText = "";

    if (error?.message === "RequestTimeout") {
      fehlerText = `Zeitueberschreitung beim Verbindungsaufbau zu ${url}.`;
    } else if (fehlerCode === "ECONNREFUSED") {
      fehlerText = `Verbindung zu ${url} abgelehnt. Bitte Host, Port und laufenden SVWS-Server pruefen.`;
      if (laeuftInDockerContainer() && /localhost|127\.0\.0\.1/.test(String(host || ""))) {
        fehlerText += " Bei Docker bitte den SVWS-Host des Rechners oder host.docker.internal verwenden.";
      }
    } else if (fehlerCode === "ENOTFOUND") {
      fehlerText = `Host fuer ${url} wurde nicht gefunden. Bitte Hostangabe pruefen.`;
    } else if (fehlerCode === "EHOSTUNREACH") {
      fehlerText = `Host ${basisUrl} ist nicht erreichbar. Bitte Netzwerk und Server pruefen.`;
    } else if (fehlerCode === "DEPTH_ZERO_SELF_SIGNED_CERT" || fehlerCode === "SELF_SIGNED_CERT_IN_CHAIN") {
      fehlerText = `HTTPS-Zertifikat fuer ${basisUrl} wird nicht vertraut (${fehlerCode}).`;
    } else {
      fehlerText = error?.message
        ? `Verbindungsfehler zu ${url}: ${error.message}${ursacheText ? ` (${ursacheText})` : ""}`
        : `Unbekannter Fehler beim Verbindungsaufbau zu ${url}.`;
    }

    throw createSvwsConnectionError(fehlerText);
  }
}
