-- Ergänzt goals um das Zielgewicht (ADR-0018 Punkt 1/2, verfeinert die
-- goals-Tabelle aus ADR-0004). Additiv, editiert keine bestehende Migration.
-- Idempotent formuliert: wiederholtes Einspielen ist unschädlich.

-- Nullable, ohne Default -- bewusste Abweichung von den vier bestehenden
-- goals-Spalten (ADR-0007 Punkt 1: dort default 0 = "kein Ziel"). Für ein
-- Gewicht ist 0 kein gültiger "nicht gesetzt"-Wert; null trägt dieselbe
-- Bedeutung ohne Sonderfall im check-Constraint (ADR-0018 Punkt 2).
alter table goals add column if not exists target_weight_kg numeric;

-- Wertebereich wie weight_logs.weight_kg (ADR-0017 Punkt 2), null-tolerant:
-- 20-400 kg und höchstens eine Nachkommastelle, bewusste Doppelung zur
-- Client-Validierung in goals/weight.calculations.ts.
alter table goals drop constraint if exists goals_target_weight_kg_range;
alter table goals add constraint goals_target_weight_kg_range
  check (
    target_weight_kg is null
    or (
      target_weight_kg >= 20.0
      and target_weight_kg <= 400.0
      and target_weight_kg = round(target_weight_kg, 1)
    )
  );

-- Keine Änderung an goals_select/_insert/_update: Beide decken die neue
-- Spalte bereits ab (ADR-0018 Punkt 5).
