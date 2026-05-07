const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const {
  createAuthModule,
} = require("./authModule");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Swagger UI Setup ---
const swaggerDocument = YAML.load(path.join(__dirname, "openapi.yaml"));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

function createDbConfig(overrides = {}) {
  const hasUserOverride = Object.prototype.hasOwnProperty.call(overrides, "user");
  const hasPasswordOverride = Object.prototype.hasOwnProperty.call(overrides, "password");
  return {
    host: String(overrides.host || "").trim(),
    port: Number(overrides.port || process.env.DB_PORT || 3306),
    user: String(hasUserOverride ? overrides.user : (process.env.DB_USER || "root")).trim(),
    password: String(hasPasswordOverride ? overrides.password : (process.env.DB_PASSWORD || "")),
    database: String(overrides.database || "").trim(),
    waitForConnections: true,
    connectionLimit: 10,
  };
}

function createPoolFromConfig(config) {
  return mysql.createPool(config);
}

function collectErrorHints(error, seen = new Set()) {
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
    hints.push(...collectErrorHints(error.cause, seen));
  }

  if (Array.isArray(error?.errors)) {
    for (const nested of error.errors) {
      hints.push(...collectErrorHints(nested, seen));
    }
  }

  return hints;
}

function classifyConnectionError(error, context = "general", databaseName = "") {
  const code = String(error?.code || "").trim().toUpperCase();
  const errno = Number(error?.errno || 0);
  const message = String(error?.message || "").trim();
  const allHints = collectErrorHints(error)
    .join(" ")
    .toLowerCase();

  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET"
  ) {
    return "Server / Port nicht erreichbar.";
  }

  if (
    allHints.includes("enotfound") ||
    allHints.includes("getaddrinfo") ||
    allHints.includes("eai_again") ||
    allHints.includes("econnrefused") ||
    allHints.includes("etimedout") ||
    allHints.includes("esockettimedout") ||
    allHints.includes("econnreset") ||
    allHints.includes("name or service not known") ||
    allHints.includes("nodename nor servname")
  ) {
    return "Server inkl. Port nicht erreichbar.";
  }

  if (errno === 1045 || code === "ER_ACCESS_DENIED_ERROR") {
    return "Authentifizierung nicht ok. DB-Benutzer oder Passwort ist falsch.";
  }

  if (
    message.toLowerCase().includes("unknown plugin") ||
    message.toLowerCase().includes("auth_gssapi_client")
  ) {
    return "Authentifizierung nicht ok. DB-Benutzer oder Passwort ist falsch.";
  }

  if (errno === 1049 || code === "ER_BAD_DB_ERROR") {
    const fromInput = String(databaseName || "").trim();
    const fromUnknownDbMessage = (message.match(/Unknown database '([^']+)'/i) || [])[1] || "";
    const fromGermanMessage = (message.match(/Die Datenbank '([^']+)'/i) || [])[1] || "";
    const db = fromInput || fromUnknownDbMessage || fromGermanMessage || "angegeben";
    return `Die Datenbank '${db}' existiert auf dem Server nicht. Benutzername und Passwort sind korrekt.`;
  }

  return message || "Verbindungsfehler zur Datenbank.";
}
async function testServerConnection({ host, port, database, user, password }) {
  const hasUser = user !== undefined && user !== null;
  const hasPassword = password !== undefined && password !== null;
  const connection = await mysql.createConnection({
    host,
    port,
    user: String(hasUser ? user : (process.env.DB_USER || "root")).trim(),
    password: String(hasPassword ? password : (process.env.DB_PASSWORD || "")),
    connectTimeout: 5000,
  });

  try {
    const dbName = String(database || "").trim();
    if (!dbName) {
      const error = new Error("Datenbank ist erforderlich.");
      error.code = "ER_BAD_DB_ERROR";
      throw error;
    }
    const [rows] = await connection.query(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1",
      [dbName],
    );
    if (!Array.isArray(rows) || !rows.length) {
      const error = new Error(`Die Datenbank '${dbName}' existiert auf dem MariaDB-Server nicht.`);
      error.code = "ER_BAD_DB_ERROR";
      throw error;
    }
  } finally {
    await connection.end();
  }
}

let currentPool = null;
let currentDbConfig = null;

function getPool() {
  return currentPool;
}

function getPublicDbDefaults() {
  return {
    host: String(process.env.DB_HOST || "localhost").trim(),
    port: Number(process.env.DB_PORT || 3307),
    database: String(process.env.DB_NAME || "stats").trim(),
    username: String(process.env.DB_USER || "root").trim(),
    password: String(process.env.DB_PASSWORD || ""),
  };
}

function getPublicDbConfig() {
  const defaults = getPublicDbDefaults();
  if (!currentDbConfig) {
    return {
      configured: false,
      host: "",
      port: defaults.port,
      database: "",
      username: "",
      defaults,
    };
  }
  return {
    configured: true,
    host: currentDbConfig.host,
    port: currentDbConfig.port,
    database: currentDbConfig.database,
    username: currentDbConfig.user,
    defaults,
  };
}

async function configurePool(overrides) {
  const nextConfig = createDbConfig(overrides);
  if (!nextConfig.host || !nextConfig.database) {
    throw new Error("Host und Datenbank sind erforderlich.");
  }

  const nextPool = createPoolFromConfig(nextConfig);
  try {
    await nextPool.query("SELECT 1");
  } catch (error) {
    await nextPool.end().catch(() => {});
    throw error;
  }

  const previousPool = currentPool;
  currentPool = nextPool;
  currentDbConfig = nextConfig;

  if (previousPool) {
    previousPool.end().catch(() => {});
  }

  return getPublicDbConfig();
}

function ensureDatabaseConfigured(req, res, next) {
  if (!currentPool) {
    return res.status(503).json({ error: "Bitte zuerst MariaDB-Server und Datenbank verbinden." });
  }
  next();
}

const {
  router: authRouter,
  authenticateToken,
  requireDashboardPermission,
} = createAuthModule(getPool);

app.get("/api/connection/status", (req, res) => {
  res.json(getPublicDbConfig());
});

