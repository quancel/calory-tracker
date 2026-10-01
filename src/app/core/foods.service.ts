import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { LOCAL_TOP_N } from './food-search.constants';
import type { LocalFoodsState, ServerFoodHit } from './foods.calculations';
import { FOODS_SNAPSHOT_STORE, LocalDbService } from './local-db.service';
import { SupabaseService } from './supabase.service';

/**
 * Lesepfad für Foods (ADR-0021, löst die Lade-Strategie aus ADR-0012 Punkt 1
 * und den Food-Teil des Lesecaches aus ADR-0016 Punkt 8 ab) — der EINZIGE
 * Aufrufer von `rpc('top_foods')`, `rpc('search_foods')` und jeder
 * `foods`-Listenabfrage. Kein Pfad lädt `foods` ungefiltert.
 *
 * `foods()` ist der **lokale Bestand**, nicht der Katalog. Er besteht aus
 * drei Teilen, im Speicher per `id` zusammengeführt:
 * - **Top** — `top_foods(LOCAL_TOP_N)`, nutzerunabhängig, in IndexedDB mit
 *   Fingerabdruck der Top-20 zur Invalidierung (ADR-0021 Punkt 4);
 * - **Gemeinsam** — alle Foods mit `source is null or source = 'manual' or
 *   is_corrected`, bei JEDEM Start neu geladen;
 * - **Nutzer** — Foods aus eigenen `entries` und `meal_items` (RLS), bei
 *   jedem Start neu geladen, plus jedes Food, mit dem der Nutzer interagiert
 *   (`upsertFood()`); daraus entsteht auch `ownUseCounts`.
 * Liegt dieselbe `id` in mehreren Teilen, gewinnt die zuletzt vom Server
 * geholte Fassung; eine per `upsertFood()` übernommene gilt bis zur nächsten
 * Server-Auffrischung desselben Foods.
 *
 * Schreiben (Anlegen, Korrigieren), Open-Food-Facts-Lookup und
 * Barcode-Auflösung bleiben ausschließlich in
 * `food-search/food-search.service.ts` — dieser Dienst kennt keine dieser
 * Operationen. `upsertFood()` dient der Pflege des lokalen Bestands NACH
 * einem Schreibvorgang bzw. beim Übernehmen eines Treffers (kein eigener
 * Schreibweg auf `foods`).
 */

export type FoodSource = 'off' | 'manual';

export interface Food {
  id: string;
  name: string;
  kcal100g: number;
  proteinG100g: number;
  carbsG100g: number;
  fatG100g: number;
  /** `null` = „nicht gesetzt" — nie `100` als Ersatzwert (ADR-0008 Punkt 5). */
  defaultPortionG: number | null;
  source: FoodSource;
  /** `null` = kein Barcode hinterlegt. `foods.barcode` ist `unique` (ADR-0010 Punkt 4). */
  barcode: string | null;
  /**
   * Sperre für automatische Schreiber (ADR-0011 Punkt 7) — KEIN UI-Element,
   * reine Datenlogik: kein künftiger automatischer Schreibweg darf ein Food
   * mit `isCorrected === true` überschreiben. Wird nur von
   * `FoodSearchService.updateFood()` auf `true` gesetzt.
   */
  isCorrected: boolean;
  /** OFF-Beliebtheit (`foods.off_popularity`, ADR-0020 Punkt 2) — Rang-Kriterium, nie von der App geschrieben. */
  offPopularity: number;
}

export interface RawFoodRow {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  default_portion_g: number | null;
  source: FoodSource | null;
  barcode: string | null;
  is_corrected: boolean;
  off_popularity: number | null;
}

/** Spaltenliste der `foods`-Abfragen — auch für eingebettete `foods(…)` und vom Schreibweg in `food-search.service.ts` genutzt. */
export const FOOD_COLUMNS =
  'id, name, kcal_100g, protein_100g, carbs_100g, fat_100g, default_portion_g, source, barcode, is_corrected, off_popularity';

export function toFood(raw: RawFoodRow): Food {
  return {
    id: raw.id,
    name: raw.name,
    kcal100g: raw.kcal_100g,
    proteinG100g: raw.protein_100g,
    carbsG100g: raw.carbs_100g,
    fatG100g: raw.fat_100g,
    defaultPortionG: raw.default_portion_g,
    source: raw.source ?? 'manual',
    barcode: raw.barcode,
    isCorrected: raw.is_corrected,
    offPopularity: raw.off_popularity ?? 0,
  };
}

