# Frontend Guide For AI Agents

## Zweck
Kurzanleitung fuer KI-Agenten, die im Frontend von `schul_stat` arbeiten.

## Stack
- Vue 3
- TypeScript
- Vite
- Axios
- Bootstrap 5
- ECharts

## Kernstruktur
- `frontend/src/App.vue`: zentrale Orchestrierung
- `frontend/src/composables/*`: Fachlogik, State, Datenladen
- `frontend/src/services/apiClient.ts`: Axios-Client mit Auth-Interceptor
- `frontend/src/services/apiService.ts`: Backend-Endpunkte
- `frontend/src/components/*`: UI-Bausteine
- `frontend/src/charts/*`: ECharts-Optionen
- `frontend/src/types/index.ts`: API- und View-Types
- `frontend/src/authStore.ts`: globaler Auth-Store via `reactive`

## Projektmuster
- `App.vue` ist kein dummer Shell-Container, sondern der Haupt-Koordinator.
- Fachlogik liegt bevorzugt in Composables, nicht direkt in Komponenten.
- Einige Komponenten nutzen Split-Dateien:
  - `.vue` fuer Script
  - `.html` fuer Template
  - `.css` fuer Styles
- API-Zugriffe nur ueber `apiService.ts` und `apiClient.ts`.

## Wichtige Fluesse

### Auth
- Token liegt in `authStore`
- Persistenz ueber `localStorage`
- `apiClient` haengt `Authorization: Bearer ...` automatisch an
- `401` wird global abgefangen

### Datenfluss
1. Filter und UI-State kommen aus Composables
2. Composables laden Daten ueber `apiService`
3. `App.vue` synchronisiert Snapshot-, Termin- und Filterzustand
4. Komponenten rendern Daten oder Charts

### Snapshot-Logik
- Snapshot-Auswahl ist zentral fuer fast alle Dashboards
- Aenderungen an Snapshot, Schuljahr oder Termin beeinflussen mehrere Composables gleichzeitig
- Filter-Resets bei Snapshot-Wechsel sind fachlich gewollt

## Relevante Composables
- `useDatabaseLogin`: DB-Verbindung
- `useAuth`: Login, Logout, Sessionfluss
- `useDashboardNavigation`: erlaubte Views
- `useGlobalFilters`: Schuljahr, Termin, Schule, Stadt, Snapshotlisten
- `useSnapshots`: Snapshot-Auswahl und Labels
- `useOverview`, `useTeachers`, `useClassStrengths`, `useDaz`: KPI-Daten und Charts

## Regeln fuer Agenten
- Bestehende Datenfluesse ueber Composables erweitern, nicht in Komponenten duplizieren.
- Neue API-Calls zuerst in `apiService.ts` anlegen.
- Auth-Logik nicht an mehreren Stellen parallel einbauen.
- Bei neuen Charts Options-Builder in `frontend/src/charts/*` halten.
- Ergebnisfelder aus dem Backend nicht stillschweigend umbenennen.
- Bestehendes Split-Muster pro Komponente beibehalten, wenn die Komponente es bereits nutzt.

## Vorsichtspunkte
- `App.vue` ist gross und koppelt viele States. Kleine Aenderungen koennen mehrere Dashboards beeinflussen.
- Snapshot- und Filter-Synchronisation nicht nebenbei veraendern.
- `authStore` ist einfacher globaler State, kein Pinia/Vuex.
- Bootstrap-JS wird bereits global in `main.ts` geladen.

## Bevor du aenderst
Pruefe immer:
1. Ist die Aenderung nur UI oder auch State-/API-Logik?
2. Existiert schon ein passendes Composable?
3. Haengt die Aenderung an Snapshot, Termin oder Auth?
4. Muss ein Chart-Options-Builder angepasst werden?
6. Can I reuse existing styles and layout patterns?
7. Do not introduce new UI libraries unless explicitly requested.
8. Prefer small, localized changes.
9. Avoid large refactors during feature work.