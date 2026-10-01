import { defineConfig } from 'vitest/config';

// Nur die Specs dieses Werkzeugs; `ng test` (App-Suite) schließt scripts/ nicht ein.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/off-import/**/*.spec.ts'],
  },
});
