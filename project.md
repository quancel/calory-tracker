Baue eine Kalorien- und Makro-Tracker-App als PWA für zwei Nutzer (privat, nicht kommerziell). Arbeite schrittweise in der unten genannten Reihenfolge und lass nach jedem Schritt die App lauffähig.

## Stack
- Frontend: Angular (aktuelle Version, Standalone Components, Signals), TypeScript strict
- PWA über @angular/service-worker, installierbar, schnelle Updates (Update-Hinweis "Neue Version verfügbar, neu laden")
- Backend: Supabase (Auth per E-Mail/Passwort, Postgres, Row Level Security)
- Externe Daten: Open Food Facts API (Barcode-Lookup und Textsuche)
- Barcode-Scan: BarcodeDetector-API mit Fallback auf zxing-js
- Mobile-first, Deutsch als UI-Sprache

## Design
- Orientierung an Yazio (Tagesübersicht mit Kalorienring, Makro-Balken, Mahlzeiten-Sektionen, Floating-Add-Button), aber cleaner und offener
- Viel Weißraum, weiche Ecken, ruhige Farbpalette mit einer Akzentfarbe, klare Typografie
- Dark Mode unterstützen
- Große Touch-Ziele, Bedienung mit einer Hand, schnelle Eingabe hat Priorität

## Funktionen
1. Auth: Login/Logout, zwei Accounts, jeder sieht nur seine eigenen Einträge und Ziele
2. Tagesansicht: Datum wechseln, Summen für kcal, Protein, Kohlenhydrate, Fett gegen Tagesziel, Einträge gruppiert nach Frühstück/Mittag/Abendessen/Snacks
3. Eintrag hinzufügen: Suche (lokale Foods zuerst, dann Open Food Facts), Barcode-Scan, manuelles Anlegen; Menge in g eingeben, Werte live berechnen
4. Food-Cache: Jedes über Open Food Facts gefundene Food wird in der eigenen Datenbank gespeichert und beim nächsten Mal lokal gefunden
5. Manuelle Korrektur: Nährwerte jedes Foods editierbar. Korrigierte Foods haben Vorrang vor Open-Food-Facts-Daten und werden bei erneutem Scan nicht überschrieben. Fehlende oder offensichtlich unplausible Werte (z. B. Makros ergeben deutlich mehr kcal als angegeben) werden markiert
6. Gespeicherte Mahlzeiten: mehrere Foods mit Mengen zu einer Mahlzeit kombinieren, per Tap in eine Mahlzeit-Sektion loggen
7. "Gestern kopieren": einzelne Mahlzeit-Sektion oder ganzen Tag vom Vortag übernehmen
8. Ziele: kcal und Makros pro Tag, pro Person einstellbar
9. Verlauf: einfache Wochen-/Monatsansicht der Kalorien und Makros (Chart)
10. Optional, erst am Ende: Gewichtslog und Kalorienziel-Vorschlag anhand des Gewichtsverlaufs

## Datenmodell (Supabase / Postgres)
- foods: id, name, barcode (unique, nullable), kcal_100g, protein_100g, carbs_100g, fat_100g, default_portion_g, source ('off' | 'manual'), is_corrected (bool), created_by, created_at
  - Foods sind für beide Nutzer gemeinsam lesbar und editierbar
- entries: id, user_id, date, meal_type, food_id, amount_g, created_at
- meals: id, user_id, name
- meal_items: id, meal_id, food_id, amount_g
- goals: user_id, kcal, protein_g, carbs_g, fat_g
- Alle Nährwerte intern immer pro 100 g speichern, Umrechnung auf die Menge nur bei Berechnung/Anzeige
- Row Level Security auf allen Tabellen: entries, meals, meal_items, goals nur für den jeweiligen user_id; foods für alle authentifizierten Nutzer
- Liefere die Schema-Migrationen als SQL-Dateien im Repo mit

## Architektur
- Feature-Ordner: auth, diary, food-search, scanner, meals, goals, stats
- Services: SupabaseService, OpenFoodFactsService, FoodRepository (entscheidet: lokal, dann OFF, dann manuell)
- Signals für State, kein NgRx nötig
- Environment-Konfiguration für Supabase-URL und Anon-Key, keine Secrets im Repo
- Offline: App-Shell gecacht, Einträge bei fehlender Verbindung lokal zwischenspeichern und später synchronisieren (nice to have)

## Reihenfolge
1. Projekt-Setup, PWA-Konfiguration, Supabase-Anbindung, Auth
2. Schema und RLS
3. Tagesansicht mit Summen und Zielen
4. Manuelles Anlegen von Foods und Einträgen
5. Barcode-Scan mit Open-Food-Facts-Lookup und Cache
6. Manuelle Korrektur mit Vorrang
7. Gespeicherte Mahlzeiten und "gestern kopieren"
8. Verlauf und Charts
9. Design-Feinschliff, Dark Mode, Update-Hinweis

## Qualitätsanspruch
- Kein unnötiger Over-Engineering-Ballast, es sind nur zwei Nutzer
- Sauberer, lesbarer Code, sinnvolle Komponentenaufteilung
- Kurze README mit Setup (Supabase-Projekt, Migrationen, Env-Variablen, Deployment)
- Frage nach, wenn eine Entscheidung das Datenmodell wesentlich verändert, sonst entscheide selbst und dokumentiere kurz warum
</content>
</invoke>
