﻿const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");

function classifyAuthConnectionError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").trim();
  const lowered = message.toLowerCase();

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET"
  ) {
    return "DB-Server nicht erreichbar. Bitte Server und Port pruefen.";
  }

  if (
    lowered.includes("enotfound") ||
    lowered.includes("getaddrinfo") ||
    lowered.includes("eai_again") ||
    lowered.includes("econnrefused") ||
    lowered.includes("etimedout") ||
    lowered.includes("esockettimedout") ||
    lowered.includes("name or service not known") ||
    lowered.includes("nodename nor servname")
  ) {
    return "DB-Server nicht erreichbar. Bitte Server und Port pruefen.";
  }

  return "";
}

function collectConnectionHints(error, seen = new Set()) {
  if (!error || seen.has(error)) return [];
  if (typeof error !== "object") return [String(error)];
  seen.add(error);

  const hints = [];
  const code = String(error?.code || "").trim();
  const errno = error?.errno;
  const message = String(error?.message || "").trim();

  if (code) hints.push(code);
  if (errno !== undefined && errno !== null && String(errno).trim()) hints.push(String(errno));
  if (message) hints.push(message);

  if (error?.cause) {
    hints.push(...collectConnectionHints(error.cause, seen));
  }

  if (Array.isArray(error?.errors)) {
    for (const nested of error.errors) {
      hints.push(...collectConnectionHints(nested, seen));
    }
  }

  return hints;
}

function classifySchoolSourceConnectionError(error, databaseName = "") {
  return normalizeSchoolSourceRestError(error, databaseName);
}

function normalizeSchoolSourceHost(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) {
    const error = new Error("Server ist erforderlich.");
    error.statusCode = 400;
    throw error;
  }

  let hostname = text;
  if (/^https?:\/\//i.test(text)) {
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      const error = new Error("Server ist ungueltig.");
      error.statusCode = 400;
      throw error;
    }
    if (parsed.protocol !== "https:") {
      const error = new Error("Es sind nur HTTPS-Adressen erlaubt.");
      error.statusCode = 400;
      throw error;
    }
    if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
      const error = new Error("Bitte nur den Hostnamen ohne Pfad angeben.");
      error.statusCode = 400;
      throw error;
    }
    hostname = String(parsed.hostname || "").trim();
  } else if (/[/?#]/.test(text)) {
    const error = new Error("Bitte nur den Hostnamen ohne Pfad angeben.");
    error.statusCode = 400;
    throw error;
  }

  try {
    const url = buildSchoolSourceRestUrl(hostname, "/config/db/schemata");
    return { hostname, url: url.toString() };
  } catch {
    const error = new Error("Server ist ungueltig.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeSchoolSourceRestError(error, hostname = "") {
  const code = String(error?.code || error?.cause?.code || "").trim().toUpperCase();
  const message = String(error?.message || error?.cause?.message || "").trim();
  const lowered = message.toLowerCase();
  const requestPath = String(error?.requestPath || error?.cause?.requestPath || "").trim();

  if (
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    lowered.includes("altname") ||
    lowered.includes("hostname/ip does not match certificate")
  ) {
    return `HTTPS-Validierung fehlgeschlagen: Zertifikat passt nicht zu ${hostname || "dem Hostnamen"}.`;
  }

  if (
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    lowered.includes("self-signed certificate") ||
    lowered.includes("unable to verify the first certificate") ||
    lowered.includes("certificate")
  ) {
    return "HTTPS-Validierung fehlgeschlagen: Zertifikat ist ungueltig.";
  }

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    lowered.includes("enotfound") ||
    lowered.includes("getaddrinfo")
  ) {
    return "Host konnte nicht aufgeloest werden.";
  }

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    lowered.includes("fetch failed") ||
    lowered.includes("timeout") ||
    lowered.includes("econnrefused")
  ) {
    return "HTTPS-Endpunkt auf Port 8443 ist nicht erreichbar.";
  }

  if (Number(error?.responseStatus || 0) === 404) {
    return `REST-Endpunkt ${requestPath || "/config/db/schemata"} wurde nicht gefunden.`;
  }

  if (Number(error?.responseStatus || 0) === 401) {
    return "DB-Login fehlerhaft";
  }

  if (Number(error?.responseStatus || 0) >= 400) {
    return `REST-Endpunkt ${requestPath || "/config/db/schemata"} antwortet mit HTTP ${error.responseStatus}.`;
  }

  return message || "REST-Verbindungstest fehlgeschlagen.";
}

function isDevelopmentMode() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

function isLocalDevelopmentHost(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function buildSchoolSourceRestUrl(hostname, pathname) {
  const normalizedHost = String(hostname || "").trim();
  const normalizedPath = String(pathname || "").trim();
  const isLocalHost = isLocalDevelopmentHost(normalizedHost);
  const base = isLocalHost && isDevelopmentMode()
    ? `https://${normalizedHost}`
    : `https://${normalizedHost}:8443`;
  return new URL(normalizedPath, `${base}/`);
}

function buildSchoolSourceRestHeaders(username = "", password = "") {
  const user = String(username || "").trim();
  const pass = String(password || "");
  const headers = { Accept: "application/json" };
  if (user) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
  }
  return headers;
}

async function fetchSchoolSourceRestJson(hostname, pathname, options = {}) {
  const url = buildSchoolSourceRestUrl(hostname, pathname);
  const allowSelfSigned = isDevelopmentMode() && isLocalDevelopmentHost(hostname);
  const headers = buildSchoolSourceRestHeaders(options.username, options.password);

  return await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "GET",
      headers,
      timeout: 5000,
      rejectUnauthorized: !allowSelfSigned,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        const statusCode = Number(res.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          const error = new Error(`HTTP ${statusCode}`);
          error.responseStatus = statusCode;
          error.requestPath = String(pathname || "").trim();
          reject(error);
          return;
        }

        try {
          resolve(body ? JSON.parse(body) : []);
        } catch {
          const error = new Error("REST-Endpunkt liefert kein gueltiges JSON.");
          error.requestPath = String(pathname || "").trim();
          reject(error);
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      const error = new Error("Zeitueberschreitung beim REST-Verbindungstest.");
      error.code = "ETIMEDOUT";
      error.requestPath = String(pathname || "").trim();
      reject(error);
    });

    req.on("error", (error) => {
      error.requestPath = String(pathname || "").trim();
      reject(error);
    });

    req.end();
  });
}

function ensureSchoolSourceRestCredentials(source, schoolLabel = "die Schule") {
  const username = String(source?.db_user || "").trim();
  const password = String(source?.db_password_enc || "");

  if (!username) {
    const error = new Error(`Fuer ${schoolLabel} fehlt der REST-Benutzer in school_source_db.`);
    error.statusCode = 400;
    throw error;
  }

  return { username, password };
}

async function fetchSchoolSourceSchemata(hostname, username = "", password = "") {
  return await fetchSchoolSourceRestJson(hostname, "/config/db/schemata", { username, password });
}

async function testTcpReachability(hostname, port) {
  return await new Promise((resolve, reject) => {
    const socket = net.connect({ host: hostname, port, timeout: 5000 });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      const error = new Error("Zeitueberschreitung beim Port-Test.");
      error.code = "ETIMEDOUT";
      reject(error);
    });

    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

function extractRestArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return payload.items || payload.data || payload.schueler || payload.students || payload.list || [];
}

function firstDefinedValue(entry, keys = []) {
  for (const key of keys) {
    if (entry && entry[key] !== undefined && entry[key] !== null) {
      return entry[key];
    }
  }
  return null;
}

function extractClassCode(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractClassCode(entry);
      if (nested) return nested;
    }
    return "";
  }
  if (typeof value === "object") {
    return String(firstDefinedValue(value, [
      "kuerzel",
      "kuerzelAnzeige",
      "kurzbezeichnung",
      "klasse",
      "class_code",
      "classCode",
      "code",
      "klassenbezeichnung",
      "anzeigename",
      "name",
      "bezeichnung",
      "text",
      "description",
      "label",
      "id",
    ]) || "").trim();
  }
  return "";
}

function normalizeCurrentStudentEntry(entry) {
  const id = Number(firstDefinedValue(entry, ["id", "student_id", "studentId", "schueler_id", "schuelerId"]) || 0);
  if (!id) return null;

  const rawClassValue = firstDefinedValue(entry, [
    "klasse",
    "class_code",
    "classCode",
    "klassenbezeichnung",
    "class",
    "course",
    "klasseKuerzel",
    "klasse_kuerzel",
    "klassenKuerzel",
    "klassen_kuerzel",
    "className",
    "classname",
    "class_name",
    "klassenname",
    "classLabel",
    "label",
  ]);
  const nestedClassId = rawClassValue && typeof rawClassValue === "object"
    ? Number(firstDefinedValue(rawClassValue, ["id", "idKlasse", "klasse_id", "class_id", "classId"]) || 0)
    : 0;

  return {
    id,
    class_id: Number(firstDefinedValue(entry, ["idKlasse", "id_klasse", "klasse_id", "class_id", "classId"]) || 0) || nestedClassId,
    year_group_id: Number(firstDefinedValue(entry, ["idJahrgang", "jahrgangID", "jahrgangId"]) || 0),
    section_id: Number(firstDefinedValue(entry, [
      "idSchuljahresabschnitt",
      "idAbschnitt",
      "id_abschnitt",
      "abschnitt_id",
      "section_id",
      "sectionId",
      "schuljahresabschnitt_id",
      "schuljahresabschnittId",
    ]) || 0),
    nachname: String(firstDefinedValue(entry, ["nachname", "last_name", "lastname", "name"]) || "").trim(),
    vorname: String(firstDefinedValue(entry, ["vorname", "first_name", "firstname"]) || "").trim(),
    jahrgang: String(firstDefinedValue(entry, ["jahrgang", "grade", "grade_level", "year"]) || "").trim(),
    geschlecht: String(firstDefinedValue(entry, ["geschlecht", "sex", "gender", "geschl"]) || "").trim(),
    schulgliederung: String(firstDefinedValue(entry, ["schulgliederung", "school_structure", "schoolStructure", "gliederung"]) || "").trim(),
    religionID: firstDefinedValue(entry, ["religionID", "religion_id", "religionId"]),
    migration: firstDefinedValue(entry, ["hatMigrationshintergrund", "migration", "hasMigrationBackground"]),
    staatsangehoerigkeit: firstDefinedValue(entry, [
      "staatsangehoerigkeit",
      "staatsangehörigkeit",
      "nationalitaet",
      "nationalität",
      "nation",
      "staatsangehoerigkeitID",
      "staatsangehörigkeitID",
      "staatsangehoerigkeit_id",
      "staatsangehörigkeit_id",
      "staatsangehoerigkeitId",
      "staatsangehörigkeitId",
    ]),
    foerderschwerpunkt1ID: firstDefinedValue(entry, [
      "foerderschwerpunkt1ID",
      "förderschwerpunkt1ID",
      "foerderschwerpunkt1_id",
      "förderschwerpunkt1_id",
      "foerderschwerpunkt1Id",
      "förderschwerpunkt1Id",
    ]),
    foerderschwerpunkt2ID: firstDefinedValue(entry, [
      "foerderschwerpunkt2ID",
      "förderschwerpunkt2ID",
      "foerderschwerpunkt2_id",
      "förderschwerpunkt2_id",
      "foerderschwerpunkt2Id",
      "förderschwerpunkt2Id",
    ]),
    hatZieldifferentenUnterricht: firstDefinedValue(entry, [
      "hatZieldifferentenUnterricht",
      "hat_zieldifferenten_unterricht",
      "target_different",
      "zieldifferent",
    ]),
    klassenart: firstDefinedValue(entry, ["klassenart", "klassenArt", "Klassenart", "class_type", "classType"]),
    class_code: extractClassCode(rawClassValue),
    status: firstDefinedValue(entry, ["status", "status_id", "statusId", "schuelerstatus", "schueler_status", "schuelerStatus"]),
  };
}

function buildSelectionClassLookup(payload) {
  const classEntries = Array.isArray(payload?.klassen)
    ? payload.klassen
    : Array.isArray(payload?.classes)
      ? payload.classes
      : [];
  const lookup = new Map();

  for (const entry of classEntries) {
    const classId = Number(firstDefinedValue(entry, ["id", "idKlasse", "klasse_id", "class_id", "classId"]) || 0);
    if (!classId) continue;
    const classCode = extractClassCode(entry);
    if (!classCode) continue;
    lookup.set(classId, classCode);
  }

  return lookup;
}

function extractSelectionClasses(payload, targetSectionId = 0) {
  const classEntries = Array.isArray(payload?.klassen)
    ? payload.klassen
    : Array.isArray(payload?.classes)
      ? payload.classes
      : [];
  const normalizedTargetSectionId = Number(targetSectionId || 0);

  return classEntries
    .filter((entry) => {
      if (!normalizedTargetSectionId) return true;
      const sectionId = Number(firstDefinedValue(entry, [
        "idSchuljahresabschnitt",
        "idAbschnitt",
        "id_abschnitt",
        "abschnitt_id",
        "section_id",
        "sectionId",
        "schuljahresabschnitt_id",
        "schuljahresabschnittId",
      ]) || 0);
      return !sectionId || sectionId === normalizedTargetSectionId;
    })
    .map((entry) => ({
      ...entry,
      class_code: String(firstDefinedValue(entry, ["kuerzel", "kuerzelAnzeige", "kurzbezeichnung"]) || "").trim(),
    }));
}

function extractSelectionStudents(payload, inheritedClassCode = "", inheritedSectionId = 0, targetSectionId = 0) {
  const classLookup = buildSelectionClassLookup(payload);
  const normalizedTargetSectionId = Number(targetSectionId || 0);
  const directEntries = extractRestArray(payload);
  const normalizedDirectEntries = directEntries
    .map((entry) => {
      const normalized = normalizeCurrentStudentEntry(entry);
      if (!normalized) return null;
      if (normalized.class_id < 0 || normalized.year_group_id < 0) {
        return null;
      }
      if (!normalized.section_id && Number(inheritedSectionId || 0) > 0) {
        normalized.section_id = Number(inheritedSectionId || 0);
      }
      if (!normalized.class_code && normalized.class_id > 0 && classLookup.has(normalized.class_id)) {
        normalized.class_code = String(classLookup.get(normalized.class_id) || "").trim();
      }
      if (!normalized.class_code && inheritedClassCode) {
        normalized.class_code = inheritedClassCode;
      }
      if (normalizedTargetSectionId > 0 && normalized.section_id > 0 && normalized.section_id !== normalizedTargetSectionId) {
        return null;
      }
      return normalized;
    })
    .filter(Boolean);
  if (normalizedDirectEntries.length) return normalizedDirectEntries;

  if (!payload || typeof payload !== "object") return [];

  const groupedEntries = [];
  for (const entry of Object.values(payload)) {
    if (!entry || typeof entry !== "object") continue;
    const classCode = extractClassCode(entry) || inheritedClassCode;
    const sectionId = Number(firstDefinedValue(entry, [
      "idSchuljahresabschnitt",
      "idAbschnitt",
      "id_abschnitt",
      "abschnitt_id",
      "section_id",
      "sectionId",
      "schuljahresabschnitt_id",
      "schuljahresabschnittId",
    ]) || inheritedSectionId || 0);
    const nestedStudents = firstDefinedValue(entry, ["schueler", "students", "studenten", "student_list"]);
    if (!Array.isArray(nestedStudents)) continue;
    for (const studentEntry of nestedStudents) {
      const normalized = normalizeCurrentStudentEntry(studentEntry);
      if (!normalized) continue;
      if (normalized.class_id < 0 || normalized.year_group_id < 0) {
        continue;
      }
      if (!normalized.section_id && sectionId > 0) {
        normalized.section_id = sectionId;
      }
      if (!normalized.class_code && normalized.class_id > 0 && classLookup.has(normalized.class_id)) {
        normalized.class_code = String(classLookup.get(normalized.class_id) || "").trim();
      }
      if (!normalized.class_code && classCode) {
        normalized.class_code = classCode;
      }
      if (normalizedTargetSectionId > 0 && normalized.section_id > 0 && normalized.section_id !== normalizedTargetSectionId) {
        continue;
      }
      groupedEntries.push(normalized);
    }
  }

  return groupedEntries;
}

function buildSelectionClassMetaLookup(classEntries, yearGroupLookup = null) {
  const byId = new Map();
  const byCode = new Map();

  for (const entry of classEntries || []) {
    const normalizedClass = normalizeClassEntry(entry, yearGroupLookup);
    if (!normalizedClass?.class_code) continue;
    const classId = Number(firstDefinedValue(entry, ["id", "idKlasse", "klasse_id", "class_id", "classId"]) || 0);
    if (classId > 0) byId.set(String(classId), normalizedClass);
    byCode.set(buildClassCodeLookupKey(normalizedClass.class_code), normalizedClass);
  }

  return { byId, byCode };
}

function normalizeStudentMasterData(payload) {
  const source = Array.isArray(payload) ? payload[0] || {} : payload || {};
  return {
    studentId: firstDefinedValue(source, ["id", "student_id", "studentId", "schueler_id", "schuelerId", "schuelerID"]),
    nachname: firstDefinedValue(source, ["nachname", "last_name", "lastname", "name"]),
    vorname: firstDefinedValue(source, ["vorname", "first_name", "firstname"]),
    geschlecht: firstDefinedValue(source, ["geschlecht", "sex", "gender", "sex_id", "sexId"]),
    religionID: firstDefinedValue(source, ["religionID", "religion_id", "religionId"]),
    migration: firstDefinedValue(source, ["hatMigrationshintergrund", "migration", "hasMigrationBackground"]),
    status: firstDefinedValue(source, ["status", "status_id", "statusId", "schuelerstatus", "schueler_status", "schuelerStatus"]),
    staatsangehoerigkeitID: firstDefinedValue(source, [
      "staatsangehoerigkeitID",
      "staatsangehoerigkeit_id",
      "staatsangehoerigkeitId",
      "nationalitaetID",
      "nationalitaet_id",
      "nationalitaetId",
      "nationID",
      "nation_id",
      "nationId",
    ]),
  };
}

function normalizeStudentLearningSectionData(payload) {
  const source = Array.isArray(payload) ? payload[0] || {} : payload || {};
  return {
    status: firstDefinedValue(source, ["status", "status_id", "statusId", "schuelerstatus", "schueler_status", "schuelerStatus"]),
    ef: firstDefinedValue(source, ["ef", "EF", "istEF", "ist_ef", "ef_status", "efStatus"]),
    klassenart: firstDefinedValue(source, ["klassenart", "klassenArt", "Klassenart", "class_type", "classType"]),
    schulgliederung: firstDefinedValue(source, ["schulgliederung", "Schulgliederung", "education_track", "educationTrack"]),
    fehlstundenGesamt: firstDefinedValue(source, [
      "fehlstundenGesamt",
      "fehlstunden_gesamt",
      "absences_total",
      "total_absences",
    ]),
    hatZieldifferentenUnterricht: firstDefinedValue(source, [
      "hatZieldifferentenUnterricht",
      "hat_zieldifferenten_unterricht",
      "target_different",
      "targetDifferent",
    ]),
    foerderschwerpunkt1ID: firstDefinedValue(source, [
      "foerderschwerpunkt1ID",
      "foerderschwerpunkt1_id",
      "foerderschwerpunkt1Id",
      "support_focus1_id",
      "supportFocus1Id",
    ]),
    foerderschwerpunkt2ID: firstDefinedValue(source, [
      "foerderschwerpunkt2ID",
      "foerderschwerpunkt2_id",
      "foerderschwerpunkt2Id",
      "support_focus2_id",
      "supportFocus2Id",
    ]),
  };
}

function normalizeStudentStatusValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = Number(String(value).trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function resolveStudentStatus(...values) {
  for (const value of values) {
    const normalized = normalizeStudentStatusValue(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function hasImportableStudentStatus(...values) {
  return resolveStudentStatus(...values) === 2;
}

function extractSchoolSections(payload) {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractSchoolSections(entry);
      if (nested.length) return nested;
    }
    return [];
  }
  if (!payload || typeof payload !== "object") return [];

  const direct = payload.abschnitte || payload.sections || payload.schuljahresabschnitte || payload.items || [];
  return Array.isArray(direct) ? direct : [];
}

function toSchoolYearLabel(schoolYear, termNo) {
  const year = Number(schoolYear || 0);
  const term = Number(termNo || 0);
  if (!year || !term) return "";
  return `${year}.${String(term).padStart(2, "0")}`;
}

function getCurrentSchoolYearLabel(date = new Date()) {
  const currentDate = date instanceof Date ? date : new Date(date);
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  if (month >= 2 && month <= 7) return `${year - 1}.02`;
  if (month === 1) return `${year - 1}.01`;
  return `${year}.01`;
}

function resolveExternalSectionId(sections, term) {
  const targetLabel = toSchoolYearLabel(term?.school_year, term?.term_no);
  if (!targetLabel) return 0;

  for (const section of Array.isArray(sections) ? sections : []) {
    const rawSchoolYear = firstDefinedValue(section, [
      "sj",
      "schuljahr",
      "school_year",
      "jahr",
      "year",
      "name",
      "label",
      "bezeichnung",
      "kuerzel",
    ]);
    const rawTermNo = firstDefinedValue(section, [
      "abschnitt",
      "term_no",
      "halbjahr",
      "hj",
      "section",
      "nummer",
      "nr",
    ]);

    const combinedCandidates = [
      rawSchoolYear,
      firstDefinedValue(section, ["label", "name", "bezeichnung", "kuerzel"]),
      rawTermNo ? `${rawSchoolYear}.${String(rawTermNo).padStart(2, "0")}` : "",
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const matches = combinedCandidates.some((value) => {
      const normalized = value.replace(/\s+/g, "");
      return normalized === targetLabel || normalized.endsWith(targetLabel);
    });

    if (!matches) continue;

    const sectionId = Number(firstDefinedValue(section, [
      "id",
      "sj_id_extern",
      "schuljahresabschnitt_id",
      "schuljahresabschnittId",
      "abschnitt_id",
      "section_id",
      "sectionId",
    ]) || 0);
    if (sectionId > 0) return sectionId;
  }

  return 0;
}

function extractStudentsFromClassEntry(entry) {
  const students = firstDefinedValue(entry, ["schueler", "students", "studenten", "student_list"]);
  if (!Array.isArray(students)) return [];

  return students
    .map((student) => {
      const id = Number(
        typeof student === "object"
          ? firstDefinedValue(student, ["id", "schueler_id", "schuelerId", "student_id", "studentId"])
          : student,
      ) || 0;
      if (!id) return null;
      return {
        id,
        status: typeof student === "object"
          ? firstDefinedValue(student, ["status", "status_id", "statusId", "schuelerstatus", "schueler_status", "schuelerStatus"])
          : null,
      };
    })
    .filter(Boolean);
}

function normalizeYearGroupEntries(payload) {
  return extractRestArray(payload)
    .map((entry) => ({
      external_id: String(firstDefinedValue(entry, ["idJahrgang", "jahrgangID", "jahrgangId", "id", "ID"]) ?? "").trim(),
      statistik_code: String(firstDefinedValue(entry, ["kuerzelstatistik", "kuerzelStatistik", "KuerzelStatistik"]) ?? "").trim(),
    }))
    .filter((entry) => entry.external_id);
}

function buildYearGroupLookup(entries) {
  const byId = new Map();
  for (const entry of entries || []) {
    const externalId = String(entry?.external_id || "").trim();
    if (!externalId) continue;
    byId.set(externalId, String(entry?.statistik_code || "").trim());
  }
  return byId;
}

function normalizeClassEntry(entry, yearGroupLookup = null) {
  const rawCode = String(
    firstDefinedValue(entry, ["kuerzel", "class_code", "classCode", "klasse", "klassenbezeichnung", "code", "name", "id"]) || "",
  ).trim().toUpperCase();
  if (!rawCode) return null;

  const yearGroupId = String(firstDefinedValue(entry, ["idJahrgang", "jahrgangID", "jahrgangId"]) ?? "").trim();
  const mappedYearGroup = yearGroupId && yearGroupLookup instanceof Map
    ? String(yearGroupLookup.get(yearGroupId) || "").trim()
    : "";
  const gradeValue = firstDefinedValue(entry, ["jahrgang", "grade", "stufe", "grade_level", "year"]);
  const parallelValue = String(firstDefinedValue(entry, ["parallelitaet", "parallel", "zug"]) || "").trim();
  const explicitGrade = mappedYearGroup || String(gradeValue || "").trim();
  let derivedGradeText = "";
  let derivedParallel = "";

  if (explicitGrade) {
    derivedGradeText = explicitGrade;
    const normalizedExplicitGrade = explicitGrade.toUpperCase();
    if (rawCode.startsWith(normalizedExplicitGrade)) {
      derivedParallel = rawCode.slice(normalizedExplicitGrade.length).trim().slice(0, 1).toUpperCase();
    } else {
      const trailingParallelMatch = rawCode.match(/([A-Z0-9])$/);
      if (trailingParallelMatch) {
        derivedParallel = String(trailingParallelMatch[1] || "").trim().toUpperCase();
      }
    }
  } else {
    const numericClassMatch = rawCode.match(/^(\d{1,2})([A-Z0-9])$/);
    if (numericClassMatch) {
      derivedGradeText = String(numericClassMatch[1] || "").trim();
      derivedParallel = String(numericClassMatch[2] || "").trim().toUpperCase();
    } else {
      // Sonderklassen wie IKA, VK oder EF nicht kuenstlich zerlegen.
      derivedGradeText = rawCode;
    }
  }

  return {
    class_code: rawCode,
    grade: explicitGrade || derivedGradeText || "",
    parallel: classHasNoParallel(explicitGrade || derivedGradeText || "", rawCode)
      ? ""
      : (parallelValue || derivedParallel || "").slice(0, 1).toUpperCase(),
    bemerkung: rawCode,
  };
}

async function loadSchoolSourceSectionClasses({ hostname, encodedDbName, username, password, schoolLabel, term }) {
  let schoolMetaPayload;
  try {
    schoolMetaPayload = await fetchSchoolSourceRestJson(
      hostname,
      `/db/${encodedDbName}/schule/stammdaten`,
      { username, password },
    );
  } catch (error) {
    if (Number(error?.responseStatus || 0) === 401) {
      const authError = new Error(`DB-Login fehlerhaft fuer ${schoolLabel}. Bitte DB-Benutzer und Passwort in school_source_db pruefen.`);
      authError.statusCode = 401;
      throw authError;
    }
    throw error;
  }

  const externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaPayload), term);
  if (!externalSectionId) {
    const error = new Error(
      `Fuer ${schoolLabel} konnte kein externer Abschnitt fuer ${toSchoolYearLabel(term.school_year, term.term_no)} gefunden werden.`,
    );
    error.statusCode = 400;
    throw error;
  }

  let classesPayload;
  try {
      classesPayload = await fetchSchoolSourceRestJson(
        hostname,
        `/db/${encodedDbName}/klassen/abschnitt/${encodeURIComponent(String(externalSectionId))}/auswahlliste`,
        { username, password },
      );
  } catch (error) {
    if (Number(error?.responseStatus || 0) === 401) {
      const authError = new Error(`DB-Login fehlerhaft fuer ${schoolLabel}. Bitte DB-Benutzer und Passwort in school_source_db pruefen.`);
      authError.statusCode = 401;
      throw authError;
    }
    throw error;
  }

  return {
    externalSectionId,
    classRows: extractRestArray(classesPayload).map((classEntry) => ({
      classEntry,
      normalizedClass: normalizeClassEntry(classEntry),
      students: extractStudentsFromClassEntry(classEntry).filter((studentEntry) => Number(studentEntry?.id || 0) > 0),
    })),
  };
}

function normalizeFlag(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return 0;
  if (["1", "true", "ja", "yes", "y"].includes(text)) return 1;
  return 0;
}

// EF-Regel: Nur wenn der uebergebene Wert exakt "DF" ist, wird ef = 1 gesetzt.
// Alle anderen Werte werden als ef = 0 behandelt.
function resolveEfFlag(...values) {
  for (const value of values) {
    if (value == null) continue;
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized) continue;
    if (normalized === "DF") return 1;
  }
  return 0;
}

