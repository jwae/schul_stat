# Database Guide For AI Agents

## Zweck dieser Datei
Diese Datei ist keine reine Schema-Beschreibung, sondern eine Arbeitsanleitung fuer KI-Agenten, die Queries schreiben, Backend-Code aendern oder Imports debuggen.

Nutze diese Datei, um schnell zu verstehen:
- welche Tabellen fachlich zentral sind
- ueber welche Schluessel gejoint wird
- welche Invarianten nicht verletzt werden duerfen
- welche Query-Pfade fuer Reporting und Import typisch sind
- wo besondere Vorsicht noetig ist

## Kurzmodell
Das System ist snapshot-basiert.

Wichtige Denkweise:
- `school` beschreibt die Schule als Stammdatensatz
- `term` beschreibt die fachliche Zeitachse
- `snaps` beschreibt eine globale Snapshot-Charge
- `snapshot` beschreibt den konkreten Snapshot einer Schule zu Termin und Datum
- `snapshot_student` und `snapshot_teacher` enthalten die eigentlichen auswertbaren Fakten

Merksatz:
Wenn du Zahlen fuer Dashboards, KPIs oder Trends brauchst, startest du fast immer bei `snapshot` und gehst dann zu `snapshot_student` oder `snapshot_teacher`.

## Prioritaet der Tabellen

### Tier 1: fast immer relevant
- `snapshot`
- `snapshot_student`
- `snapshot_teacher`
- `school`
- `term`

### Tier 2: oft fuer Anreicherung oder Filter relevant
- `class`
- `school_form`
- `education_track`
- `support_focus`
- `religion`
- `nation`
- `sex`
- `snaps`

### Tier 3: wichtig fuer Betrieb, Admin und Import
- `school_source_db`
- `school_source_import_run`
- `school_source_import_log`
- `app_user`
- `app_group`
- `app_dashboard`
- `app_group_dashboard`

### Tier 4: Sonderfall
- `test_source_students`

## Kerninvarianten

### Snapshot ist der fachliche Anker
Alle auswertbaren Schueler- und Lehrerdaten haengen an `snapshot.snapshot_id`.

Konsequenz fuer Agenten:
- Nicht direkt gegen `snapshot_student` oder `snapshot_teacher` aggregieren, ohne vorher den relevanten `snapshot` sauber einzuschraenken.

### `snr` ist der fachliche Schluessel der Schule
`school.snr` identifiziert die Schule systemweit.

Konsequenz fuer Agenten:
- Wenn Anforderungen von "Schule" sprechen, ist fast immer `snr` der richtige Filter oder Join-Schluessel.

### Ein Snapshot ist historisch
Dasselbe Objekt kann ueber mehrere Termine und Stichtage mehrfach vorkommen.

Konsequenz fuer Agenten:
- Nie annehmen, dass es "den" aktuellen Datensatz pro Schule gibt.
- Zeitbezug immer explizit machen: `term_id`, `school_year`, `term_no`, `snapshot_date`.

### Snapshot-Kopf und Snapshot-Fakten sind getrennt
`snapshot` enthaelt Kontext, `snapshot_student` und `snapshot_teacher` enthalten Einzelfakten.

Konsequenz fuer Agenten:
- Reporting braucht fast immer einen Join ueber `snapshot_id`.

### Lookup-IDs sind stabil
Referenztabellen wie `sex`, `nation`, `school_form`, `education_track`, `support_focus` sind Lookup-Tabellen.

Konsequenz fuer Agenten:
- Niemals IDs "neu interpretieren" oder stillschweigend ummappen.
- Bei Import- oder Migrationscode immer bestehende IDs und Codes respektieren.

## Kritische Regeln

### Regel 1: `school_source_db.snr` hat keinen Foreign Key
Fachlich gehoert `school_source_db.snr` zu `school.snr`, aber das Schema erzwingt das nicht per FK.

