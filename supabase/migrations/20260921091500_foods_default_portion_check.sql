-- Sichert die Regel "default_portion_g = null heißt nicht gesetzt" zusätzlich
-- in der Datenbank ab (ADR-0008 Punkt 5, verfeinert die foods-Tabelle aus
-- ADR-0004). Additiv, editiert die Basis-Migration nicht. Idempotent
-- formuliert: wiederholtes Einspielen ist unschädlich.

-- Spalte bleibt nullable und ohne Default -- null bedeutet weiterhin "nicht
-- gesetzt", nicht "100". Erlaubt sind null oder Werte > 0; die fachliche
-- Ablehnung von "<= 0" im ausgefüllten Feld setzt bereits die
-- Client-Validierung durch (ADR-0008 Punkt 5), dieser Constraint ist die
-- Datenbank-Garantie derselben Regel.
alter table foods drop constraint if exists foods_default_portion_g_check;
alter table foods add constraint foods_default_portion_g_check
  check (default_portion_g is null or default_portion_g > 0);