async function loadReligionMap(conn) {
  const [rows] = await conn.query("SELECT religion_id, ASD, id, name FROM religion");
  const map = new Map();
  for (const row of rows || []) {
    const religionId = Number(row.religion_id || 0);
    if (!religionId) continue;
    map.set(String(religionId), religionId);
    const code = String(row.ASD || "").trim();
    if (code) map.set(code, religionId);
    const externalId = String(row.id ?? "").trim();
    if (externalId) map.set(externalId, religionId);
  }
  return map;
}

async function loadReligionReferenceRows(conn) {
  const [rows] = await conn.query("SELECT religion_id, ASD, id, name FROM religion");
  return (rows || []).map((row) => ({
    religion_id: Number(row.religion_id || 0),
    asd: String(row.ASD || "").trim(),
    external_id: String(row.id ?? "").trim(),
    name: String(row.name || "").trim(),
  }));
}

async function loadSupportFocusReferenceRows(conn) {
  const [rows] = await conn.query("SELECT support_focus_id, ASD, name FROM support_focus");
  return (rows || []).map((row) => ({
    support_focus_id: Number(row.support_focus_id || 0),
    asd: String(row.ASD || "").trim(),
    name: String(row.name || "").trim(),
  }));
}

async function loadNationReferenceRows(conn) {
  const [rows] = await conn.query("SELECT nation_id, code, label FROM nation");
  return (rows || []).map((row) => ({
    nation_id: Number(row.nation_id || 0),
    code: String(row.code || "").trim(),
    label: String(row.label || "").trim(),
  }));
}

async function loadEducationTrackReferenceRows(conn) {
  const [rows] = await conn.query("SELECT education_track_id, sf, name FROM education_track");
  return (rows || []).map((row) => ({
    education_track_id: Number(row.education_track_id || 0),
    sf: String(row.sf || "").trim(),
    name: String(row.name || "").trim(),
  }));
}

async function loadSchoolFormReferenceRows(conn) {
  const [rows] = await conn.query("SELECT school_form_id, sf, sf_kurz, name FROM school_form");
  return (rows || []).map((row) => ({
    school_form_id: Number(row.school_form_id || 0),
    sf: String(row.sf || "").trim(),
    sf_kurz: String(row.sf_kurz || "").trim(),
    name: String(row.name || "").trim(),
  }));
}

function normalizeReferenceCode(value) {
  return String(value || "").trim();
}

function buildReferenceLookup(rows, idKey, codeKey, labelKey) {
  const byId = new Map();
  const byCode = new Map();
  for (const row of rows || []) {
    const internalId = Number(row?.[idKey] || 0);
    if (!internalId) continue;
    const code = normalizeReferenceCode(row?.[codeKey]);
    const label = String(row?.[labelKey] || "").trim();
    const normalized = { internal_id: internalId, code, label };
    byId.set(String(internalId), normalized);
    if (code) byCode.set(code, normalized);
  }
  return { byId, byCode };
}

function buildSchoolFormLookup(rows) {
  const byId = new Map();
  const byCode = new Map();
  for (const row of rows || []) {
    const internalId = Number(row?.school_form_id || 0);
    if (!internalId) continue;
    const normalized = {
      internal_id: internalId,
      sf: String(row?.sf || "").trim(),
      sf_kurz: String(row?.sf_kurz || "").trim(),
      label: String(row?.name || "").trim(),
    };
    byId.set(String(internalId), normalized);
    if (normalized.sf) byCode.set(normalized.sf, normalized);
    if (normalized.sf_kurz) byCode.set(normalized.sf_kurz, normalized);
  }
  return { byId, byCode };
}

function resolveStudentSchoolFormId(schoolFormLookup, schoolDefaultFormId, schoolStructure) {
  const normalizedStructure = String(schoolStructure || "").trim();
  if (!normalizedStructure || normalizedStructure === "***" || normalizedStructure === "GY8" || normalizedStructure === "GY9") {
    return schoolDefaultFormId;
  }
  return schoolFormLookup.byCode.get(normalizedStructure)?.internal_id || null;
}

function buildExternalReferenceMap(externalEntries, internalLookup) {
  const map = new Map();
  for (const entry of externalEntries || []) {
    const externalId = String(entry?.external_id ?? "").trim();
    const code = normalizeReferenceCode(entry?.code);
    if (!externalId || !code) continue;
    const internal = internalLookup.byCode.get(code);
    if (!internal) continue;
    map.set(externalId, {
      external_id: externalId,
      external_code: code,
      external_label: String(entry?.label || "").trim(),
      internal_id: internal.internal_id,
      internal_code: internal.code,
      internal_label: internal.label,
    });
  }
  return map;
}

function normalizeExternalReferenceEntries(payload) {
  return extractRestArray(payload)
    .map((entry) => ({
      external_id: String(firstDefinedValue(entry, ["id", "ID", "externId", "external_id"]) ?? "").trim(),
      code: normalizeReferenceCode(firstDefinedValue(entry, [
        "kuerzelStatistik",
        "KuerzelStatistik",
        "statistikKrz",
        "StatistikKrz",
        "statistik_krz",
        "code",
        "kuerzel",
      ])),
      label: String(firstDefinedValue(entry, ["name", "label", "bezeichnung"]) || "").trim(),
    }))
    .filter((entry) => entry.external_id || entry.code || entry.label);
}

function resolveMappedReference(referenceMap, externalId) {
  const key = String(externalId ?? "").trim();
  if (!key) return null;
  return referenceMap.get(key) || null;
}

function formatLogTimestamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return {
    datePart: `${year}${month}${day}`,
    timePart: `${hour}${minute}${second}`,
  };
}

function sanitizeFilePart(value, fallback = "unknown") {
  const text = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return text || fallback;
}

function formatMappedLogValue(mapping, idKey, labelKey, codeKey) {
  if (!mapping || typeof mapping !== "object") return "-";
  const internalId = Number(mapping[idKey] || 0);
  if (!internalId) return "nicht zugeordnet";
  const label = String(mapping[labelKey] || "").trim();
  const code = String(mapping[codeKey] || "").trim();
  const parts = [String(internalId)];
  if (label) parts.push(label);
  if (code) parts.push(`[${code}]`);
  return parts.join(" | ");
}

function buildSchoolPreviewLog(source, termLabel, snapshotDate) {
  const lines = [];
  lines.push(`Snapshot-Datum: ${String(snapshotDate || "").trim() || "-"}`);
  lines.push(`Schuljahr: ${String(termLabel || "").trim() || "-"}`);
  lines.push(`Schule: ${String(source?.school_name || "-").trim() || "-"}`);
  lines.push(`SNR: ${String(source?.snr || "-").trim() || "-"}`);
  lines.push(`Datenbank: ${String(source?.db_name || "-").trim() || "-"}`);
  lines.push(`Abschnitt: ${String(source?.external_section_id || "-").trim() || "-"}`);
  lines.push(`Klassen: ${Number(source?.total_classes || 0)}`);
  lines.push(`Schueler: ${Number(source?.total_students || 0)}`);

  for (const student of Array.isArray(source?.students) ? source.students : []) {
    lines.push("");
    lines.push(`- ${String(student?.full_name || "-").trim() || "-"} | ID ${Number(student?.student_no || 0) || "-"}`);
    lines.push(`  Klasse: ${String(student?.class_code || "-").trim() || "-"} | Jahrgang: ${String(student?.grade || "-").trim() || "-"}`);
    lines.push(`  Klassenart: ${String(student?.klassenart || "-").trim() || "-"}`);
    lines.push(`  Fehlstunden gesamt: ${student?.fehlstunden_gesamt ?? "-"}`);
    lines.push(`  Migration: ${Number(student?.migration || 0) === 1 ? "ja" : "nein"} | EF: ${Number(student?.ef || 0) === 1 ? "ja" : "nein"} | Foerderbedarf: ${Number(student?.special_needs || 0) === 1 ? "ja" : "nein"} | Zieldifferent: ${Number(student?.target_different || 0) === 1 ? "ja" : "nein"}`);
    lines.push(`  Religion: extern ${String(student?.religion?.external_id || "-").trim() || "-"} -> intern ${formatMappedLogValue(student?.religion, "religion_id", "name", "asd")}`);
    lines.push(`  Nation: extern ${String(student?.nation?.external_id || "-").trim() || "-"} -> intern ${formatMappedLogValue(student?.nation, "nation_id", "label", "code")}`);
    lines.push(`  Foerderschwerpunkt 1: ${!String(student?.support_focus1?.external_id || "").trim() ? "Nein" : `extern ${String(student?.support_focus1?.external_id || "-").trim()} -> intern ${formatMappedLogValue(student?.support_focus1, "support_focus_id", "name", "asd")}`}`);
    lines.push(`  Foerderschwerpunkt 2: ${!String(student?.support_focus2?.external_id || "").trim() ? "Nein" : `extern ${String(student?.support_focus2?.external_id || "-").trim()} -> intern ${formatMappedLogValue(student?.support_focus2, "support_focus_id", "name", "asd")}`}`);
  }

  return lines.join("\n");
}

function buildSchoolImportSummaryLog(source, termLabel, snapshotDate) {
  const lines = [];
  lines.push(`Snapshot-Datum: ${String(snapshotDate || "-").trim() || "-"}`);
  lines.push(`Schuljahr: ${String(termLabel || "-").trim() || "-"}`);
  lines.push(`Schule: ${String(source?.school_name || "-").trim() || "-"} | SNR ${String(source?.snr || "-").trim() || "-"}`);
  lines.push(`Quelle: ${String(source?.db_name || "-").trim() || "-"}`);
  lines.push(`Abschnitt: ${String(source?.external_section_id || "-").trim() || "-"}`);
  lines.push(`Vorhandene Eintraege geloescht: ${Number(source?.deleted_students || 0)}`);
  lines.push(`Schueler importiert: ${Number(source?.imported_students || 0)}`);
  lines.push(`Klassen verarbeitet: ${Number(source?.total_classes || 0)}`);
  const statusCounts = Array.isArray(source?.status_counts) ? source.status_counts : [];
  if (statusCounts.length) {
    lines.push(`Statussummen: ${statusCounts.map((entry) => `Status ${entry?.status ?? "-"}=${Number(entry?.count || 0)}`).join(" | ")}`);
  }
  return lines.join("\n");
}

function buildSchoolImportDetailLog(source, termLabel, snapshotDate) {
  const lines = [];
  lines.push("***  Zu Testzwecken werden hier noch die Schuelerdaten mit Name und ID protokolliert!!! ***");
  lines.push("");
  lines.push("");
  lines.push(buildSchoolImportSummaryLog(source, termLabel, snapshotDate));

  for (const student of Array.isArray(source?.students) ? source.students : []) {
    lines.push("");
    lines.push(`- ${String(student?.full_name || "-").trim() || "-"} | ID ${Number(student?.student_no || 0) || "-"}`);
    lines.push("  Quelldaten:");
    lines.push(`    Klasse: ${String(student?.source?.class_code || "-").trim() || "-"} | Jahrgang: ${String(student?.source?.grade || "-").trim() || "-"}`);
    lines.push(`    Geschlecht: ${String(student?.source?.geschlecht || "-").trim() || "-"}`);
    lines.push(`    Klassenart: ${String(student?.source?.klassenart || "-").trim() || "-"}`);
    lines.push(`    Schulgliederung: ${String(student?.source?.schulgliederung || "-").trim() || "-"}`);
    lines.push(`    Migration: ${Number(student?.source?.migration || 0) === 1 ? "ja" : "nein"} | Zieldifferent: ${Number(student?.source?.target_different || 0) === 1 ? "ja" : "nein"}`);
    lines.push(`    Religion: extern ${String(student?.source?.religion?.external_id || "-").trim() || "-"} -> intern ${formatMappedLogValue(student?.source?.religion, "religion_id", "name", "asd")}`);
    lines.push(`    Nation: extern ${String(student?.source?.nation?.external_id || "-").trim() || "-"} -> intern ${formatMappedLogValue(student?.source?.nation, "nation_id", "label", "code")}`);
    lines.push(`    Foerderschwerpunkt 1: ${!String(student?.source?.support_focus1?.external_id || "").trim() ? "Nein" : `extern ${String(student?.source?.support_focus1?.external_id || "-").trim()} -> intern ${formatMappedLogValue(student?.source?.support_focus1, "support_focus_id", "name", "asd")}`}`);
    lines.push(`    Foerderschwerpunkt 2: ${!String(student?.source?.support_focus2?.external_id || "").trim() ? "Nein" : `extern ${String(student?.source?.support_focus2?.external_id || "-").trim()} -> intern ${formatMappedLogValue(student?.source?.support_focus2, "support_focus_id", "name", "asd")}`}`);
    lines.push("  Zieldaten:");
    lines.push(`    snapshot_id: ${student?.target?.snapshot_id ?? "-"}`);
    lines.push(`    class_id: ${student?.target?.class_id ?? "-"} | class_code: ${String(student?.target?.class_code || "-").trim() || "-"}`);
    lines.push(`    school_form_id: ${student?.target?.school_form_id ?? "-"}`);
    lines.push(`    education_track_id: ${student?.target?.education_track_id ?? "-"}`);
    lines.push(`    sex_id: ${student?.target?.sex_id ?? "-"}`);
    lines.push(`    religion_id: ${student?.target?.religion_id ?? "-"}`);
    lines.push(`    nation_id: ${student?.target?.nation_id ?? "-"}`);
    lines.push(`    ef: ${Number(student?.target?.ef || 0) === 1 ? "ja" : "nein"} | special_needs: ${Number(student?.target?.special_needs || 0) === 1 ? "ja" : "nein"} | target_different: ${Number(student?.target?.target_different || 0) === 1 ? "ja" : "nein"}`);
    lines.push(`    support_focus1_id: ${student?.target?.support_focus1_id ?? "-"}`);
    lines.push(`    support_focus2_id: ${student?.target?.support_focus2_id ?? "-"}`);
    lines.push(`    migration: ${Number(student?.target?.migration || 0) === 1 ? "ja" : "nein"}`);
  }

  return lines.join("\n");
}

function buildImportBatchLog(sources, termLabel, snapshotDate) {
  const lines = [];
  lines.push(`Snapshot-Datum: ${String(snapshotDate || "").trim() || "-"}`);
  lines.push(`Schuljahr: ${String(termLabel || "").trim() || "-"}`);
  lines.push(`Erstellt am: ${new Date().toISOString()}`);

  for (const source of Array.isArray(sources) ? sources : []) {
    lines.push("");
    lines.push("============================================================");
    lines.push(`Schule: ${String(source?.school_name || "-").trim() || "-"}`);
    lines.push(`SNR: ${String(source?.snr || "-").trim() || "-"}`);
    lines.push(`Datenbank: ${String(source?.db_name || "-").trim() || "-"}`);
    lines.push(`Abschnitt: ${Number(source?.external_section_id || 0) || "-"}`);
    lines.push(`Importierte Schueler: ${Number(source?.imported_students || 0)}`);
    lines.push(`Importdauer: ${Number(source?.import_duration_ms || 0)} ms`);
    const statusCounts = Array.isArray(source?.status_counts) ? source.status_counts : [];
    lines.push(
      `Statussummen: ${statusCounts.length
        ? statusCounts.map((entry) => `Status ${entry?.status ?? "-"}=${Number(entry?.count || 0)}`).join(" | ")
        : "-"}`,
    );
    lines.push("");
    lines.push("Schueler:");
    for (const student of Array.isArray(source?.students) ? source.students : []) {
      lines.push(
        `${Number(student?.row_no || 0) || "-"} | ${Number(student?.student_no || 0) || "-"} | ${String(student?.nachname || "-").trim() || "-"} | ${String(student?.vorname || "-").trim() || "-"} | ${String(student?.class_code || "-").trim() || "-"} | ${String(student?.jahrgang || "-").trim() || "-"} | ${String(student?.geschlecht || "-").trim() || "-"} | ${String(student?.schulgliederung || "-").trim() || "-"} | ${student?.religionID ?? "-"} | ${student?.migration ?? "-"} | ${student?.staatsangehoerigkeit ?? "-"} | ${student?.foerderschwerpunkt1ID ?? "-"} | ${student?.foerderschwerpunkt2ID ?? "-"} | ${student?.hatZieldifferentenUnterricht ?? "-"} | ${student?.klassenart ?? "-"} | ${student?.status ?? "-"}`,
      );
    }
  }

  return lines.join("\n");
}

function ensureImportPreviewLogDir() {
  const logDir = path.resolve(__dirname, "..", "logs", "import-preview");
  fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

function deleteImportPreviewLogs() {
  const logDir = ensureImportPreviewLogDir();
  const entries = fs.readdirSync(logDir, { withFileTypes: true });
  let deletedCount = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".txt")) continue;
    fs.unlinkSync(path.join(logDir, entry.name));
    deletedCount += 1;
  }
  return { logDir, deletedCount };
}

const previewSchoolYearProgress = {
  active: false,
  action: "",
  current_school: "",
  current_snr: "",
  completed_sources: 0,
  total_sources: 0,
  abort_requested: false,
  was_aborted: false,
};

function updatePreviewSchoolYearProgress(patch = {}) {
  Object.assign(previewSchoolYearProgress, patch);
}

function resetPreviewSchoolYearProgress() {
  previewSchoolYearProgress.active = false;
  previewSchoolYearProgress.action = "";
  previewSchoolYearProgress.current_school = "";
  previewSchoolYearProgress.current_snr = "";
  previewSchoolYearProgress.completed_sources = 0;
  previewSchoolYearProgress.total_sources = 0;
  previewSchoolYearProgress.abort_requested = false;
  previewSchoolYearProgress.was_aborted = false;
}

function parseDelimitedLine(line, delimiter = ",") {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => String(value || "").trim());
}

function normalizeCsvHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findCsvHeaderIndex(headerCells, aliases) {
  const normalizedAliases = aliases.map((alias) => normalizeCsvHeaderKey(alias));
  return headerCells.findIndex((cell) => normalizedAliases.includes(cell));
}

function detectCsvDelimiter(line) {
  const text = String(line || "");
  let inQuotes = false;
  let semicolonCount = 0;
  let commaCount = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (inQuotes) continue;
    if (char === ";") semicolonCount += 1;
    if (char === ",") commaCount += 1;
  }

  return semicolonCount > commaCount ? ";" : ",";
}

function parseSchoolSourceCsv(csvText) {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    const error = new Error("Die CSV-Datei ist leer.");
    error.statusCode = 400;
    throw error;
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headerCells = parseDelimitedLine(lines[0], delimiter).map((cell) => normalizeCsvHeaderKey(cell));
  const headerDefinitions = [
    { key: "db_host", aliases: ["db_host", "dbhost", "host"] },
    { key: "db_port", aliases: ["db_port", "dbport", "port"] },
    { key: "db_name", aliases: ["db_name", "dbname", "datenbank"] },
    { key: "db_user", aliases: ["db_user", "dbuser", "user", "benutzer"] },
    { key: "db_passwd", aliases: ["db_passwd", "db_password_enc", "db_password", "passwort"] },
    { key: "snr", aliases: ["snr"] },
  ];
  const headerIndex = new Map();
  for (const definition of headerDefinitions) {
    const index = findCsvHeaderIndex(headerCells, definition.aliases);
    if (index < 0) {
      const error = new Error(`Die CSV-Datei enthaelt nicht die erforderliche Spalte ${definition.key}.`);
      error.statusCode = 400;
      throw error;
    }
    headerIndex.set(definition.key, index);
  }

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter);
    return {
      row_no: rowIndex + 2,
      snr: String(cells[headerIndex.get("snr")] || "").trim(),
      db_host: String(cells[headerIndex.get("db_host")] || "").trim(),
      db_port: String(cells[headerIndex.get("db_port")] || "").trim(),
      db_name: String(cells[headerIndex.get("db_name")] || "").trim(),
      db_user: String(cells[headerIndex.get("db_user")] || "").trim(),
      db_password_enc: String(cells[headerIndex.get("db_passwd")] || "").trim(),
    };
  }).filter((entry) =>
    entry.snr
    || entry.db_host
    || entry.db_port
    || entry.db_name
    || entry.db_user
    || entry.db_password_enc
  );
}

function parseSchoolCsv(csvText) {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    const error = new Error("Die CSV-Datei ist leer.");
    error.statusCode = 400;
    throw error;
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headerCells = parseDelimitedLine(lines[0], delimiter).map((cell) => normalizeCsvHeaderKey(cell));
  const snrIndex = findCsvHeaderIndex(headerCells, ["snr"]);
  const nameIndex = findCsvHeaderIndex(headerCells, ["name"]);
  const cityIndex = findCsvHeaderIndex(headerCells, ["city", "ort"]);

  if (snrIndex < 0) {
    const error = new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte snr.");
    error.statusCode = 400;
    throw error;
  }
  if (nameIndex < 0) {
    const error = new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte name.");
    error.statusCode = 400;
    throw error;
  }
  if (cityIndex < 0) {
    const error = new Error("Die CSV-Datei enthaelt nicht die erforderliche Spalte city oder ort.");
    error.statusCode = 400;
    throw error;
  }

  const formIndex = findCsvHeaderIndex(headerCells, ["school_form", "schulform"]);

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter);
    return {
      row_no: rowIndex + 2,
      snr: String(cells[snrIndex] || "").trim(),
      name: String(cells[nameIndex] || "").trim(),
      city: String(cells[cityIndex] || "").trim(),
      school_form: formIndex >= 0 ? String(cells[formIndex] || "").trim() : "",
    };
  }).filter((entry) => entry.snr || entry.name || entry.city);
}

function resolveSexId(value) {
  const normalized = Number(value || 0);
  return normalized || null;
}

function resolveReligionId(religionMap, value) {
  const key = String(value ?? "").trim();
  return key ? Number(religionMap.get(key) || 0) || null : null;
}

function buildClassCodeLookupKey(value) {
  return `CODE::${String(value || "").trim().toUpperCase()}`;
}

function buildClassIdentityKey(grade, parallel, classCode) {
  return [
    String(grade || "").trim(),
    String(parallel || "").trim().toUpperCase(),
    String(classCode || "").trim().toUpperCase(),
  ].join("__");
}

function classHasNoParallel(grade, classCode) {
  const normalizedGrade = String(grade || "").trim().toUpperCase();
  const normalizedCode = String(classCode || "").trim().toUpperCase();
  return ["EF", "Q1", "Q2"].includes(normalizedGrade) || ["EF", "Q1", "Q2"].includes(normalizedCode);
}