Risiko:
- Orphan-Quellen oder inkonsistente Schulzuordnungen sind moeglich.

Agentenregel:
- Bei Code fuer Quellenverwaltung oder Import immer explizit pruefen, dass `snr` in `school` existiert.

### Regel 2: `snapshot` muss zuerst sauber gefiltert werden
Die Faktentabellen koennen gross werden. Direkte Vollscans sind teuer und fachlich oft falsch.

Agentenregel:
- Typischer Pfad ist zuerst `snapshot` filtern, dann mit `snapshot_student` oder `snapshot_teacher` joinen.

### Regel 3: Bool-Felder sind echte 0/1-Felder
In `snapshot_student` sind `ef`, `special_needs`, `target_different`, `migration` per Check Constraint auf `0/1` begrenzt.

Agentenregel:
- Keine Annahmen ueber weitere Zustandswerte treffen.
- In Filtern und Aggregationen explizit mit `0` und `1` arbeiten.

### Regel 4: Snapshot-Dubletten sind fachlich verboten
`snapshot` ist eindeutig ueber `snr`, `term_id`, `snapshot_date`, `source`.

Agentenregel:
- Bei Insert- oder Upsert-Logik immer diese Kombination als fachliche Eindeutigkeit betrachten.

### Regel 5: Cascade Deletes existieren
Beim Loeschen eines `snapshot` werden `snapshot_student` und `snapshot_teacher` mitgeloescht.

Agentenregel:
- Delete-Code mit Vorsicht behandeln. Ein Delete auf Kopfebene loescht grosse Datenmengen.

## Typische Query-Startpunkte

### Fuer Dashboard-KPIs zu Schuelern
Start:
- `snapshot`

Dann:
- `snapshot_student`

Optional anreichern mit:
- `school`
- `class`
- `school_form`
- `education_track`
- `support_focus`
- `religion`
- `nation`
- `sex`

### Fuer Dashboard-KPIs zu Lehrern
Start:
- `snapshot`

Dann:
- `snapshot_teacher`

Optional anreichern mit:
- `school`
- `nation`
- `sex`

### Fuer Verlauf oder Trends
Start:
- `term`
- `snapshot`

Dann:
- `snapshot_student` oder `snapshot_teacher`

Wichtig:
- Trends nie nur ueber `snapshot_date` bauen, wenn die Fachlogik auf `school_year` und `term_no` basiert.

### Fuer Import-Debugging
Start:
- `school_source_db`
- `school_source_import_run`
- `school_source_import_log`

Dann:
- `snapshot`
- `snapshot_student`
- `snapshot_teacher`

## Beziehungen in Agenten-Sprache

### Auth und Rechte
- `app_group` -> viele `app_user`
- `app_group` <-> `app_dashboard` ueber `app_group_dashboard`

Nutzen:
- Bestimmt, welche Dashboards ein Benutzer sehen darf

### Schule und Quelle
- `school_form` -> viele `school`
- `school` -> fachlich genau eine `school_source_db`
- `school_source_db` -> viele `school_source_import_run`
- `school_source_import_run` -> viele `school_source_import_log`

Nutzen:
- Verbindet Stammdaten einer Schule mit der technischen Importquelle und den Importprotokollen

### Zeit und Snapshot
- `term` -> viele `snaps`
- `term` -> viele `snapshot`
- `snaps` -> viele `snapshot`
- `school` -> viele `snapshot`

Nutzen:
- Modelliert Snapshot-Chargen und schulbezogene Momentaufnahmen

### Snapshot-Fakten
- `snapshot` -> viele `snapshot_student`
- `snapshot` -> viele `snapshot_teacher`
- `class` -> viele `snapshot_student`
- `school_form` -> viele `snapshot_student`
- `education_track` -> viele `snapshot_student`
- `religion` -> viele `snapshot_student`
- `support_focus` -> viele `snapshot_student`
- `sex` -> viele `snapshot_student`
- `sex` -> viele `snapshot_teacher`
- `nation` -> viele `snapshot_student`
- `nation` -> viele `snapshot_teacher`

