# AGENTS.md

## Zweck
Zentraler Einstiegspunkt fuer Codex, GPT-5.5 und VS Code Agent-Workflows in diesem Projekt.

## Erst lesen

### Immer
- `docs/api.md`

### Bei Frontend-Arbeit
- `docs/frontend.md`

### Bei Backend-Arbeit
- `docs/backend.md`
- `docs/database.md`

### Bei DB-/SQL-Arbeit
- `docs/database.md`
- `docs/schema.sql`

Hinweis:
- `docs/architecture.md` ist aktuell nicht vorhanden.

## Agent-Workflow
1. Relevante Docs lesen.
2. Bestehende Struktur und Muster im Code analysieren.
3. Kleinen Minimalplan bilden.
4. Nur notwendige Aenderungen durchfuehren.
5. Relevante Checks ausfuehren.
6. Aenderungen, offene Risiken und nicht getestete Bereiche kurz zusammenfassen.

## Globale Projektregeln
- Analyse vor Aenderung. Nicht direkt umstrukturieren.
- Kleine, lokale Aenderungen bevorzugen.
- Keine unnoetigen Refactors bei Feature- oder Bugfix-Arbeit.
- Bestehende Feldnamen, API-Responses und Snapshot-Logik nicht still aendern.
- Vorhandene Patterns weiterverwenden statt neue Parallelstrukturen einzufuehren.

## Scope und Verantwortlichkeiten

### Frontend
- Vue 3 + TypeScript + Vite
- `frontend/src/App.vue` orchestriert viel State
- Fachlogik bleibt bevorzugt in `frontend/src/composables/*`
- API-Zugriffe laufen ueber `frontend/src/services/apiClient.ts` und `frontend/src/services/apiService.ts`
- Bestehendes `.vue` + `.html` + `.css` Split-Muster pro Komponente beibehalten

### Backend
- Express-API lebt hauptsaechlich in `backend/server.js`
- Auth, Admin und Importlogik leben in `backend/authModule.js`
- Keine neue Fantasie-Schicht einfuehren, wenn eine kleine Aenderung in bestehender Struktur reicht
- Neue Endpunkte an vorhandene API-Bereiche anlehnen

### Datenbank
- Snapshot-Modell ist fachlich zentral
- Schulbezug laeuft ueber `snr`
- Zeitbezug laeuft ueber `termId` oder `schoolYear + termNo`
- Schema-Aenderungen nur mit neuer Migration unter `backend/migrations`

## Kritische Projektmuster
- KPI-Endpunkte sind snapshot-zentriert und erwarten bestehende Filtermuster wie `snapId`, `snapshotDate`, `source`, `city`, `snr`
- Admin-Mutationen liefern haeufig kompletten Bootstrap-Stand statt Einzelobjekten
- Frontend erwartet bereits aggregierte KPI-Responses, keine Rohdaten
- `401` wird im Frontend global ueber den Axios-Client behandelt

## Sicherheitsregeln
- Keine Secrets, Tokens oder `.env`-Werte in Doku, Code oder Antworten uebernehmen
- SQL immer parametriert halten
- Auth- und Berechtigungspruefungen bei geschuetzten Endpunkten nicht umgehen
- Delete- und Importlogik mit Snapshot-Daten besonders vorsichtig anfassen

## Qualitaetsregeln

### Frontend-Checks
Im Ordner `frontend`:
- `npm run typecheck`
- `npm run build`

### Backend-Checks
- Es gibt aktuell keine echten Backend-Tests oder Lint-Skripte in `backend/package.json`
- Bei Backend-Aenderungen mindestens betroffene Endpunkte, Request-/Response-Formate und Dokumentation pruefen

## Nicht tun
- Keine generischen Enterprise-Refactors
- Keine neuen UI-, State- oder API-Abstraktionsschichten ohne klaren Bedarf
- Keine stillen Umbenennungen von Response-Feldern
- Keine Annahme einer Multi-Tenant-Architektur
