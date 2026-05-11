# Backend Instructions

## Zweck
Dieses Backend stellt eine Express-basierte API fuer `schul_stat` bereit. Es liefert Verbindungslogik fuer MariaDB, Authentifizierung per JWT, Metadaten-Endpunkte und KPI-Auswertungen fuer das Frontend.

## Technologie-Stack
- Node.js
- Express 5
- `mysql2/promise` fuer MariaDB-Zugriffe
- JWT fuer Authentifizierung
- Swagger UI ueber `openapi.yaml`
- Konfiguration ueber `.env`

## Relevante Dateien
- `server.js`: Einstiegspunkt, Express-App, DB-Verbindung, API-Endpunkte, Swagger
- `authModule.js`: Login, Token-Pruefung, Berechtigungen, Benutzerverwaltung und angebundene Schulquellen-Logik
- `openapi.yaml`: API-Dokumentation fuer `/api-docs`
- `migrations/*.sql`: SQL-Migrationen fuer Backend-relevante Datenstrukturen
- `package.json`: Abhaengigkeiten des Backends

## Start und Betrieb
Arbeitsverzeichnis:
```powershell
cd backend
```

Abhaengigkeiten installieren:
```powershell
npm install
```

Backend starten:
```powershell
node server.js
```

Swagger UI:
```text
http://localhost:3000/api-docs
```

Das Backend startet auf Port `3000`.

## Erwartete Umgebungsvariablen
Die Anwendung liest insbesondere folgende Variablen:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `NODE_ENV`

Hinweis:
- Ohne aktive DB-Konfiguration antworten datenbankabhaengige Endpunkte mit `503`.
- Die eigentliche Laufzeit-Verbindung wird ueber `/api/connection/connect` gesetzt.

## Architektur-Grundsaetze
- Die API ist aktuell zentral in `server.js` aufgebaut.
- Die Authentifizierungs- und Berechtigungslogik ist in `authModule.js` gekapselt.
- Datenbankzugriffe laufen ueber einen gemeinsamen MariaDB-Pool.
- Fehlertexte sind ueberwiegend deutsch und sollen fuer UI-Nutzer verstaendlich bleiben.
- Bestehende Response-Felder nicht ohne Notwendigkeit umbenennen, weil das Frontend direkt darauf aufsetzt.

## Regeln fuer Backend-Aenderungen
- Neue Endpunkte konsistent unter `/api/...` anlegen.
- Bei neuen geschuetzten Endpunkten bestehende Auth- und Permission-Mechanismen wiederverwenden.
- SQL immer parametriert ausfuehren, keine String-Konkatenation fuer Benutzereingaben.
- Fehlerantworten moeglichst strukturiert und fuer das Frontend stabil halten.
- Wenn ein Endpunkt fachlich relevant ist, `openapi.yaml` mitpflegen.
- Bei Schema-Aenderungen neue Migration unter `backend/migrations` anlegen, bestehende Migrationen nicht rueckwirkend aendern.
- Lokale Sonderlogik fuer Entwicklungsumgebungen nur beibehalten oder erweitern, wenn sie klar dokumentiert ist.

## Bestehende API-Bereiche
- Verbindungsaufbau und Verbindungsstatus
- Authentifizierung und Benutzerkontext
- Stammdaten wie Schulen und Snapshots
- KPI-Auswertungen, z. B. Uebersicht und Lehrerdaten

## Empfehlungen fuer weitere Strukturierung
Falls das Backend weiter waechst, sollten folgende Refactorings bevorzugt werden:
- Routen in eigene Module unter `backend/routes`
- Datenbanklogik in Services oder Repositories
- Gemeinsame Fehlerbehandlung als Middleware
- Validierung fuer Request-Bodies und Query-Parameter

## Definition of Done fuer Backend-Changes
- Endpunkt oder Logik ist implementiert
- Fehlerfaelle sind mitgedacht
- `openapi.yaml` ist bei API-Aenderungen aktualisiert
- Migration ist vorhanden, falls DB-Struktur angepasst wurde
- Frontend-Kompatibilitaet wurde geprueft