Nutzen:
- Das ist der eigentliche Reporting-Bereich

## Tabellenuebersicht fuer Agenten

### `snapshot`
Businesszweck:
Kopfdatensatz eines Schul-Snapshots.

Wofuer du die Tabelle benutzt:
- Einstieg in fast alle fachlichen Auswertungen
- Eingrenzung auf Schule, Termin, Datum und Quelle

Wichtige Spalten:
- `snapshot_id`
- `snr`
- `term_id`
- `snapshot_date`
- `source`
- `snap_id`

Wichtige Constraints:
- PK `snapshot_id`
- Unique `snr, term_id, snapshot_date, source`
- FK auf `school`, `term`, `snaps`

Wichtige Indizes:
- `idx_snapshot_new (snr, term_id, snapshot_date)`
- `idx_snapshot_term_date_snr (term_id, snapshot_date, snr)`
- `idx_snapshot_snap_id (snap_id)`

Agentenhinweis:
- Bei neuen Reporting-Queries zuerst pruefen, ob der Filter ueber `snr + term` oder `term + snapshot_date` laufen sollte.

### `snapshot_student`
Businesszweck:
Schueler-Fakten pro Snapshot.

Wofuer du die Tabelle benutzt:
- Schuelerzahlen
- Verteilungen nach Geschlecht, Bildungsgang, Schulform, Foerderbedarf, Migration, Religion, Nation
- Zeitreihen ueber aggregierte Snapshot-Mengen

Wichtige Spalten:
- `snapshot_id`
- `student_no`
- `class_id`
- `school_form_id`
- `education_track_id`
- `ef`
- `special_needs`
- `target_different`
- `migration`
- `sex_id`
- `nation_id`

Wichtige Constraints:
- PK `snapshot_id, class_id, student_no`
- mehrere FKs auf Lookup-Tabellen
- Check Constraints fuer Bool-Felder
- `ON DELETE CASCADE` via `snapshot_id`

Wichtige Indizes:
- `idx_ss_class (snapshot_id, class_id)`
- `idx_ss_filters (snapshot_id, school_form_id, education_track_id, ef, special_needs, target_different)`
- `idx_ss_snapshot_special (snapshot_id, special_needs)`
- `idx_snapshot_student_sex (sex_id)`
- `idx_snapshot_student_migration (migration)`

Agentenhinweis:
- Fuer Massenauswertungen moeglichst ueber `snapshot_id` oder ueber einen Join von eingeschraenkten `snapshot`-Zeilen arbeiten.

### `snapshot_teacher`
Businesszweck:
Lehrer-Fakten pro Snapshot.

Wofuer du die Tabelle benutzt:
- Lehrerzahlen
- Verteilungen nach Geschlecht, Nationalitaet, Alter

Wichtige Spalten:
- `snapshot_id`
- `teacher_no`
- `sex_id`
- `nation_id`
- `age`

Wichtige Constraints:
- PK `snapshot_teacher_id`
- Unique `snapshot_id, teacher_no`
- FKs auf `snapshot`, `sex`, `nation`
- `ON DELETE CASCADE`

Wichtige Indizes:
- `idx_st_snapshot`
- `idx_st_sex`
- `idx_st_nation`

Agentenhinweis:
- Lehrer-Auswertungen sind meist einfacher als Schueler-Auswertungen, weil weniger Dimensionen beteiligt sind.

### `school`
Businesszweck:
Stammdaten einer Schule.

Wofuer du die Tabelle benutzt:
- Anzeigename, Ort und Aktivierung fuer Snapshot-Betrieb
- Join-Ziel fuer `snr`

Wichtige Spalten:
- `snr`
- `name`
- `city`
- `school_form_id`
- `is_enabled_for_snapshots`

Wichtige Constraints:
- PK `snr`
- FK auf `school_form`

