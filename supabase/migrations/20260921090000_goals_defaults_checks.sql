-- Ergänzt goals um Defaults und Wertebereichs-Checks für das feldweise
-- Speichern (ADR-0007, verfeinert die goals-Tabelle aus ADR-0004).
-- Additiv, editiert die Basis-Migration nicht. Idempotent formuliert:
-- wiederholtes Einspielen ist unschädlich.

-- Default 0 je Wertspalte, Spalten bleiben not null. Ein insert mit nur
-- einer Wertspalte ist damit gültig; die übrigen drei stehen auf 0 und
-- bedeuten nach ADR-0006 Punkt 4 "kein Ziel gesetzt".
alter table goals alter column kcal set default 0;
alter table goals alter column protein_g set default 0;
alter table goals alter column carbs_g set default 0;
alter table goals alter column fat_g set default 0;

-- Wertebereiche als check-Constraints (ADR-0004 Punkt 3). Untergrenze
-- bewusst >= 0, nicht > 0 -- sonst wäre der Default 0 nicht einfügbar. Die
-- fachliche Untergrenze für kcal (> 0) setzt die Client-Validierung durch
-- (ADR-0007 Punkt 2).
alter table goals drop constraint if exists goals_kcal_range;
alter table goals add constraint goals_kcal_range
  check (kcal >= 0 and kcal <= 10000);

alter table goals drop constraint if exists goals_protein_g_range;
alter table goals add constraint goals_protein_g_range
  check (protein_g >= 0 and protein_g <= 1000);

alter table goals drop constraint if exists goals_carbs_g_range;
alter table goals add constraint goals_carbs_g_range
  check (carbs_g >= 0 and carbs_g <= 1000);

alter table goals drop constraint if exists goals_fat_g_range;
alter table goals add constraint goals_fat_g_range
  check (fat_g >= 0 and fat_g <= 1000);
