/**
 * Vorlage für `environment.ts` (siehe ADR-0003).
 *
 * `environment.ts` ist gitignored und wird lokal aus dieser Datei kopiert:
 *
 *   cp src/environments/environment.example.ts src/environments/environment.ts
 *
 * Werte danach mit den Daten aus dem Supabase-Projekt ("Project Settings" →
 * "API") ersetzen. Der Anon-Key ist kein Geheimnis (er ist RLS-beschränkt),
 * aber projektspezifisch — deshalb kein echter Wert im Repo.
 */
export const environment = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY',
};
