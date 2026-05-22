# svwsConnection

Kleines Hilfsmodul fuer SVWS-Verbindungsaufbau und Verbindungspruefung.

## Zweck

Das Modul kapselt die robuste Pruefung einer SVWS-Datenbankverbindung auf Basis von:
- `host`
- `schule`
- `user`
- `passwort`

Geprueft wird der lesende Endpunkt:
- `GET /db/{schule}/schule/stammdaten`

## Export

```js
import { pruefeSvwsVerbindung, createSvwsClient } from "@smedia/lib/svwsConnection";
```

## Verhalten von `pruefeSvwsVerbindung(...)`

- normalisiert den Host
- baut die Test-URL fuer `schule/stammdaten`
- sendet einen GET-Request mit Basic Auth
- verwendet standardmaessig `5000` ms Timeout
- liefert bei Erfolg ein Objekt mit `ok: true`
- wirft bei Validierungs-, Netzwerk- oder HTTP-Fehlern eine gut lesbare Fehlermeldung

## Hinweis

Das Modul prueft nur die Erreichbarkeit und Authentifizierung. Es importiert keine Schuelerdaten und schreibt nichts in die lokale Datenbank.
