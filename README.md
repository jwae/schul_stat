# schul_stat

`schul_stat` trennt lokale Entwicklung und Docker-Betrieb sauber:

- Lokal entwickelst du weiter wie bisher mit Vite, Node.js und einer lokalen MariaDB.
- Docker ist fuer Deployment, portable Bereitstellung und produktionsnahe Ausfuehrung gedacht.

## Projektstruktur

```text
schul_stat/
|- frontend/
|- backend/
|- DB/
|  \- init.sql
|- docker-compose.yml
|- .env
|- .env.example
|- .env.docker
\- README.md
```

## Lokale Entwicklung

### 1. Umgebungsdatei vorbereiten

Die Datei `.env` ist fuer den lokalen Betrieb gedacht und wird nicht versioniert.

```powershell
Copy-Item .env.example .env
```

Passe danach bei Bedarf `DB_*`, `JWT_SECRET` und weitere lokale Werte an.

### 2. Frontend lokal starten

```powershell
cd frontend
npm install
npm run dev
```

Vite laeuft lokal, und `frontend/vite.config.ts` leitet `/api` automatisch an `http://localhost:3000` weiter.

### 3. Backend lokal starten

```powershell
cd backend
npm install
node server.js
```

Das Backend laeuft lokal auf Port `3000`.

### 4. MariaDB lokal nutzen

Fuer die taegliche Entwicklung bleibt deine lokale MariaDB wie bisher bestehen. Wenn `DB_AUTO_CONNECT=false` gesetzt ist, verbindet sich das Backend weiterhin erst nach dem manuellen DB-Connect ueber die UI bzw. `/api/connection/connect`.

## Docker-Betrieb

### Zweck

Der Docker-Stack ist fuer:

- Deployment
- portable Bereitstellung
- produktionsnahe Ausfuehrung
- Betrieb auf anderen Systemen oder Servern

### Konfiguration

`docker compose` nutzt in diesem Setup die versionierte Datei `.env.docker`.

Wichtige Werte:

- `DB_HOST=mariadb`
- `DB_PORT=3306`
- `DB_AUTO_CONNECT=true`
- `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`

Vor einem echten Deployment solltest du insbesondere `JWT_SECRET`, `MYSQL_PASSWORD` und `MYSQL_ROOT_PASSWORD` anpassen.

### Stack starten

```powershell
docker compose up -d --build
```

Danach sind die Container ueber folgende Ports erreichbar:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:3000`
- MariaDB: `localhost:3307`

### Stack stoppen

```powershell
docker compose down
```

### Stack mit Datenreset stoppen

```powershell
docker compose down -v
```

Vorsicht: `-v` loescht auch das persistente MariaDB-Volume.

## Datenbank-Initialisierung

Beachte: Das bestehende Repository hat bereits ein Verzeichnis `DB/`. Um keine groessere Umstrukturierung zu erzwingen, liegt die Docker-Initialisierung deshalb in `DB/init.sql`.

Beim ersten Start importiert der MariaDB-Container automatisch `DB/init.sql`.

Das passiert ueber das Standardverzeichnis `/docker-entrypoint-initdb.d/` des offiziellen MariaDB-Images. Wichtig:

- Der Import laeuft nur beim ersten Initialisieren des Volumes.
- Wenn du `DB/init.sql` aenderst, musst du fuer einen Neuimport das Volume loeschen:

```powershell
docker compose down -v
docker compose up -d --build
```

Optional kannst du spaeter in `DB/init.sql` auch Test- oder Stammdaten ergaenzen. Die Datenbank selbst sowie die DB-Benutzer werden weiterhin ueber ENV im Container angelegt, nicht ueber SQL.

## API- und Nginx-Kommunikation

Das Frontend spricht in Produktion relativ ueber `/api`.

Im Docker-Betrieb uebernimmt `frontend/nginx.conf` zwei Aufgaben:

- SPA-Auslieferung des Vite-Builds
- Reverse Proxy von `/api` auf den Backend-Container `backend:3000`

Dadurch bleiben im Frontend keine harten Produktions-`localhost`-URLs notwendig.

## Deployment-Workflow

### Lokal entwickeln

Arbeite lokal wie gewohnt mit:

- lokalem Frontend
- lokalem Backend
- lokaler MariaDB

### Aenderungen deployen

```powershell
git push
```

### Server aktualisieren

```powershell
git pull
docker compose up -d --build
```

## Git-Workflow

Versioniert werden:

- `docker-compose.yml`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `backend/Dockerfile`
- `DB/init.sql`
- `.env.example`
- `.env.docker`

Nicht versioniert werden:

- `.env`
- `node_modules`
- Build-Artefakte
- persistente Docker-Daten

## Update-Workflow

Wenn sich nur Anwendungscode aendert:

```powershell
git pull
docker compose up -d --build
```

Wenn sich nur ENV-Werte aendern:

```powershell
docker compose up -d
```

Wenn sich `DB/init.sql` aendert und die Datenbank neu aufgebaut werden soll:

```powershell
docker compose down -v
docker compose up -d --build
```

## Troubleshooting

### Frontend zeigt keine API-Daten

- Pruefe, ob `backend` und `mariadb` laufen: `docker compose ps`
- Pruefe, ob `backend` gesund ist: `docker compose logs backend`
- Pruefe, ob der Nginx-Proxy aktiv ist: `docker compose logs frontend`

### MariaDB wurde nicht neu initialisiert

- `DB/init.sql` wird nur beim ersten Start eines leeren Volumes importiert
- fuehre `docker compose down -v` aus und starte den Stack neu

### Backend startet nicht

- `.env.docker` auf vollstaendige `DB_*`- und `JWT_*`-Werte pruefen
- Logs ansehen: `docker compose logs backend`
- wenn `DB_AUTO_CONNECT=true` aktiv ist, beendet sich das Backend absichtlich bei ungueltiger DB-Konfiguration

### Port ist bereits belegt

- lokale Dienste auf `8080`, `3000` oder `3307` beenden
- oder die Port-Mappings in `docker-compose.yml` anpassen

## Best Practices

- Nutze fuer lokal und Docker getrennte ENV-Dateien.
- Hinterlege keine echten Secrets im Git-Repository.
- Teste `docker compose up --build` vor dem Push kurz einmal durch.
- Halte `DB/init.sql` und `docs/schema.sql` fachlich synchron.
- Fuer produktive Server eigene sichere Passwoerter und ein starkes `JWT_SECRET` setzen.