/** Schema der gespeicherten Teile — passt es nicht, gilt der Teil als nicht vorhanden (ADR-0021 Punkt 3). Bei neuer `Food`-Form erhöhen. */
export const FOODS_SNAPSHOT_SCHEMA = 1;
/** PostgREST-Zeilenlimit je Anfrage (`max_rows`, Supabase-Standard 1000). */
export const POSTGREST_PAGE_SIZE = 1000;
/** So viele Top-Zeilen bilden den Fingerabdruck (ADR-0021 Punkt 4). */
export const TOP_FINGERPRINT_SIZE = 20;
/** Abfragegrenze an `search_foods` — Obergrenze der Funktion (ADR-0020 Punkt 4); mehr als angezeigt, weil `SERVER_RESULT_LIMIT` erst NACH dem Duplikat-Abzug gilt. */
export const SEARCH_FOODS_REQUEST_LIMIT = 50;
/** Zeitlimit einer Serversuche. */
export const SEARCH_FOODS_TIMEOUT_MS = 8000;

const TOP_KEY = 'top';
const SHARED_KEY = 'shared';
const USER_KEY_PREFIX = 'user:';
const SHARED_FILTER = 'source.is.null,source.eq.manual,is_corrected.is.true';

function userKey(userId: string): string {
  return `${USER_KEY_PREFIX}${userId}`;
}

interface TopSnapshot {
  schema: number;
  topN: number;
  fingerprint: string;
  foods: Food[];
}

interface SharedSnapshot {
  schema: number;
  foods: Food[];
}

interface UserSnapshot {
  schema: number;
  foods: Food[];
  useCounts: Record<string, number>;
}

type PartName = 'top' | 'shared' | 'user';

/** Ergebnis von `searchServer()` — ein Abbruch ist nie ein Fehler (ADR-0021 Punkt 9/10). */
export type ServerSearchResult =
  { status: 'success'; hits: ServerFoodHit[] } | { status: 'error' } | { status: 'aborted' };

interface RawSearchRow extends RawFoodRow {
  own_use_count: number | null;
}

interface PageResponse {
  data: unknown;
  error: unknown;
}

function isValidSnapshot(value: unknown): value is { schema: number; foods: Food[] } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { schema?: unknown; foods?: unknown };
  return candidate.schema === FOODS_SNAPSHOT_SCHEMA && Array.isArray(candidate.foods);
}

/** Eingebettetes `foods(…)` kommt als Objekt (n:1), defensiv wird auch ein Einzel-Array akzeptiert. */
function embeddedFood(value: unknown): RawFoodRow | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ? (candidate as RawFoodRow) : null;
}

/**
 * `providedIn: 'root'`: der lokale Bestand überlebt das Öffnen/Schließen von
 * Sheets und wird je Sitzung genau einmal aufgebaut. Kein `user_id`-Filter in
 * den Abfragen — `foods` ist gemeinsamer Bestand, `entries`/`meal_items`
 * begrenzt RLS serverseitig (ADR-0004).
 */
@Injectable({ providedIn: 'root' })
export class CoreFoodsService {
  private readonly supabase = inject(SupabaseService);
  private readonly localDb = inject(LocalDbService);

  private readonly byIdState = signal<ReadonlyMap<string, Food>>(new Map());
  private readonly ownUseCountsState = signal<ReadonlyMap<string, number>>(new Map());
  private readonly localStateState = signal<LocalFoodsState>('idle');

  /** Lokaler Bestand (Top + Gemeinsam + Nutzer) — NICHT der Katalog. */
  readonly foods = computed(() => [...this.byIdState().values()]);
  /** Anzahl Verwendungen je `food_id` in den eigenen Einträgen (nur der angemeldete Nutzer). */
  readonly ownUseCounts = this.ownUseCountsState.asReadonly();
  readonly localState = this.localStateState.asReadonly();
  /** `true`, solange geladen wird UND noch gar kein Food vorliegt (Skeleton-Bedingung, design-conventions.md „Erstes Laden ohne lokalen Bestand"). */
  readonly initialLoading = computed(
    () => this.localStateState() === 'loading' && this.byIdState().size === 0,
  );