Wichtige Indizes:
- `idx_school_enabled_for_snapshots`

Agentenhinweis:
- Wenn eine Anforderung "nur aktive Snapshot-Schulen" meint, ist oft `is_enabled_for_snapshots = 1` gemeint.

### `term`
Businesszweck:
Fachliche Zeitdimension.

Wofuer du die Tabelle benutzt:
- Schuljahre und Termin-Nummern in Auswertungen
- Trend- und Vergleichslogik

Wichtige Spalten:
- `term_id`
- `school_year`
- `term_no`
- `label`

Wichtige Constraints:
- PK `term_id`
- Unique `school_year, term_no`

Agentenhinweis:
- Fuer UI-Filter ist `school_year + term_no` oft fachlich sinnvoller als ein nacktes `term_id`.

### `snaps`
Businesszweck:
Globale Snapshot-Charge.

Wofuer du die Tabelle benutzt:
- Gruppierung mehrerer schulbezogener Snapshots unter einem technischen Import- oder Snapshot-Ereignis

Wichtige Spalten:
- `snap_id`
- `term_id`
- `snapshot_date`
- `source`

Agentenhinweis:
- Nur dann einbeziehen, wenn die Logik wirklich auf Charge-Ebene arbeitet. Viele normale KPI-Abfragen brauchen `snaps` nicht.

### `class`
Businesszweck:
Klassen-Stammdaten.

Wofuer du die Tabelle benutzt:
- Jahrgangsbezogene Auswertungen
- Klassenbezug in Schueler-Auswertungen

Wichtige Spalten:
- `class_id`
- `jahrgang`
- `parallel`
- `class_code`

Wichtige Constraints:
- PK `class_id`
- Unique `jahrgang, parallel, class_code`

### `school_form`
Businesszweck:
Lookup fuer Schulformen.

Wofuer du die Tabelle benutzt:
- Anreicherung und Gruppierung von Schueler- oder Schuldaten

### `education_track`
Businesszweck:
Lookup fuer Bildungsgange.

Wofuer du die Tabelle benutzt:
- Fachliche Segmentierung von Schuelern

Besonderheit:
- Spalten wie `sf`, `nr` und weitere freie Felder koennen fuer Speziallogik relevant sein. Nicht ungenutzt umbenennen oder entfernen.

### `support_focus`
Businesszweck:
Lookup fuer Foerderschwerpunkte.

Wofuer du die Tabelle benutzt:
- Segmentierung foerderbezogener Schuelerdaten

### `religion`
Businesszweck:
Lookup fuer Konfession oder Religion.

### `nation`
Businesszweck:
Lookup fuer Nationalitaet oder Staat.

### `sex`
Businesszweck:
Lookup fuer Geschlecht.

### `school_source_db`
Businesszweck:
Technische Importquelle pro Schule.

Wofuer du die Tabelle benutzt:
- Verbindungsdaten einer Schulquelle
- technische Verwaltung von Quellen

Wichtige Spalten:
- `source_id`
- `snr`
- `db_host`
- `db_port`
- `db_name`
- `db_user`
- `db_password_enc`
- `is_active`
- `last_test_at`
- `last_test_status`
- `last_import_at`

Wichtige Constraints:
- PK `source_id`
- Unique `snr`

Wichtige Indizes:
- `idx_school_source_db_active`
- `idx_school_source_db_snr`

Agentenhinweis:
- Passwort ist verschluesselt gespeichert.
- Diese Tabelle ist betrieblich kritisch und nicht fuer normale Reporting-Joins gedacht.

### `school_source_import_run`
Businesszweck:
Status und Zaehler eines konkreten Importlaufs.

Wofuer du die Tabelle benutzt:
- technische Nachvollziehbarkeit
- Monitoring
- Fehleranalyse

Wichtige Spalten:
- `import_run_id`
- `source_id`
- `status`
- `started_at`
- `finished_at`
- `snapshot_date`
- `inserted_students`
- `inserted_teachers`
- `inserted_classes`