app.post("/api/connection/connect", async (req, res) => {
  const host = String(req.body?.host || "").trim();
  const database = String(req.body?.database || "").trim();
  const port = Number(req.body?.port || process.env.DB_PORT || 3306);
  const user = String(req.body?.username || req.body?.user || "").trim();
  const password = String(req.body?.password || "");

  try {
    if (!password) {
      return res.status(400).json({ error: "DB-Passwort ist erforderlich." });
    }

    const config = await configurePool({ host, port, database, user, password });
    res.json(config);
  } catch (e) {
    console.error("db connection failed:", e?.message || e);
    res.status(400).json({
      error: classifyConnectionError(e, "connect", database),
      details: e?.message || "",
      code: e?.code || "",
    });
  }
});

app.post("/api/connection/test", async (req, res) => {
  const host = String(req.body?.host || "").trim();
  const port = Number(req.body?.port || process.env.DB_PORT || 3306);
  const database = String(req.body?.database || "").trim();
  const user = String(req.body?.username || req.body?.user || "").trim();
  const password = String(req.body?.password || "");

  try {
    if (!host) {
      return res.status(400).json({ error: "Server-Adresse ist erforderlich." });
    }

    if (!user) {
      return res.status(400).json({ error: "DB-Benutzer ist erforderlich." });
    }

    if (!password) {
      return res.status(400).json({ error: "DB-Passwort ist erforderlich." });
    }

    await testServerConnection({ host, port, database, user, password });
    res.json({ connected: true, host, port, database });
  } catch (e) {
    console.error("db server test failed:", e?.message || e);
    res.status(400).json({
      error: classifyConnectionError(e, "test", database),
      details: e?.message || "",
      code: e?.code || "",
    });
  }
});

app.use("/api/auth", authRouter);
app.use("/api", ensureDatabaseConfigured, authenticateToken);

/**
 * GET /api/meta/schools?termId=123&snapshotDate=YYYY-MM-DD
 * -> [{ snr, name, city }]
 */
app.get("/api/meta/schools", async (req, res) => {
  try {
    const termId = Number(req.query.termId ?? 0);
    const snapId = String(req.query.snapId ?? "").trim();
    const snapshotDate = String(req.query.snapshotDate ?? "").trim();
    const source = req.query.source ? String(req.query.source).trim() : "";
    const schoolYear = Number(req.query.schoolYear ?? 2024);
    const termNo = Number(req.query.termNo ?? 1);

    const params = [];
    const where = [];

    if (termId > 0) {
      where.push("t.term_id = ?");
      params.push(termId);
      if (snapId) {
        where.push("COALESCE(TRIM(sp.snap_id), '') = TRIM(?)");
        params.push(snapId);
      } else if (snapshotDate) {
        where.push("DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') = ?");
        params.push(snapshotDate);
      }
      if (source) {
        where.push("COALESCE(TRIM(sp.source), '') = TRIM(?)");
        params.push(source);
      }
    } else {
      where.push("t.school_year = ?", "t.term_no = ?");
      params.push(schoolYear, termNo);
      if (snapId) {
        where.push("COALESCE(TRIM(sp.snap_id), '') = TRIM(?)");
        params.push(snapId);
      } else if (snapshotDate) {
        where.push("DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') = ?");
        params.push(snapshotDate);
      }
      if (source) {
        where.push("COALESCE(TRIM(sp.source), '') = TRIM(?)");
        params.push(source);
      }
    }

    const [rows] = await currentPool.query(
      `
      SELECT DISTINCT s.snr, s.name, s.city
      FROM school s
      JOIN snapshot sp ON sp.snr = s.snr
      JOIN term t ON t.term_id = sp.term_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.city, s.snr
      `,
      params,
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "DB query failed" });
  }
});

/**
 * GET /api/meta/snapshots?schoolYear=2024&termNo=1&city=...&snr=...
 * -> [{ termId, snapshotDate: "YYYY-MM-DD", info: "..." }, ...]
 */
