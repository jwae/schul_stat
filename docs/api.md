# API Guide For AI Agents

## Zweck
Kurzreferenz fuer die reale API von `schul_stat`.

## Struktur
- `backend/server.js`: Connection-, Meta- und KPI-Endpunkte
- `backend/authModule.js`: Login, Admin, Import, Bootstrap
- `frontend/src/services/apiClient.ts`: zentraler Axios-Client
- `frontend/src/services/apiService.ts`: Standard-Frontend-Services

## API-Bereiche

### Connection
- `GET /api/connection/status`
- `POST /api/connection/connect`
- `POST /api/connection/test`

Besonderheit:
- nicht JWT-geschuetzt
- DB-Verbindung wird zur Laufzeit gesetzt

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Meta
- `GET /api/meta/schools`
- `GET /api/meta/snapshots`

### KPI
- `GET /api/kpi/student-strengths/by-school-snapshot`
- `GET /api/kpi/class-strengths/by-school`
- `GET /api/kpi/daz/by-school`
- `GET /api/kpi/teachers`
- `GET /api/kpi/overview`

### Admin
Alle Verwaltungs- und Import-Endpunkte liegen unter:
- `/api/auth/admin/...`

Wichtige reale Gruppen:
- Bootstrap
- Benutzer/Gruppen
- Schulen/Quellen
- Snapshots
- Preview/Test/Import
- DB-Inhalte

## Frontend-Kommunikation
- normale Lese-APIs laufen meist ueber `apiService.ts`
- viele Admin-Requests laufen direkt ueber `apiClient`
- Query-Parameter kommen aus `App.vue` und den Composables

Axios-Regeln:
- `baseURL = "/"`
- Bearer-Token wird automatisch gesetzt
- `401` loest globalen Logout aus

## Auth und Rechte
- Login liefert JWT + Benutzerkontext
- alle `/api/meta/*` und `/api/kpi/*` laufen hinter `authenticateToken`
- KPI-Endpunkte pruefen zusaetzlich Dashboard-Rechte per `requireDashboardPermission(...)`
- Admin-Endpunkte pruefen `requireAdmin`

Reale Fehler:
- `401 { error: "Nicht eingeloggt." }`
- `401 { error: "Session beendet. Bitte erneut anmelden." }`
- `401 { error: "Session abgelaufen oder ungueltig." }`
- `403 { error: "Keine Berechtigung fuer <dashboardKey>." }`

## Kritische API-Patterns

### 1. Snapshot-zentrierte API
Fast alle fachlichen Endpunkte arbeiten ueber:
- `termId` oder `schoolYear + termNo`
- `snapId` oder `snapshotDate`
- optional `source`, `city`, `snr`

Wichtig:
- viele KPI-Endpunkte verlangen `snapId` oder `snapshotDate`
- `snapId` ist fachlich staerker als `snapshotDate`

### 2. Admin-Bootstrap-Refresh
Viele schreibende Admin-Endpunkte liefern keinen einzelnen Datensatz zurueck, sondern direkt den kompletten Verwaltungsstand aus `fetchAdminBootstrap()`.

Bootstrap enthaelt:
- `dashboards`
- `groups`
- `users`
- `schools`
- `school_sources`
- `snapshots`
- `terms`
- `stats`

Das betrifft real u. a.:
- Gruppen CRUD
- Benutzer CRUD
- School Source CRUD
- Snapshot CRUD
- CSV-Importe

### 3. KPI-Endpunkte liefern UI-fertige Aggregationen
Das Frontend erwartet keine Rohdaten, sondern fertige Diagramm- und Matrixdaten.

Nicht aufbrechen:
- `overview` liefert bereits Aggregationen, Flags und Trends
- `teachers` liefert bereits Breakdown-Strukturen
- `class-strengths` und `daz` liefern `rows` plus Kontext

### 4. API ist nicht REST-puristisch
Reale Arbeitsendpunkte wie diese sind gewollt:
- `/check-existing`
- `/ensure`
- `/test-all`
- `/preview-school-year`
- `/import-school-year/abort`

