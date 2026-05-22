# loadKlassenUndSchueler

Technisches Hilfsmodul zum Laden und Normalisieren von Klassen- und Schuelerdaten aus einer SVWS-API.

## Zweck

Das Modul kapselt den zweistufigen Lesevorgang fuer:
- `GET /schule/stammdaten`
- `GET /schueler/abschnitt/{idSchuljahresabschnitt}/auswahlliste`

Es ermittelt zuerst den aktiven `idSchuljahresabschnitt` aus den Schulstammdaten und laedt danach die Schueler-Auswahlliste fuer genau diesen Abschnitt. Anschliessend werden die gelieferten Klassen- und Schuelerdaten in eine einheitliche, UI-freundliche Struktur normalisiert und sortiert.

## Export

```js
import { loadKlassenUndSchueler } from './loadKlassenUndSchueler.js'
```

```js
const klassenListe = await loadKlassenUndSchueler(client)
```

## Signatur

```js
async function loadKlassenUndSchueler(client = axios)
```

## Erwartete Anforderungen an `client`

Der uebergebene `client` muss mindestens eine Methode `get(url)` bereitstellen, die sich wie `axios.get(...)` verhaelt.

Typischerweise ist das:
- der globale `axios`-Client mit bereits gesetzter `baseURL` und `auth`
- oder eine eigene `axios.create(...)`-Instanz

## Erwartete API-Basis

Vor dem Aufruf sollte der Client bereits auf die gewuenschte SVWS-Datenbank konfiguriert sein, zum Beispiel:

```js
client.defaults.baseURL = 'https://server.example/db/schule1'
client.defaults.auth = { username: 'user', password: 'secret' }
```

Das Modul selbst setzt keine `baseURL`, keine Zugangsdaten und keine Header.

## Aufrufablauf

1. `GET /schule/stammdaten`
2. Extraktion von `idSchuljahresabschnitt`
3. `GET /schueler/abschnitt/{id}/auswahlliste`
4. Normalisierung und Sortierung der Rueckgabedaten

## Rueckgabeformat

Die Funktion liefert ein Array von Klassenobjekten in dieser Form:

```js
[
  {
    id: 123,
    kuerzel: '5a',
    sortierung: 10,
    schueler: [
      {
        id: 456,
        nachname: 'Mustermann',
        vorname: 'Mia',
        hatFoto: false,
        dbFotoUrl: null,
        ...weitereOriginalfelder
      }
    ]
  }
]
```

## Normalisierung

Das Modul gleicht unterschiedliche Feldnamen aus, die je nach SVWS-Antwortformat vorkommen koennen.

Beispiele:
- Schueler-ID: `id`, `idSchueler`, `schuelerID`
- Klassen-ID: `id`, `idKlasse`, `klasseID`, `klassenID`, `klasse.id`
- Klassenkuerzel: `kuerzel`, `kuerzelKlasse`, `klasse`, `klassenname`
- Schuljahresabschnitt: `idSchuljahresabschnitt`, `idSchuljahresAbschnitt`, verschachtelte `...?.id`

Zusaetzlich werden fuer Schueler diese Felder gesetzt:
- `hatFoto: false`
- `dbFotoUrl: null`

## Sortierung

Die Rueckgabe wird stabil fuer die UI vorbereitet:
- Klassen nach `sortierung`, danach nach `kuerzel` (deutsche Locale)
- Schueler nach `nachname`, danach nach `vorname` (deutsche Locale)

Klassen ohne gueltige Schueler werden aus der Rueckgabe entfernt.

## Fehlerverhalten

Das Modul behandelt API-Fehler nicht selbst, sondern reicht sie an den Aufrufer weiter.

Zusaetzlich wirft es einen eigenen Fehler, wenn aus `/schule/stammdaten` keine gueltige `idSchuljahresabschnitt` ermittelt werden kann:

```js
throw new Error('Fehlende idSchuljahresabschnitt in /schule/stammdaten')
```

UI-Meldungen, Logging, Rechtepruefung und Retry-Strategien gehoeren bewusst nicht in dieses Modul.

## Nicht im Verantwortungsbereich

Dieses Modul uebernimmt bewusst nicht:
- Login
- Rechtepruefung
- LocalStorage
- Vue-State
- Toasts oder andere UI-Reaktionen
- Schreibzugriffe auf SVWS-Endpunkte

## Beispielintegration

```js
import axios from 'axios'
import { loadKlassenUndSchueler } from './loadKlassenUndSchueler.js'

axios.defaults.baseURL = 'https://server.example/db/schema1'
axios.defaults.auth = { username: 'user', password: 'secret' }

const klassenListe = await loadKlassenUndSchueler(axios)
```

## Wiederverwendung in anderen Apps

Das Modul ist frameworkfrei und kann auch ausserhalb von Vue oder Electron genutzt werden, solange:
- dieselben SVWS-Endpunkte vorhanden sind
- ein kompatibler HTTP-Client uebergeben wird
- der Aufrufer die Authentifizierung und Fehlerdarstellung uebernimmt

## Dateibeziehung

Aktuelle Produktionsnutzung in diesem Repository:
- `SVWS-Photo-Matcher/desktop/src/login-verwaltung.js`