app.get("/api/meta/snapshots", async (req, res) => {
  try {
    const schoolYear = Number(req.query.schoolYear ?? 0);
    const termNo = Number(req.query.termNo ?? 0);
    const city = req.query.city ? String(req.query.city).trim() : "";
    const snr = req.query.snr ? String(req.query.snr).trim() : "";

    const where = [];
    const params = [];

    if (schoolYear > 0) {
      where.push("t.school_year = ?");
      params.push(schoolYear);
    }
    if (termNo > 0) {
      where.push("t.term_no = ?");
      params.push(termNo);
    }

    if (city) { where.push("TRIM(sc.city) = TRIM(?)"); params.push(city); }
    if (snr) { where.push("sc.snr = ?"); params.push(snr); }

    const sql = `
      SELECT
        COALESCE(TRIM(sp.snap_id), '') AS snapId,
        t.term_id AS termId,
        t.school_year AS schoolYear,
        t.term_no AS termNo,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshotDate,
        MAX(NULLIF(TRIM(sp.info), '')) AS info,
        COALESCE(TRIM(sp.source), '') AS source
      FROM snapshot sp
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY COALESCE(TRIM(sp.snap_id), ''), t.term_id, t.school_year, t.term_no, DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d'), COALESCE(TRIM(sp.source), '')
      ORDER BY t.school_year, t.term_no, snapshotDate, source;
    `;

    const [rows] = await currentPool.query(sql, params);
    res.json(rows.map((row) => ({
      snapId: String(row.snapId || "").trim(),
      termId: Number(row.termId || 0),
      schoolYear: Number(row.schoolYear || 0),
      termNo: Number(row.termNo || 0),
      snapshotDate: row.snapshotDate,
      info: String(row.info || "").trim(),
      source: String(row.source || "").trim(),
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "DB query failed" });
  }
});

/**
 * GET /api/kpi/student-strengths/by-school-snapshot?schoolYear=2024&termNo=1&city=...&snr=...
 * -> rows: [{city,snr,name,snapshotDate,students}]
 */
app.get(
  "/api/kpi/student-strengths/by-school-snapshot",
  requireDashboardPermission("schuelerstaerken"),
  async (req, res) => {
  try {
    const snapshotName = req.query.snapshotName ? String(req.query.snapshotName).trim() : "";
    const city = req.query.city ? String(req.query.city).trim() : "";
    const snr = req.query.snr ? String(req.query.snr).trim() : "";

    const where = [];
    const params = [];

    if (snapshotName) {
      // Find snapshots with exact match or similar info/source to capture all years
      where.push(`(
        COALESCE(NULLIF(TRIM(sp.info), ''), '') = ? 
        OR COALESCE(TRIM(sp.source), '') = ?
        OR sp.info LIKE CONCAT(?, '%')
        OR sp.source LIKE CONCAT(?, '%')
      )`);
      params.push(snapshotName, snapshotName, snapshotName, snapshotName);
    }

    if (city) { where.push("TRIM(sc.city) = TRIM(?)"); params.push(city); }
    if (snr) { where.push("sc.snr = ?"); params.push(snr); }

    const sql = `
      SELECT
        sc.city,
        sc.snr,
        sc.name,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshotDate,
        CONCAT(
          t.school_year, '/', SUBSTRING(CAST(t.school_year + 1 AS CHAR), 3, 2),
          ' (', t.term_no, '. HJ)'
        ) AS snapshotLabel,
        COUNT(ss.student_no) AS students
      FROM snapshot sp
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      LEFT JOIN snapshot_student ss ON ss.snapshot_id = sp.snapshot_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY sc.city, sc.snr, sc.name, sp.snapshot_date, t.school_year, t.term_no
      ORDER BY t.school_year DESC, t.term_no DESC, sp.snapshot_date DESC, sc.city, sc.snr;
    `;

    const [rows] = await currentPool.query(sql, params);
    res.json({ rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "DB query failed" });
  }
});

/**
 * GET /api/kpi/class-strengths/by-school?snapshotDate=YYYY-MM-DD&schoolYear=2024&termNo=1&city=...&snr=...
 * -> rows: [{city,snr,name,class_code,grade,parallel,students}]
 *
 * WICHTIG: class_code muss bei dir existieren. Falls deine Spalte anders heißt:
 * - ersetze c.class_code unten entsprechend (z.B. c.name)
 */
app.get(
  "/api/kpi/class-strengths/by-school",
  requireDashboardPermission("klassenstaerken"),
  async (req, res) => {
  try {
    const schoolYear = Number(req.query.schoolYear ?? 2024);
    const termNo = Number(req.query.termNo ?? 1);
    const termId = Number(req.query.termId ?? 0);
    const snapId = String(req.query.snapId ?? "").trim();
    const snapshotDate = String(req.query.snapshotDate ?? "").trim();
    const source = req.query.source ? String(req.query.source).trim() : "";
    const city = req.query.city ? String(req.query.city).trim() : "";
    const snr = req.query.snr ? String(req.query.snr).trim() : "";

    if (!snapId && !snapshotDate) {
      return res.status(400).json({ error: "snapId or snapshotDate is required" });
    }

    const where = [];
    const params = [];

    if (termId > 0) {
      where.push("t.term_id = ?");
      params.push(termId);
    } else {
      where.push("t.school_year = ?", "t.term_no = ?");
      params.push(schoolYear, termNo);
    }
    if (snapId) {
      where.push("COALESCE(TRIM(sp.snap_id), '') = TRIM(?)");
      params.push(snapId);
    } else {
      where.push("sp.snapshot_date = ?");
      params.push(snapshotDate);
    }

    if (source) {
      where.push("COALESCE(TRIM(sp.source), '') = TRIM(?)");
      params.push(source);
    }

    if (city) { where.push("TRIM(sc.city) = TRIM(?)"); params.push(city); }
    if (snr) { where.push("sc.snr = ?"); params.push(snr); }

    const sql = `
      SELECT
        sc.city,
        sc.snr,
        sc.name,
        c.jahrgang AS grade,
        c.parallel,
        c.class_code,
        COUNT(ss.student_no) AS students
      FROM snapshot_student ss
      JOIN snapshot sp ON sp.snapshot_id = ss.snapshot_id
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      JOIN \`class\` c ON c.class_id = ss.class_id
      WHERE ${where.join(" AND ")}
      GROUP BY sc.city, sc.snr, sc.name, c.jahrgang, c.parallel, c.class_code
      ORDER BY sc.city, sc.snr, c.jahrgang, c.parallel;
    `;

    const [rows] = await currentPool.query(sql, params);
    res.json({ schoolYear, termNo, snapId: snapId || null, snapshotDate: snapshotDate || null, filters: { city: city || null, snr: snr || null }, rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "DB query failed" });
  }
});


app.get(
  "/api/kpi/daz/by-school",
  requireDashboardPermission("daz"),
  async (req, res) => {
  try {
    const schoolYear = Number(req.query.schoolYear ?? 2024);
    const termNo = Number(req.query.termNo ?? 1);
    const termId = Number(req.query.termId ?? 0);
    const snapId = String(req.query.snapId ?? "").trim();
    const snapshotDate = String(req.query.snapshotDate ?? "").trim();
    const source = req.query.source ? String(req.query.source).trim() : "";
    const city = req.query.city ? String(req.query.city).trim() : "";
    const snr = req.query.snr ? String(req.query.snr).trim() : "";

    if (!snapId && !snapshotDate) return res.status(400).json({ error: "snapId or snapshotDate is required" });

    const where = [];
    const params = [];

    if (termId > 0) {
      where.push("t.term_id = ?");
      params.push(termId);
    } else {
      where.push("t.school_year = ?", "t.term_no = ?");
      params.push(schoolYear, termNo);
    }
    if (snapId) {
      where.push("COALESCE(TRIM(sp.snap_id), '') = TRIM(?)");
      params.push(snapId);
    } else {
      where.push("sp.snapshot_date = ?");
      params.push(snapshotDate);
    }

    if (source) {
      where.push("COALESCE(TRIM(sp.source), '') = TRIM(?)");
      params.push(source);
    }

    if (city) { where.push("TRIM(sc.city) = TRIM(?)"); params.push(city); }
    if (snr)  { where.push("sc.snr = ?"); params.push(snr); }

    const sql = `
      SELECT
        sc.city,
        sc.snr,
        sc.name,
        c.jahrgang AS grade,
        c.parallel,
        c.class_code,
        SUM(CASE WHEN ss.ef = 1 THEN 1 ELSE 0 END) AS daz
      FROM snapshot_student ss
      JOIN snapshot sp ON sp.snapshot_id = ss.snapshot_id
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      JOIN \`class\` c ON c.class_id = ss.class_id
      WHERE ${where.join(" AND ")}
      GROUP BY sc.city, sc.snr, sc.name, c.jahrgang, c.parallel, c.class_code
      ORDER BY sc.city, sc.snr, c.jahrgang, c.parallel;
    `;

    const [rows] = await currentPool.query(sql, params);
    res.json({ schoolYear, termNo, snapId: snapId || null, snapshotDate: snapshotDate || null, filters: { city: city || null, snr: snr || null }, rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "DB query failed" });
  }
});


/**
 * GET /api/kpi/overview?snapshotDate=YYYY-MM-DD&schoolYear=2024&termNo=1&city=...&snr=...
 * -> aggregated stats for pie charts
 */
/**
 * GET /api/kpi/teachers?snapshotDate=YYYY-MM-DD&schoolYear=2024&termNo=1&city=...&snr=...
 * -> aggregated stats for teacher charts
 */
app.get("/api/kpi/teachers", requireDashboardPermission("lehrerdaten"), async (req, res) => {
  try {
    const schoolYear = Number(req.query.schoolYear ?? 2024);
    const termNo = Number(req.query.termNo ?? 1);
    const termId = Number(req.query.termId ?? 0);
    const snapId = String(req.query.snapId ?? "").trim();
    const snapshotDate = String(req.query.snapshotDate ?? "").trim();
    const source = req.query.source ? String(req.query.source).trim() : "";
    const city = req.query.city ? String(req.query.city).trim() : "";
    const snr = req.query.snr ? String(req.query.snr).trim() : "";

    if (!snapId && !snapshotDate) {
      return res.status(400).json({ error: "snapId or snapshotDate is required" });
    }

    const where = [];
    const params = [];

    if (termId > 0) {
      where.push("t.term_id = ?");
      params.push(termId);
    } else {
      where.push("t.school_year = ?", "t.term_no = ?");
      params.push(schoolYear, termNo);
    }
    if (snapId) {
      where.push("COALESCE(TRIM(sp.snap_id), '') = TRIM(?)");
      params.push(snapId);
    } else {
      where.push("sp.snapshot_date = ?");
      params.push(snapshotDate);
    }

    if (source) {
      where.push("COALESCE(TRIM(sp.source), '') = TRIM(?)");
      params.push(source);
    }

    if (city) {
      where.push("TRIM(sc.city) = TRIM(?)");
      params.push(city);
    }
    if (snr) {
      where.push("sc.snr = ?");
      params.push(snr);
    }

    const teacherFromAndWhere = `
      FROM snapshot_teacher st
      JOIN snapshot sp ON sp.snapshot_id = st.snapshot_id
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      WHERE ${where.join(" AND ")}
    `;

    const [stColsRows] = await currentPool.query("SHOW COLUMNS FROM snapshot_teacher");
    const stCols = new Set((stColsRows || []).map((r) => String(r.Field || "").toLowerCase()));
    
    const hasSexId = stCols.has("sex_id");
    const hasAge = stCols.has("age");
    const hasCity = stCols.has("city");
    const hasNationId = stCols.has("nation_id");

    const [totalRows] = await currentPool.query(
      `SELECT COUNT(*) AS totalTeachers ${teacherFromAndWhere}`,
      params
    );
    const totalTeachers = Number(totalRows?.[0]?.totalTeachers ?? 0);
    const [schoolCountRows] = await currentPool.query(
      `SELECT COUNT(DISTINCT sc.snr) AS schoolCount ${teacherFromAndWhere}`,
      params
    );
    const schoolCount = Number(schoolCountRows?.[0]?.schoolCount ?? 0);

    let sexBreakdown = [];
    if (hasSexId) {
      const [sexCountRows] = await currentPool.query(
        `
        SELECT
          CAST(st.sex_id AS CHAR) AS sexId,
          COUNT(*) AS count
        ${teacherFromAndWhere}
        GROUP BY CAST(st.sex_id AS CHAR)
        `,
        params
      );
      
      const sexLabelMap = {
        "3": "Männlich",
        "4": "Weiblich",
        "5": "Divers",
        "6": "Ohne Angabe"
      };

      sexLabelMap["1"] = sexLabelMap["1"] || "Maennlich";
      sexLabelMap["2"] = sexLabelMap["2"] || "Weiblich";

      try {
        const [sexColsRows] = await currentPool.query("SHOW COLUMNS FROM `sex`");
        const sexCols = new Set((sexColsRows || []).map((r) => String(r.Field || "").toLowerCase()));
        const sexIdCol = ["sex_id", "id"].find((c) => sexCols.has(c)) || null;
        const sexLabelCol =
          ["label", "name", "code", "text", "bezeichnung"].find((c) => sexCols.has(c)) || null;

        if (sexIdCol) {
          const labelExpr = sexLabelCol
            ? `TRIM(COALESCE(\`${sexLabelCol}\`, ''))`
            : `CONCAT('ID ', CAST(\`${sexIdCol}\` AS CHAR))`;
          const [sexRefRows] = await currentPool.query(
            `
            SELECT
              CAST(\`${sexIdCol}\` AS CHAR) AS sexId,
              ${labelExpr} AS label
            FROM \`sex\`
            `
          );
          for (const row of sexRefRows || []) {
            const id = String(row.sexId ?? "").trim();
            const label = String(row.label ?? "").trim();
            if (id && label) sexLabelMap[id] = label;
          }
        }
      } catch {
        // Fallback auf die bekannte ID-Zuordnung, falls die Referenztabelle nicht lesbar ist.
      }

      sexBreakdown = (sexCountRows || []).map(r => ({
        name: sexLabelMap[String(r.sexId)] || `ID ${r.sexId}`,
        value: Number(r.count || 0)
      })).filter(e => e.value > 0);

      if (!sexBreakdown.length && totalTeachers > 0) {
        sexBreakdown = [{ name: "Ohne Zuordnung", value: totalTeachers }];
      }
    }

    let ageBreakdown = [];
    if (hasAge) {
      const [ageRows] = await currentPool.query(
        `
        SELECT
          SUM(CASE WHEN st.\`age\` < 30 THEN 1 ELSE 0 END) AS under30,
          SUM(CASE WHEN st.\`age\` BETWEEN 30 AND 39 THEN 1 ELSE 0 END) AS age30to39,
          SUM(CASE WHEN st.\`age\` BETWEEN 40 AND 49 THEN 1 ELSE 0 END) AS age40to49,
          SUM(CASE WHEN st.\`age\` BETWEEN 50 AND 59 THEN 1 ELSE 0 END) AS age50to59,
          SUM(CASE WHEN st.\`age\` >= 60 THEN 1 ELSE 0 END) AS age60plus
        ${teacherFromAndWhere}
        `,
        params
      );
      ageBreakdown = [
        { name: "Unter 30", value: Number(ageRows?.[0]?.under30 ?? 0) },
        { name: "30-39", value: Number(ageRows?.[0]?.age30to39 ?? 0) },
        { name: "40-49", value: Number(ageRows?.[0]?.age40to49 ?? 0) },
        { name: "50-59", value: Number(ageRows?.[0]?.age50to59 ?? 0) },
        { name: "60+", value: Number(ageRows?.[0]?.age60plus ?? 0) }
      ].filter(e => e.value > 0);
    }

    let cityBreakdown = [];
    if (hasCity) {
      const [cityRows] = await currentPool.query(
        `
        SELECT
          TRIM(COALESCE(st.city, '')) AS name,
          COUNT(*) AS value
        ${teacherFromAndWhere}
        GROUP BY TRIM(st.city)
        ORDER BY value DESC
        LIMIT 20
        `,
        params
      );
      cityBreakdown = (cityRows || [])
        .map(r => ({ name: String(r.name || "Unbekannt"), value: Number(r.value || 0) }))
        .filter(r => r.value > 0);
    } else {
      const [cityRows] = await currentPool.query(
        `
        SELECT
          sc.city AS name,
          COUNT(*) AS value
        ${teacherFromAndWhere}
        GROUP BY sc.city
        ORDER BY value DESC
        LIMIT 20
        `,
        params
      );
      cityBreakdown = (cityRows || []).map(r => ({
        name: String(r.name || "Unbekannt"),
        value: Number(r.value || 0)
      }));
    }

    let nationBreakdown = [];
    if (hasNationId) {
       const [nationRows] = await currentPool.query(
        `
        SELECT
          SUM(CASE WHEN st.\`nation_id\` = 207 THEN 1 ELSE 0 END) AS german,
          SUM(CASE WHEN st.\`nation_id\` <> 207 THEN 1 ELSE 0 END) AS other
        ${teacherFromAndWhere}
        `,
        params
      );
      nationBreakdown = [
        { name: "Deutsch", value: Number(nationRows?.[0]?.german ?? 0) },
        { name: "Andere", value: Number(nationRows?.[0]?.other ?? 0) }
      ].filter(e => e.value > 0);
    }

    res.json({
      schoolCount,
      totalTeachers,
      sexBreakdown,
      ageBreakdown,
      cityBreakdown,
      nationalityBreakdown: nationBreakdown
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "DB query failed" });
  }
});

app.get("/api/kpi/overview", requireDashboardPermission("uebersicht"), async (req, res) => {
  try {
    const schoolYear = Number(req.query.schoolYear ?? 2024);
    const termNo = Number(req.query.termNo ?? 1);
    const termId = Number(req.query.termId ?? 0);
    const snapId = String(req.query.snapId ?? "").trim();
    const snapshotDate = String(req.query.snapshotDate ?? "").trim();
    const source = req.query.source ? String(req.query.source).trim() : "";
    const city = req.query.city ? String(req.query.city).trim() : "";
    const snr = req.query.snr ? String(req.query.snr).trim() : "";

    if (!snapId && !snapshotDate) {
      return res.status(400).json({ error: "snapId or snapshotDate is required" });
    }

    const where = [];
    const params = [];

    if (termId > 0) {
      where.push("t.term_id = ?");
      params.push(termId);
    } else {
      where.push("t.school_year = ?", "t.term_no = ?");
      params.push(schoolYear, termNo);
    }
    
    if (snapId) {
      where.push("COALESCE(TRIM(sp.snap_id), '') = TRIM(?)");
      params.push(snapId);
    } else {
      where.push("sp.snapshot_date = ?");
      params.push(snapshotDate);
    }

    if (source) {
      where.push("COALESCE(TRIM(sp.source), '') = TRIM(?)");
      params.push(source);
    }

    if (city) {
      where.push("TRIM(sc.city) = TRIM(?)");
      params.push(city);
    }
    if (snr) {
      where.push("sc.snr = ?");
      params.push(snr);
    }

    const fromAndWhere = `
      FROM snapshot_student ss
      JOIN snapshot sp ON sp.snapshot_id = ss.snapshot_id
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      LEFT JOIN \`class\` c ON c.class_id = ss.class_id
      WHERE ${where.join(" AND ")}
    `;

    const trendWhere = [];
    const trendParams = [];
    if (snapId) {
      // With snapId: take the schools contained in the selected snapshot run
      // and show their development across sections/terms.
      trendWhere.push(
        `EXISTS (
          SELECT 1
          FROM snapshot sp_selected
          WHERE sp_selected.snr = sp.snr
            AND COALESCE(TRIM(sp_selected.snap_id), '') = TRIM(?)
        )`,
      );
      trendParams.push(snapId);
      if (source) {
        trendWhere.push("COALESCE(TRIM(sp.source), '') = TRIM(?)");
        trendParams.push(source);
      }
    } else {
      trendWhere.push(
        `EXISTS (
          SELECT 1
          FROM snapshot sp_selected
          JOIN term t_selected ON t_selected.term_id = sp_selected.term_id
          WHERE sp_selected.snr = sp.snr
            ${termId > 0 ? "AND t_selected.term_id = ?" : "AND t_selected.school_year = ? AND t_selected.term_no = ?"}
            AND sp_selected.snapshot_date = ?
            ${source ? "AND COALESCE(TRIM(sp_selected.source), '') = TRIM(?)" : ""}
        )`,
      );
      if (termId > 0) trendParams.push(termId);
      else trendParams.push(schoolYear, termNo);
      trendParams.push(snapshotDate);
      if (source) trendParams.push(source);
    }

    if (city) {
      trendWhere.push("TRIM(sc.city) = TRIM(?)");
      trendParams.push(city);
    }
    if (snr) {
      trendWhere.push("sc.snr = ?");
      trendParams.push(snr);
    }
    const trendFromAndWhere = `
      FROM snapshot_student ss
      JOIN snapshot sp ON sp.snapshot_id = ss.snapshot_id
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      ${trendWhere.length ? `WHERE ${trendWhere.join(" AND ")}` : ""}
    `;
    const teacherFromAndWhere = `
      FROM snapshot_teacher st
      JOIN snapshot sp ON sp.snapshot_id = st.snapshot_id
      JOIN term t ON t.term_id = sp.term_id
      JOIN school sc ON sc.snr = sp.snr
      WHERE ${where.join(" AND ")}
    `;

    const [ssColsRows] = await currentPool.query("SHOW COLUMNS FROM snapshot_student");
    const ssCols = new Set((ssColsRows || []).map((r) => String(r.Field || "").toLowerCase()));
    const [stColsRows] = await currentPool.query("SHOW COLUMNS FROM snapshot_teacher");
    const stCols = new Set((stColsRows || []).map((r) => String(r.Field || "").toLowerCase()));
    const hasSpecialNeeds = ssCols.has("special_needs");
    const hasTargetDifferent = ssCols.has("target_different");
    const hasEf = ssCols.has("ef");
    const hasReligionId = ssCols.has("religion_id");
    const hasEducationTrackId = ssCols.has("education_track_id");
    const hasMigration = ssCols.has("migration");
    const hasNationId = ssCols.has("nation_id");
    const hasTeacherAge = stCols.has("age");
    const sexIdAvailable = ssCols.has("sex_id");
    const genderTextColumn = ["gender", "sex", "geschlecht"].find((c) => ssCols.has(c)) || null;
    const genderAvailable = sexIdAvailable || Boolean(genderTextColumn);
    const specialNeedsExpr = hasSpecialNeeds
      ? "SUM(CASE WHEN ss.special_needs = 1 THEN 1 ELSE 0 END)"
      : "0";
    const supportTargetSameExpr = hasSpecialNeeds && hasTargetDifferent
      ? "SUM(CASE WHEN ss.`special_needs` = 1 AND ss.`target_different` = 0 THEN 1 ELSE 0 END)"
      : "0";
    const supportTargetDifferentExpr = hasSpecialNeeds && hasTargetDifferent
      ? "SUM(CASE WHEN ss.`special_needs` = 1 AND ss.`target_different` = 1 THEN 1 ELSE 0 END)"
      : "0";
    const ef0Expr = hasEf
      ? "SUM(CASE WHEN COALESCE(ss.`ef`, 0) = 0 THEN 1 ELSE 0 END)"
      : "0";
    const ef1Expr = hasEf
      ? "SUM(CASE WHEN ss.`ef` = 1 THEN 1 ELSE 0 END)"
      : "0";

    const [totalRows] = await currentPool.query(
      `
      SELECT
        COUNT(*) AS totalStudents,
        ${specialNeedsExpr} AS specialNeeds,
        ${supportTargetSameExpr} AS supportTargetSame,
        ${supportTargetDifferentExpr} AS supportTargetDifferent,
        ${ef0Expr} AS ef0,
        ${ef1Expr} AS ef1
      ${fromAndWhere}
      `,
      params
    );

    const totalStudents = Number(totalRows?.[0]?.totalStudents ?? 0);
    const specialNeeds = Number(totalRows?.[0]?.specialNeeds ?? 0);
    const supportTargetSame = Number(totalRows?.[0]?.supportTargetSame ?? 0);
    const supportTargetDifferent = Number(totalRows?.[0]?.supportTargetDifferent ?? 0);
    const ef0 = Number(totalRows?.[0]?.ef0 ?? 0);
    const ef1 = Number(totalRows?.[0]?.ef1 ?? 0);
    const specialNeedsPercent = totalStudents
      ? Number(((specialNeeds / totalStudents) * 100).toFixed(1))
      : 0;

    const [gradeRows] = await currentPool.query(
      `
      SELECT c.jahrgang AS grade, COUNT(*) AS students
      ${fromAndWhere}
      GROUP BY c.jahrgang
      ORDER BY c.jahrgang
      `,
      params
    );

    const [trendRows] = await currentPool.query(
      `
      SELECT
        sp.term_id AS termId,
        CONCAT(t.school_year, '.', LPAD(t.term_no, 2, '0')) AS termLabel,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshotDate,
        COUNT(*) AS students
      ${trendFromAndWhere}
      GROUP BY sp.term_id, CONCAT(t.school_year, '.', LPAD(t.term_no, 2, '0')), DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d')
      ORDER BY t.school_year, t.term_no, snapshotDate
      `,
      trendParams,
    );
    const [schoolTrendRows] = await currentPool.query(
      `
      SELECT
        sp.term_id AS termId,
        CONCAT(t.school_year, '.', LPAD(t.term_no, 2, '0')) AS termLabel,
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshotDate,
        sc.snr,
        sc.name AS schoolName,
        COUNT(*) AS students
      ${trendFromAndWhere}
      GROUP BY
        sp.term_id,
        CONCAT(t.school_year, '.', LPAD(t.term_no, 2, '0')),
        DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d'),
        sc.snr,
        sc.name
      ORDER BY t.school_year, t.term_no, snapshotDate, sc.snr
      `,
      trendParams,
    );
    const [efTrendRows] = hasEf
      ? await currentPool.query(
          `
          SELECT
            sp.term_id AS termId,
            CONCAT(t.school_year, '.', LPAD(t.term_no, 2, '0')) AS termLabel,
            DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d') AS snapshotDate,
            COUNT(*) AS students
          ${trendFromAndWhere}
          AND ss.\`ef\` = 1
          GROUP BY sp.term_id, CONCAT(t.school_year, '.', LPAD(t.term_no, 2, '0')), DATE_FORMAT(sp.snapshot_date, '%Y-%m-%d')
          ORDER BY t.school_year, t.term_no, snapshotDate
          `,
          trendParams,
        )
      : [[]];

    let male = null;
    let female = null;
    let unknownGender = null;
    let sexBreakdown = null;
    let religionBreakdown = [];
    let migrationBreakdown = [];
    let nationalityBreakdown = [];
    let teacherAgeBreakdown = [];

    if (sexIdAvailable) {
      const [genderRows] = await currentPool.query(
        `
        SELECT
          SUM(
            CASE
              WHEN CAST(ss.\`sex_id\` AS CHAR) IN ('1', 'm', 'M', 'male', 'MALE')
              THEN 1 ELSE 0
            END
          ) AS male,
          SUM(
            CASE
              WHEN CAST(ss.\`sex_id\` AS CHAR) IN ('2', 'w', 'W', 'f', 'F', 'female', 'FEMALE')
              THEN 1 ELSE 0
            END
          ) AS female
        ${fromAndWhere}
        `,
        params
      );

      male = Number(genderRows?.[0]?.male ?? 0);
      female = Number(genderRows?.[0]?.female ?? 0);
      unknownGender = Math.max(0, totalStudents - male - female);

      const sexLabelMap = new Map([
        ["3", "Männlich"],
        ["4", "Weiblich"],
        ["5", "Divers"],
        ["6", "Ohne Angabe"],
      ]);
      try {
        const [sexColsRows] = await currentPool.query("SHOW COLUMNS FROM `sex`");
        const sexCols = new Set((sexColsRows || []).map((r) => String(r.Field || "").toLowerCase()));
        const sexIdCol = ["sex_id", "id"].find((c) => sexCols.has(c)) || null;
        const sexLabelCol =
          ["name", "label", "code", "text", "bezeichnung"].find((c) => sexCols.has(c)) || null;

        if (sexIdCol) {
          const labelExpr = sexLabelCol
            ? `TRIM(COALESCE(\`${sexLabelCol}\`, ''))`
            : `CONCAT('sex_id ', CAST(\`${sexIdCol}\` AS CHAR))`;
          const [sexRefRows] = await currentPool.query(
            `
            SELECT
              CAST(\`${sexIdCol}\` AS CHAR) AS sexId,
              ${labelExpr} AS label
            FROM \`sex\`
            `
          );
          for (const row of sexRefRows || []) {
            const id = String(row.sexId ?? "").trim();
            const label = String(row.label ?? "").trim();
            if (["1", "2", "3", "4"].includes(id) && label) sexLabelMap.set(id, label);
          }
        }
      } catch {
        // Wenn die Referenztabelle nicht lesbar ist, bleiben IDs als Fallback.
      }

      const [sexCountRows] = await currentPool.query(
        `
        SELECT
          CAST(ss.\`sex_id\` AS CHAR) AS sexId,
          COUNT(*) AS students
        ${fromAndWhere}
        GROUP BY CAST(ss.\`sex_id\` AS CHAR)
        `,
        params
      );
      const sexCountMap = new Map((sexCountRows || []).map((r) => [String(r.sexId), Number(r.students || 0)]));

      sexBreakdown = ["3", "4", "5", "6"]
        .map((id) => ({
          name: sexLabelMap.get(id) || `sex_id ${id}`,
          value: sexCountMap.get(id) || 0,
        }))
        .filter((entry) => entry.value > 0);
    } else if (genderTextColumn) {
      const [genderRows] = await currentPool.query(
        `
        SELECT
          SUM(
            CASE
              WHEN UPPER(TRIM(COALESCE(ss.\`${genderTextColumn}\`, ''))) IN ('M', 'MALE', 'MAENNLICH')
              THEN 1 ELSE 0
            END
          ) AS male,
          SUM(
            CASE
              WHEN UPPER(TRIM(COALESCE(ss.\`${genderTextColumn}\`, ''))) IN ('W', 'F', 'FEMALE', 'WEIBLICH')
              THEN 1 ELSE 0
            END
          ) AS female
        ${fromAndWhere}
        `,
        params
      );

      male = Number(genderRows?.[0]?.male ?? 0);
      female = Number(genderRows?.[0]?.female ?? 0);
      unknownGender = Math.max(0, totalStudents - male - female);
    }

    if (hasReligionId) {
      const [religionRows] = await currentPool.query(
        `
        SELECT
          CAST(ss.\`religion_id\` AS CHAR) AS religionId,
          COUNT(*) AS students
        ${fromAndWhere}
        AND ss.\`religion_id\` IS NOT NULL
        GROUP BY CAST(ss.\`religion_id\` AS CHAR)
        `,
        params
      );

      const idToCount = new Map(
        (religionRows || []).map((r) => [String(r.religionId), Number(r.students || 0)])
      );

      const idToName = new Map();
      try {
        const [religionRefRows] = await currentPool.query(
          `
          SELECT
            CAST(\`religion_id\` AS CHAR) AS religionId,
            TRIM(COALESCE(\`name\`, '')) AS name
          FROM \`religion\`
          `
        );
        for (const row of religionRefRows || []) {
          const id = String(row.religionId ?? "").trim();
          const name = String(row.name ?? "").trim();
          if (id) idToName.set(id, name || `religion_id ${id}`);
        }
      } catch {
        // Fallback below uses religion_id if reference table is unavailable.
      }

      religionBreakdown = [...idToCount.entries()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([id, value]) => ({
          name: idToName.get(id) || `religion_id ${id}`,
          value,
        }));
    }

    if (hasMigration) {
      const [migrationRows] = await currentPool.query(
        `
        SELECT
          SUM(CASE WHEN ss.\`migration\` = 1 THEN 1 ELSE 0 END) AS withMigration
        ${fromAndWhere}
        `,
        params,
      );

      const withMigration = Number(migrationRows?.[0]?.withMigration ?? 0);
      const withoutMigration = Math.max(0, totalStudents - withMigration);

      migrationBreakdown = [
        { name: "Mit Migrationshintergrund", value: withMigration },
        { name: "Ohne Migrationshintergrund", value: withoutMigration },
      ];
    }

    if (hasNationId) {
      const [nationalityRows] = await currentPool.query(
        `
        SELECT
          SUM(CASE WHEN ss.\`nation_id\` = 207 THEN 1 ELSE 0 END) AS german,
          SUM(
            CASE
              WHEN ss.\`nation_id\` IS NOT NULL AND ss.\`nation_id\` <> 207 THEN 1
              ELSE 0
            END
          ) AS other
        ${fromAndWhere}
        `,
        params,
      );

      nationalityBreakdown = [
        { name: "Deutschland", value: Number(nationalityRows?.[0]?.german ?? 0) },
        { name: "Andere", value: Number(nationalityRows?.[0]?.other ?? 0) },
      ];
    }

    if (hasTeacherAge) {
      const [teacherRows] = await currentPool.query(
        `
        SELECT
          SUM(CASE WHEN st.\`age\` IS NOT NULL AND st.\`age\` < 30 THEN 1 ELSE 0 END) AS under30,
          SUM(CASE WHEN st.\`age\` BETWEEN 30 AND 39 THEN 1 ELSE 0 END) AS age30to39,
          SUM(CASE WHEN st.\`age\` BETWEEN 40 AND 49 THEN 1 ELSE 0 END) AS age40to49,
          SUM(CASE WHEN st.\`age\` BETWEEN 50 AND 59 THEN 1 ELSE 0 END) AS age50to59,
          SUM(CASE WHEN st.\`age\` >= 60 THEN 1 ELSE 0 END) AS age60plus,
          SUM(CASE WHEN st.\`age\` IS NULL THEN 1 ELSE 0 END) AS unknownAge
        ${teacherFromAndWhere}
        `,
        params,
      );

      teacherAgeBreakdown = [
        { name: "Unter 30", value: Number(teacherRows?.[0]?.under30 ?? 0) },
        { name: "30-39", value: Number(teacherRows?.[0]?.age30to39 ?? 0) },
        { name: "40-49", value: Number(teacherRows?.[0]?.age40to49 ?? 0) },
        { name: "50-59", value: Number(teacherRows?.[0]?.age50to59 ?? 0) },
        { name: "60+", value: Number(teacherRows?.[0]?.age60plus ?? 0) },
        { name: "Unbekannt", value: Number(teacherRows?.[0]?.unknownAge ?? 0) },
      ].filter((entry) => entry.value > 0);
    }

    let educationTrackBreakdown = [];
    if (hasEducationTrackId) {
      const [etRows] = await currentPool.query(
        `
        SELECT
          CAST(ss.\`education_track_id\` AS CHAR) AS etId,
          COUNT(*) AS students
        ${fromAndWhere}
        AND ss.\`education_track_id\` IS NOT NULL
        GROUP BY CAST(ss.\`education_track_id\` AS CHAR)
        `,
        params
      );

      const idToCount = new Map(
        (etRows || []).map((r) => [String(r.etId), Number(r.students || 0)])
      );

      const idToName = new Map();
      try {
        const [etRefRows] = await currentPool.query(
          `
          SELECT
            CAST(\`education_track_id\` AS CHAR) AS etId,
            TRIM(COALESCE(\`sf\`, \`name\`, '')) AS name
          FROM \`education_track\`
          `
        );
        for (const row of etRefRows || []) {
          const id = String(row.etId ?? "").trim();
          const name = String(row.name ?? "").trim();
          if (id) idToName.set(id, name || `ID ${id}`);
        }
      } catch {
        // Fallback
      }

      educationTrackBreakdown = [...idToCount.entries()]
        .map(([id, value]) => {
          let name = idToName.get(id) || `ID ${id}`;
          if (name === "H") name = "H (§132c an RS)";
          return { name, value };
        })
        .sort((a, b) => b.value - a.value);
    }

    let hTrackGradeBreakdown = [];
    if (hasEducationTrackId) {
      const [hRows] = await currentPool.query(
        `
        SELECT
          c.jahrgang AS grade,
          COUNT(*) AS students
        ${fromAndWhere}
        AND ss.\`education_track_id\` IN (
          SELECT \`education_track_id\` FROM \`education_track\` WHERE \`sf\` = 'H' OR \`name\` = 'H'
        )
        GROUP BY c.jahrgang
        ORDER BY c.jahrgang
        `,
        params
      );
      hTrackGradeBreakdown = (hRows || []).map((r) => ({
        name: r.grade === null ? "Ohne Angabe" : `Jahrgang ${r.grade}`,
        value: Number(r.students),
      }));
    }

    const [schoolGradeRows] = await currentPool.query(
      `
      SELECT
        sc.snr,
        sc.name AS schoolName,
        c.jahrgang AS grade,
        COUNT(*) AS students
      ${fromAndWhere}
      GROUP BY sc.snr, sc.name, c.jahrgang
      ORDER BY sc.snr, c.jahrgang
      `,
      params
    );

    const efTrendMap = new Map(
      (efTrendRows || []).map((row) => [Number(row.termId || 0), Number(row.students || 0)])
    );

    res.json({
      schoolYear,
      termNo,
      snapId: snapId || null,
      snapshotDate: snapshotDate || null,
      filters: { city: city || null, snr: snr || null },
      genderAvailable,
      migrationAvailable: hasMigration,
      nationalityAvailable: hasNationId,
      teacherAgeAvailable: hasTeacherAge,
      genderBreakdown: sexBreakdown,
      religionBreakdown,
      migrationBreakdown,
      nationalityBreakdown,
      teacherAgeBreakdown,
      gradeBreakdown: gradeRows.map((r) => ({
        name: r.grade === null ? "Ohne Angabe" : `Jahrgang ${r.grade}`,
        value: Number(r.students),
      })),
      studentTrend: (trendRows || []).map((row) => ({
        termId: Number(row.termId || 0),
        termLabel: String(row.termLabel || "").trim(),
        snapshot_date: String(row.snapshotDate || "").trim(),
        total_students: Number(row.students || 0),
        ef_students: efTrendMap.get(Number(row.termId || 0)) || 0
      })),
      schoolStudentTrend: (schoolTrendRows || []).map((row) => ({
        termId: Number(row.termId || 0),
        termLabel: String(row.termLabel || "").trim(),
        snapshot_date: String(row.snapshotDate || "").trim(),
        snr: String(row.snr || "").trim(),
        schoolName: String(row.schoolName || "").trim(),
        total_students: Number(row.students || 0),
      })),
      totals: {
        totalStudents,
        male,
        female,
        unknownGender,
        specialNeeds,
        specialNeedsPercent,
      },
      supportBreakdown: [
        { name: "Zielgleich", value: supportTargetSame },
        { name: "Zieldifferent", value: supportTargetDifferent },
      ],
      efBreakdown: [
        { name: "Keine Erstfoerderung", value: ef0  },
        { name: "In Erstfoerderung", value: ef1 },
      ],
      educationTrackBreakdown,
      hTrackGradeBreakdown,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "DB query failed" });
  }
});

app.listen(3000, () => {
  console.log("API laeuft auf http://localhost:3000");
  console.log(
    `DB Standardwerte: host=${process.env.DB_HOST || "127.0.0.1"} port=${Number(process.env.DB_PORT || 3306)} db=${process.env.DB_NAME || "stats"}`
  );
  console.log("Warte auf DB-Verbindung ueber /api/connection/connect");
});