function resolveClassMapId(classMap, normalizedClass) {
  if (!(classMap instanceof Map) || !normalizedClass?.class_code) return 0;
  const classCodeKey = buildClassCodeLookupKey(normalizedClass.class_code);
  const classKey = buildClassIdentityKey(
    normalizedClass.grade,
    normalizedClass.parallel,
    normalizedClass.class_code,
  );
  return Number(classMap.get(classKey) || classMap.get(classCodeKey) || 0);
}

async function findExistingClassId(conn, grade, parallel, classCode) {
  const normalizedGrade = String(grade || "00").trim() || "00";
  const normalizedParallel = String(parallel || "").trim().toUpperCase();
  const normalizedClassCode = String(classCode || "").trim();

  const [exactRows] = await conn.query(
    `
    SELECT class_id
    FROM class
    WHERE jahrgang = ? AND parallel = ? AND TRIM(class_code) = ?
    ORDER BY class_id DESC
    LIMIT 1
    `,
    [normalizedGrade, normalizedParallel, normalizedClassCode],
  );
  const exactClassId = Number(exactRows?.[0]?.class_id || 0);
  if (exactClassId) return exactClassId;

  const [legacyRows] = await conn.query(
    `
    SELECT class_id
    FROM class
    WHERE jahrgang = ? AND parallel = ?
    ORDER BY class_id DESC
    LIMIT 1
    `,
    [normalizedGrade, normalizedParallel],
  );
  return Number(legacyRows?.[0]?.class_id || 0);
}

async function loadClassMapByCode(conn, classes, yearGroupLookup = null) {
  const uniqueClasses = [];
  const seen = new Set();
  for (const entry of classes || []) {
    const normalized = normalizeClassEntry(entry, yearGroupLookup);
    if (!normalized) continue;
    const classKey = buildClassIdentityKey(normalized.grade, normalized.parallel, normalized.class_code);
    const codeKey = buildClassCodeLookupKey(normalized.class_code);
    const dedupeKey = classKey !== "____" ? classKey : codeKey;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    uniqueClasses.push(normalized);
  }

  if (!uniqueClasses.length) return new Map();

  const [rows] = await conn.query(
    `
    SELECT class_id, class_code, jahrgang, parallel
    FROM class
    `,
  );
  const map = new Map();
  for (const row of rows || []) {
    const key = buildClassIdentityKey(row.jahrgang, row.parallel, row.class_code);
    const classId = Number(row.class_id || 0);
    if (key !== "____" && classId) map.set(key, classId);
    const classCodeKey = buildClassCodeLookupKey(row.class_code);
    if (classCodeKey !== "CODE::" && classId) map.set(classCodeKey, classId);
  }

  for (const classEntry of uniqueClasses) {
    const key = buildClassIdentityKey(classEntry.grade, classEntry.parallel, classEntry.class_code);
    const classCodeKey = buildClassCodeLookupKey(classEntry.class_code);
    if (map.has(key)) continue;

    const existingClassId = await findExistingClassId(
      conn,
      classEntry.grade || "00",
      classEntry.parallel || "",
      String(classEntry.class_code || "").trim(),
    );
    if (existingClassId) {
      map.set(key, existingClassId);
      map.set(classCodeKey, existingClassId);
      continue;
    }

    let insertedClassId = 0;
    try {
      const [insertResult] = await conn.query(
        `
        INSERT INTO class (jahrgang, parallel, class_code, bemerkung)
        VALUES (?, ?, ?, ?)
        `,
        [classEntry.grade || "00", classEntry.parallel || "", classEntry.class_code, classEntry.bemerkung || classEntry.class_code],
      );
      insertedClassId = Number(insertResult?.insertId || 0);
    } catch (error) {
      if (Number(error?.errno || 0) === 1062 || String(error?.code || "").toUpperCase() === "ER_DUP_ENTRY") {
        insertedClassId = await findExistingClassId(
          conn,
          classEntry.grade || "00",
          classEntry.parallel || "",
          String(classEntry.class_code || "").trim(),
        );
      } else {
        throw error;
      }
    }
    if (insertedClassId) {
      map.set(key, insertedClassId);
      map.set(classCodeKey, insertedClassId);
    }
  }

  const [reloadedRows] = await conn.query(
    `
    SELECT class_id, class_code, jahrgang, parallel
    FROM class
    `,
  );
  for (const row of reloadedRows || []) {
    const key = buildClassIdentityKey(row.jahrgang, row.parallel, row.class_code);
    const classId = Number(row.class_id || 0);
    if (key !== "____" && classId) map.set(key, classId);
    const classCodeKey = buildClassCodeLookupKey(row.class_code);
    if (classCodeKey !== "CODE::" && classId) map.set(classCodeKey, classId);
  }
  return map;
}

async function ensureClassMapEntries(conn, classMap, classes, yearGroupLookup = null) {
  const source = Array.isArray(classes) ? classes : [];
  const seen = new Set();

  for (const entry of source) {
    const normalizedClass = normalizeClassEntry(entry, yearGroupLookup);
    if (!normalizedClass?.class_code) continue;

    const classKey = buildClassIdentityKey(
      normalizedClass.grade,
      normalizedClass.parallel,
      normalizedClass.class_code,
    );
    if (seen.has(classKey)) continue;
    seen.add(classKey);

    let classId = resolveClassMapId(classMap, normalizedClass);
    if (classId) continue;

    classId = await findExistingClassId(
      conn,
      normalizedClass.grade || "00",
      normalizedClass.parallel || "",
      String(normalizedClass.class_code || "").trim(),
    );
    if (classId) {
      classMap.set(classKey, classId);
      classMap.set(buildClassCodeLookupKey(normalizedClass.class_code), classId);
      continue;
    }

    try {
      const [insertResult] = await conn.query(
        `
        INSERT INTO class (jahrgang, parallel, class_code, bemerkung)
        VALUES (?, ?, ?, ?)
        `,
        [
          normalizedClass.grade || "00",
          normalizedClass.parallel || "",
          normalizedClass.class_code,
          normalizedClass.bemerkung || normalizedClass.class_code,
        ],
      );
      classId = Number(insertResult?.insertId || 0);
    } catch (error) {
      if (Number(error?.errno || 0) === 1062 || String(error?.code || "").toUpperCase() === "ER_DUP_ENTRY") {
        classId = await findExistingClassId(
          conn,
          normalizedClass.grade || "00",
          normalizedClass.parallel || "",
          String(normalizedClass.class_code || "").trim(),
        );
      } else {
        throw error;
      }
    }
    if (!classId) {
      classId = await findExistingClassId(
        conn,
        normalizedClass.grade || "00",
        normalizedClass.parallel || "",
        String(normalizedClass.class_code || "").trim(),
      );
    }
    if (!classId) {
      const error = new Error(`Klasse ${normalizedClass.class_code} (${normalizedClass.grade}${normalizedClass.parallel}) konnte nicht angelegt werden.`);
      error.statusCode = 400;
      throw error;
    }
    classMap.set(classKey, classId);
    classMap.set(buildClassCodeLookupKey(normalizedClass.class_code), classId);
  }

  return classMap;
}

async function mapWithConcurrency(items, worker, concurrency = 8) {
  const source = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(concurrency || 1));
  const results = new Array(source.length);
  let index = 0;

  async function run() {
    while (index < source.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(source[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, source.length) }, () => run()));
  return results;
}

function extractSchemaNames(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : payload?.schemata || payload?.schemas || payload?.items || payload?.data || [];

  if (!Array.isArray(candidates)) return [];

  return [...new Set(candidates
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (!entry || typeof entry !== "object") return "";
      return String(
        entry.schema_name ||
        entry.schemaName ||
        entry.SCHEMA_NAME ||
        entry.name ||
        entry.label ||
        "",
      ).trim();
    })
    .filter(Boolean))];
}

async function testSchoolSourceConnection(source) {
  const hostname = normalizeSchoolSourceHost(source?.db_host).hostname;
  const databaseName = String(source?.db_name || "").trim();
  const username = String(source?.db_user || "").trim();
  const password = String(source?.db_password_enc || "");
  if (!databaseName) {
    const error = new Error("Datenbank ist erforderlich.");
    error.statusCode = 400;
    throw error;
  }

  const restUrl = buildSchoolSourceRestUrl(hostname, "/config/db/schemata");
  const restPort = Number(restUrl.port || (restUrl.protocol === "https:" ? 443 : 80));

  await testTcpReachability(hostname, restPort);

  const payload = await fetchSchoolSourceSchemata(hostname, username, password);
  const schemata = extractSchemaNames(payload);
  const hasDatabase = schemata.some((entry) => entry.toLowerCase() === databaseName.toLowerCase());

  if (!hasDatabase) {
    return {
      hostname,
      port: restPort,
      databaseName,
      schemata,
      server_status: "online",
      db_status: "offline",
      status_code: "server_ok_db_fail",
      message: `Host und Port erreichbar, /config/db/schemata antwortet, aber die Datenbank '${databaseName}' wurde nicht gefunden.`,
    };
  }

  const encodedDbName = encodeURIComponent(databaseName);
  try {
    await fetchSchoolSourceRestJson(
      hostname,
      `/db/${encodedDbName}/schule/stammdaten`,
      { username, password },
    );
  } catch (error) {
    if (Number(error?.responseStatus || 0) === 401) {
      const authError = new Error("DB-Login fehlerhaft");
      authError.statusCode = 401;
      throw authError;
    }
    if (Number(error?.responseStatus || 0) === 404) {
      const endpointError = new Error(`REST-Endpunkt /db/${databaseName}/schule/stammdaten wurde nicht gefunden.`);
      endpointError.statusCode = 400;
      throw endpointError;
    }
    throw error;
  }

  return {
    hostname,
    port: restPort,
    databaseName,
    schemata,
    server_status: "online",
    db_status: "online",
    status_code: "server_ok_db_ok",
    message: "Host erreichbar, Schema gefunden, Login erfolgreich.",
  };
}