  private topIds = new Set<string>();
  private sharedIds = new Set<string>();
  private userIds = new Set<string>();
  /** `id`s, deren Fassung aus dem Netz oder per `upsertFood()` stammt — ein gespeicherter Teil überschreibt sie nie. */
  private readonly freshIds = new Set<string>();
  private storedTop: TopSnapshot | null = null;
  private topMeta: { topN: number; fingerprint: string } | null = null;
  private readonly hasData: Record<PartName, boolean> = { top: false, shared: false, user: false };
  private boundUserId: string | null = null;
  private activeWork = 0;
  private storedReadPromise: Promise<void> | null = null;
  private userSwitchPromise: Promise<void> = Promise.resolve();
  private loadPromise: Promise<void> | null = null;

  constructor() {
    // Nutzerbindung (ADR-0021 Punkt 7): beim Wechsel Nutzer-Teil und
    // Nutzungszahlen verwerfen, den Teil des neuen Nutzers laden.
    effect(() => {
      const userId = this.supabase.userId();
      untracked(() => {
        if (this.storedReadPromise === null || userId === this.boundUserId) return;
        this.userSwitchPromise = this.switchUser(userId);
      });
    });
  }

  /** Baut den lokalen Bestand genau einmal je Sitzung auf: erst gespeicherte Teile, danach Auffrischung aus dem Netz. */
  ensureLoaded(): Promise<void> {
    this.loadPromise ??= this.initialLoad();
    return this.loadPromise;
  }

  /** Lädt die Teile nach, für die weder frische noch gespeicherte Daten vorliegen (Statuszeilen-Button „Erneut versuchen"). */
  async retryLoad(): Promise<void> {
    await this.ensureStoredRead();
    await this.userSwitchPromise;
    const missing = (['top', 'shared', 'user'] as const).filter((part) => this.isMissing(part));
    if (missing.length === 0) return;
    await this.refresh(missing);
  }

  /**
   * Das Food zu einer ID aus dem lokalen Bestand — wartet das Lesen der
   * gespeicherten Teile ab (ohne Netz), statt sich auf `foods()` zum
   * Aufrufzeitpunkt zu verlassen (ADR-0021 Punkt 6/8, Offline-Puffer).
   */
  async findFood(id: string): Promise<Food | null> {
    await this.ensureStoredRead();
    await this.userSwitchPromise;
    return this.byIdState().get(id) ?? null;
  }

  /**
   * Übernimmt ein Food, mit dem der Nutzer interagiert (angelegt, korrigiert,
   * gescannt, ausgewählter Server-Treffer), sofort in den Nutzer-Teil — im
   * Speicher UND persistiert (ADR-0021 Punkt 2).
   */
  upsertFood(food: Food): void {
    const next = new Map(this.byIdState());
    next.set(food.id, food);
    this.byIdState.set(next);
    this.freshIds.add(food.id);
    this.userIds.add(food.id);
    void this.persistUser();
  }

  /** Erhöht die Nutzungszahl je `food_id` nach einem (auch gepufferten) Anlegen eines Eintrags und persistiert sie (ADR-0021 Punkt 8). */
  recordUse(foodIds: readonly string[]): Promise<void> {
    if (foodIds.length === 0) return Promise.resolve();
    const next = new Map(this.ownUseCountsState());
    for (const id of foodIds) {
      next.set(id, (next.get(id) ?? 0) + 1);
    }
    this.ownUseCountsState.set(next);
    return this.persistUser();
  }

  /**
   * Serversuche über `search_foods` (ADR-0020 Punkt 4, ADR-0021 Punkt 9):
   * fertig sortiert, höchstens `SEARCH_FOODS_REQUEST_LIMIT` Zeilen. Ein
   * Abbruch über `signal` liefert `aborted`, ein Zeitlimit `error`.
   */
  async searchServer(query: string, signal: AbortSignal): Promise<ServerSearchResult> {
    if (signal.aborted) return { status: 'aborted' };

    const inner = new AbortController();
    const onAbort = (): void => inner.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => inner.abort(), SEARCH_FOODS_TIMEOUT_MS);

