import axios from 'axios';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function pickFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function getSchuljahresabschnittId(schulStammdaten) {
  const raw = pickFirstDefined(
    schulStammdaten?.idSchuljahresabschnitt,
    schulStammdaten?.idSchuljahresAbschnitt,
    schulStammdaten?.schuljahresabschnitt?.id,
    schulStammdaten?.schuljahresAbschnitt?.id,
  );
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getEntrySchuljahresabschnittId(entry) {
  const raw = pickFirstDefined(
    entry?.idSchuljahresabschnitt,
    entry?.idSchuljahresAbschnitt,
    entry?.schuljahresabschnitt?.id,
    entry?.schuljahresAbschnitt?.id,
  );
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getKlasseId(entry) {
  return pickFirstDefined(entry?.id, entry?.idKlasse, entry?.klasseID, entry?.klassenID, entry?.klasse?.id);
}

function getSchuelerKlasseId(entry) {
  return pickFirstDefined(
    entry?.idKlasse,
    entry?.klasseID,
    entry?.klassenID,
    entry?.klasse?.id,
    entry?.idKlasseSchueler,
  );
}

function normalizeKlasseFromAuswahlliste(entry) {
  return {
    ...entry,
    id: getKlasseId(entry),
    kuerzel: String(pickFirstDefined(entry?.kuerzel, entry?.kuerzelKlasse, entry?.klasse, entry?.klassenname, 'Ohne Klasse')).trim(),
    sortierung: pickFirstDefined(entry?.sortierung, entry?.sortierungKlasse, entry?.klassenSortierung, 9999),
  };
}

function normalizeSchuelerFromAuswahlliste(entry) {
  return {
    ...entry,
    id: pickFirstDefined(entry?.id, entry?.idSchueler, entry?.schuelerID),
    nachname: String(pickFirstDefined(entry?.nachname, entry?.name, entry?.familienname, '')).trim(),
    vorname: String(pickFirstDefined(entry?.vorname, entry?.rufname, entry?.vornameAnzeige, '')).trim(),
    hatFoto: false,
    dbFotoUrl: null,
  };
}

function sortKlassenliste(klassen) {
  return klassen.sort((a, b) => {
    const sa = Number.isFinite(Number(a?.sortierung)) ? Number(a.sortierung) : 9999;
    const sb = Number.isFinite(Number(b?.sortierung)) ? Number(b.sortierung) : 9999;
    if (sa !== sb) return sa - sb;
    return String(a?.kuerzel ?? '').localeCompare(String(b?.kuerzel ?? ''), 'de');
  });
}

function sortSchuelerliste(schueler) {
  return schueler.sort((a, b) => {
    const byLastName = String(a?.nachname ?? '').localeCompare(String(b?.nachname ?? ''), 'de');
    if (byLastName !== 0) return byLastName;
    return String(a?.vorname ?? '').localeCompare(String(b?.vorname ?? ''), 'de');
  });
}

function mapAuswahllisteToKlassen(payload, expectedSchuljahresabschnittId) {
  const targetSchuljahresabschnittId =
    getEntrySchuljahresabschnittId(payload) ?? expectedSchuljahresabschnittId;

  const rawKlassen = asArray(payload?.klassen);
  const rawSchueler = asArray(payload?.schueler);

  return sortKlassenliste(
    rawKlassen
      .filter((klasse) => klasse && typeof klasse === 'object')
      .filter((klasse) => getEntrySchuljahresabschnittId(klasse) === targetSchuljahresabschnittId)
      .map((klasse) => {
        const normalizedKlasse = normalizeKlasseFromAuswahlliste(klasse);
        const klasseId = normalizedKlasse.id;

        const schueler = sortSchuelerliste(
          rawSchueler
            .filter((entry) => entry && typeof entry === 'object')
            .filter((entry) => getEntrySchuljahresabschnittId(entry) === targetSchuljahresabschnittId)
            .filter((entry) => {
              if (klasseId == null) return false;
              return String(getSchuelerKlasseId(entry)) === String(klasseId);
            })
            .map((entry) => normalizeSchuelerFromAuswahlliste(entry))
            .filter((entry) => entry.id != null),
        );

        return {
          id: normalizedKlasse.id,
          kuerzel: normalizedKlasse.kuerzel,
          sortierung: normalizedKlasse.sortierung,
          schueler,
        };
      })
      .filter((klasse) => klasse.schueler.length > 0),
  );
}

export async function loadKlassenUndSchueler(client = axios) {
  const schulResponse = await client.get('/schule/stammdaten');
  const idSchuljahresabschnitt = getSchuljahresabschnittId(schulResponse?.data);

  if (idSchuljahresabschnitt == null) {
    throw new Error('Fehlende idSchuljahresabschnitt in /schule/stammdaten');
  }

  const auswahlResponse = await client.get(`/schueler/abschnitt/${idSchuljahresabschnitt}/auswahlliste`);
  return mapAuswahllisteToKlassen(auswahlResponse?.data, idSchuljahresabschnitt);
}