Wichtige Indizes:
- `idx_school_source_import_run_status`
- `idx_school_source_import_run_started_at`

### `school_source_import_log`
Businesszweck:
Detailprotokoll eines Importlaufs.

Wofuer du die Tabelle benutzt:
- Fehler- und Warnanalyse

Wichtige Spalten:
- `import_run_id`
- `log_level`
- `log_message`
- `created_at`

### `app_user`
Businesszweck:
Anwendungsbenutzer fuer Login und Rechte.

Agentenhinweis:
- Relevanz primar fuer Auth- und Admin-Funktionen, nicht fuer Schulstatistik.

### `app_group`
Businesszweck:
Rollen- oder Gruppenstammdaten.

### `app_dashboard`
Businesszweck:
Liste verfuegbarer Dashboards.

### `app_group_dashboard`
Businesszweck:
Berechtigungszuordnung Gruppen <-> Dashboards.

### `test_source_students`
Businesszweck:
Test- oder Staging-Tabelle ausserhalb des zentralen Snapshot-Modells.

Agentenhinweis:
- Nur verwenden, wenn die Aufgabe ausdruecklich Testdaten oder Vorstufen betrifft.
- Nicht als produktive Quelle fuer KPI-Logik behandeln.

## Wichtige Constraints kompakt

### Eindeutigkeiten
- `app_dashboard.dashboard_key`
- `app_group.group_name`
- `app_user.username`
- `app_user.email`
- `term(school_year, term_no)`
- `class(jahrgang, parallel, class_code)`
- `school_source_db(snr)`
- `snapshot(snr, term_id, snapshot_date, source)`
- `snapshot_teacher(snapshot_id, teacher_no)`
- `snapshot_student(snapshot_id, class_id, student_no)`

### Cascade Deletes
- `app_group_dashboard` wird bei Loeschen von Gruppe oder Dashboard bereinigt
- `school_source_import_run` wird bei Loeschen der Quelle geloescht
- `school_source_import_log` wird bei Loeschen eines Importlaufs geloescht
- `snapshot_student` und `snapshot_teacher` werden bei Loeschen eines Snapshot-Kopfes geloescht

### Bool-Checks in `snapshot_student`
- `ef in (0,1)`
- `special_needs in (0,1)`
- `target_different in (0,1)`
- `migration in (0,1)`

## Wichtige Indizes kompakt

### Fuer Reporting
- `snapshot.idx_snapshot_new (snr, term_id, snapshot_date)`
- `snapshot.idx_snapshot_term_date_snr (term_id, snapshot_date, snr)`
- `snaps.idx_snaps_term_date (term_id, snapshot_date)`
- `snapshot_student.idx_ss_filters (snapshot_id, school_form_id, education_track_id, ef, special_needs, target_different)`
- `snapshot_student.idx_ss_class (snapshot_id, class_id)`
- `snapshot_student.idx_ss_snapshot_special (snapshot_id, special_needs)`
- `snapshot_teacher.idx_st_snapshot (snapshot_id)`

### Fuer Betrieb
- `school.idx_school_enabled_for_snapshots`
- `school_source_db.idx_school_source_db_active`
- `school_source_db.idx_school_source_db_snr`
- `school_source_import_run.idx_school_source_import_run_status`
- `school_source_import_run.idx_school_source_import_run_started_at`

## Typische Datenfluesse

### 1. Login und Rechte
1. Benutzer wird in `app_user` gefunden.
2. Die Gruppe kommt aus `app_group`.
3. Berechtigte Dashboards kommen ueber `app_group_dashboard`.
4. Das Backend leitet daraus Zugriff auf Dashboard-Endpunkte ab.

### 2. Einrichtung einer Quelle
1. Schule existiert in `school`.
2. Technische Quelle wird in `school_source_db` hinterlegt.
3. Verbindungstests und letzte Importe werden dort und in Importtabellen nachgehalten.