function extractToken(req) {
  const header = String(req.headers.authorization || "").trim();
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function createAuthModule(poolProvider) {
  const router = express.Router();
  const revokedTokens = new Map();

  function getPool() {
    const pool = typeof poolProvider === "function" ? poolProvider() : poolProvider;
    if (!pool) {
      throw new Error("Keine Datenbankverbindung konfiguriert.");
    }
    return pool;
  }

  const jwtSecret = process.env.JWT_SECRET || "change-me-in-production";
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "8h";

  const revokedCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, expiresAt] of revokedTokens.entries()) {
      if (expiresAt <= now) revokedTokens.delete(token);
    }
  }, 5 * 60 * 1000);
  revokedCleanupTimer.unref?.();

  function isRevoked(token) {
    const expiresAt = revokedTokens.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
      revokedTokens.delete(token);
      return false;
    }
    return true;
  }

  function revokeToken(token) {
    try {
      const decoded = jwt.decode(token);
      const exp = decoded?.exp ? Number(decoded.exp) * 1000 : Date.now() + 60 * 60 * 1000;
      revokedTokens.set(token, exp);
    } catch {
      revokedTokens.set(token, Date.now() + 60 * 60 * 1000);
    }
  }

  async function loadUser(username) {
    const [rows] = await getPool().query(
      `
      SELECT
        u.user_id,
        u.username,
        u.user_fullname,
        u.email,
        u.password_hash,
        u.is_active,
        u.group_id,
        g.group_name,
        g.is_active AS group_is_active
      FROM app_user u
      LEFT JOIN app_group g ON g.group_id = u.group_id
      WHERE u.username = ? OR u.email = ?
      LIMIT 1
      `,
      [username, username],
    );

    return rows && rows[0] ? rows[0] : null;
  }

  async function normalizeDashboardRows(rows) {
    return (rows || [])
      .map((r) => ({
        dashboard_key: String(r.dashboard_key || "").trim(),
        dashboard_name: String(r.dashboard_name || "").trim(),
      }))
      .filter((r) => r.dashboard_key && r.dashboard_name);
  }

  async function ensureDashboardCatalog(conn) {
    await conn.query(
      `
      INSERT INTO app_dashboard (dashboard_key, dashboard_name, is_active)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE
        dashboard_name = IF(TRIM(dashboard_name) = '', VALUES(dashboard_name), dashboard_name),
        is_active = 1
      `,
      ["lehrerdaten", "Lehrerdaten"],
    );
  }

  async function loadDashboardKeysByGroup(groupId, groupName = "") {
    await ensureDashboardCatalog(getPool());

    if (String(groupName).trim().toLowerCase() === "admin") {
      const [rows] = await getPool().query(
        `
        SELECT d.dashboard_key, d.dashboard_name
        FROM app_dashboard d
        WHERE d.is_active = 1
        ORDER BY d.dashboard_key
        `,
      );

      return normalizeDashboardRows(rows);
    }

    const [rows] = await getPool().query(
      `
      SELECT
        d.dashboard_key,
        d.dashboard_name
      FROM app_group_dashboard agd
      JOIN app_dashboard d ON d.dashboard_id = agd.dashboard_id
      WHERE agd.group_id = ?
        AND d.is_active = 1
      ORDER BY d.dashboard_key
      `,
      [groupId],
    );

    return normalizeDashboardRows(rows);
  }

  function requireAdmin(req, res, next) {
    const groupName = String(req.user?.groupName || "").trim().toLowerCase();
    if (groupName !== "admin") {
      return res.status(403).json({ error: "Nur Admins duerfen diese Verwaltung nutzen." });
    }
    next();
  }

  function toNullableText(value, maxLength = 255) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    return text.slice(0, maxLength);
  }

  function toRequiredText(value, fieldName, maxLength = 255) {
    const text = String(value ?? "").trim().slice(0, maxLength);
    if (!text) {
      const error = new Error(`${fieldName} ist erforderlich.`);
      error.statusCode = 400;
      throw error;
    }
    return text;
  }

  function toFlag(value, fallback = 1) {
    if (value === undefined || value === null || value === "") return Number(fallback ? 1 : 0);
    if (typeof value === "boolean") return value ? 1 : 0;
    const lowered = String(value).trim().toLowerCase();
    if (["1", "true", "ja", "yes", "on"].includes(lowered)) return 1;
    if (["0", "false", "nein", "no", "off"].includes(lowered)) return 0;
    return Number(fallback ? 1 : 0);
  }

  function toPositiveInt(value, fieldName) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      const error = new Error(`${fieldName} ist ungueltig.`);
      error.statusCode = 400;
      throw error;
    }
    return n;
  }

  function toRequiredSnapId(value) {
    const snapId = String(value ?? "").trim();
    if (!/^\d+$/.test(snapId)) {
      const error = new Error("Snapshot-ID ist ungueltig.");
      error.statusCode = 400;
      throw error;
    }
    return snapId;
  }

  function validateEmailAddress(email) {
    if (!email) return;
    const normalized = String(email).trim();
    const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!looksValid) {
      const error = new Error("Die E-Mail-Adresse ist ungueltig.");
      error.statusCode = 400;
      throw error;
    }
  }

  function uniqueSortedInts(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0))]
      .sort((a, b) => a - b);
  }

  async function fetchAdminDashboards(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        dashboard_id,
        dashboard_key,
        dashboard_name,
        is_active,
        created_at
      FROM app_dashboard
      ORDER BY dashboard_name, dashboard_key
      `,
    );

    return (rows || []).map((row) => ({
      dashboard_id: Number(row.dashboard_id),
      dashboard_key: String(row.dashboard_key || "").trim(),
      dashboard_name: String(row.dashboard_name || "").trim(),
      is_active: Number(row.is_active) === 1,
      created_at: row.created_at,
    }));
  }

  async function fetchAdminGroups(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        g.group_id,
        g.group_name,
        g.group_description,
        g.is_active,
        g.created_at,
        d.dashboard_id,
        d.dashboard_key,
        d.dashboard_name
      FROM app_group g
      LEFT JOIN app_group_dashboard agd ON agd.group_id = g.group_id
      LEFT JOIN app_dashboard d ON d.dashboard_id = agd.dashboard_id
      ORDER BY g.group_name, d.dashboard_name, d.dashboard_key
      `,
    );

    const groups = new Map();
    for (const row of rows || []) {
      const groupId = Number(row.group_id);
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          group_id: groupId,
          group_name: String(row.group_name || "").trim(),
          group_description: toNullableText(row.group_description),
          is_active: Number(row.is_active) === 1,
          created_at: row.created_at,
          dashboard_ids: [],
          dashboards: [],
        });
      }

      if (row.dashboard_id) {
        const group = groups.get(groupId);
        group.dashboard_ids.push(Number(row.dashboard_id));
        group.dashboards.push({
          dashboard_id: Number(row.dashboard_id),
          dashboard_key: String(row.dashboard_key || "").trim(),
          dashboard_name: String(row.dashboard_name || "").trim(),
        });
      }
    }

    return [...groups.values()].map((group) => ({
      ...group,
      dashboard_ids: uniqueSortedInts(group.dashboard_ids),
    }));
  }

  async function fetchAdminUsers(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        u.user_id,
        u.group_id,
        u.user_fullname,
        u.username,
        u.email,
        u.is_active,
        u.created_at,
        u.updated_at,
        u.last_login_at,
        g.group_name,
        g.group_description,
        g.is_active AS group_is_active
      FROM app_user u
      JOIN app_group g ON g.group_id = u.group_id
      ORDER BY u.username, u.email
      `,
    );

    return (rows || []).map((row) => ({
      user_id: Number(row.user_id),
      group_id: Number(row.group_id),
      user_fullname: toNullableText(row.user_fullname, 150),
      username: String(row.username || "").trim(),
      email: toNullableText(row.email),
      is_active: Number(row.is_active) === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login_at: row.last_login_at,
      group_name: String(row.group_name || "").trim(),
      group_description: toNullableText(row.group_description),
      group_is_active: Number(row.group_is_active) === 1,
    }));
  }

  async function fetchAdminSchools(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        s.snr,
        s.name,
        s.city,
        s.school_form_id,
        sf.code AS school_form_code,
        sf.name AS school_form_name
      FROM school s
      LEFT JOIN school_form sf ON sf.school_form_id = s.school_form_id
      ORDER BY s.city, s.name, s.snr
      `,
    );

    return (rows || []).map((row) => ({
      snr: String(row.snr || "").trim(),
      name: toNullableText(row.name, 255),
      city: toNullableText(row.city, 100),
      school_form_id: row.school_form_id ? Number(row.school_form_id) : null,
      school_form_code: toNullableText(row.school_form_code, 32),
      school_form_name: toNullableText(row.school_form_name, 255),
    }));
  }

  async function fetchAdminSchoolSources(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        sd.source_id,
        sd.snr,
        sd.db_host,
        sd.db_port,
        sd.db_name,
        sd.db_user,
        sd.db_password_enc,
        sd.is_active,
        sd.last_test_at,
        sd.last_test_status,
        sd.last_import_at,
        sd.created_at,
        sd.updated_at,
        s.snr,
        s.name AS school_name,
        s.city,
        sf.code AS school_form_code,
        sf.name AS school_form_name,
        sf.sf_kurz AS school_form_sf
      FROM school_source_db sd
      JOIN school s ON s.snr = sd.snr
      LEFT JOIN school_form sf ON sf.school_form_id = s.school_form_id
      ORDER BY s.city, s.name, s.snr
      `,
    );

    return (rows || []).map((row) => ({
      source_id: Number(row.source_id),
      db_host: String(row.db_host || "").trim(),
      db_port: Number(row.db_port || 3306),
      db_name: String(row.db_name || "").trim(),
      db_user: String(row.db_user || "").trim(),
      db_password_enc: String(row.db_password_enc || ""),
      is_active: Number(row.is_active) === 1,
      last_test_at: row.last_test_at,
      last_test_status: toNullableText(row.last_test_status, 30),
      last_import_at: row.last_import_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      snr: String(row.snr || "").trim(),
      school_name: toNullableText(row.school_name, 255),
      city: toNullableText(row.city, 100),
      school_form_code: toNullableText(row.school_form_code, 32),
      school_form_name: toNullableText(row.school_form_name, 255),
      school_form_sf: toNullableText(row.school_form_sf, 2),
    }));
  }

  async function fetchAdminTerms(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        term_id,
        label,
        school_year,
        term_no
      FROM term
      ORDER BY school_year DESC, term_no DESC
      `,
    );

    return (rows || []).map((row) => ({
      term_id: Number(row.term_id),
      label: toNullableText(row.label, 120),
      school_year: Number(row.school_year || 0),
      term_no: Number(row.term_no || 0),
    }));
  }

  async function fetchAdminSnapshots(conn) {
    const [rows] = await conn.query(
      `
      SELECT
        sp.snapshot_id,
        sp.snap_id,
        sp.snr,
        sp.term_id,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshot_date,
        sp.imported_at,
        sp.info,
        sp.source,
        COUNT(ss.snapshot_id) AS record_count,
        (SELECT COUNT(*) FROM snapshot_teacher st WHERE st.snapshot_id = sp.snapshot_id) AS teacher_count,
        s.snr,
        s.name AS school_name,
        s.city,
        t.school_year,
        t.term_no
      FROM snapshot sp
      JOIN school s ON s.snr = sp.snr
      JOIN term t ON t.term_id = sp.term_id
      LEFT JOIN snapshot_student ss ON ss.snapshot_id = sp.snapshot_id
      GROUP BY
        sp.snapshot_id,
        sp.snr,
        sp.term_id,
        sp.snapshot_date,
        sp.imported_at,
        sp.info,
        sp.source,
        s.snr,
        s.name,
        s.city,
        t.school_year,
        t.term_no
      ORDER BY sp.snapshot_date DESC, sp.imported_at DESC, s.city, s.name, s.snr
      `,
    );

    return (rows || []).map((row) => ({
      snapshot_id: Number(row.snapshot_id),
      snap_id: String(row.snap_id || "").trim(),
      term_id: Number(row.term_id),
      snapshot_date: String(row.snapshot_date || "").trim(),
      imported_at: row.imported_at,
      info: toNullableText(row.info, 100),
      source: toNullableText(row.source, 255),
      record_count: Number(row.record_count || 0),
      teacher_count: Number(row.teacher_count || 0),
      snr: String(row.snr || "").trim(),
      school_name: toNullableText(row.school_name, 255),
      city: toNullableText(row.city, 100),
      school_year: Number(row.school_year || 0),
      term_no: Number(row.term_no || 0),
    }));
  }

  async function fetchAdminSnapshotDbContents(conn, snapId) {
    const [studentRows] = await conn.query(
      `
      SELECT
        ss.snapshot_id,
        sp.snap_id,
        sp.snr,
        s.name AS school_name,
        s.city AS school_city,
        t.school_year,
        t.term_no,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshot_date,
        sp.info,
        sp.source,
        ss.student_no,
        ss.class_id,
        ss.school_form_id,
        sf.sf_kurz AS school_form_short,
        sf.name AS school_form_label,
        ss.education_track_id,
        et.sf AS education_track_sf,
        et.name AS education_track_label,
        ss.ef,
        c.jahrgang AS class_grade,
        c.parallel AS class_parallel,
        ss.religion_id,
        r.name AS religion_label,
        ss.special_needs,
        ss.support_focus1_id,
        sf1.name AS support_focus1_label,
        ss.support_focus2_id,
        sf2.name AS support_focus2_label,
        ss.target_different,
        sx.label AS sex_label,
        ss.nation_id,
        n.label AS nation_label,
        ss.migration
      FROM snapshot_student ss
      JOIN snapshot sp ON sp.snapshot_id = ss.snapshot_id
      JOIN school s ON s.snr = sp.snr
      JOIN term t ON t.term_id = sp.term_id
      LEFT JOIN class c ON c.class_id = ss.class_id
      LEFT JOIN school_form sf ON sf.school_form_id = ss.school_form_id
      LEFT JOIN education_track et ON et.education_track_id = ss.education_track_id
      LEFT JOIN religion r ON r.religion_id = ss.religion_id
      LEFT JOIN support_focus sf1 ON sf1.support_focus_id = ss.support_focus1_id
      LEFT JOIN support_focus sf2 ON sf2.support_focus_id = ss.support_focus2_id
      LEFT JOIN sex sx ON sx.sex_id = ss.sex_id
      LEFT JOIN nation n ON n.nation_id = ss.nation_id
      WHERE sp.snap_id = ?
      ORDER BY s.city, s.name, sp.snr, ss.student_no
      `,
      [snapId],
    );

    const [teacherRows] = await conn.query(
      `
      SELECT
        st.snapshot_id,
        sp.snap_id,
        sp.snr,
        s.name AS school_name,
        s.city AS school_city,
        t.school_year,
        t.term_no,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshot_date,
        sp.info,
        sp.source,
        st.teacher_no,
        sx.label AS sex_label,
        n.label AS nation_label,
        st.city AS teacher_city,
        st.age
      FROM snapshot_teacher st
      JOIN snapshot sp ON sp.snapshot_id = st.snapshot_id
      JOIN school s ON s.snr = sp.snr
      JOIN term t ON t.term_id = sp.term_id
      LEFT JOIN sex sx ON sx.sex_id = st.sex_id
      LEFT JOIN nation n ON n.nation_id = st.nation_id
      WHERE sp.snap_id = ?
      ORDER BY s.city, s.name, sp.snr, st.teacher_no
      `,
      [snapId],
    );

    return {
      snapshot_students: (studentRows || []).map((row) => ({
        snapshot_id: Number(row.snapshot_id || 0),
        snap_id: String(row.snap_id || "").trim(),
        snr: String(row.snr || "").trim(),
        school_name: toNullableText(row.school_name, 255),
        school_city: toNullableText(row.school_city, 100),
        school_year: Number(row.school_year || 0),
        term_no: Number(row.term_no || 0),
        snapshot_date: String(row.snapshot_date || "").trim(),
        info: toNullableText(row.info, 100),
        source: toNullableText(row.source, 255),
        student_no: Number(row.student_no || 0),
        class_id: Number(row.class_id || 0),
        school_form_id: Number(row.school_form_id || 0),
        school_form_short: toNullableText(row.school_form_short, 10),
        school_form_label: toNullableText(row.school_form_label, 255),
        education_track_id: Number(row.education_track_id || 0),
        education_track_sf: toNullableText(row.education_track_sf, 10),
        education_track_label: toNullableText(row.education_track_label, 255),
        ef: Number(row.ef || 0),
        class_grade: toNullableText(row.class_grade, 20),
        class_parallel: toNullableText(row.class_parallel, 20),
        religion_id: Number(row.religion_id || 0),
        religion_label: toNullableText(row.religion_label, 100),
        special_needs: Number(row.special_needs || 0),
        support_focus1_id: Number(row.support_focus1_id || 0),
        support_focus1_label: toNullableText(row.support_focus1_label, 255),
        support_focus2_id: Number(row.support_focus2_id || 0),
        support_focus2_label: toNullableText(row.support_focus2_label, 255),
        target_different: Number(row.target_different || 0),
        sex_label: toNullableText(row.sex_label, 50),
        nation_id: Number(row.nation_id || 0),
        nation_label: toNullableText(row.nation_label, 100),
        migration: Number(row.migration || 0),
      })),
      snapshot_teachers: (teacherRows || []).map((row) => ({
        snapshot_id: Number(row.snapshot_id || 0),
        snap_id: String(row.snap_id || "").trim(),
        snr: String(row.snr || "").trim(),
        school_name: toNullableText(row.school_name, 255),
        school_city: toNullableText(row.school_city, 100),
        school_year: Number(row.school_year || 0),
        term_no: Number(row.term_no || 0),
        snapshot_date: String(row.snapshot_date || "").trim(),
        info: toNullableText(row.info, 100),
        source: toNullableText(row.source, 255),
        teacher_no: Number(row.teacher_no || 0),
        sex_label: toNullableText(row.sex_label, 50),
        nation_label: toNullableText(row.nation_label, 100),
        teacher_city: toNullableText(row.teacher_city, 100),
        age: Number(row.age || 0),
      })),
    };
  }

  async function fetchAdminBootstrap() {
    const conn = getPool();
    await ensureDashboardCatalog(conn);

    const [dashboards, groups, users, schools, schoolSources, snapshots, terms] = await Promise.all([
      fetchAdminDashboards(conn),
      fetchAdminGroups(conn),
      fetchAdminUsers(conn),
      fetchAdminSchools(conn),
      fetchAdminSchoolSources(conn),
      fetchAdminSnapshots(conn),
      fetchAdminTerms(conn),
    ]);

    return {
      dashboards,
      groups,
      users,
      schools,
      school_sources: schoolSources,
      snapshots,
      terms,
      stats: {
        total_users: users.length,
        active_users: users.filter((user) => user.is_active).length,
        total_groups: groups.length,
        active_groups: groups.filter((group) => group.is_active).length,
        total_dashboards: dashboards.length,
        total_schools: schools.length,
        total_school_sources: schoolSources.length,
        active_school_sources: schoolSources.filter((source) => source.is_active).length,
        total_snapshots: snapshots.length,
        total_snapshot_schools: new Set(
          snapshots
            .map((snapshot) => String(snapshot?.snr || "").trim())
            .filter(Boolean),
        ).size,
      },
    };
  }

  async function ensureDashboardIdsExist(conn, dashboardIds) {
    const ids = uniqueSortedInts(dashboardIds);
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await conn.query(
      `
      SELECT dashboard_id
      FROM app_dashboard
      WHERE dashboard_id IN (${placeholders})
      `,
      ids,
    );
    const existingIds = uniqueSortedInts((rows || []).map((row) => row.dashboard_id));
    if (existingIds.length !== ids.length) {
      const error = new Error("Mindestens ein Dashboard ist ungueltig.");
      error.statusCode = 400;
      throw error;
    }
    return existingIds;
  }

  async function ensureGroupExists(conn, groupId) {
    const [rows] = await conn.query(
      `
      SELECT group_id, group_name
      FROM app_group
      WHERE group_id = ?
      LIMIT 1
      `,
      [groupId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Gruppe wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureSchoolExists(conn, schoolSnr) {
    const [rows] = await conn.query(
      `
      SELECT snr, name
      FROM school
      WHERE snr = ?
      LIMIT 1
      `,
      [schoolSnr],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Schule wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureSchoolSourceExists(conn, sourceId) {
    const [rows] = await conn.query(
      `
      SELECT source_id, snr, db_host, db_port, db_name, db_user, db_password_enc, is_active
      FROM school_source_db
      WHERE source_id = ?
      LIMIT 1
      `,
      [sourceId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Die Schulserver-Quelle wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureSnapshotExists(conn, snapshotId) {
    const [rows] = await conn.query(
      `
        SELECT snapshot_id, snap_id, snr, term_id, snapshot_date, info, source
        FROM snapshot
      WHERE snapshot_id = ?
      LIMIT 1
      `,
      [snapshotId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Der Snapshot wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureSnapshotGroupExists(conn, snapId) {
    const [rows] = await conn.query(
      `
      SELECT COUNT(*) AS total
      FROM snapshot
      WHERE snap_id = ?
      `,
      [snapId],
    );
    if (Number(rows?.[0]?.total || 0) <= 0) {
      const error = new Error("Der Snapshot-Stand wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
  }

  async function fetchSnapshotGroupTemplate(conn, snapId) {
    const [rows] = await conn.query(
      `
      SELECT
        snapshot_id,
        snap_id,
        term_id,
        DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS snapshot_date,
        info,
        source
      FROM snapshot
      WHERE snap_id = ?
      ORDER BY snapshot_id ASC
      LIMIT 1
      `,
      [snapId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Der Snapshot-Stand wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function ensureTermExists(conn, termId) {
    const [rows] = await conn.query(
      `
      SELECT term_id, label, school_year, term_no
      FROM term
      WHERE term_id = ?
      LIMIT 1
      `,
      [termId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Das Schuljahr wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function cleanupUnusedSnapRuns(conn, snapIds) {
    const ids = Array.isArray(snapIds)
      ? [...new Set(snapIds.map((value) => String(value ?? "").trim()).filter((value) => /^\d+$/.test(value)))]
      : [];
    if (!ids.length) return 0;

    const placeholders = ids.map(() => "?").join(", ");
    const [result] = await conn.query(
      `
      DELETE s
      FROM snaps s
      LEFT JOIN snapshot sp ON sp.snap_id = s.snap_id
      WHERE s.snap_id IN (${placeholders})
        AND sp.snapshot_id IS NULL
      `,
      ids,
    );
    return Number(result?.affectedRows || 0);
  }

  async function createSnapRun(conn, { termId, snapshotDate, source, info, importedAt = null }) {
    const [result] = await conn.query(
      `
      INSERT INTO snaps (term_id, snapshot_date, source, info, imported_at)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        Number(termId || 0),
        String(snapshotDate || "").trim(),
        toNullableText(source, 255),
        toNullableText(info, 100),
        importedAt,
      ],
    );
    const nextId = Number(result?.insertId || 0);
    if (nextId <= 0) {
      throw new Error("Konnte keinen neuen Snapshot-Run in snaps anlegen.");
    }
    return String(nextId);
  }

  async function fetchAdminSnapshotsByIds(conn, snapshotIds) {
    const ids = Array.isArray(snapshotIds)
      ? snapshotIds.map((value) => Number(value || 0)).filter((value) => value > 0)
      : [];
    if (!ids.length) return [];

    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await conn.query(
      `
      SELECT
        sp.snapshot_id,
        sp.snap_id,
        sp.snr,
        sp.term_id,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshot_date,
        sp.imported_at,
        sp.info,
        sp.source,
        COUNT(ss.snapshot_id) AS record_count,
        (SELECT COUNT(*) FROM snapshot_teacher st WHERE st.snapshot_id = sp.snapshot_id) AS teacher_count,
        s.snr,
        s.name AS school_name,
        s.city,
        t.school_year,
        t.term_no
      FROM snapshot sp
      JOIN school s ON s.snr = sp.snr
      JOIN term t ON t.term_id = sp.term_id
      LEFT JOIN snapshot_student ss ON ss.snapshot_id = sp.snapshot_id
      WHERE sp.snapshot_id IN (${placeholders})
      GROUP BY
        sp.snapshot_id,
        sp.snap_id,
        sp.snr,
        sp.term_id,
        sp.snapshot_date,
        sp.imported_at,
        sp.info,
        sp.source,
        s.snr,
        s.name,
        s.city,
        t.school_year,
        t.term_no
      ORDER BY sp.snapshot_date DESC, sp.imported_at DESC, s.city, s.name, s.snr
      `,
      ids,
    );

    return (rows || []).map((row) => ({
      snapshot_id: Number(row.snapshot_id),
      snap_id: String(row.snap_id || "").trim(),
      term_id: Number(row.term_id),
      snapshot_date: String(row.snapshot_date || "").trim(),
      imported_at: row.imported_at,
      info: toNullableText(row.info, 100),
      source: toNullableText(row.source, 255),
      record_count: Number(row.record_count || 0),
      teacher_count: Number(row.teacher_count || 0),
      snr: String(row.snr || "").trim(),
      school_name: toNullableText(row.school_name, 255),
      city: toNullableText(row.city, 100),
      school_year: Number(row.school_year || 0),
      term_no: Number(row.term_no || 0),
    }));
  }

  async function ensureUniqueSchoolSourceBySchool(conn, schoolSnr, excludeSourceId = 0) {
    const params = [schoolSnr];
    let query = `
      SELECT source_id
      FROM school_source_db
      WHERE snr = ?
    `;
    if (excludeSourceId) {
      query += " AND source_id <> ?";
      params.push(excludeSourceId);
    }
    query += " LIMIT 1";

    const [rows] = await conn.query(query, params);
    if (rows && rows[0]) {
      const error = new Error("Fuer diese Schule existiert bereits eine Schulserver-Quelle.");
      error.statusCode = 409;
      throw error;
    }
  }

  function isAdminGroupName(groupName) {
    return String(groupName || "").trim().toLowerCase() === "admin";
  }

  async function loadUserById(conn, userId) {
    const [rows] = await conn.query(
      `
      SELECT
        u.user_id,
        u.group_id,
        u.username,
        u.is_active,
        g.group_name
      FROM app_user u
      JOIN app_group g ON g.group_id = u.group_id
      WHERE u.user_id = ?
      LIMIT 1
      `,
      [userId],
    );
    if (!rows || !rows[0]) {
      const error = new Error("Der Benutzer wurde nicht gefunden.");
      error.statusCode = 404;
      throw error;
    }
    return rows[0];
  }

  async function countActiveAdminUsers(conn, excludeUserId = 0) {
    const params = [];
    let query = `
      SELECT COUNT(*) AS total
      FROM app_user u
      JOIN app_group g ON g.group_id = u.group_id
      WHERE u.is_active = 1
        AND g.is_active = 1
        AND LOWER(TRIM(g.group_name)) = 'admin'
    `;
    if (excludeUserId) {
      query += " AND u.user_id <> ?";
      params.push(excludeUserId);
    }
    const [rows] = await conn.query(query, params);
    return Number(rows?.[0]?.total || 0);
  }

  async function ensureAdminGroupMutationAllowed(conn, currentGroup, nextGroupName, nextIsActive) {
    if (!isAdminGroupName(currentGroup?.group_name)) return;
    if (!isAdminGroupName(nextGroupName)) {
      const error = new Error("Die Admin-Gruppe darf nicht umbenannt werden.");
      error.statusCode = 409;
      throw error;
    }
    if (Number(nextIsActive) !== 1) {
      const error = new Error("Die Admin-Gruppe darf nicht deaktiviert werden.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function ensureAdminUserMutationAllowed(conn, userId, nextGroupId, nextIsActive) {
    const currentUser = await loadUserById(conn, userId);
    if (!isAdminGroupName(currentUser.group_name)) return;

    const targetGroup = await ensureGroupExists(conn, nextGroupId);
    const staysAdmin = isAdminGroupName(targetGroup.group_name);
    const staysActive = Number(nextIsActive) === 1;
    if (staysAdmin && staysActive) return;

    const remainingAdmins = await countActiveAdminUsers(conn, userId);
    if (remainingAdmins <= 0) {
      const error = new Error("Der letzte aktive Admin-Benutzer darf nicht deaktiviert, verschoben oder geloescht werden.");
      error.statusCode = 409;
      throw error;
    }
  }

  function ensureCurrentAdminUserNotDeactivated(currentUserId, targetUserId, nextIsActive) {
    if (Number(currentUserId) > 0 && Number(targetUserId) === Number(currentUserId) && Number(nextIsActive) !== 1) {
      const error = new Error("Der aktuell eingeloggte Admin-Benutzer darf sich nicht selbst deaktivieren.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function ensureUniqueGroupName(conn, groupName, excludeGroupId = 0) {
    const params = [groupName];
    let query = `
      SELECT group_id
      FROM app_group
      WHERE group_name = ?
    `;
    if (excludeGroupId) {
      query += " AND group_id <> ?";
      params.push(excludeGroupId);
    }
    query += " LIMIT 1";

    const [rows] = await conn.query(query, params);
    if (rows && rows[0]) {
      const error = new Error("Der Gruppenname ist bereits vergeben.");
      error.statusCode = 409;
      throw error;
    }
  }

  async function ensureUniqueUserData(conn, { username, email, excludeUserId = 0 }) {
    const checks = [{ field: "username", value: username, message: "Der Loginname ist bereits vergeben." }];
    if (email) {
      checks.push({ field: "email", value: email, message: "Die E-Mail-Adresse ist bereits vergeben." });
    }

    for (const check of checks) {
      const params = [check.value];
      let query = `
        SELECT user_id
        FROM app_user
        WHERE ${check.field} = ?
      `;
      if (excludeUserId) {
        query += " AND user_id <> ?";
        params.push(excludeUserId);
      }
      query += " LIMIT 1";
      const [rows] = await conn.query(query, params);
      if (rows && rows[0]) {
        const error = new Error(check.message);
        error.statusCode = 409;
        throw error;
      }
    }
  }

  async function syncGroupDashboards(conn, groupId, dashboardIds) {
    await conn.query("DELETE FROM app_group_dashboard WHERE group_id = ?", [groupId]);
    if (!dashboardIds.length) return;
    const values = dashboardIds.map((dashboardId) => [groupId, dashboardId]);
    await conn.query(
      `
      INSERT INTO app_group_dashboard (group_id, dashboard_id)
      VALUES ?
      `,
      [values],
    );
  }

  function adminErrorResponse(res, error, fallbackMessage) {
    const statusCode = Number(error?.statusCode || 0);
    if (statusCode >= 400 && statusCode < 600) {
      return res.status(statusCode).json({ error: error.message || fallbackMessage });
    }
    if (Number(error?.errno) === 1062 || String(error?.code || "").toUpperCase() === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ein Eintrag mit diesen Schluesseldaten existiert bereits." });
    }
    console.error(error);
    const technicalMessage =
      String(error?.sqlMessage || "").trim()
      || String(error?.message || "").trim()
      || fallbackMessage;
    return res.status(500).json({ error: technicalMessage });
  }

  async function updateLastLogin(userId) {
    try {
      await getPool().query(
        "UPDATE app_user SET last_login_at = NOW() WHERE user_id = ?",
        [userId],
      );
    } catch (e) {
      console.error("updateLastLogin failed:", e?.message || e);
    }
  }

  function signToken(user) {
    const payload = {
      sub: String(user.user_id),
      username: user.username,
      user_fullname: user.user_fullname,
      email: user.email,
      groupId: user.group_id,
      groupName: user.group_name,
      dashboards: user.dashboard_keys || [],
      dashboard_permissions: user.dashboard_permissions || [],
    };

    return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  }

  function authenticateToken(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "Nicht eingeloggt." });
    }
    if (isRevoked(token)) {
      return res.status(401).json({ error: "Session beendet. Bitte erneut anmelden." });
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = payload;
      req.token = token;
      next();
    } catch (e) {
      return res.status(401).json({ error: "Session abgelaufen oder ungültig." });
    }
  }

  function requireDashboardPermission(requiredDashboardKey) {
    return (req, res, next) => {
      const allowed = Array.isArray(req.user?.dashboards) ? req.user.dashboards : [];

      if (!allowed.includes(requiredDashboardKey)) {
        return res
          .status(403)
          .json({ error: `Keine Berechtigung fuer ${requiredDashboardKey}.` });
      }

      next();
    };
  }

  router.post("/login", async (req, res) => {
    try {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");

      if (!username || !password) {
        return res.status(400).json({ error: "Username und Passwort sind erforderlich." });
      }

      const user = await loadUser(username);
      if (
        !user ||
        Number(user.is_active) !== 1 ||
        Number(user.group_is_active) !== 1
      ) {
        console.warn(`[AUTH] login denied: user not found or inactive for "${username}"`);
        return res.status(401).json({ error: "Ungültige Zugangsdaten." });
      }

      const ok = await bcrypt.compare(password, String(user.password_hash || ""));
      if (!ok) {
        console.warn(`[AUTH] login denied: invalid password for "${username}"`);
        return res.status(401).json({ error: "Ungültige Zugangsdaten." });
      }

      const dashboardPermissions = await loadDashboardKeysByGroup(
        user.group_id,
        user.group_name,
      );
      const dashboardKeys = dashboardPermissions.map((item) => item.dashboard_key);
      if (!dashboardKeys.length) {
        return res.status(403).json({
          error: "Keine berechtigten Dashboards fuer diese Gruppe.",
        });
      }
      user.dashboard_keys = dashboardKeys;
      user.dashboard_permissions = dashboardPermissions;

      await updateLastLogin(user.user_id);

      const token = signToken(user);
      return res.json({
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          user_fullname: user.user_fullname,
          email: user.email,
          group_id: user.group_id,
          group_name: user.group_name,
          dashboards: dashboardKeys,
          dashboard_permissions: dashboardPermissions,
        },
      });
    } catch (e) {
      console.error(e);
      if (String(e?.message || "").includes("Keine Datenbankverbindung konfiguriert")) {
        return res.status(503).json({ error: e.message });
      }
      const connectionError = classifyAuthConnectionError(e);
      if (connectionError) {
        return res.status(503).json({ error: connectionError });
      }
      return res.status(500).json({ error: e?.message || "Login fehlgeschlagen." });
    }
  });

  router.get("/me", authenticateToken, (req, res) => {
    res.json({ user: req.user });
  });

  router.get("/admin/bootstrap", authenticateToken, requireAdmin, async (req, res) => {
    try {
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Verwaltungsdaten konnten nicht geladen werden.");
    }
  });

  router.get("/admin/db-contents", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const conn = getPool();
      const snapId = toRequiredSnapId(req.query?.snapId);

      await ensureSnapshotGroupExists(conn, snapId);
      const contents = await fetchAdminSnapshotDbContents(conn, snapId);

      return res.json({
        snap_id: snapId,
        total_snapshot_students: contents.snapshot_students.length,
        total_snapshot_teachers: contents.snapshot_teachers.length,
        snapshot_students: contents.snapshot_students,
        snapshot_teachers: contents.snapshot_teachers,
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Die DB-Inhalte konnten nicht geladen werden.");
    }
  });

  router.post("/admin/groups", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupName = toRequiredText(req.body?.group_name, "Gruppenname", 50);
      const groupDescription = toNullableText(req.body?.group_description, 255);
      const isActive = toFlag(req.body?.is_active, 1);
      const dashboardIds = await ensureDashboardIdsExist(conn, req.body?.dashboard_ids);
      await ensureUniqueGroupName(conn, groupName);

      await conn.beginTransaction();
      const [result] = await conn.query(
        `
        INSERT INTO app_group (group_name, group_description, is_active)
        VALUES (?, ?, ?)
        `,
        [groupName, groupDescription, isActive],
      );
      const groupId = Number(result.insertId);
      await syncGroupDashboards(conn, groupId, dashboardIds);
      await conn.commit();

      res.status(201).json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Gruppe konnte nicht gespeichert werden.");
    } finally {
      conn.release();
    }
  });

  router.patch("/admin/groups/:groupId", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.params.groupId, "Gruppe");
      const currentGroup = await ensureGroupExists(conn, groupId);
      const groupName = toRequiredText(req.body?.group_name, "Gruppenname", 50);
      const groupDescription = toNullableText(req.body?.group_description, 255);
      const isActive = toFlag(req.body?.is_active, 1);
      const dashboardIds = await ensureDashboardIdsExist(conn, req.body?.dashboard_ids);
      await ensureAdminGroupMutationAllowed(conn, currentGroup, groupName, isActive);
      await ensureUniqueGroupName(conn, groupName, groupId);

      await conn.beginTransaction();
      await conn.query(
        `
        UPDATE app_group
        SET group_name = ?, group_description = ?, is_active = ?
        WHERE group_id = ?
        `,
        [groupName, groupDescription, isActive, groupId],
      );
      await syncGroupDashboards(conn, groupId, dashboardIds);
      await conn.commit();

      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Gruppe konnte nicht aktualisiert werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/users", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.body?.group_id, "Gruppe");
      const username = toRequiredText(req.body?.username, "Benutzername", 80);
      const userFullname = toNullableText(req.body?.user_fullname, 150);
      const email = toNullableText(req.body?.email, 255);
      const password = toRequiredText(req.body?.password, "Passwort", 255);
      const isActive = toFlag(req.body?.is_active, 1);

      await ensureGroupExists(conn, groupId);
      validateEmailAddress(email);
      await ensureUniqueUserData(conn, { username, email });
      const passwordHash = await bcrypt.hash(password, 10);
      await conn.query(
        `
        INSERT INTO app_user (
          group_id,
          user_fullname,
          username,
          email,
          password_hash,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [groupId, userFullname, username, email, passwordHash, isActive],
      );

      res.status(201).json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Der Benutzer konnte nicht angelegt werden.");
    } finally {
      conn.release();
    }
  });

  router.patch("/admin/users/:userId", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const userId = toPositiveInt(req.params.userId, "Benutzer");
      const currentUserId = Number(req.user?.sub || 0);
      const groupId = toPositiveInt(req.body?.group_id, "Gruppe");
      const username = toRequiredText(req.body?.username, "Benutzername", 80);
      const userFullname = toNullableText(req.body?.user_fullname, 150);
      const email = toNullableText(req.body?.email, 255);
      const isActive = toFlag(req.body?.is_active, 1);
      const password = String(req.body?.password || "").trim();

      ensureCurrentAdminUserNotDeactivated(currentUserId, userId, isActive);
      await ensureAdminUserMutationAllowed(conn, userId, groupId, isActive);
      await ensureGroupExists(conn, groupId);
      validateEmailAddress(email);
      await ensureUniqueUserData(conn, { username, email, excludeUserId: userId });

      const [existingRows] = await conn.query(
        `
        SELECT user_id
        FROM app_user
        WHERE user_id = ?
        LIMIT 1
        `,
        [userId],
      );
      if (!existingRows || !existingRows[0]) {
        const error = new Error("Der Benutzer wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      await conn.query(
        `
        UPDATE app_user
        SET group_id = ?, user_fullname = ?, username = ?, email = ?, is_active = ?
        WHERE user_id = ?
        `,
        [groupId, userFullname, username, email, isActive, userId],
      );

      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        await conn.query(
          "UPDATE app_user SET password_hash = ? WHERE user_id = ?",
          [passwordHash, userId],
        );
      }

      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Der Benutzer konnte nicht aktualisiert werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/users/:userId", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const userId = toPositiveInt(req.params.userId, "Benutzer");
      const currentUserId = Number(req.user?.sub || 0);
      if (currentUserId > 0 && userId === currentUserId) {
        const error = new Error("Der aktuell eingeloggte Admin-Benutzer darf sich nicht selbst loeschen.");
        error.statusCode = 409;
        throw error;
      }
      await ensureAdminUserMutationAllowed(conn, userId, (await loadUserById(conn, userId)).group_id, 0);

      await conn.query("DELETE FROM app_user WHERE user_id = ?", [userId]);
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Der Benutzer konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/groups/:groupId", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const groupId = toPositiveInt(req.params.groupId, "Gruppe");
      const group = await ensureGroupExists(conn, groupId);
      if (isAdminGroupName(group.group_name)) {
        const error = new Error("Die Admin-Gruppe darf nicht geloescht werden.");
        error.statusCode = 409;
        throw error;
      }
      const [userRows] = await conn.query(
        `
        SELECT COUNT(*) AS total
        FROM app_user
        WHERE group_id = ?
        `,
        [groupId],
      );
      if (Number(userRows?.[0]?.total || 0) > 0) {
        const error = new Error("Die Gruppe kann nicht geloescht werden, solange Benutzer zugeordnet sind.");
        error.statusCode = 409;
        throw error;
      }

      await conn.beginTransaction();
      await conn.query("DELETE FROM app_group_dashboard WHERE group_id = ?", [groupId]);
      await conn.query("DELETE FROM app_group WHERE group_id = ?", [groupId]);
      await conn.commit();
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Gruppe konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const schoolId = toRequiredText(req.body?.snr, "Schule", 6);
      const dbHost = toRequiredText(req.body?.db_host, "Server", 255);
      const dbPort = toPositiveInt(req.body?.db_port || 3306, "Port");
      const dbName = toRequiredText(req.body?.db_name, "Datenbank", 255);
      const dbUser = toRequiredText(req.body?.db_user, "DB-Benutzer", 255);
      const dbPasswordEnc = String(req.body?.db_password_enc || "").slice(0, 4000);
      const isActive = toFlag(req.body?.is_active, 1);

      await ensureSchoolExists(conn, schoolId);
      await ensureUniqueSchoolSourceBySchool(conn, schoolId);

      const [insertResult] = await conn.query(
        `
        INSERT INTO school_source_db (
          snr,
          db_host,
          db_port,
          db_name,
          db_user,
          db_password_enc,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [schoolId, dbHost, dbPort, dbName, dbUser, dbPasswordEnc, isActive],
      );

      const sourceId = Number(insertResult?.insertId || 0);
      if (!sourceId) {
        const error = new Error("Die Schulserver-Quelle konnte nicht angelegt werden.");
        error.statusCode = 500;
        throw error;
      }

      const createdSource = await ensureSchoolSourceExists(conn, sourceId);
      const insertVerified =
        String(createdSource.snr || "").trim() === schoolId &&
        String(createdSource.db_host || "").trim() === dbHost &&
        Number(createdSource.db_port || 0) === dbPort &&
        String(createdSource.db_name || "").trim() === dbName &&
        String(createdSource.db_user || "").trim() === dbUser &&
        Number(createdSource.is_active || 0) === isActive;

      if (!insertVerified) {
        const error = new Error("Die Schulserver-Quelle wurde nach dem Speichern nicht korrekt in der DB angelegt.");
        error.statusCode = 500;
        throw error;
      }

      await conn.commit();

      const bootstrap = await fetchAdminBootstrap();
      const bootstrapSource = Array.isArray(bootstrap?.school_sources)
        ? bootstrap.school_sources.find((entry) => Number(entry?.source_id || 0) === sourceId) || null
        : null;

      res.status(201).json({
        ...bootstrap,
        created_source: bootstrapSource,
      });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schulserver-Quelle konnte nicht angelegt werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/schools/import-csv", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const csvText = String(req.body?.csv_text || "");
      const overwriteExisting = toFlag(req.body?.overwrite_existing, 0) === 1;
      const selectedRowNos = Array.isArray(req.body?.selected_row_nos)
        ? req.body.selected_row_nos.map((value) => Number(value || 0)).filter((value) => value > 0)
        : [];
      const selectedRowSet = selectedRowNos.length ? new Set(selectedRowNos) : null;
      const rows = parseSchoolCsv(csvText).filter((row) => !selectedRowSet || selectedRowSet.has(Number(row.row_no || 0)));
      if (!rows.length) {
        const error = new Error("Die CSV-Datei enthaelt keine importierbaren Zeilen.");
        error.statusCode = 400;
        throw error;
      }

      const invalidRows = [];
      const duplicateSnrs = new Set();
      const seenSnrs = new Set();
      const preparedRows = [];

      for (const row of rows) {
        const schoolId = String(row.snr || "").trim();
        if (!schoolId) {
          invalidRows.push(`Zeile ${row.row_no}: Schulnummer fehlt.`);
          continue;
        }
        if (seenSnrs.has(schoolId)) {
          duplicateSnrs.add(schoolId);
        }
        seenSnrs.add(schoolId);

        const name = String(row.name || "").trim();
        const city = String(row.city || "").trim();
        const schoolForm = String(row.school_form || "").trim();

        if (!name || !city) {
          invalidRows.push(`Zeile ${row.row_no}: Unvollstaendige Daten fuer ${schoolId}.`);
          continue;
        }

        let schoolFormId = null;
        if (schoolForm) {
          const [formRows] = await conn.query(
            `
            SELECT school_form_id
            FROM school_form
            WHERE code = ? OR name = ? OR sf_kurz = ?
            LIMIT 1
            `,
            [schoolForm, schoolForm, schoolForm]
          );
          if (formRows && formRows.length > 0) {
            schoolFormId = formRows[0].school_form_id;
          } else {
            invalidRows.push(`Zeile ${row.row_no}: Schulform "${schoolForm}" wurde nicht in school_form gefunden.`);
            continue;
          }
        }

        preparedRows.push({
          row_no: row.row_no,
          snr: schoolId,
          name,
          city,
          school_form_id: schoolFormId,
        });
      }

      if (duplicateSnrs.size) {
        invalidRows.push(`Doppelte Schulnummern in CSV: ${[...duplicateSnrs].sort((a, b) => a.localeCompare(b, "de", { numeric: true })).join(", ")}`);
      }

      if (invalidRows.length) {
        const error = new Error(invalidRows.join("\n"));
        error.statusCode = 400;
        throw error;
      }

      const existingEntries = [];
      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT snr, name, city, school_form_id FROM school WHERE snr = ? LIMIT 1",
          [row.snr]
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          existingEntries.push({
            snr: String(existing.snr || "").trim(),
            name: row.name,
            city: row.city,
            school_form_id: existing.school_form_id,
          });
        }
      }

      if (existingEntries.length && !overwriteExisting) {
        await conn.rollback().catch(() => {});
        return res.status(409).json({
          needs_confirmation: true,
          message: `${existingEntries.length} Schule(n) sind bereits vorhanden.`,
          existing_entries: existingEntries,
          import_rows: preparedRows.length,
        });
      }

      let createdCount = 0;
      let updatedCount = 0;
      const createdEntries = [];
      const updatedEntries = [];

      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT snr FROM school WHERE snr = ? LIMIT 1",
          [row.snr]
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          await conn.query(
            `
            UPDATE school
            SET name = ?, city = ?, school_form_id = ?
            WHERE snr = ?
            `,
            [row.name, row.city, row.school_form_id, row.snr]
          );
          updatedCount += 1;
          updatedEntries.push({
            snr: row.snr,
            name: row.name,
            city: row.city,
          });
          continue;
        }

        await conn.query(
          `
          INSERT INTO school (snr, name, city, school_form_id)
          VALUES (?, ?, ?, ?)
          `,
          [row.snr, row.name, row.city, row.school_form_id]
        );
        createdCount += 1;
        createdEntries.push({
          snr: row.snr,
          name: row.name,
          city: row.city,
        });
      }

      await conn.commit();
      const bootstrap = await fetchAdminBootstrap();
      return res.status(201).json({
        ...bootstrap,
        created_count: createdCount,
        updated_count: updatedCount,
        imported_count: createdCount + updatedCount,
        created_entries: createdEntries,
        updated_entries: updatedEntries,
      });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der CSV-Import der Schulen ist fehlgeschlagen.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources/import-csv", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const csvText = String(req.body?.csv_text || "");
      const overwriteExisting = toFlag(req.body?.overwrite_existing, 0) === 1;
      const selectedRowNos = Array.isArray(req.body?.selected_row_nos)
        ? req.body.selected_row_nos.map((value) => Number(value || 0)).filter((value) => value > 0)
        : [];
      const selectedRowSet = selectedRowNos.length ? new Set(selectedRowNos) : null;
      const rows = parseSchoolSourceCsv(csvText).filter((row) => !selectedRowSet || selectedRowSet.has(Number(row.row_no || 0)));
      if (!rows.length) {
        const error = new Error("Die CSV-Datei enthaelt keine importierbaren Zeilen.");
        error.statusCode = 400;
        throw error;
      }

      const invalidRows = [];
      const duplicateSnrs = new Set();
      const seenSnrs = new Set();
      const preparedRows = [];

      for (const row of rows) {
        const schoolId = String(row.snr || "").trim();
        if (!schoolId) {
          invalidRows.push(`Zeile ${row.row_no}: Schulnummer fehlt.`);
          continue;
        }
        if (seenSnrs.has(schoolId)) {
          duplicateSnrs.add(schoolId);
        }
        seenSnrs.add(schoolId);

        const dbHost = String(row.db_host || "").trim();
        const dbName = String(row.db_name || "").trim();
        const dbUser = String(row.db_user || "").trim();
        const dbPasswordEnc = String(row.db_password_enc || "").trim();
        const dbPortRaw = String(row.db_port || "").trim();
        const dbPort = Number(dbPortRaw || 0);

        if (!dbHost || !dbName || !dbUser || !dbPasswordEnc || !dbPortRaw) {
          invalidRows.push(`Zeile ${row.row_no}: Unvollstaendige Daten fuer ${schoolId}.`);
          continue;
        }
        if (!Number.isInteger(dbPort) || dbPort <= 0) {
          invalidRows.push(`Zeile ${row.row_no}: Ungueltiger Port fuer ${schoolId}.`);
          continue;
        }

        const [schoolRows] = await conn.query(
          "SELECT snr, name FROM school WHERE snr = ? LIMIT 1",
          [schoolId],
        );
        const school = schoolRows?.[0] || null;
        if (!school) {
          invalidRows.push(`Zeile ${row.row_no}: Schulnummer ${schoolId} ist nicht in school vorhanden.`);
          continue;
        }

        preparedRows.push({
          row_no: row.row_no,
          snr: schoolId,
          school_name: String(school.name || "").trim(),
          db_host: dbHost,
          db_port: dbPort,
          db_name: dbName,
          db_user: dbUser,
          db_password_enc: dbPasswordEnc,
        });
      }

      if (duplicateSnrs.size) {
        invalidRows.push(`Doppelte Schulnummern in CSV: ${[...duplicateSnrs].sort((a, b) => a.localeCompare(b, "de", { numeric: true })).join(", ")}`);
      }

      if (invalidRows.length) {
        const error = new Error(invalidRows.join("\n"));
        error.statusCode = 400;
        throw error;
      }

      const existingEntries = [];
      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT source_id, snr, db_host, db_port, db_name, db_user, is_active FROM school_source_db WHERE snr = ? LIMIT 1",
          [row.snr],
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          existingEntries.push({
            source_id: Number(existing.source_id || 0),
            snr: String(existing.snr || "").trim(),
            school_name: row.school_name,
            db_host: String(existing.db_host || "").trim(),
            db_port: Number(existing.db_port || 0),
            db_name: String(existing.db_name || "").trim(),
            db_user: String(existing.db_user || "").trim(),
            is_active: Number(existing.is_active || 0),
          });
        }
      }

      if (existingEntries.length && !overwriteExisting) {
        await conn.rollback().catch(() => {});
        return res.status(409).json({
          needs_confirmation: true,
          message: `${existingEntries.length} Schule(n) sind bereits in school_source_db vorhanden.`,
          existing_entries: existingEntries,
          import_rows: preparedRows.length,
        });
      }

      let createdCount = 0;
      let updatedCount = 0;
      const createdEntries = [];
      const updatedEntries = [];

      for (const row of preparedRows) {
        const [existingRows] = await conn.query(
          "SELECT source_id FROM school_source_db WHERE snr = ? LIMIT 1",
          [row.snr],
        );
        const existing = existingRows?.[0] || null;
        if (existing) {
          await conn.query(
            `
            UPDATE school_source_db
            SET db_host = ?, db_port = ?, db_name = ?, db_user = ?, db_password_enc = ?, is_active = 1
            WHERE source_id = ?
            `,
            [row.db_host, row.db_port, row.db_name, row.db_user, row.db_password_enc, Number(existing.source_id || 0)],
          );
          updatedCount += 1;
          updatedEntries.push({
            snr: row.snr,
            school_name: row.school_name,
            db_host: row.db_host,
            db_port: row.db_port,
            db_name: row.db_name,
            db_user: row.db_user,
          });
          continue;
        }

        await conn.query(
          `
          INSERT INTO school_source_db (
            snr,
            db_host,
            db_port,
            db_name,
            db_user,
            db_password_enc,
            is_active
          )
          VALUES (?, ?, ?, ?, ?, ?, 1)
          `,
          [row.snr, row.db_host, row.db_port, row.db_name, row.db_user, row.db_password_enc],
        );
        createdCount += 1;
        createdEntries.push({
          snr: row.snr,
          school_name: row.school_name,
          db_host: row.db_host,
          db_port: row.db_port,
          db_name: row.db_name,
          db_user: row.db_user,
        });
      }

      await conn.commit();
      const bootstrap = await fetchAdminBootstrap();
      return res.status(201).json({
        ...bootstrap,
        created_count: createdCount,
        updated_count: updatedCount,
        imported_count: createdCount + updatedCount,
        created_entries: createdEntries,
        updated_entries: updatedEntries,
      });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der CSV-Import der Schulserver-Quellen ist fehlgeschlagen.");
    } finally {
      conn.release();
    }
  });

  router.patch("/admin/school-sources/:sourceId", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      const schoolId = toRequiredText(req.body?.snr, "Schule", 6);
      const dbHost = toRequiredText(req.body?.db_host, "Server", 255);
      const dbPort = toPositiveInt(req.body?.db_port || 3306, "Port");
      const dbName = toRequiredText(req.body?.db_name, "Datenbank", 255);
      const dbUser = toRequiredText(req.body?.db_user, "DB-Benutzer", 255);
      const incomingPassword = String(req.body?.db_password_enc || "");
      const isActive = toFlag(req.body?.is_active, 1);

      const currentSource = await ensureSchoolSourceExists(conn, sourceId);
      await ensureSchoolExists(conn, schoolId);
      await ensureUniqueSchoolSourceBySchool(conn, schoolId, sourceId);

      const dbPasswordEnc = incomingPassword.trim()
        ? incomingPassword
        : String(currentSource.db_password_enc || "");

      const [updateResult] = await conn.query(
        `
        UPDATE school_source_db
        SET snr = ?, db_host = ?, db_port = ?, db_name = ?, db_user = ?, db_password_enc = ?, is_active = ?
        WHERE source_id = ?
        `,
        [schoolId, dbHost, dbPort, dbName, dbUser, dbPasswordEnc, isActive, sourceId],
      );

      if (Number(updateResult?.affectedRows || 0) !== 1) {
        const error = new Error("Die Schulserver-Quelle konnte nicht aktualisiert werden.");
        error.statusCode = 404;
        throw error;
      }

      const updatedSource = await ensureSchoolSourceExists(conn, sourceId);
      const updateVerified =
        String(updatedSource.snr || "").trim() === schoolId &&
        String(updatedSource.db_host || "").trim() === dbHost &&
        Number(updatedSource.db_port || 0) === dbPort &&
        String(updatedSource.db_name || "").trim() === dbName &&
        String(updatedSource.db_user || "").trim() === dbUser &&
        Number(updatedSource.is_active || 0) === isActive;

      if (!updateVerified) {
        const error = new Error("Die Schulserver-Quelle wurde nach dem Speichern nicht korrekt in der DB aktualisiert.");
        error.statusCode = 500;
        throw error;
      }

      await conn.commit();

      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schulserver-Quelle konnte nicht aktualisiert werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/school-sources/:sourceId", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      await ensureSchoolSourceExists(conn, sourceId);
      await conn.query("DELETE FROM school_source_db WHERE source_id = ?", [sourceId]);
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schulserver-Quelle konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/schools", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const [snapshotRows] = await conn.query(
        `
        SELECT DISTINCT snap_id
        FROM snapshot
        WHERE snap_id IS NOT NULL AND snap_id <> ''
        `,
      );
      const snapIds = (snapshotRows || [])
        .map((row) => String(row?.snap_id || "").trim())
        .filter(Boolean);

      await conn.query("DELETE FROM snapshot");
      if (snapIds.length) {
        await cleanupUnusedSnapRuns(conn, snapIds);
      }
      await conn.query("DELETE FROM school_source_db");
      await conn.query("DELETE FROM school");

      await conn.commit();
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Die Schulen konnten nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources/:sourceId/test", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    let sourceHost = "";
    try {
      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      const source = await ensureSchoolSourceExists(conn, sourceId);
      sourceHost = String(source?.db_host || "").trim();
      const result = await testSchoolSourceConnection(source);

      await conn.query(
        `
        UPDATE school_source_db
        SET last_test_at = NOW(), last_test_status = ?
        WHERE source_id = ?
        `,
        [result.status_code, sourceId],
      );

      res.json({
        success: true,
        source_id: sourceId,
        status: result.status_code,
        server_status: result.server_status,
        db_status: result.db_status,
        message: result.message,
        bootstrap: await fetchAdminBootstrap(),
      });
    } catch (error) {
      const sourceId = Number(req.params.sourceId || 0);
      if (sourceId > 0) {
        await conn.query(
          `
          UPDATE school_source_db
          SET last_test_at = NOW(), last_test_status = ?
          WHERE source_id = ?
          `,
          ["server_fail", sourceId],
        ).catch(() => {});
      }

      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message || "Verbindungstest fehlgeschlagen." });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error, sourceHost),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources/test-draft", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const draftSource = {
        db_host: toRequiredText(req.body?.db_host, "Server", 255),
        db_port: toPositiveInt(req.body?.db_port || 3306, "Port"),
        db_name: toRequiredText(req.body?.db_name, "Datenbank", 255),
        db_user: toRequiredText(req.body?.db_user, "DB-Benutzer", 255),
        db_password_enc: String(req.body?.db_password_enc || ""),
      };
      const result = await testSchoolSourceConnection(draftSource);
      return res.json({
        success: true,
        status: result.status_code,
        server_status: result.server_status,
        db_status: result.db_status,
        message: result.message,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message || "Verbindungstest fehlgeschlagen." });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error, String(req.body?.db_host || "").trim()),
      });
    }
  });

  router.post("/admin/school-sources/test-all", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      const uniqueSourceIds = [...new Set(sourceIds)];

      let rows;
      if (uniqueSourceIds.length) {
        const placeholders = uniqueSourceIds.map(() => "?").join(", ");
        [rows] = await conn.query(
          `
          SELECT source_id, snr, db_host, db_port, db_name, db_user, db_password_enc, is_active
          FROM school_source_db
          WHERE source_id IN (${placeholders})
          ORDER BY source_id
          `,
          uniqueSourceIds,
        );

        if ((rows || []).length !== uniqueSourceIds.length) {
          const error = new Error("Mindestens eine Schulserver-Quelle wurde nicht gefunden.");
          error.statusCode = 404;
          throw error;
        }
      } else {
        [rows] = await conn.query(
          `
          SELECT source_id, snr, db_host, db_port, db_name, db_user, db_password_enc, is_active
          FROM school_source_db
          ORDER BY source_id
          `,
        );
      }

      let successCount = 0;
      let failureCount = 0;
      const results = [];

      for (const source of rows || []) {
        const sourceId = Number(source?.source_id || 0);
        if (!sourceId) continue;

        try {
          const result = await testSchoolSourceConnection(source);
          await conn.query(
            `
            UPDATE school_source_db
            SET last_test_at = NOW(), last_test_status = ?
            WHERE source_id = ?
            `,
            [result.status_code, sourceId],
          );
          successCount += 1;
          results.push({
            source_id: sourceId,
            server_status: result.server_status,
            db_status: result.db_status,
            status: result.status_code,
          });
        } catch {
          await conn.query(
            `
            UPDATE school_source_db
            SET last_test_at = NOW(), last_test_status = ?
            WHERE source_id = ?
            `,
            ["server_fail", sourceId],
          ).catch(() => {});
          failureCount += 1;
          results.push({
            source_id: sourceId,
            server_status: "offline",
            db_status: "unknown",
            status: "server_fail",
          });
        }
      }

      res.json({
        success: failureCount === 0,
        message: `Verbindungstest abgeschlossen: ${successCount} erfolgreich, ${failureCount} fehlgeschlagen.`,
        results,
        bootstrap: await fetchAdminBootstrap(),
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message });
      }
      return adminErrorResponse(res, error, "Die Verbindungstests konnten nicht ausgefuehrt werden.");
    } finally {
      conn.release();
    }
  });

  router.get("/admin/school-sources/:sourceId/classes-preview", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const sourceId = toPositiveInt(req.params.sourceId, "Schulserver-Quelle");
      const source = await ensureSchoolSourceExists(conn, sourceId);
      const hostname = normalizeSchoolSourceHost(source?.db_host).hostname;
      const databaseName = toRequiredText(source?.db_name, "Datenbank", 255);
      const username = String(source?.db_user || "").trim();
      const password = String(source?.db_password_enc || "");
      const encodedDbName = encodeURIComponent(databaseName);
      const payload = await fetchSchoolSourceRestJson(
        hostname,
        `/db/${encodedDbName}/schueler/aktuell`,
        { username, password },
      );

      res.json({
        success: true,
        source_id: sourceId,
        host: hostname,
        db_name: databaseName,
        payload,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message || "Klassenvorschau fehlgeschlagen." });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshots", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const termId = toPositiveInt(req.body?.term_id, "Schuljahr");
      const snapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      const snapshotInfo = toNullableText(req.body?.info, 100);
      const snapshotSource = snapshotInfo || "dashboard-snapshot-create";
      const schoolSnrs = Array.isArray(req.body?.school_snrs)
        ? req.body.school_snrs.map((value) => toRequiredText(value, "Schule", 6))
        : [];

      if (!schoolSnrs.length) {
        const error = new Error("Es wurden keine Schulen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      const term = await ensureTermExists(conn, termId);

      const uniqueSchoolSnrs = [...new Set(schoolSnrs)];
      const placeholders = uniqueSchoolSnrs.map(() => "?").join(", ");
      const [schools] = await conn.query(
        `
        SELECT snr, name
        FROM school
        WHERE snr IN (${placeholders})
        `,
        uniqueSchoolSnrs,
      );

      if ((schools || []).length !== uniqueSchoolSnrs.length) {
        const error = new Error("Mindestens eine Schule wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      const insertedSnapshotIds = [];
      await conn.beginTransaction();
      try {
        const runSnapId = await createSnapRun(conn, {
          termId,
          snapshotDate,
          source: snapshotSource,
          info: snapshotInfo,
          importedAt: null,
        });
        for (const schoolSnr of uniqueSchoolSnrs) {
          const [result] = await conn.query(
            `
            INSERT INTO snapshot (snap_id, snr, term_id, snapshot_date, info, source)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [runSnapId, schoolSnr, termId, snapshotDate, snapshotInfo, snapshotSource],
          );
          insertedSnapshotIds.push(Number(result?.insertId || 0));
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        if (Number(error?.errno || 0) === 1062) {
          const duplicateError = new Error("Snapshot schon vorhanden!");
          duplicateError.statusCode = 409;
          throw duplicateError;
        }
        throw error;
      }

      const createdSnapshots = await fetchAdminSnapshotsByIds(conn, insertedSnapshotIds);
      res.json({
        success: true,
        message: `Snapshot ${String(term?.label || termId).trim()} fuer ${createdSnapshots.length} Schule${createdSnapshots.length === 1 ? "" : "n"} angelegt.`,
        created_snapshots: createdSnapshots,
        bootstrap: await fetchAdminBootstrap(),
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Die Snapshots konnten nicht angelegt werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshots/check-existing", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const termId = toPositiveInt(req.body?.term_id, "Schuljahr");
      const schoolSnrs = Array.isArray(req.body?.school_snrs)
        ? req.body.school_snrs.map((value) => toRequiredText(value, "Schule", 6))
        : [];

      if (!schoolSnrs.length) {
        const error = new Error("Es wurden keine Schulen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      await ensureTermExists(conn, termId);

      const uniqueSchoolSnrs = [...new Set(schoolSnrs)];
      const placeholders = uniqueSchoolSnrs.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT snapshot_id, snr
        FROM snapshot sp
        WHERE sp.term_id = ?
          AND snr IN (${placeholders})
        `,
        [termId, ...uniqueSchoolSnrs],
      );

      const existingSchoolSnrs = [...new Set((rows || []).map((row) => String(row.snr || "").trim()).filter(Boolean))];

      res.json({
        exists: existingSchoolSnrs.length > 0,
        existing_school_snrs: existingSchoolSnrs,
        existing_count: existingSchoolSnrs.length,
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Der Snapshot-Existenzcheck konnte nicht ausgefuehrt werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshots/ensure", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const termId = toPositiveInt(req.body?.term_id, "Schuljahr");
      const snapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      const snapshotInfo = toNullableText(req.body?.info, 100);
      const snapshotSource = snapshotInfo || "dashboard-snapshot-sj-ensure";
      const schoolSnrs = Array.isArray(req.body?.school_snrs)
        ? req.body.school_snrs.map((value) => toRequiredText(value, "Schule", 6))
        : [];

      if (!schoolSnrs.length) {
        const error = new Error("Es wurden keine Schulen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      await ensureTermExists(conn, termId);

      const uniqueSchoolSnrs = [...new Set(schoolSnrs)];
      const placeholders = uniqueSchoolSnrs.map(() => "?").join(", ");
      const [schools] = await conn.query(
        `
        SELECT snr, name
        FROM school
        WHERE snr IN (${placeholders})
        `,
        uniqueSchoolSnrs,
      );

      if ((schools || []).length !== uniqueSchoolSnrs.length) {
        const error = new Error("Mindestens eine Schule wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      const [existingRows] = await conn.query(
        `
        SELECT snapshot_id, snap_id, snr
        FROM snapshot sp
        WHERE sp.term_id = ?
          AND sp.snapshot_date = ?
          AND COALESCE(sp.source, '') = ?
          AND snr IN (${placeholders})
        `,
        [termId, snapshotDate, snapshotSource, ...uniqueSchoolSnrs],
      );

      const existingSchoolSnrs = new Set(
        (existingRows || [])
          .map((row) => String(row.snr || "").trim())
          .filter(Boolean),
      );
      const existingSnapId = String((existingRows || []).find((row) => String(row.snap_id || "").trim())?.snap_id || "").trim();
      const missingSchoolSnrs = uniqueSchoolSnrs.filter((schoolSnr) => !existingSchoolSnrs.has(schoolSnr));

      const insertedSnapshotIds = [];
      await conn.beginTransaction();
      try {
        let runSnapId = existingSnapId;
        if (!runSnapId && missingSchoolSnrs.length) {
          runSnapId = await createSnapRun(conn, {
            termId,
            snapshotDate,
            source: snapshotSource,
            info: snapshotInfo,
            importedAt: null,
          });
        }
        for (const schoolSnr of missingSchoolSnrs) {
          const [result] = await conn.query(
            `
            INSERT INTO snapshot (snap_id, snr, term_id, snapshot_date, info, source)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [runSnapId, schoolSnr, termId, snapshotDate, snapshotInfo, snapshotSource],
          );
          insertedSnapshotIds.push(Number(result?.insertId || 0));
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        if (Number(error?.errno || 0) === 1062 || String(error?.code || "").toUpperCase() === "ER_DUP_ENTRY") {
          const duplicateError = new Error("Snapshot mit diesem Schuljahr, Datum und Quelle ist bereits vorhanden.");
          duplicateError.statusCode = 409;
          throw duplicateError;
        }
        throw error;
      }

      const createdSnapshots = await fetchAdminSnapshotsByIds(conn, insertedSnapshotIds);
      res.json({
        success: true,
        existed: existingSchoolSnrs.size > 0,
        existing_count: existingSchoolSnrs.size,
        created_count: createdSnapshots.length,
        created_snapshots: createdSnapshots,
        bootstrap: await fetchAdminBootstrap(),
        message: createdSnapshots.length
          ? `${createdSnapshots.length} fehlende Snapshot-Eintraege in Tabelle snapshot angelegt.`
          : "Alle Snapshot-Eintraege waren bereits vorhanden.",
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Die Snapshot-Eintraege konnten nicht ergänzt werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshots/schools", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const snapId = toRequiredSnapId(req.body?.snap_id);
      const schoolSnr = toRequiredText(req.body?.school_snr, "Schule", 6);

      await ensureSnapshotGroupExists(conn, snapId);
      await ensureSchoolExists(conn, schoolSnr);
      const snapshotTemplate = await fetchSnapshotGroupTemplate(conn, snapId);
      const templateSnapId = String(snapshotTemplate.snap_id || "").trim();
      if (!/^\d+$/.test(templateSnapId)) {
        const error = new Error("Der Snapshot-Stand hat keine gueltige snap_id.");
        error.statusCode = 500;
        throw error;
      }

      let insertedSnapshotId = 0;
      await conn.beginTransaction();
      try {
        const [result] = await conn.query(
            `
          INSERT INTO snapshot (snap_id, snr, term_id, snapshot_date, info, source)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            templateSnapId,
            schoolSnr,
            Number(snapshotTemplate.term_id || 0),
            String(snapshotTemplate.snapshot_date || "").trim(),
            toNullableText(snapshotTemplate.info, 100),
            toNullableText(snapshotTemplate.source, 255),
          ],
        );
        insertedSnapshotId = Number(result?.insertId || 0);
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        if (Number(error?.errno || 0) === 1062 || String(error?.code || "").toUpperCase() === "ER_DUP_ENTRY") {
          const duplicateError = new Error("Die Schule ist bereits in diesem Snapshot enthalten.");
          duplicateError.statusCode = 409;
          throw duplicateError;
        }
        throw error;
      }

      const createdSnapshots = await fetchAdminSnapshotsByIds(conn, [insertedSnapshotId]);
      res.json({
        success: true,
        created_snapshot: createdSnapshots[0] || null,
        bootstrap: await fetchAdminBootstrap(),
        message: "Schule in Snapshot aufgenommen.",
      });
    } catch (error) {
      return adminErrorResponse(res, error, "Die Schule konnte nicht in den Snapshot aufgenommen werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/admin/school-sources/students-preview", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      if (!sourceIds.length) {
        const error = new Error("Es wurden keine aktiven Schulserver-Quellen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      const uniqueSourceIds = [...new Set(sourceIds)];
      const placeholders = uniqueSourceIds.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT
          sd.source_id,
          sd.snr,
          sd.db_host,
          sd.db_name,
          sd.db_user,
          sd.db_password_enc,
          sd.is_active,
          s.snr,
          s.name AS school_name,
          s.school_form_id
        FROM school_source_db sd
        JOIN school s ON s.snr = sd.snr
        WHERE sd.source_id IN (${placeholders})
        ORDER BY s.city, s.name, s.snr
        `,
        uniqueSourceIds,
      );

      if ((rows || []).length !== uniqueSourceIds.length) {
        const error = new Error("Mindestens eine Schulserver-Quelle wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      const studentsBySource = await mapWithConcurrency(rows, async (row) => {
        const hostname = normalizeSchoolSourceHost(row?.db_host).hostname;
        const databaseName = toRequiredText(row?.db_name, "Datenbank", 255);
        const username = String(row?.db_user || "").trim();
        const password = String(row?.db_password_enc || "");
        const encodedDbName = encodeURIComponent(databaseName);

        const currentStudentsPayload = await fetchSchoolSourceRestJson(
          hostname,
          `/db/${encodedDbName}/schueler/aktuell`,
          { username, password },
        );
        const currentStudents = extractRestArray(currentStudentsPayload)
          .map((entry) => normalizeCurrentStudentEntry(entry))
          .filter(Boolean);

        const students = await mapWithConcurrency(currentStudents, async (student) => {
          const masterDataPayload = await fetchSchoolSourceRestJson(
            hostname,
            `/db/${encodedDbName}/schueler/${encodeURIComponent(student.id)}/stammdaten`,
            { username, password },
          );
          const masterData = normalizeStudentMasterData(masterDataPayload);
          return {
            snr: String(row.snr || "").trim(),
            id: student.id,
            nachname: student.nachname,
            vorname: student.vorname,
            jahrgang: student.jahrgang,
            geschlecht: masterData.geschlecht,
            religionID: masterData.religionID,
            migration: masterData.migration,
          };
        }, 10);

        return {
          source_id: Number(row.source_id || 0),
          snr: String(row.snr || "").trim(),
          school_name: toNullableText(row.school_name, 255),
          students,
        };
      }, 3);

      const students = studentsBySource.flatMap((entry) => entry.students || []);
      res.json({
        success: true,
        total_students: students.length,
        students,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshot-students/import", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const termId = toPositiveInt(req.body?.term_id, "Schuljahr");
      const snapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      if (!sourceIds.length) {
        const error = new Error("Es wurden keine aktiven Schulserver-Quellen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      await ensureTermExists(conn, termId);

      const uniqueSourceIds = [...new Set(sourceIds)];
      const placeholders = uniqueSourceIds.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT
          sd.source_id,
          sd.snr,
          sd.db_host,
          sd.db_name,
          sd.db_user,
          sd.db_password_enc,
          sd.is_active,
          s.snr,
          s.name AS school_name,
          s.school_form_id,
          sp.snapshot_id
        FROM school_source_db sd
        JOIN school s ON s.snr = sd.snr
        LEFT JOIN snapshot sp
          ON sp.snr = sd.snr
          AND sp.term_id = ?
          AND sp.snapshot_date = ?
        WHERE sd.source_id IN (${placeholders})
        ORDER BY s.city, s.name, s.snr
        `,
        [termId, snapshotDate, ...uniqueSourceIds],
      );

      if ((rows || []).length !== uniqueSourceIds.length) {
        const error = new Error("Mindestens eine Schulserver-Quelle wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      const missingSnapshot = (rows || []).find((row) => !Number(row?.snapshot_id || 0));
      if (missingSnapshot) {
        const error = new Error("Fuer mindestens eine Schule gibt es noch keinen Snapshot.");
        error.statusCode = 400;
        throw error;
      }

      const religionLookup = buildReferenceLookup(await loadReligionReferenceRows(conn), "religion_id", "asd", "name");
      const supportFocusLookup = buildReferenceLookup(await loadSupportFocusReferenceRows(conn), "support_focus_id", "asd", "name");
      const nationLookup = buildReferenceLookup(await loadNationReferenceRows(conn), "nation_id", "code", "label");
      const educationTrackLookup = buildReferenceLookup(await loadEducationTrackReferenceRows(conn), "education_track_id", "sf", "name");
      const schoolFormLookup = buildSchoolFormLookup(await loadSchoolFormReferenceRows(conn));
      const insertedRows = [];
      const preflightResults = [];

      for (const row of rows || []) {
        try {
          const result = await testSchoolSourceConnection(row);
          preflightResults.push({
            source_id: Number(row?.source_id || 0),
            snr: String(row?.snr || "").trim(),
            school_name: toNullableText(row?.school_name, 255),
            server_status: result.server_status,
            db_status: result.db_status,
            status: result.status_code,
            message: result.message,
          });
        } catch (error) {
          const schoolLabel = String(row?.school_name || row?.snr || "die Schule").trim();
          const authOrConnectionError = new Error(
            normalizeSchoolSourceRestError(error, String(row?.db_host || "").trim()) ||
            `Verbindungstest fehlgeschlagen fuer ${schoolLabel}.`,
          );
          authOrConnectionError.statusCode = Number(error?.statusCode || error?.responseStatus || 400);
          throw authOrConnectionError;
        }
      }

      await conn.beginTransaction();
      try {
        for (const row of rows || []) {
          const hostname = normalizeSchoolSourceHost(row?.db_host).hostname;
          const databaseName = toRequiredText(row?.db_name, "Datenbank", 255);
          const username = String(row?.db_user || "").trim();
          const password = String(row?.db_password_enc || "");
          const encodedDbName = encodeURIComponent(databaseName);

          const [currentStudentsPayload, classesPayload, yearGroupsPayload] = await Promise.all([
            fetchSchoolSourceRestJson(
              hostname,
              `/db/${encodedDbName}/schueler/aktuell`,
              { username, password },
            ),
            fetchSchoolSourceRestJson(
              hostname,
              `/db/${encodedDbName}/klassen/abschnitt/01/auswahlliste`,
              { username, password },
            ),
            fetchSchoolSourceRestJson(
              hostname,
              `/db/${encodedDbName}/jahrgaenge/jahrgangsdaten`,
              { username, password },
            ),
          ]);
          const yearGroupLookup = buildYearGroupLookup(normalizeYearGroupEntries(yearGroupsPayload));

          const classMap = await loadClassMapByCode(conn, extractRestArray(classesPayload), yearGroupLookup);

          const currentStudents = extractRestArray(currentStudentsPayload)
            .map((entry) => normalizeCurrentStudentEntry(entry))
            .filter(Boolean);

          for (const student of currentStudents) {
            if (!student.class_code) {
              const error = new Error(`Klasse fuer Schueler ${student.id} konnte nicht ermittelt werden.`);
              error.statusCode = 400;
              throw error;
            }

            const studentClassEntry = normalizeClassEntry({ kuerzel: student.class_code }, yearGroupLookup);
            const classId = resolveClassMapId(classMap, studentClassEntry);
            if (!classId) {
              const error = new Error(`Klasse ${student.class_code} ist nicht in der Tabelle class vorhanden.`);
              error.statusCode = 400;
              throw error;
            }

            const masterDataPayload = await fetchSchoolSourceRestJson(
              hostname,
              `/db/${encodedDbName}/schueler/${encodeURIComponent(student.id)}/stammdaten`,
              { username, password },
            );
            const masterData = normalizeStudentMasterData(masterDataPayload);
            if (!hasImportableStudentStatus(student.status, masterData.status)) {
              continue;
            }
            const sexId = resolveSexId(masterData.geschlecht);
            const religionId = resolveReligionId(religionMap, masterData.religionID);
            const migration = normalizeFlag(masterData.migration);

            await conn.query(
              `
              INSERT INTO snapshot_student (snapshot_id, student_no, class_id, religion_id, sex_id, migration)
              VALUES (?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                religion_id = VALUES(religion_id),
                sex_id = VALUES(sex_id),
                migration = VALUES(migration)
              `,
              [Number(row.snapshot_id || 0), student.id, classId, religionId, sexId, migration],
            );

            insertedRows.push({
              snapshot_id: Number(row.snapshot_id || 0),
              student_no: student.id,
              class_id: classId,
              religion_id: religionId,
              sex_id: sexId,
              migration,
              snr: String(row.snr || "").trim(),
            });
          }
        }

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }

      res.json({
        success: true,
        total_rows: insertedRows.length,
        rows: insertedRows,
        preflight_results: preflightResults,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshot-teachers/test-school-year", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const termId = toPositiveInt(req.body?.term_id, "Schuljahr");
      const snapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      if (!sourceIds.length) {
        return res.status(400).json({ error: "Es wurden keine aktiven Schulserver-Quellen uebergeben." });
      }

      const term = await ensureTermExists(conn, termId);
      const nationLookup = buildReferenceLookup(await loadNationReferenceRows(conn), "nation_id", "code", "label");
      const [sexRows] = await conn.query("SELECT sex_id, code, label FROM sex");
      const sexByCode = new Map();
      for (const s of sexRows) sexByCode.set(String(s.code).trim(), s.sex_id);

      function calculateAgeFromBirthdate(birthDateStr) {
        if (!birthDateStr) return 0;
        const birth = new Date(birthDateStr);
        if (isNaN(birth.getTime())) return 0;
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        return age;
      }

      const uniqueSourceIds = [...new Set(sourceIds)];
      const placeholders = uniqueSourceIds.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT sd.source_id, sd.snr, sd.db_host, sd.db_name, sd.db_user, sd.db_password_enc, s.name AS school_name
        FROM school_source_db sd
        JOIN school s ON s.snr = sd.snr
        WHERE sd.source_id IN (${placeholders})
        `,
        uniqueSourceIds
      );

      const results = [];
      for (const row of rows) {
        const hostname = normalizeSchoolSourceHost(row.db_host).hostname;
        const databaseName = row.db_name;
        const { username, password } = ensureSchoolSourceRestCredentials(row, row.school_name);
        const encodedDbName = encodeURIComponent(databaseName);

        // 1. Get Stammdaten for externalSectionId
        const schoolMetaPayload = await fetchSchoolSourceRestJson(
          hostname,
          `/db/${encodedDbName}/schule/stammdaten`,
          { username, password }
        );
        const externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaPayload), term);

        if (!externalSectionId) {
          results.push({ school_name: row.school_name, snr: row.snr, error: "Abschnitt-ID nicht gefunden." });
          continue;
        }

        // 1b. Fetch Cities (Orte) for mapping wohnortID
        const citiesPayload = await fetchSchoolSourceRestJson(
          hostname,
          `/db/${encodedDbName}/orte`,
          { username, password }
        );
        const rawCities = extractRestArray(citiesPayload);
        const cityMap = new Map();
        for (const c of rawCities) {
          const cId = String(c.id || "").trim();
          const cName = String(c.ortsname || c.bezeichnung || c.ort || c.name || "").trim();
          if (cId) cityMap.set(cId, cName);
        }

        // 2. Fetch Teachers from section list
        const teachersPayload = await fetchSchoolSourceRestJson(
          hostname,
          `/db/${encodedDbName}/lehrer/abschnitt/${externalSectionId}`,
          { username, password }
        );
        
        const rawTeachersList = extractRestArray(teachersPayload);
        const visibleTeachers = [];

        // 3. Fetch Master Data for each teacher in the list
        for (const teacherBrief of rawTeachersList) {
          const teacherId = teacherBrief.id;
          if (!teacherId) continue;

          try {
            const masterDataPayload = await fetchSchoolSourceRestJson(
              hostname,
              `/db/${encodedDbName}/lehrer/${encodeURIComponent(teacherId)}/stammdaten`,
              { username, password }
            );
            
            // Handle array or object payload
            const t = Array.isArray(masterDataPayload) ? masterDataPayload[0] : masterDataPayload;
            if (!t) continue;

            // Filter istSichtbar=true
            if (t.istSichtbar !== true && t.istSichtbar !== 1) continue;

            const age = calculateAgeFromBirthdate(t.geburtsdatum);
            const sexId = sexByCode.get(String(t.geschlecht || "").trim()) || 6;
            const nationId = nationLookup.byCode.get(String(t.staatsangehoerigkeitID ?? "").trim())?.internal_id || 207;
            const cityResolved = cityMap.get(String(t.wohnortID ?? "").trim()) || String(t.wohnort || t.ort || t.city || "").trim();

            visibleTeachers.push({
              id: t.id,
              vorname: t.vorname || "",
              nachname: t.nachname || "",
              kuerzel: t.kuerzel || "",
              geschlecht: t.geschlecht || "",
              geburtsdatum: t.geburtsdatum || "",
              staatsangehoerigkeit_id_raw: t.staatsangehoerigkeitID || "",
              wohnort_id_raw: t.wohnortID || "",
              geschlecht_id: sexId,
              nationalitaet_id: nationId,
              city: cityResolved,
              alter: age
            });
          } catch (err) {
            console.error(`Could not fetch master data for teacher ${teacherId}:`, err.message);
          }
        }

        results.push({
          school_name: row.school_name,
          snr: row.snr,
          abschnitt_id: externalSectionId,
          total_found: rawTeachersList.length,
          visible_count: visibleTeachers.length,
          teachers: visibleTeachers
        });
      }

      res.json({
        success: true,
        message: "Lehrerdaten-Vorschau geladen.",
        results
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshot-teachers/import-school-year", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      let endpointFetchDurationMs = 0;
      const fetchJson = async (hostname, pathname, options) => fetchSchoolSourceRestJson(hostname, pathname, options);
      const measureFetchWindow = async (work, onMeasured = null) => {
        const startedAt = Date.now();
        try {
          return await work();
        } finally {
          const durationMs = Date.now() - startedAt;
          endpointFetchDurationMs += durationMs;
          if (typeof onMeasured === "function") onMeasured(durationMs);
        }
      };
      const requestedSnapId = toNullableText(req.body?.snap_id, 30);
      let termId = 0;
      let effectiveSnapId = "";
      let fallbackSnapshotDate = "";
      if (requestedSnapId) {
        const snapshotTemplate = await fetchSnapshotGroupTemplate(conn, toRequiredSnapId(requestedSnapId));
        effectiveSnapId = String(snapshotTemplate.snap_id || "").trim();
        termId = Number(snapshotTemplate.term_id || 0);
      } else {
        termId = toPositiveInt(req.body?.term_id, "Schuljahr");
        fallbackSnapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      }
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      if (!sourceIds.length) {
        return res.status(400).json({ error: "Es wurden keine aktiven Schulserver-Quellen uebergeben." });
      }

      const term = await ensureTermExists(conn, termId);
      const nationLookup = buildReferenceLookup(await loadNationReferenceRows(conn), "nation_id", "code", "label");
      const [sexRows] = await conn.query("SELECT sex_id, code, label FROM sex");
      const sexByCode = new Map();
      for (const s of sexRows) sexByCode.set(String(s.code).trim(), s.sex_id);

      function calculateAgeFromBirthdate(birthDateStr) {
        if (!birthDateStr) return 0;
        const birth = new Date(birthDateStr);
        if (isNaN(birth.getTime())) return 0;
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        return age;
      }

      const uniqueSourceIds = [...new Set(sourceIds)];
      const placeholders = uniqueSourceIds.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT sd.source_id, sd.snr, sd.db_host, sd.db_name, sd.db_user, sd.db_password_enc, s.name AS school_name, sp.snapshot_id
        FROM school_source_db sd
        JOIN school s ON s.snr = sd.snr
        JOIN snapshot sp ON sp.snr = sd.snr
          AND (
            (? <> '' AND sp.snap_id = ?)
            OR
            (? = '' AND sp.term_id = ? AND sp.snapshot_date = ?)
          )
        WHERE sd.source_id IN (${placeholders})
        `,
        [
          effectiveSnapId,
          effectiveSnapId,
          effectiveSnapId,
          termId,
          fallbackSnapshotDate,
          ...uniqueSourceIds,
        ]
      );

      if ((rows || []).length === 0) {
        return res.status(400).json({ error: "Keine passenden Snapshots fuer den Import gefunden." });
      }

      updatePreviewSchoolYearProgress({
        active: true,
        action: "Lehrerdaten importieren.",
        completed_sources: 0,
        total_sources: rows.length,
        current_school: "",
        current_snr: "",
        abort_requested: false,
        was_aborted: false,
      });

      await conn.beginTransaction();
      let totalInserted = 0;
      const results = [];

      for (const [sourceIndex, row] of rows.entries()) {
        const schoolLabel = String(row?.school_name || row?.snr || "die Schule").trim();
        updatePreviewSchoolYearProgress({
          action: "Lehrerdaten importieren.",
          current_school: schoolLabel,
          current_snr: String(row?.snr || "").trim(),
          completed_sources: sourceIndex,
          total_sources: rows.length,
          was_aborted: false,
        });
        const snapshotId = Number(row.snapshot_id);
        const hostname = normalizeSchoolSourceHost(row.db_host).hostname;
        const databaseName = row.db_name;
        const { username, password } = ensureSchoolSourceRestCredentials(row, row.school_name);
        const encodedDbName = encodeURIComponent(databaseName);
        let schoolInserted = 0;
        let sourceFetchDurationMs = 0;

        // 1. Get Stammdaten for externalSectionId
        const schoolMetaPayload = await measureFetchWindow(
          () => fetchJson(
            hostname,
            `/db/${encodedDbName}/schule/stammdaten`,
            { username, password }
          ),
          (durationMs) => {
            sourceFetchDurationMs += durationMs;
          },
        );
        const externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaPayload), term);

        if (!externalSectionId) {
          results.push({
            school_name: row.school_name,
            snr: row.snr,
            imported_count: 0,
            import_duration_ms: sourceFetchDurationMs,
            error: "Abschnitt-ID nicht gefunden.",
          });
          updatePreviewSchoolYearProgress({
            action: "Lehrerdaten importieren.",
            current_school: schoolLabel,
            current_snr: String(row?.snr || "").trim(),
            completed_sources: sourceIndex + 1,
            total_sources: rows.length,
            was_aborted: false,
          });
          continue;
        }

        // 1b. Fetch Cities (Orte) for mapping wohnortID
        const citiesPayload = await measureFetchWindow(
          () => fetchJson(
            hostname,
            `/db/${encodedDbName}/orte`,
            { username, password }
          ),
          (durationMs) => {
            sourceFetchDurationMs += durationMs;
          },
        );
        const rawCities = extractRestArray(citiesPayload);
        const cityMap = new Map();
        for (const c of rawCities) {
          const cId = String(c.id || "").trim();
          const cName = String(c.ortsname || c.bezeichnung || c.ort || c.name || "").trim();
          if (cId) cityMap.set(cId, cName);
        }

        // 2. Fetch Teachers from section list
        const teachersPayload = await measureFetchWindow(
          () => fetchJson(
            hostname,
            `/db/${encodedDbName}/lehrer/abschnitt/${externalSectionId}`,
            { username, password }
          ),
          (durationMs) => {
            sourceFetchDurationMs += durationMs;
          },
        );
        
        const rawTeachersList = extractRestArray(teachersPayload);
        
        // 3. Clear existing teachers for this snapshot
        await conn.query("DELETE FROM snapshot_teacher WHERE snapshot_id = ?", [snapshotId]);

        // 4. Fetch detailed master data in parallel and insert afterwards
        let teacherCounter = 1;
        const teacherDetailConcurrency = 8;
        const preparedTeachers = await measureFetchWindow(
          () => mapWithConcurrency(rawTeachersList, async (teacherBrief) => {
            const teacherId = Number(teacherBrief?.id || 0);
            if (!teacherId) return null;

            try {
              const masterDataPayload = await fetchJson(
                hostname,
                `/db/${encodedDbName}/lehrer/${encodeURIComponent(teacherId)}/stammdaten`,
                { username, password }
              );
              
              const t = Array.isArray(masterDataPayload) ? masterDataPayload[0] : masterDataPayload;
              if (!t) return null;
              if (t.istSichtbar !== true && t.istSichtbar !== 1) return null;

              const sexId = sexByCode.get(String(t.geschlecht || "").trim()) || 6;
              const nationId = nationLookup.byCode.get(String(t.staatsangehoerigkeitID ?? "").trim())?.internal_id || 207;
              const age = calculateAgeFromBirthdate(t.geburtsdatum);
              const cityResolved = cityMap.get(String(t.wohnortID ?? "").trim()) || String(t.bezeichnung || t.wohnort || t.ort || t.city || "").trim();

              return {
                teacherId,
                sexId,
                nationId,
                cityResolved,
                age,
              };
            } catch (err) {
              console.error(`Could not import master data for teacher ${teacherId}:`, err.message);
              return null;
            }
          }, teacherDetailConcurrency),
          (durationMs) => {
            sourceFetchDurationMs += durationMs;
          },
        );

        for (const teacher of preparedTeachers) {
          if (!teacher) continue;
          await conn.query(
            "INSERT INTO snapshot_teacher (snapshot_id, teacher_no, sex_id, nation_id, city, age) VALUES (?, ?, ?, ?, ?, ?)",
            [snapshotId, teacherCounter++, teacher.sexId, teacher.nationId, teacher.cityResolved, teacher.age]
          );
          schoolInserted++;
        }
        totalInserted += schoolInserted;
        results.push({
          school_name: row.school_name,
          snr: row.snr,
          imported_count: schoolInserted,
          import_duration_ms: sourceFetchDurationMs,
        });
        updatePreviewSchoolYearProgress({
          action: "Lehrerdaten importieren.",
          current_school: schoolLabel,
          current_snr: String(row?.snr || "").trim(),
          completed_sources: sourceIndex + 1,
          total_sources: rows.length,
          was_aborted: false,
        });
      }

      await conn.commit();
      res.json({
        success: true,
        total_rows: totalInserted,
        total_sources: rows.length,
        duration_ms: endpointFetchDurationMs,
        results,
        message: `Import von ${totalInserted} Lehrer-Datensaetzen abgeschlossen.`
      });
    } catch (e) {
      if (conn) await conn.rollback();
      res.status(500).json({ error: e.message });
    } finally {
      resetPreviewSchoolYearProgress();
      if (conn) conn.release();
    }
  });

  router.post("/admin/snapshot-students/import-school-year", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      let endpointFetchDurationMs = 0;
      const fetchJson = async (hostname, pathname, options) => fetchSchoolSourceRestJson(hostname, pathname, options);
      const measureFetchWindow = async (work, onMeasured = null) => {
        const startedAt = Date.now();
        try {
          return await work();
        } finally {
          const durationMs = Date.now() - startedAt;
          endpointFetchDurationMs += durationMs;
          if (typeof onMeasured === "function") onMeasured(durationMs);
        }
      };
      const requestedSnapId = toNullableText(req.body?.snap_id, 30);
      let termId = 0;
      let effectiveSnapId = "";
      let snapshotDate = "";
      if (requestedSnapId) {
        const snapshotTemplate = await fetchSnapshotGroupTemplate(conn, toRequiredSnapId(requestedSnapId));
        effectiveSnapId = String(snapshotTemplate.snap_id || "").trim();
        termId = Number(snapshotTemplate.term_id || 0);
        snapshotDate = String(snapshotTemplate.snapshot_date || "").trim();
      } else {
        termId = toPositiveInt(req.body?.term_id, "Schuljahr");
        snapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      }
      const saveLog = toFlag(req.body?.save_log, 0) === 1;
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      if (!sourceIds.length) {
        const error = new Error("Es wurden keine aktiven Schulserver-Quellen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      const term = await ensureTermExists(conn, termId);

      const uniqueSourceIds = [...new Set(sourceIds)];
      const placeholders = uniqueSourceIds.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT
          sd.source_id,
          sd.snr,
          sd.db_host,
          sd.db_name,
          sd.db_user,
          sd.db_password_enc,
          sd.is_active,
          s.snr,
          s.name AS school_name,
          s.school_form_id,
          sp.snapshot_id
        FROM school_source_db sd
        JOIN school s ON s.snr = sd.snr
        LEFT JOIN snapshot sp
          ON sp.snr = sd.snr
          AND (
            (? <> '' AND sp.snap_id = ?)
            OR
            (? = '' AND sp.term_id = ? AND sp.snapshot_date = ?)
          )
        WHERE sd.source_id IN (${placeholders})
        ORDER BY s.city, s.name, s.snr
        `,
        [
          effectiveSnapId,
          effectiveSnapId,
          effectiveSnapId,
          termId,
          snapshotDate,
          ...uniqueSourceIds,
        ],
      );

      if ((rows || []).length !== uniqueSourceIds.length) {
        const error = new Error("Mindestens eine Schulserver-Quelle wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      const missingSnapshot = (rows || []).find((row) => !Number(row?.snapshot_id || 0));
      if (missingSnapshot) {
        const error = new Error("Fuer mindestens eine Schule gibt es noch keinen Snapshot.");
        error.statusCode = 400;
        throw error;
      }

      const religionLookup = buildReferenceLookup(await loadReligionReferenceRows(conn), "religion_id", "asd", "name");
      const supportFocusLookup = buildReferenceLookup(await loadSupportFocusReferenceRows(conn), "support_focus_id", "asd", "name");
      const nationLookup = buildReferenceLookup(await loadNationReferenceRows(conn), "nation_id", "code", "label");
      const educationTrackLookup = buildReferenceLookup(await loadEducationTrackReferenceRows(conn), "education_track_id", "sf", "name");
      const schoolFormLookup = buildSchoolFormLookup(await loadSchoolFormReferenceRows(conn));
      const selectedTermLabel = toSchoolYearLabel(term.school_year, term.term_no);
      const currentSchoolYearLabel = getCurrentSchoolYearLabel();
      const allowedStatuses = selectedTermLabel === currentSchoolYearLabel
        ? new Set([2, 6])
        : new Set([2, 6, 8, 9]);
      const totalStatusCounts = new Map();
      const insertedRows = [];
      const sourceSummaries = [];
      let deletedRows = 0;
      let importAborted = false;

      updatePreviewSchoolYearProgress({
        active: true,
        action: "Schuelerdaten werden importiert...",
        completed_sources: 0,
        total_sources: rows.length,
        current_school: "",
        current_snr: "",
        abort_requested: false,
        was_aborted: false,
      });

      await conn.beginTransaction();
      try {
        for (const [sourceIndex, row] of (rows || []).entries()) {
          const sourceImportStartedAt = Date.now();
          let sourceFetchDurationMs = 0;
          const schoolLabel = String(row?.school_name || row?.snr || "die Schule").trim();
          updatePreviewSchoolYearProgress({
            action: previewSchoolYearProgress.abort_requested
              ? "Import wird nach aktueller Schule abgebrochen..."
              : "Schuelerdaten werden importiert...",
            current_school: schoolLabel,
            current_snr: String(row?.snr || "").trim(),
            completed_sources: sourceIndex,
            total_sources: rows.length,
            was_aborted: false,
          });

          const snapshotId = Number(row.snapshot_id || 0);
          const [deleteResult] = await conn.query(
            "DELETE FROM snapshot_student WHERE snapshot_id = ?",
            [snapshotId],
          );
          const deletedStudentsForSource = Number(deleteResult?.affectedRows || 0);
          deletedRows += deletedStudentsForSource;

          const hostname = normalizeSchoolSourceHost(row?.db_host).hostname;
          const databaseName = toRequiredText(row?.db_name, "Datenbank", 255);
          const { username, password } = ensureSchoolSourceRestCredentials(row, schoolLabel);
          const encodedDbName = encodeURIComponent(databaseName);

          let religionPayload;
          let supportFocusPayload;
          let yearGroupsPayload;
          try {
            [religionPayload, supportFocusPayload, yearGroupsPayload] = await measureFetchWindow(
              () => Promise.all([
                fetchJson(
                  hostname,
                  `/db/${encodedDbName}/schule/religionen`,
                  { username, password },
                ),
                fetchJson(
                  hostname,
                  `/db/${encodedDbName}/foerderschwerpunkte`,
                  { username, password },
                ),
                fetchJson(
                  hostname,
                  `/db/${encodedDbName}/jahrgaenge/jahrgangsdaten`,
                  { username, password },
                ),
              ]),
              (durationMs) => {
                sourceFetchDurationMs += durationMs;
              },
            );
          } catch (error) {
            if (Number(error?.responseStatus || 0) === 401) {
              const authError = new Error(`DB-Login fehlerhaft fuer ${schoolLabel}. Bitte DB-Benutzer und Passwort in school_source_db pruefen.`);
              authError.statusCode = 401;
              throw authError;
            }
            throw error;
          }
          const externalReligionEntries = normalizeExternalReferenceEntries(religionPayload);
          const externalSupportFocusEntries = normalizeExternalReferenceEntries(supportFocusPayload);
          const religionMap = buildExternalReferenceMap(externalReligionEntries, religionLookup);
          const supportFocusMap = buildExternalReferenceMap(externalSupportFocusEntries, supportFocusLookup);
          const schoolMetaPayload = await measureFetchWindow(
            () => fetchJson(
              hostname,
              `/db/${encodedDbName}/schule/stammdaten`,
              { username, password },
            ),
            (durationMs) => {
              sourceFetchDurationMs += durationMs;
            },
          );
          const externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaPayload), term);
          if (!externalSectionId) {
            sourceSummaries.push({
              source_id: Number(row.source_id || 0),
              school_name: toNullableText(row.school_name, 255),
              snr: String(row.snr || "").trim(),
              db_name: databaseName,
              external_section_id: 0,
              deleted_students: deletedStudentsForSource,
              imported_students: 0,
              import_duration_ms: sourceFetchDurationMs,
              status_counts: [],
              students: [],
              error: `Kein externer Abschnitt fuer ${toSchoolYearLabel(term.school_year, term.term_no)} gefunden. Schule wurde uebersprungen.`,
            });
            continue;
          }
          const yearGroupLookup = buildYearGroupLookup(normalizeYearGroupEntries(yearGroupsPayload));
          const insertedBefore = insertedRows.length;
          const studentDetails = [];
          const sourceStatusCounts = new Map();

          const selectionPayload = await measureFetchWindow(
            () => fetchJson(
              hostname,
              `/db/${encodedDbName}/schueler/abschnitt/${encodeURIComponent(String(externalSectionId))}/auswahlliste`,
              { username, password },
            ),
            (durationMs) => {
              sourceFetchDurationMs += durationMs;
            },
          );
          const selectionClasses = extractSelectionClasses(selectionPayload, externalSectionId);
          const selectionClassMeta = buildSelectionClassMetaLookup(selectionClasses, yearGroupLookup);
          const selectionStudents = extractSelectionStudents(selectionPayload)
            .filter((student) => {
              const studentSectionId = Number(student?.section_id || 0);
              return studentSectionId > 0 && studentSectionId === Number(externalSectionId || 0);
            })
            .sort((a, b) => {
              const classCompare = String(a?.class_code || "").localeCompare(String(b?.class_code || ""), "de", { numeric: true });
              if (classCompare !== 0) return classCompare;
              const lastNameCompare = String(a?.nachname || "").localeCompare(String(b?.nachname || ""), "de", { numeric: true });
              if (lastNameCompare !== 0) return lastNameCompare;
              const firstNameCompare = String(a?.vorname || "").localeCompare(String(b?.vorname || ""), "de", { numeric: true });
              if (firstNameCompare !== 0) return firstNameCompare;
              return Number(a?.id || 0) - Number(b?.id || 0);
            });
          const classMap = await loadClassMapByCode(
            conn,
            selectionClasses,
            yearGroupLookup,
          );
          const eligibleStudents = selectionStudents
            .map((student) => ({
              student,
              studentId: Number(student?.id || 0),
              resolvedStatus: resolveStudentStatus(student?.status),
            }))
            .filter((entry) => entry.studentId > 0 && allowedStatuses.has(entry.resolvedStatus));
          await ensureClassMapEntries(
            conn,
            classMap,
            selectionClasses,
            yearGroupLookup,
          );
          const studentDetailConcurrency = 8;

          const preparedStudents = await measureFetchWindow(
            () => mapWithConcurrency(eligibleStudents, async (entry) => {
              const { student, studentId, resolvedStatus } = entry;
              const normalizedClass = selectionClassMeta.byId.get(String(student?.class_id || ""))
                || selectionClassMeta.byCode.get(buildClassCodeLookupKey(student?.class_code))
                || normalizeClassEntry({
                  kuerzel: student?.class_code,
                  jahrgang: student?.jahrgang,
                }, yearGroupLookup);
              if (!normalizedClass?.class_code) {
                const error = new Error(`Klasse fuer Schueler ${studentId} konnte nicht ermittelt werden.`);
                error.statusCode = 400;
                throw error;
              }
              const classId = resolveClassMapId(classMap, normalizedClass);
              if (!classId) {
                const error = new Error(`Klasse ${normalizedClass.class_code} (${normalizedClass.grade}${normalizedClass.parallel}) konnte nicht angelegt werden.`);
                error.statusCode = 400;
                throw error;
              }

              let masterDataPayload;
              let learningSectionPayload;
              try {
                [masterDataPayload, learningSectionPayload] = await Promise.all([
                  fetchJson(
                    hostname,
                    `/db/${encodedDbName}/schueler/${encodeURIComponent(studentId)}/stammdaten`,
                    { username, password },
                  ),
                  fetchJson(
                    hostname,
                    `/db/${encodedDbName}/schueler/${encodeURIComponent(studentId)}/abschnitt/${encodeURIComponent(String(externalSectionId))}/lernabschnittsdaten`,
                    { username, password },
                  ),
                ]);
              } catch (error) {
                if (Number(error?.responseStatus || 0) === 401) {
                  const authError = new Error(`DB-Login fehlerhaft fuer ${schoolLabel}. Bitte DB-Benutzer und Passwort in school_source_db pruefen.`);
                  authError.statusCode = 401;
                  throw authError;
                }
                throw error;
              }

              const masterData = normalizeStudentMasterData(masterDataPayload);
              const learningSection = normalizeStudentLearningSectionData(learningSectionPayload);
              const sexId = resolveSexId(masterData.geschlecht);
              const religionId = resolveMappedReference(religionMap, masterData.religionID)?.internal_id || null;
              const supportFocus1Id = resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt1ID)?.internal_id || null;
              const supportFocus2Id = resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt2ID)?.internal_id || null;
              const schoolDefaultFormId = Number(row.school_form_id || 0) || null;
              const nationId = nationLookup.byCode.get(String(masterData.staatsangehoerigkeitID ?? "").trim())?.internal_id || null;
              const schoolStructure = String(learningSection.schulgliederung ?? "").trim();
              const schoolFormId = resolveStudentSchoolFormId(schoolFormLookup, schoolDefaultFormId, schoolStructure);
              const educationTrackId = schoolStructure === "***"
                ? schoolDefaultFormId
                : (educationTrackLookup.byCode.get(schoolStructure)?.internal_id || null);
              const migration = normalizeFlag(masterData.migration);
              const ef = resolveEfFlag(learningSection.klassenart);
              const targetDifferent = normalizeFlag(learningSection.hatZieldifferentenUnterricht);
              const specialNeeds = supportFocus1Id || supportFocus2Id ? 1 : 0;

              return {
                studentId,
                resolvedStatus,
                normalizedClass,
                classId,
                masterData,
                learningSection,
                mapped: {
                  schoolFormId,
                  educationTrackId,
                  religionId,
                  sexId,
                  nationId,
                  migration,
                  ef,
                  specialNeeds,
                  supportFocus1Id,
                  supportFocus2Id,
                  targetDifferent,
                },
              };
            }, studentDetailConcurrency),
            (durationMs) => {
              sourceFetchDurationMs += durationMs;
            },
          );

          for (const prepared of preparedStudents) {
            const {
              studentId,
              resolvedStatus,
              normalizedClass,
              classId,
              masterData,
              learningSection,
              mapped,
            } = prepared;
            const statusKey = String(resolvedStatus ?? "-").trim() || "-";
            sourceStatusCounts.set(statusKey, Number(sourceStatusCounts.get(statusKey) || 0) + 1);
            totalStatusCounts.set(statusKey, Number(totalStatusCounts.get(statusKey) || 0) + 1);

            await conn.query(
              `
              INSERT INTO snapshot_student (
                snapshot_id, student_no, class_id, school_form_id, education_track_id,
                religion_id, sex_id, nation_id, migration,
                ef, special_needs, support_focus1_id, support_focus2_id, target_different
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                school_form_id = VALUES(school_form_id),
                education_track_id = VALUES(education_track_id),
                religion_id = VALUES(religion_id),
                sex_id = VALUES(sex_id),
                nation_id = VALUES(nation_id),
                migration = VALUES(migration),
                ef = VALUES(ef),
                special_needs = VALUES(special_needs),
                support_focus1_id = VALUES(support_focus1_id),
                support_focus2_id = VALUES(support_focus2_id),
                target_different = VALUES(target_different)
              `,
              [
                snapshotId,
                studentId,
                classId,
                mapped.schoolFormId,
                mapped.educationTrackId,
                mapped.religionId,
                mapped.sexId,
                mapped.nationId,
                mapped.migration,
                mapped.ef,
                mapped.specialNeeds,
                mapped.supportFocus1Id,
                mapped.supportFocus2Id,
                mapped.targetDifferent,
              ],
            );

            insertedRows.push({
              snapshot_id: snapshotId,
              student_no: studentId,
              class_id: classId,
              school_form_id: mapped.schoolFormId,
              education_track_id: mapped.educationTrackId,
              religion_id: mapped.religionId,
              sex_id: mapped.sexId,
              nation_id: mapped.nationId,
              migration: mapped.migration,
              ef: mapped.ef,
              special_needs: mapped.specialNeeds,
              support_focus1_id: mapped.supportFocus1Id,
              support_focus2_id: mapped.supportFocus2Id,
              target_different: mapped.targetDifferent,
              snr: String(row.snr || "").trim(),
              external_section_id: externalSectionId,
            });

            studentDetails.push({
              row_no: studentDetails.length + 1,
              student_no: studentId,
              nachname: String(masterData.nachname || "").trim(),
              vorname: String(masterData.vorname || "").trim(),
              jahrgang: String(normalizedClass.grade || "").trim(),
              geschlecht: String(masterData.geschlecht || "").trim(),
              schulgliederung: String(learningSection.schulgliederung || "").trim(),
              religionID: masterData.religionID ?? null,
              migration: masterData.migration ?? null,
              staatsangehoerigkeit: masterData.staatsangehoerigkeitID ?? null,
              foerderschwerpunkt1ID: learningSection.foerderschwerpunkt1ID ?? null,
              foerderschwerpunkt2ID: learningSection.foerderschwerpunkt2ID ?? null,
              hatZieldifferentenUnterricht: learningSection.hatZieldifferentenUnterricht ?? null,
              klassenart: learningSection.klassenart ?? null,
              full_name: `${String(masterData.nachname || "").trim()}, ${String(masterData.vorname || "").trim()}`.replace(/^,\s*|,\s*$/g, ""),
              class_code: normalizedClass.class_code,
              status: resolvedStatus,
              counted: true,
              ef: mapped.ef,
              source: {
                class_code: normalizedClass.class_code,
                grade: normalizedClass.grade,
                geschlecht: masterData.geschlecht,
                klassenart: toNullableText(learningSection.klassenart, 50),
                schulgliederung: toNullableText(learningSection.schulgliederung, 50),
                fehlstunden_gesamt: learningSection.fehlstundenGesamt,
                migration: mapped.migration,
                target_different: mapped.targetDifferent,
                religion: {
                  external_id: String(masterData.religionID ?? "").trim(),
                  religion_id: mapped.religionId,
                  name: resolveMappedReference(religionMap, masterData.religionID)?.internal_label || null,
                  asd: resolveMappedReference(religionMap, masterData.religionID)?.internal_code || null,
                },
                nation: {
                  external_id: String(masterData.staatsangehoerigkeitID ?? "").trim(),
                  nation_id: mapped.nationId,
                  label: nationLookup.byCode.get(String(masterData.staatsangehoerigkeitID ?? "").trim())?.label || null,
                  code: nationLookup.byCode.get(String(masterData.staatsangehoerigkeitID ?? "").trim())?.code || null,
                },
                support_focus1: {
                  external_id: String(learningSection.foerderschwerpunkt1ID ?? "").trim(),
                  support_focus_id: mapped.supportFocus1Id,
                  name: resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt1ID)?.internal_label || null,
                  asd: resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt1ID)?.internal_code || null,
                },
                support_focus2: {
                  external_id: String(learningSection.foerderschwerpunkt2ID ?? "").trim(),
                  support_focus_id: mapped.supportFocus2Id,
                  name: resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt2ID)?.internal_label || null,
                  asd: resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt2ID)?.internal_code || null,
                },
              },
              target: {
                snapshot_id: snapshotId,
                class_id: classId,
                class_code: normalizedClass.class_code,
                school_form_id: mapped.schoolFormId,
                education_track_id: mapped.educationTrackId,
                sex_id: mapped.sexId,
                religion_id: mapped.religionId,
                nation_id: mapped.nationId,
                ef: mapped.ef,
                special_needs: mapped.specialNeeds,
                support_focus1_id: mapped.supportFocus1Id,
                support_focus2_id: mapped.supportFocus2Id,
                target_different: mapped.targetDifferent,
                migration: mapped.migration,
              },
            });
          }

          sourceSummaries.push({
            source_id: Number(row.source_id || 0),
            school_name: toNullableText(row.school_name, 255),
            snr: String(row.snr || "").trim(),
            db_name: databaseName,
            external_section_id: externalSectionId,
            deleted_students: deletedStudentsForSource,
            imported_students: insertedRows.length - insertedBefore,
            import_duration_ms: sourceFetchDurationMs,
            status_counts: [...sourceStatusCounts.entries()]
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([status, count]) => ({ status, count })),
            students: studentDetails,
          });

          const abortRequested = !!previewSchoolYearProgress.abort_requested;
          updatePreviewSchoolYearProgress({
            action: abortRequested
              ? "Import wird nach aktueller Schule abgebrochen..."
              : "Schuelerdaten werden importiert...",
            current_school: schoolLabel,
            current_snr: String(row?.snr || "").trim(),
            completed_sources: sourceIndex + 1,
            total_sources: rows.length,
            was_aborted: abortRequested,
          });
          if (abortRequested) {
            importAborted = true;
            break;
          }
        }

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      }

      const termLabel = toSchoolYearLabel(term.school_year, term.term_no);
      const logFiles = [];
      if (saveLog && sourceSummaries.length) {
        const logDir = ensureImportPreviewLogDir();
        const timestamp = formatLogTimestamp(new Date());
        const fileName = `${timestamp.datePart}-${timestamp.timePart}-snapshot-import.txt`;
        const filePath = path.join(logDir, fileName);
        fs.writeFileSync(filePath, buildImportBatchLog(sourceSummaries, termLabel, snapshotDate), "utf8");
        logFiles.push({
          snr: "batch",
          path: filePath,
          file_name: fileName,
        });
      }

      res.json({
        success: true,
        duration_ms: endpointFetchDurationMs,
        aborted: importAborted,
        deleted_rows: deletedRows,
        total_rows: insertedRows.length,
        total_sources: sourceSummaries.length,
        counted_statuses: [...allowedStatuses],
        status_totals: [...totalStatusCounts.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([status, count]) => ({ status, count })),
        log_saved: saveLog,
        log_directory: saveLog ? ensureImportPreviewLogDir() : "",
        log_files: logFiles,
        sources: sourceSummaries,
        rows: insertedRows,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshot-students/preview-school-year", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const termId = toPositiveInt(req.body?.term_id, "Schuljahr");
      const snapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      const saveLog = toFlag(req.body?.save_log, 0) === 1;
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      if (!sourceIds.length) {
        const error = new Error("Es wurden keine aktiven Schulserver-Quellen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      const term = await ensureTermExists(conn, termId);
      const uniqueSourceIds = [...new Set(sourceIds)];
      const placeholders = uniqueSourceIds.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT
          sd.source_id,
          sd.snr,
          sd.db_host,
          sd.db_name,
          sd.db_user,
          sd.db_password_enc,
          sd.is_active,
          s.snr,
          s.name AS school_name,
          s.school_form_id
        FROM school_source_db sd
        JOIN school s ON s.snr = sd.snr
        WHERE sd.source_id IN (${placeholders})
        ORDER BY s.city, s.name, s.snr
        `,
        uniqueSourceIds,
      );

      if ((rows || []).length !== uniqueSourceIds.length) {
        const error = new Error("Mindestens eine Schulserver-Quelle wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      const religionLookup = buildReferenceLookup(await loadReligionReferenceRows(conn), "religion_id", "asd", "name");
      const supportFocusLookup = buildReferenceLookup(await loadSupportFocusReferenceRows(conn), "support_focus_id", "asd", "name");
      const nationLookup = buildReferenceLookup(await loadNationReferenceRows(conn), "nation_id", "code", "label");
      const educationTrackLookup = buildReferenceLookup(await loadEducationTrackReferenceRows(conn), "education_track_id", "sf", "name");
      const schoolFormLookup = buildSchoolFormLookup(await loadSchoolFormReferenceRows(conn));
      const sources = [];
      updatePreviewSchoolYearProgress({
        active: true,
        action: "Import-Vorschau wird geladen...",
        completed_sources: 0,
        total_sources: rows.length,
        current_school: "",
        current_snr: "",
      });

      for (const [sourceIndex, row] of (rows || []).entries()) {
        const hostname = normalizeSchoolSourceHost(row?.db_host).hostname;
        const databaseName = toRequiredText(row?.db_name, "Datenbank", 255);
        const schoolLabel = String(row?.school_name || row?.snr || "die Schule").trim();
        updatePreviewSchoolYearProgress({
          action: "Import-Vorschau wird geladen...",
          current_school: schoolLabel,
          current_snr: String(row?.snr || "").trim(),
          completed_sources: sourceIndex,
          total_sources: rows.length,
        });
        const { username, password } = ensureSchoolSourceRestCredentials(row, schoolLabel);
        const encodedDbName = encodeURIComponent(databaseName);

        const [
          religionPayload,
          supportFocusPayload,
          schoolMetaPayload,
          yearGroupsPayload,
        ] = await Promise.all([
          fetchSchoolSourceRestJson(
            hostname,
            `/db/${encodedDbName}/schule/religionen`,
            { username, password },
          ),
          fetchSchoolSourceRestJson(
            hostname,
            `/db/${encodedDbName}/foerderschwerpunkte`,
            { username, password },
          ),
          fetchSchoolSourceRestJson(
            hostname,
            `/db/${encodedDbName}/schule/stammdaten`,
            { username, password },
          ),
          fetchSchoolSourceRestJson(
            hostname,
            `/db/${encodedDbName}/jahrgaenge/jahrgangsdaten`,
            { username, password },
          ),
        ]);

        const externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaPayload), term);
        if (!externalSectionId) {
          const error = new Error(
            `Fuer ${schoolLabel} konnte kein externer Abschnitt fuer ${toSchoolYearLabel(term.school_year, term.term_no)} gefunden werden.`,
          );
          error.statusCode = 400;
          throw error;
        }

        const externalReligionEntries = normalizeExternalReferenceEntries(religionPayload);
        const externalSupportFocusEntries = normalizeExternalReferenceEntries(supportFocusPayload);
        const religionMap = buildExternalReferenceMap(externalReligionEntries, religionLookup);
        const supportFocusMap = buildExternalReferenceMap(externalSupportFocusEntries, supportFocusLookup);
        const yearGroupLookup = buildYearGroupLookup(normalizeYearGroupEntries(yearGroupsPayload));

        const classesPayload = await fetchSchoolSourceRestJson(
          hostname,
          `/db/${encodedDbName}/klassen/abschnitt/${encodeURIComponent(String(externalSectionId))}/auswahlliste`,
          { username, password },
        );
        const classEntries = extractRestArray(classesPayload);
        const classes = [];
        const students = [];

        for (const classEntry of classEntries) {
          const normalizedClass = normalizeClassEntry(classEntry, yearGroupLookup);
          if (!normalizedClass?.class_code) continue;

          classes.push({
            class_code: normalizedClass.class_code,
            grade: normalizedClass.grade,
            parallel: normalizedClass.parallel,
          });

          for (const studentEntry of extractStudentsFromClassEntry(classEntry)) {
            const studentId = Number(studentEntry?.id || 0);
            if (!studentId) continue;
            const [masterDataPayload, learningSectionPayload] = await Promise.all([
              fetchSchoolSourceRestJson(
                hostname,
                `/db/${encodedDbName}/schueler/${encodeURIComponent(studentId)}/stammdaten`,
                { username, password },
              ),
              fetchSchoolSourceRestJson(
                hostname,
                `/db/${encodedDbName}/schueler/${encodeURIComponent(studentId)}/abschnitt/${encodeURIComponent(String(externalSectionId))}/lernabschnittsdaten`,
                { username, password },
              ),
            ]);

            const masterData = normalizeStudentMasterData(masterDataPayload);
            const learningSection = normalizeStudentLearningSectionData(learningSectionPayload);
            if (!hasImportableStudentStatus(studentEntry?.status, learningSection.status, masterData.status)) {
              continue;
            }
            const mappedReligion = resolveMappedReference(religionMap, masterData.religionID);
            const mappedNation = nationLookup.byCode.get(String(masterData.staatsangehoerigkeitID ?? "").trim()) || null;
            const mappedFocus1 = resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt1ID);
            const mappedFocus2 = resolveMappedReference(supportFocusMap, learningSection.foerderschwerpunkt2ID);
            const sexId = resolveSexId(masterData.geschlecht);
            const schoolDefaultFormId = Number(row.school_form_id || 0) || null;
            const schoolStructure = String(learningSection.schulgliederung ?? "").trim();
            const schoolFormId = resolveStudentSchoolFormId(schoolFormLookup, schoolDefaultFormId, schoolStructure);
            const educationTrackId = schoolStructure === "***"
              ? schoolDefaultFormId
              : (educationTrackLookup.byCode.get(schoolStructure)?.internal_id || null);
            const hasSpecialNeeds = Boolean(
              String(learningSection.foerderschwerpunkt1ID ?? "").trim() ||
              String(learningSection.foerderschwerpunkt2ID ?? "").trim(),
            );
            students.push({
              source_id: Number(row.source_id || 0),
              school_name: toNullableText(row.school_name, 255),
              snr: String(row.snr || "").trim(),
              snapshot_date: snapshotDate,
              term_label: toSchoolYearLabel(term.school_year, term.term_no),
              external_section_id: externalSectionId,
              student_no: Number(masterData.studentId || studentId || 0),
              nachname: String(masterData.nachname || "").trim(),
              vorname: String(masterData.vorname || "").trim(),
              full_name: `${String(masterData.nachname || "").trim()}, ${String(masterData.vorname || "").trim()}`.replace(/^,\s*|,\s*$/g, ""),
              class_code: normalizedClass.class_code,
              grade: normalizedClass.grade,
              migration: normalizeFlag(masterData.migration),
              geschlecht: masterData.geschlecht,
              religion: {
                external_id: String(masterData.religionID ?? "").trim(),
                external_entry: externalReligionEntries.find((entry) => entry.external_id === String(masterData.religionID ?? "").trim()) || null,
                religion_id: mappedReligion?.internal_id || null,
                name: mappedReligion?.internal_label || null,
                asd: mappedReligion?.internal_code || null,
              },
              nation: {
                external_id: String(masterData.staatsangehoerigkeitID ?? "").trim(),
                external_entry: null,
                nation_id: mappedNation?.internal_id || null,
                label: mappedNation?.label || null,
                code: mappedNation?.code || null,
              },
              ef: resolveEfFlag(learningSection.klassenart),
              klassenart: toNullableText(learningSection.klassenart, 50),
              schulgliederung: toNullableText(learningSection.schulgliederung, 50),
              fehlstunden_gesamt: learningSection.fehlstundenGesamt,
              sex_id: sexId,
              school_form_id: schoolFormId,
              education_track_id: educationTrackId,
              lernabschnittsdaten_raw: Array.isArray(learningSectionPayload)
                ? learningSectionPayload[0] || {}
                : learningSectionPayload || {},
              special_needs: hasSpecialNeeds ? 1 : 0,
              target_different: normalizeFlag(learningSection.hatZieldifferentenUnterricht),
              support_focus1: {
                external_id: String(learningSection.foerderschwerpunkt1ID ?? "").trim(),
                external_entry: externalSupportFocusEntries.find((entry) => entry.external_id === String(learningSection.foerderschwerpunkt1ID ?? "").trim()) || null,
                support_focus_id: mappedFocus1?.internal_id || null,
                name: mappedFocus1?.internal_label || null,
                asd: mappedFocus1?.internal_code || null,
              },
              support_focus2: {
                external_id: String(learningSection.foerderschwerpunkt2ID ?? "").trim(),
                external_entry: externalSupportFocusEntries.find((entry) => entry.external_id === String(learningSection.foerderschwerpunkt2ID ?? "").trim()) || null,
                support_focus_id: mappedFocus2?.internal_id || null,
                name: mappedFocus2?.internal_label || null,
                asd: mappedFocus2?.internal_code || null,
              },
            });
          }
        }

        sources.push({
          source_id: Number(row.source_id || 0),
          school_name: toNullableText(row.school_name, 255),
          snr: String(row.snr || "").trim(),
          db_name: databaseName,
          external_section_id: externalSectionId,
          classes,
          total_classes: classes.length,
          total_students: students.length,
          students,
          mappings: {
            religions: {
              external_total: externalReligionEntries.length,
              mapped_total: religionMap.size,
              entries: externalReligionEntries.map((entry) => ({
                ...entry,
                mapped: religionMap.get(entry.external_id) || null,
              })),
            },
            support_focuses: {
              external_total: externalSupportFocusEntries.length,
              mapped_total: supportFocusMap.size,
              entries: externalSupportFocusEntries.map((entry) => ({
                ...entry,
                mapped: supportFocusMap.get(entry.external_id) || null,
              })),
            },
          },
        });
        updatePreviewSchoolYearProgress({
          action: "Import-Vorschau wird geladen...",
          current_school: schoolLabel,
          current_snr: String(row?.snr || "").trim(),
          completed_sources: sourceIndex + 1,
          total_sources: rows.length,
        });
      }

      const termLabel = toSchoolYearLabel(term.school_year, term.term_no);
      const logFiles = [];
      if (saveLog && sources.length) {
        const logDir = ensureImportPreviewLogDir();
        const timestamp = formatLogTimestamp(new Date());
        for (const source of sources) {
          const fileName = `${timestamp.datePart}-${timestamp.timePart}-${sanitizeFilePart(source?.snr, "school")}.txt`;
          const filePath = path.join(logDir, fileName);
          fs.writeFileSync(filePath, buildSchoolPreviewLog(source, termLabel, snapshotDate), "utf8");
          logFiles.push({
            snr: String(source?.snr || "").trim(),
            path: filePath,
            file_name: fileName,
          });
        }
      }

      res.json({
        success: true,
        duration_ms: endpointFetchDurationMs,
        snapshot_date: snapshotDate,
        term: {
          term_id: Number(term.term_id || 0),
          school_year: Number(term.school_year || 0),
          term_no: Number(term.term_no || 0),
          label: toSchoolYearLabel(term.school_year, term.term_no),
        },
        total_sources: sources.length,
        total_students: sources.reduce((sum, source) => sum + Number(source.total_students || 0), 0),
        log_saved: saveLog,
        log_directory: saveLog ? ensureImportPreviewLogDir() : "",
        log_files: logFiles,
        sources,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error),
      });
    } finally {
      resetPreviewSchoolYearProgress();
      conn.release();
    }
  });

  router.delete("/admin/snapshot-students/preview-school-year/logs", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const result = deleteImportPreviewLogs();
      return res.json({
        success: true,
        log_directory: result.logDir,
        deleted_count: result.deletedCount,
        message: result.deletedCount
          ? `${result.deletedCount} Log-Datei(en) geloescht.`
          : "Keine Log-Dateien zum Loeschen gefunden.",
      });
    } catch (error) {
      return res.status(400).json({
        error: error?.message || "Die Log-Dateien konnten nicht geloescht werden.",
      });
    }
  });

  router.post("/admin/snapshot-students/test-school-year", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const startedAt = Date.now();
      const requestedSnapId = toNullableText(req.body?.snap_id, 30);
      let termId = 0;
      let effectiveSnapId = "";
      let snapshotDate = "";
      if (requestedSnapId) {
        const snapshotTemplate = await fetchSnapshotGroupTemplate(conn, toRequiredSnapId(requestedSnapId));
        effectiveSnapId = String(snapshotTemplate.snap_id || "").trim();
        termId = Number(snapshotTemplate.term_id || 0);
        snapshotDate = String(snapshotTemplate.snapshot_date || "").trim();
      } else {
        termId = toPositiveInt(req.body?.term_id, "Schuljahr");
        snapshotDate = toRequiredText(req.body?.snapshot_date, "Snapshot-Datum", 10);
      }
      const sourceIds = Array.isArray(req.body?.source_ids)
        ? req.body.source_ids.map((value) => toPositiveInt(value, "Schulserver-Quelle"))
        : [];
      if (!sourceIds.length) {
        const error = new Error("Es wurden keine aktiven Schulserver-Quellen uebergeben.");
        error.statusCode = 400;
        throw error;
      }

      const term = await ensureTermExists(conn, termId);
      const uniqueSourceIds = [...new Set(sourceIds)];
      const placeholders = uniqueSourceIds.map(() => "?").join(", ");
      const [rows] = await conn.query(
        `
        SELECT
          sd.source_id,
          sd.snr,
          sd.db_host,
          sd.db_name,
          sd.db_user,
          sd.db_password_enc,
          sd.is_active,
          s.name AS school_name,
          sp.snapshot_id
        FROM school_source_db sd
        JOIN school s ON s.snr = sd.snr
        LEFT JOIN snapshot sp
          ON sp.snr = sd.snr
          AND (
            (? <> '' AND sp.snap_id = ?)
            OR
            (? = '' AND sp.term_id = ? AND sp.snapshot_date = ?)
          )
        WHERE sd.source_id IN (${placeholders})
        ORDER BY s.city, s.name, s.snr
        `,
        [
          effectiveSnapId,
          effectiveSnapId,
          effectiveSnapId,
          termId,
          snapshotDate,
          ...uniqueSourceIds,
        ],
      );

      if ((rows || []).length !== uniqueSourceIds.length) {
        const error = new Error("Mindestens eine Schulserver-Quelle wurde nicht gefunden.");
        error.statusCode = 404;
        throw error;
      }

      const missingSnapshot = (rows || []).find((row) => !Number(row?.snapshot_id || 0));
      if (missingSnapshot) {
        const error = new Error("Fuer mindestens eine Schule gibt es noch keinen Snapshot.");
        error.statusCode = 400;
        throw error;
      }

      const sources = [];
      const selectedTermLabel = toSchoolYearLabel(term.school_year, term.term_no);
      const currentSchoolYearLabel = getCurrentSchoolYearLabel();
      const allowedStatuses = selectedTermLabel === currentSchoolYearLabel
        ? new Set([2, 6])
        : new Set([2, 6, 8, 9]);
      const totalStatusCounts = new Map();
      for (const row of rows || []) {
        const schoolLabel = String(row?.school_name || row?.snr || "die Schule").trim();
        let hostname = "";
        try {
          const schemaCheck = await testSchoolSourceConnection(row);
          if (String(schemaCheck?.status_code || "").trim() !== "server_ok_db_ok") {
            sources.push({
              source_id: Number(row.source_id || 0),
              snr: String(row.snr || "").trim(),
              school_name: schoolLabel,
              snapshot_id: Number(row.snapshot_id || 0),
              external_section_id: 0,
              active_students: 0,
              ef_students: 0,
              imported_students: 0,
              total_students: 0,
              status_counts: [],
              students: [],
              schema_check_ok: false,
              schema_check_message: String(schemaCheck?.message || "").trim(),
              error: String(schemaCheck?.message || "").trim() || "Schema nicht erreichbar.",
            });
            continue;
          }

          hostname = normalizeSchoolSourceHost(row?.db_host).hostname;
          const databaseName = toRequiredText(row?.db_name, "Datenbank", 255);
          const encodedDbName = encodeURIComponent(databaseName);
          const { username, password } = ensureSchoolSourceRestCredentials(row, schoolLabel);

          let activeStudents = 0;
          const students = [];
          let externalSectionId = 0;
          const sourceStatusCounts = new Map();

          const schoolMetaPayload = await fetchSchoolSourceRestJson(
            hostname,
            `/db/${encodedDbName}/schule/stammdaten`,
            { username, password },
          );
          externalSectionId = resolveExternalSectionId(extractSchoolSections(schoolMetaPayload), term);
          if (!externalSectionId) {
            const error = new Error(
              `Fuer ${schoolLabel} konnte kein externer Abschnitt fuer ${toSchoolYearLabel(term.school_year, term.term_no)} gefunden werden.`,
            );
            error.statusCode = 400;
            throw error;
          }

          const selectionPayload = await fetchSchoolSourceRestJson(
            hostname,
            `/db/${encodedDbName}/schueler/abschnitt/${encodeURIComponent(String(externalSectionId))}/auswahlliste`,
            { username, password },
          );
          const allSelectionStudents = extractSelectionStudents(selectionPayload)
            .sort((a, b) => {
              const classCompare = String(a?.class_code || "").localeCompare(String(b?.class_code || ""), "de", { numeric: true });
              if (classCompare !== 0) return classCompare;
              const lastNameCompare = String(a?.nachname || "").localeCompare(String(b?.nachname || ""), "de", { numeric: true });
              if (lastNameCompare !== 0) return lastNameCompare;
              const firstNameCompare = String(a?.vorname || "").localeCompare(String(b?.vorname || ""), "de", { numeric: true });
              if (firstNameCompare !== 0) return firstNameCompare;
              return Number(a?.id || 0) - Number(b?.id || 0);
            });
          const selectionStudents = allSelectionStudents
            .filter((student) => {
              const studentSectionId = Number(student?.section_id || 0);
              if (studentSectionId <= 0) return false;
              return studentSectionId === Number(externalSectionId || 0);
            })
            .sort((a, b) => {
              const classCompare = String(a?.class_code || "").localeCompare(String(b?.class_code || ""), "de", { numeric: true });
              if (classCompare !== 0) return classCompare;
              const lastNameCompare = String(a?.nachname || "").localeCompare(String(b?.nachname || ""), "de", { numeric: true });
              if (lastNameCompare !== 0) return lastNameCompare;
              const firstNameCompare = String(a?.vorname || "").localeCompare(String(b?.vorname || ""), "de", { numeric: true });
              if (firstNameCompare !== 0) return firstNameCompare;
              return Number(a?.id || 0) - Number(b?.id || 0);
            });

          for (const student of selectionStudents) {
            const studentId = Number(student?.id || 0);
            if (!studentId) continue;
            const status = resolveStudentStatus(student?.status);
            const counted = allowedStatuses.has(status);
            if (!counted) continue;
            let masterDataPayload;
            let learningSectionPayload;
            try {
              [masterDataPayload, learningSectionPayload] = await Promise.all([
                fetchSchoolSourceRestJson(
                  hostname,
                  `/db/${encodedDbName}/schueler/${encodeURIComponent(studentId)}/stammdaten`,
                  { username, password },
                ),
                fetchSchoolSourceRestJson(
                  hostname,
                  `/db/${encodedDbName}/schueler/${encodeURIComponent(studentId)}/abschnitt/${encodeURIComponent(String(externalSectionId))}/lernabschnittsdaten`,
                  { username, password },
                ),
              ]);
            } catch (error) {
              if (Number(error?.responseStatus || 0) === 401) {
                const authError = new Error(`DB-Login fehlerhaft fuer ${schoolLabel}. Bitte DB-Benutzer und Passwort in school_source_db pruefen.`);
                authError.statusCode = 401;
                throw authError;
              }
              throw error;
            }
            const masterData = normalizeStudentMasterData(masterDataPayload);
            const learningSection = normalizeStudentLearningSectionData(learningSectionPayload);
            activeStudents += 1;
            const statusKey = String(status ?? "-").trim() || "-";
            sourceStatusCounts.set(statusKey, Number(sourceStatusCounts.get(statusKey) || 0) + 1);
            totalStatusCounts.set(statusKey, Number(totalStatusCounts.get(statusKey) || 0) + 1);

            students.push({
              row_no: students.length + 1,
              snapshot_id: Number(row?.snapshot_id || 0),
              student_no: studentId,
              nachname: String(student?.nachname || "").trim(),
              vorname: String(student?.vorname || "").trim(),
              jahrgang: String(student?.jahrgang || "").trim(),
              geschlecht: String(student?.geschlecht || "").trim(),
              schulgliederung: String(learningSection?.schulgliederung ?? student?.schulgliederung ?? "").trim(),
              religionID: masterData?.religionID ?? student?.religionID ?? null,
              migration: masterData?.migration ?? student?.migration ?? null,
              staatsangehoerigkeit: masterData?.staatsangehoerigkeitID ?? student?.staatsangehoerigkeit ?? null,
              foerderschwerpunkt1ID: learningSection?.foerderschwerpunkt1ID ?? student?.foerderschwerpunkt1ID ?? null,
              foerderschwerpunkt2ID: learningSection?.foerderschwerpunkt2ID ?? student?.foerderschwerpunkt2ID ?? null,
              hatZieldifferentenUnterricht: learningSection?.hatZieldifferentenUnterricht ?? student?.hatZieldifferentenUnterricht ?? null,
              klassenart: learningSection?.klassenart ?? student?.klassenart ?? null,
              full_name: [
                String(student?.nachname || "").trim(),
                String(student?.vorname || "").trim(),
              ].filter(Boolean).join(", ") || String(student?.id || ""),
              class_code: String(student?.class_code || "").trim(),
              status,
              counted,
              ef: 0,
            });
          }

          sources.push({
            source_id: Number(row.source_id || 0),
            snr: String(row.snr || "").trim(),
            school_name: schoolLabel,
            snapshot_id: Number(row.snapshot_id || 0),
            schema_check_ok: true,
            schema_check_message: "Schema erreichbar.",
            external_section_id: Number(externalSectionId || 0),
            active_students: activeStudents,
            ef_students: 0,
            imported_students: activeStudents,
            unfiltered_students: allSelectionStudents.length,
            total_students: students.length,
            status_counts: [...sourceStatusCounts.entries()]
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([status, count]) => ({ status, count })),
            students,
          });
        } catch (error) {
          sources.push({
            source_id: Number(row.source_id || 0),
            snr: String(row.snr || "").trim(),
            school_name: schoolLabel,
            snapshot_id: Number(row.snapshot_id || 0),
            external_section_id: 0,
            active_students: 0,
            ef_students: 0,
            imported_students: 0,
            total_students: 0,
            status_counts: [],
            students: [],
            schema_check_ok: false,
            schema_check_message: normalizeSchoolSourceRestError(error, hostname || String(row?.db_host || "").trim()) || error?.message || "Schema-Check fehlgeschlagen",
            error: normalizeSchoolSourceRestError(error, hostname || String(row?.db_host || "").trim()) || error?.message || "Unbekannter Fehler",
          });
        }
      }

      return res.json({
        success: true,
        duration_ms: Date.now() - startedAt,
        duration_total_ms: Date.now() - startedAt,
        snapshot_date: snapshotDate,
        term: {
          term_id: Number(term.term_id || 0),
          label: selectedTermLabel,
          school_year: Number(term.school_year || 0),
          term_no: Number(term.term_no || 0),
        },
        current_school_year_label: currentSchoolYearLabel,
        counted_statuses: [...allowedStatuses],
        total_sources: sources.length,
        total_students: sources.reduce((sum, source) => sum + Number(source.active_students || 0), 0),
        total_rows: sources.reduce((sum, source) => sum + Number(source.active_students || 0), 0),
        status_counts: [...totalStatusCounts.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([status, count]) => ({ status, count })),
        sources,
        results: sources,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 600) {
        return res.status(statusCode).json({ error: error.message });
      }
      return res.status(400).json({
        error: normalizeSchoolSourceRestError(error),
      });
    } finally {
      conn.release();
    }
  });

  router.post("/admin/snapshot-students/import-school-year/abort", authenticateToken, requireAdmin, async (req, res) => {
    if (!previewSchoolYearProgress.active) {
      return res.status(409).json({
        error: "Aktuell laeuft kein Import.",
      });
    }

    updatePreviewSchoolYearProgress({
      abort_requested: true,
      action: "Import wird nach aktueller Schule abgebrochen...",
    });

    return res.json({
      success: true,
      message: "Import wird nach der aktuellen Schule kontrolliert beendet.",
    });
  });

  router.get("/admin/snapshot-students/preview-school-year/progress", authenticateToken, requireAdmin, async (req, res) => {
    return res.json({
      active: !!previewSchoolYearProgress.active,
      action: String(previewSchoolYearProgress.action || "").trim(),
      current_school: String(previewSchoolYearProgress.current_school || "").trim(),
      current_snr: String(previewSchoolYearProgress.current_snr || "").trim(),
      completed_sources: Number(previewSchoolYearProgress.completed_sources || 0),
      total_sources: Number(previewSchoolYearProgress.total_sources || 0),
      abort_requested: !!previewSchoolYearProgress.abort_requested,
      was_aborted: !!previewSchoolYearProgress.was_aborted,
    });
  });

  router.delete("/admin/snapshots/:snapshotId", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const snapshotId = toPositiveInt(req.params.snapshotId, "Snapshot");
      const existingSnapshot = await ensureSnapshotExists(conn, snapshotId);
      const snapId = String(existingSnapshot?.snap_id || "").trim();

      await conn.beginTransaction();
      await conn.query("DELETE FROM snapshot WHERE snapshot_id = ?", [snapshotId]);
      if (snapId) {
        await cleanupUnusedSnapRuns(conn, [snapId]);
      }
      await conn.commit();
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der Snapshot konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.delete("/admin/snapshots", authenticateToken, requireAdmin, async (req, res) => {
    const conn = await getPool().getConnection();
    try {
      const snapId = toRequiredSnapId(req.query?.snapId);
      await ensureSnapshotGroupExists(conn, snapId);

      await conn.beginTransaction();
      await conn.query(
        `
        DELETE FROM snapshot
        WHERE snap_id = ?
        `,
        [snapId],
      );
      await cleanupUnusedSnapRuns(conn, [snapId]);
      await conn.commit();
      res.json(await fetchAdminBootstrap());
    } catch (error) {
      await conn.rollback().catch(() => {});
      return adminErrorResponse(res, error, "Der Snapshot-Stand konnte nicht geloescht werden.");
    } finally {
      conn.release();
    }
  });

  router.post("/logout", authenticateToken, async (req, res) => {
    try {
      revokeToken(req.token || "");
      res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: "Logout fehlgeschlagen." });
    }
  });

  return { router, authenticateToken, requireDashboardPermission };
}

module.exports = { createAuthModule };