## Reale Response-Muster

### Einfaches Objekt
Beispiele:
- `GET /api/connection/status`
- `POST /api/connection/connect`
- `POST /api/auth/login`
- `GET /api/kpi/overview`
- `GET /api/kpi/teachers`

### Nacktes Array
Beispiele:
- `GET /api/meta/schools`
- `GET /api/meta/snapshots`

### Objekt mit `rows`
Beispiele:
- `GET /api/kpi/student-strengths/by-school-snapshot`
- `GET /api/kpi/class-strengths/by-school`
- `GET /api/kpi/daz/by-school`

Typisch dabei:
- Kontextfelder wie `schoolYear`, `termNo`, `snapId`, `snapshotDate`, `filters`
- eigentliche Daten in `rows`

## Wichtige reale Responses

### `POST /api/auth/login`
- `token`
- `user.user_id`
- `user.username`
- `user.user_fullname`
- `user.email`
- `user.group_id`
- `user.group_name`
- `user.dashboards`
- `user.dashboard_permissions`

### `GET /api/meta/schools`
- `[{ snr, name, city }]`

### `GET /api/meta/snapshots`
- `[{ snapId, termId, schoolYear, termNo, snapshotDate, info, source }]`

### `GET /api/kpi/class-strengths/by-school`
- `schoolYear`
- `termNo`
- `snapId`
- `snapshotDate`
- `filters`
- `rows[]` mit `city`, `snr`, `name`, `grade`, `parallel`, `class_code`, `students`

### `GET /api/kpi/daz/by-school`
- gleiches Kontextmuster wie Class Strengths
- `rows[]` mit `class_code`, `daz`

### `GET /api/kpi/teachers`
- `schoolCount`
- `totalTeachers`
- `sexBreakdown`
- `ageBreakdown`
- `cityBreakdown`
- `nationalityBreakdown`

### `GET /api/kpi/overview`
- `schoolYear`
- `termNo`
- `snapId`
- `snapshotDate`
- `filters`
- `genderAvailable`
- `migrationAvailable`
- `nationalityAvailable`
- `teacherAgeAvailable`
- `totals`
- `genderBreakdown`
- `religionBreakdown`
- `migrationBreakdown`
- `nationalityBreakdown`
- `teacherAgeBreakdown`
- `gradeBreakdown`
- `supportBreakdown`
- `efBreakdown`
- `educationTrackBreakdown`
- `hTrackGradeBreakdown`
- `studentTrend`
- `schoolStudentTrend`

### `GET /api/auth/admin/db-contents`
- `snap_id`
- `total_snapshot_students`
- `total_snapshot_teachers`
- `snapshot_students`
- `snapshot_teachers`

## Fehlerformate
- Standard: `{ error: string }`
- Connection-Endpunkte oft: `{ error, details, code }`
- Admin-Duplicate-Key: `409 { error: "Ein Eintrag mit diesen Schluesseldaten existiert bereits." }`

Frontend liest real meist:
- `response.data.error`
- bei Connection zusaetzlich `details` und `code`

## Wichtige Feld- und Namensmuster
- KPI-Responses meist camelCase
- Admin-/DB-nahe Responses teils snake_case

Nicht mischen:
- bestehenden Endpunktstil beibehalten
- keine stillen Umbenennungen in Responses

## Relevante Projektregeln

### Neue KPI-Endpunkte
- unter `/api/kpi/...`
- mit `requireDashboardPermission(...)`
- Snapshot-/Schul-Filter an bestehende Parameter anlehnen
- UI-fertige Aggregation liefern

### Neue Admin-Endpunkte
- unter `/api/auth/admin/...`
- mit `authenticateToken` + `requireAdmin`
- bei Mutationen pruefen, ob Bootstrap-Refresh erwartet wird

### Fehlerformat
- `error` immer als primaeres Feld behalten

### Multi-Tenant
- kein echtes Tenant-Modell vorhanden
- fachliche Segmentierung laeuft ueber `snr`, `city`, `termId` bzw. `schoolYear + termNo`, `snapId`, `snapshotDate`