### 3. Import einer Snapshot-Charge
1. Import startet fuer eine Quelle aus `school_source_db`.
2. Ein Lauf wird in `school_source_import_run` erzeugt.
3. Laufmeldungen werden in `school_source_import_log` geschrieben.
4. Ein fachlicher Termin wird ueber `term` bestimmt.
5. Eine technische Charge wird in `snaps` erzeugt oder verwendet.
6. Pro Schule wird ein `snapshot` erzeugt.
7. Detaildaten landen in `snapshot_student` und `snapshot_teacher`.

### 4. KPI-Auswertung
1. Das Backend schraenkt `snapshot` auf Schule, Termin, Datum oder Quelle ein.
2. Es joint auf `snapshot_student` oder `snapshot_teacher`.
3. Lookup-Tabellen liefern sprechende Labels oder weitere Dimensionen.
4. Das Ergebnis wird aggregiert und an das Frontend geliefert.

### 5. Historische Vergleiche
1. Vergleich basiert fachlich auf `term` und technisch auf `snapshot`.
2. Schueler- oder Lehrerdaten werden ueber mehrere Snapshots aggregiert.

## Query-Regeln fuer Agenten

### Bevorzuge diese Reihenfolge
1. Fachlichen Scope bestimmen: Schule, Termin, Datum, Quelle
2. Passende `snapshot`-Zeilen ermitteln
3. Erst dann auf Fakten joinen
4. Labels nur dann ueber Lookup-Tabellen dazuholen, wenn wirklich gebraucht

### Vermeide diese Fehler
- Ohne Snapshot-Filter direkt gegen `snapshot_student` zaehlen
- `school_source_db` als harte FK-sichere Tabelle behandeln
- Trends nur ueber `snapshot_date` modellieren, obwohl `term` fachlich fuehrend ist
- `test_source_students` in produktive Reporting-Logik einbauen
- Bool-Felder wie Nullable-Felder behandeln, obwohl sie fachlich `0/1` sind

### Wenn du neue SQL-Queries schreibst
- Nutze bestehende Indizes mit `snapshot_id`, `term_id`, `snr` und den Filterspalten der Faktentabellen
- Bevorzuge parametrisierte Bedingungen
- Halte Ergebnisfelder stabil, wenn das Frontend bereits daran haengt

## Aenderungsregeln fuer Agenten

### Wenn du neue Tabellen oder Felder einfuehrst
- Frage zuerst, ob es in das Snapshot-Modell oder in Stammdaten gehoert
- Pruefe, ob der fachliche Anker `snapshot`, `school` oder `term` sein muss
- Denke bei Reporting-Feldern frueh ueber Indizes nach

### Wenn du Migrationen schreibst
- Bestehende Constraints nicht stillschweigend aufweichen
- Bei Quellen- oder Snapshot-Tabellen Rueckwaertskompatibilitaet besonders ernst nehmen
- Vor allem bei `snapshot`, `snapshot_student`, `snapshot_teacher` und Lookup-Tabellen defensiv vorgehen

### Wenn du Debugging machst
- Importproblem: starte bei `school_source_import_run` und `school_source_import_log`
- Fehlende Zahlen im Dashboard: starte bei `snapshot`, dann Fakten, dann Lookups
- Falsche Schulzuordnung: pruefe `snr` in `school`, `school_source_db` und `snapshot`

## Modellgrenzen und offene Vorsichtspunkte
- `snaps` und `snapshot` sind bewusst getrennt. Nicht voreilig zusammenlegen.
- `school_source_db.snr` ist fachlich sensibel, weil kein FK existiert.
- `test_source_students` ist kein zentraler Teil des Reporting-Modells.
- Einige Quell- oder Kommentartexte koennen Encoding-Artefakte enthalten. Technische Schluessel und IDs sind wichtiger als Anzeige-Texte.
