// Resolve-Hook für scripts/off-import (ADR-0022 Punkt 1): ergänzt bei
// RELATIVEN Spezifizierern ohne bekannte Endung `.ts`, damit die
// extensionlosen Importe in src/app unverändert unter Node-Type-Stripping
// laufen. Alles andere (Pakete, node:, Spezifizierer mit Endung) bleibt
// unberührt. Einbindung: node --import ./scripts/off-import/register-ts-resolve.mjs
import { registerHooks } from 'node:module';

const KNOWN_EXTENSION = /\.(?:ts|mts|cts|js|mjs|cjs|json|node)$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && !KNOWN_EXTENSION.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // keine .ts-Datei: Standardauflösung entscheidet (und wirft ggf. selbst)
      }
    }
    return nextResolve(specifier, context);
  },
});
