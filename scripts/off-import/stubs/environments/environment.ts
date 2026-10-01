// Nur für `npm run off-import:typecheck` (über `rootDirs` in tsconfig.json):
// `src/environments/environment.ts` ist gitignored und fehlt in einem frischen
// Clone; der Typgraph des Skripts erreicht sie über `import type { Food }`.
// Zur Laufzeit wird sie nie geladen (Type Stripping entfernt den Import).
export { environment } from '../../../../src/environments/environment.example.ts';