    try {
      const response = await this.supabase.client
        .rpc('search_foods', { p_query: query.trim(), p_limit: SEARCH_FOODS_REQUEST_LIMIT })
        .abortSignal(inner.signal);

      if (signal.aborted) return { status: 'aborted' };
      if (response.error) return { status: 'error' };

      const rows = (response.data ?? []) as unknown as RawSearchRow[];
      return {
        status: 'success',
        hits: rows.map((row) => ({ food: toFood(row), ownUseCount: row.own_use_count ?? 0 })),
      };
    } catch {
      return signal.aborted ? { status: 'aborted' } : { status: 'error' };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  // --- Laden -----------------------------------------------------------------

  private async initialLoad(): Promise<void> {
    const storedRead = this.ensureStoredRead();
    this.beginWork();
    try {
      await storedRead;
      await this.refreshParts(['top', 'shared', 'user']);
    } finally {
      this.endWork();
    }
  }

  private async refresh(parts: readonly PartName[]): Promise<void> {
    this.beginWork();
    try {
      await this.refreshParts(parts);
    } finally {
      this.endWork();
    }
  }

  private async refreshParts(parts: readonly PartName[]): Promise<void> {
    const userIdAtStart = this.boundUserId;
    await Promise.all(
      parts.map((part) => {
        if (part === 'top') return this.refreshTop();
        if (part === 'shared') return this.refreshShared();
        return this.refreshUser(userIdAtStart);
      }),
    );
  }

  private beginWork(): void {
    this.activeWork += 1;
    this.recomputeState();
  }

  private endWork(): void {
    this.activeWork -= 1;
    this.recomputeState();
  }

  private isMissing(part: PartName): boolean {
    if (part === 'user' && this.boundUserId === null) return false;
    return !this.hasData[part];
  }

  private recomputeState(): void {
    if (this.storedReadPromise === null) {
      this.localStateState.set('idle');
      return;
    }
    if (this.activeWork > 0) {
      this.localStateState.set('loading');
      return;
    }
    const missing = (['top', 'shared', 'user'] as const).some((part) => this.isMissing(part));
    this.localStateState.set(missing ? 'unavailable' : 'ready');
  }

  private ensureStoredRead(): Promise<void> {
    if (this.storedReadPromise === null) {
      this.boundUserId = this.supabase.userId();
      this.storedReadPromise = this.readStoredParts(this.boundUserId);
    }
    return this.storedReadPromise;
  }

  private async readSnapshot<T>(key: string): Promise<T | undefined> {
    try {
      return await this.localDb.get<T>(FOODS_SNAPSHOT_STORE, key);
    } catch {
      // IndexedDB nicht verfügbar: der Bestand kommt dann nur aus dem Netz.
      return undefined;
    }
  }

  private async readStoredParts(userId: string | null): Promise<void> {
    const [top, shared, user] = await Promise.all([
      this.readSnapshot<TopSnapshot>(TOP_KEY),
      this.readSnapshot<SharedSnapshot>(SHARED_KEY),
      userId === null
        ? Promise.resolve(undefined)
        : this.readSnapshot<UserSnapshot>(userKey(userId)),
    ]);

    const next = new Map(this.byIdState());
    const put = (foods: readonly Food[]): void => {
      for (const food of foods) {
        if (!this.freshIds.has(food.id)) next.set(food.id, food);
      }
    };

    if (isValidSnapshot(top)) {
      this.storedTop = top as TopSnapshot;
      this.topIds = new Set(top.foods.map((food) => food.id));
      this.hasData.top = true;
      put(top.foods);
    }
    if (isValidSnapshot(shared)) {
      this.sharedIds = new Set(shared.foods.map((food) => food.id));
      this.hasData.shared = true;
      put(shared.foods);
    }
    if (isValidSnapshot(user)) {
      this.applyStoredUser(user as UserSnapshot, put);
    }
    this.byIdState.set(next);
  }

  private applyStoredUser(snapshot: UserSnapshot, put: (foods: readonly Food[]) => void): void {
    for (const food of snapshot.foods) this.userIds.add(food.id);
    this.hasData.user = true;
    put(snapshot.foods);
    if (this.ownUseCountsState().size === 0 && snapshot.useCounts) {
      this.ownUseCountsState.set(new Map(Object.entries(snapshot.useCounts)));
    }
  }

  // --- Top -------------------------------------------------------------------

  private async refreshTop(): Promise<void> {
    const fingerprint = await this.fetchTopFingerprint();
    // Offline/Fehler: der gespeicherte Teil bleibt gültig (ADR-0021 Punkt 4).
    if (fingerprint === null) return;

    const stored = this.storedTop;
    if (
      stored !== null &&
      stored.schema === FOODS_SNAPSHOT_SCHEMA &&
      stored.topN === LOCAL_TOP_N &&
      stored.fingerprint === fingerprint
    ) {
      this.hasData.top = true;
      return;
    }

    const foods = await this.fetchTopFoods();
    if (foods === null) return;

    // Erst jetzt, mit ALLEN Seiten: atomarer Tausch (Speicher und IndexedDB).
    this.applyFresh('top', foods);
    this.topMeta = { topN: LOCAL_TOP_N, fingerprint };
    this.hasData.top = true;
    await this.persistTop();
  }

  private async fetchTopFingerprint(): Promise<string | null> {
    try {
      const response = await this.supabase.client.rpc('top_foods', {
        p_limit: TOP_FINGERPRINT_SIZE,
      });
      if (response.error) return null;
      const rows = (response.data ?? []) as unknown as RawFoodRow[];
      return rows.map((row) => `${row.id}:${row.off_popularity ?? 0}`).join('|');
    } catch {
      return null;
    }
  }

  private async fetchTopFoods(): Promise<Food[] | null> {
    const rows = await this.fetchPages<RawFoodRow>(
      (from, to) => this.supabase.client.rpc('top_foods', { p_limit: LOCAL_TOP_N }).range(from, to),
      LOCAL_TOP_N,
    );
    return rows === null ? null : rows.map(toFood);
  }

  // --- Gemeinsam -------------------------------------------------------------

  private async refreshShared(): Promise<void> {
    const rows = await this.fetchPages<RawFoodRow>((from, to) =>
      this.supabase.client
        .from('foods')
        .select(FOOD_COLUMNS)
        .or(SHARED_FILTER)
        .order('id')
        .range(from, to),
    );
    if (rows === null) return;

    this.applyFresh('shared', rows.map(toFood));
    this.hasData.shared = true;
    await this.persistShared();
  }

  // --- Nutzer ----------------------------------------------------------------

  private async refreshUser(userId: string | null): Promise<void> {
    if (userId === null) return;

    const entryRows = await this.fetchPages<{ food_id: string; foods: unknown }>((from, to) =>
      this.supabase.client
        .from('entries')
        .select(`food_id, foods(${FOOD_COLUMNS})`)
        .order('id')
        .range(from, to),
    );
    if (entryRows === null) return;

    const mealItemRows = await this.fetchPages<{ foods: unknown }>((from, to) =>
      this.supabase.client
        .from('meal_items')
        .select(`foods(${FOOD_COLUMNS})`)
        .order('id')
        .range(from, to),
    );
    if (mealItemRows === null) return;

    // Während der Abfragen kann der Nutzer gewechselt haben — dann gehört das Ergebnis niemandem mehr.
    if (this.boundUserId !== userId) return;

    const foods = new Map<string, Food>();
    const counts = new Map<string, number>();
    for (const row of entryRows) {
      counts.set(row.food_id, (counts.get(row.food_id) ?? 0) + 1);
      const raw = embeddedFood(row.foods);
      if (raw) foods.set(raw.id, toFood(raw));
    }
    for (const row of mealItemRows) {
      const raw = embeddedFood(row.foods);
      if (raw) foods.set(raw.id, toFood(raw));
    }

    this.applyFresh('user', [...foods.values()]);
    this.ownUseCountsState.set(counts);
    this.hasData.user = true;
    await this.persistUser();
  }

  private async switchUser(userId: string | null): Promise<void> {
    this.boundUserId = userId;
    this.beginWork();
    try {
      // Nutzung des anderen Nutzers bleibt auch lokal unsichtbar (ADR-0021 Punkt 7).
      const keep = new Set([...this.topIds, ...this.sharedIds]);
      const next = new Map(this.byIdState());
      for (const id of this.userIds) {
        if (!keep.has(id)) next.delete(id);
      }
      this.byIdState.set(next);
      this.userIds = new Set();
      this.ownUseCountsState.set(new Map());
      this.hasData.user = false;
      await this.deleteOtherUserSnapshots(userId);

      if (userId === null) return;

      const stored = await this.readSnapshot<UserSnapshot>(userKey(userId));
      if (this.boundUserId !== userId) return;
      if (isValidSnapshot(stored)) {
        const merged = new Map(this.byIdState());
        this.applyStoredUser(stored as UserSnapshot, (foods) => {
          for (const food of foods) {
            if (!this.freshIds.has(food.id)) merged.set(food.id, food);
          }
        });
        this.byIdState.set(merged);
      }
      await this.refreshUser(userId);
    } finally {
      this.endWork();
    }
  }

  private async deleteOtherUserSnapshots(userId: string | null): Promise<void> {
    try {
      const keys = await this.localDb.getAllKeys(FOODS_SNAPSHOT_STORE);
      const own = userId === null ? null : userKey(userId);
      for (const key of keys) {
        if (typeof key === 'string' && key.startsWith(USER_KEY_PREFIX) && key !== own) {
          await this.localDb.delete(FOODS_SNAPSHOT_STORE, key);
        }
      }
    } catch {
      // Nicht löschbar: der Schlüssel wird beim nächsten Start erneut versucht.
    }
  }

  // --- Zusammenführen und Persistieren ---------------------------------------

  /** Setzt die frisch vom Server geholte Fassung eines Teils: Top/Gemeinsam ersetzen den Teil, der Nutzer-Teil wird vereinigt (nie gekürzt). */
  private applyFresh(part: PartName, foods: readonly Food[]): void {
    const next = new Map(this.byIdState());
    const newIds = new Set<string>();
    for (const food of foods) {
      next.set(food.id, food);
      newIds.add(food.id);
      this.freshIds.add(food.id);
    }

    if (part === 'user') {
      for (const id of newIds) this.userIds.add(id);
    } else {
      const oldIds = part === 'top' ? this.topIds : this.sharedIds;
      const otherIds = part === 'top' ? this.sharedIds : this.topIds;
      for (const id of oldIds) {
        if (!newIds.has(id) && !otherIds.has(id) && !this.userIds.has(id)) next.delete(id);
      }
      if (part === 'top') this.topIds = newIds;
      else this.sharedIds = newIds;
    }
    this.byIdState.set(next);
  }

  private foodsOf(ids: ReadonlySet<string>): Food[] {
    const byId = this.byIdState();
    const result: Food[] = [];
    for (const id of ids) {
      const food = byId.get(id);
      if (food) result.push(food);
    }
    return result;
  }

  private async put(key: string, value: unknown): Promise<void> {
    try {
      await this.localDb.put(FOODS_SNAPSHOT_STORE, value, key);
    } catch {
      // Ein nicht schreibbarer Cache darf die Suche nie beeinträchtigen.
    }
  }

  private persistTop(): Promise<void> {
    const meta = this.topMeta;
    if (meta === null) return Promise.resolve();
    const snapshot: TopSnapshot = {
      schema: FOODS_SNAPSHOT_SCHEMA,
      topN: meta.topN,
      fingerprint: meta.fingerprint,
      foods: this.foodsOf(this.topIds),
    };
    this.storedTop = snapshot;
    return this.put(TOP_KEY, snapshot);
  }

  private persistShared(): Promise<void> {
    const snapshot: SharedSnapshot = {
      schema: FOODS_SNAPSHOT_SCHEMA,
      foods: this.foodsOf(this.sharedIds),
    };
    return this.put(SHARED_KEY, snapshot);
  }

  private persistUser(): Promise<void> {
    const userId = this.boundUserId;
    if (userId === null) return Promise.resolve();
    const snapshot: UserSnapshot = {
      schema: FOODS_SNAPSHOT_SCHEMA,
      foods: this.foodsOf(this.userIds),
      useCounts: Object.fromEntries(this.ownUseCountsState()),
    };
    return this.put(userKey(userId), snapshot);
  }

  /**
   * Seitenweises Laden gegen das PostgREST-Zeilenlimit (ADR-0021 Punkt 5):
   * der Versatz rückt um die TATSÄCHLICH gelieferte Zeilenzahl vor, Ende bei
   * leerer Seite oder erreichter Obergrenze — bewusst nicht „Seite kürzer als
   * 1000 ⇒ Ende" (ein niedriger konfiguriertes `max_rows` schnitte sonst
   * still ab). `null` bei Fehler: ein unvollständiger Teil gilt nie als
   * geladen.
   */
  private async fetchPages<T>(
    page: (from: number, to: number) => PromiseLike<PageResponse>,
    limit = Number.POSITIVE_INFINITY,
  ): Promise<T[] | null> {
    const rows: T[] = [];
    let from = 0;
    try {
      while (rows.length < limit) {
        const response = await page(from, from + POSTGREST_PAGE_SIZE - 1);
        if (response.error) return null;
        const data = (response.data ?? []) as T[];
        if (data.length === 0) break;
        rows.push(...data);
        from += data.length;
      }
    } catch {
      return null;
    }
    return rows.length > limit ? rows.slice(0, limit) : rows;
  }
}
