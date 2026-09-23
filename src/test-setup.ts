/**
 * Globale Testumgebung (nur `ng test`, nie Teil des Produktions-Bundles).
 * `jsdom` implementiert `indexedDB` nicht — `fake-indexeddb` polyfüllt es
 * ausschließlich für Tests, damit `core/local-db.service.ts` (natives
 * `indexedDB`, ADR-0016 Punkt 2) ohne Mock-Schicht getestet werden kann.
 * Reine Dev-Dependency, keine neue Laufzeit-Abhängigkeit im Sinne von
 * ADR-0016 Punkt 2 — sie wird nie in den Produktions-Build eingebunden.
 */
import 'fake-indexeddb/auto';
