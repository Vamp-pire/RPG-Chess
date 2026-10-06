import { Vec } from './geom';
import { Item, Mats, SLOTS, Slot, itemStats, makeItem, rollQ, setAlchemistCheck } from './items';
import { BASES, Fam, UniqId, starterOf } from '../data/gear';
import { MoveRule } from './rules';
import { AbilityId, MatId, TraitId } from '../data/materials';
import { Align, BranchId, CompanionId, JobId, PIECES, PROMO3, PieceId, jobDef } from '../data/pieces';
import { AreaId } from '../data/areas';
import { SetId, activeSets } from './sets';
import { Diff } from './difficulty';

export type QSt = 'locked' | 'avail' | 'active' | 'ready' | 'done';
export interface QState { st: QSt; n: number }

export interface GameState {
  v: number;
  piece: PieceId;
  job: JobId | null;
  hp: number;
  bonusHp: number;
  promoted: boolean;
  gold: number;
  bag: Mats;
  store: Mats;
  items: Item[];
  equip: Record<Slot, number | null>;
  nextId: number;
  area: AreaId;
  pos: Vec;
  quests: Record<string, QState>;
  flags: Record<string, number | boolean | string>;
  dex: Record<string, number>;
  progress: number;
  mastery: boolean;
  battles: number;
  promoted2: boolean;
  ach: Record<string, number>;
  party: CompanionId[];
  /** 레시피 노트: 한 번 만든 조합 (자동 채우기는 없다) */
  recipes: { slot: Slot; mats: Mats; name: string }[];
  diff: Diff;
  /** 재료를 대장간에서 쓴 횟수 (설명이 한 글자씩 드러난다) */
  matUse: Partial<Record<MatId, number>>;
}

const SAVE_KEY = 'chessforge_save_v1';
export let G: GameState = null as unknown as GameState;

// ---------- 저장 슬롯 (1~3). 1번은 옛 저장과 같은 키 ----------
export const SLOTS_N = 3;
let slot = (() => { try { return Math.min(SLOTS_N, Math.max(1, Number(localStorage.getItem('cf_slot') ?? 1))); } catch { return 1; } })();
const keyOf = (n: number) => (n === 1 ? SAVE_KEY : `${SAVE_KEY}_s${n}`);
export const curSlot = () => slot;
export function setSlot(n: number) {
  slot = n;
  try { localStorage.setItem('cf_slot', String(n)); } catch { /* */ }
}
/** 슬롯 요약 (타이틀의 슬롯 고르기용) */
export function slotInfo(n: number): { piece: string; area: string; diff: string; progress: number; rebirth: number; t: number } | null {
  try {
    const raw = localStorage.getItem(keyOf(n));
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState & { savedAt?: number };
    return { piece: pieceTitle(g), area: g.area, diff: g.diff ?? 'normal', progress: g.progress, rebirth: Number(g.flags?.rebirth ?? 0), t: g.savedAt ?? 0 };
  } catch {
    return null;
  }
}

// ---------- 세이브 코드: 저장을 문자열로 내보내고 불러온다 ----------
export async function exportCode(): Promise<string> {
  const json = JSON.stringify(G);
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return 'CF1.' + btoa(s);
}
export async function importCode(code: string): Promise<boolean> {
  try {
    const c = code.trim();
    if (!c.startsWith('CF1.')) return false;
    const bin = atob(c.slice(4));
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('deflate');
    const json = await new Response(new Blob([b]).stream().pipeThrough(ds)).text();
    const g = JSON.parse(json) as GameState;
    if (!g || g.v !== 1 || !g.piece || !g.flags) return false;
    localStorage.setItem(keyOf(slot), JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}

export function newGame(piece: PieceId, diff: Diff = 'normal'): GameState {
  G = {
    v: 1,
    piece,
    job: null,
    hp: PIECES[piece].hp * HP_MUL, // 체력 2배 규칙 (새 게임이 절반 체력으로 시작하던 것)
    bonusHp: 0,
    promoted: false,
    gold: 20,
    bag: { fiber: 2 },
    store: {},
    items: [],
    equip: { weapon: null, boots: null, armor: null, engrave: null, relic: null },
    nextId: 1,
    area: 'town',
    pos: [3, 4],
    quests: {},
    flags: { hpx2: true },
    dex: {},
    progress: 0,
    mastery: false,
    battles: 0,
    promoted2: false,
    ach: {},
    party: [],
    recipes: [],
    diff,
    matUse: {},
  };
  return G;
}

/** 이전 버전 저장을 현재 구조로 맞춘다 */
function migrate(g: GameState) {
  g.promoted2 ??= false;
  g.ach ??= {};
  g.party ??= [];
  g.recipes ??= [];
  g.diff ??= 'normal';
  g.matUse ??= {};
  // 체력 2배 규칙 이전 저장: 지금 체력도 2배로
  if (!g.flags.hpx2) {
    g.flags.hpx2 = true;
    g.hp = Math.min(maxHp(g), g.hp * HP_MUL);
  }
}

export function save() {
  try {
    localStorage.setItem(keyOf(slot), JSON.stringify({ ...G, savedAt: Date.now() }));
  } catch { /* 저장 불가 환경 */ }
}

export function load(): boolean {
  try {
    const raw = localStorage.getItem(keyOf(slot));
    if (!raw) return false;
    const g = JSON.parse(raw) as GameState;
    if (!g || g.v !== 1) return false;
    migrate(g);
    G = g;
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(keyOf(slot));
  } catch {
    return false;
  }
}

export function wipeSave() {
  try { localStorage.removeItem(keyOf(slot)); } catch { /* */ }
}

// ---------- 이벤트 버스 (업적·비밀 요소가 여기에 붙는다) ----------
type Handler = (data?: unknown) => void;
const handlers = new Map<string, Handler[]>();
export function on(ev: string, fn: Handler) {
  const l = handlers.get(ev) ?? [];
  l.push(fn);
  handlers.set(ev, l);
}
export function emit(ev: string, data?: unknown) {
  for (const fn of handlers.get(ev) ?? []) fn(data);
  for (const fn of handlers.get('*') ?? []) fn({ ev, data });
}

// ---------- 파생 값 ----------
/** 두 번째 승급: 고른 갈래가 있으면 그것, 없으면(옛 저장) 기본 */
export const promo2Of = (g = G) => {
  const p = PIECES[g.piece];
  const b = g.flags.branch as BranchId | undefined;
  return (b && p.branches?.[b]) || p.promo2;
};

/** 최대 체력. 붙어서 치면 피해 2배 규칙과 함께 모든 체력을 2배로 했다 (치고 빠지기만으로는 어렵게) */
export const HP_MUL = 2;
export const maxHp = (g = G) => HP_MUL * (PIECES[g.piece].hp + (g.promoted ? PIECES[g.piece].promo.hp : 0) + (g.promoted2 ? promo2Of(g).hp : 0) + (g.flags.promoted3 ? PROMO3.hp : 0) + g.bonusHp + gearHp(g));
/** 장착한 장비의 덤 효과 '최대 체력 +1' 합 */
export const gearHp = (g = G) => SLOTS.reduce((s, sl) => { const it = equipped(sl, g); return s + (it && usable(it, g) ? itemStats(it).hp : 0); }, 0);

export function baseRules(g = G): MoveRule[] {
  const p = PIECES[g.piece];
  const r = [...p.rules];
  if (g.promoted) r.push(...p.promo.rules);
  if (g.promoted2) r.push(...promo2Of(g).rules);
  if (g.flags.promoted3) r.push(...PROMO3.rules);
  return r;
}

export const pieceTitle = (g = G) => {
  const p = PIECES[g.piece];
  return g.flags.promoted3 ? PROMO3.name : g.promoted2 ? promo2Of(g).name : g.promoted ? p.promo.name : p.name;
};

export interface Loadout {
  rules: MoveRule[];
  traits: Partial<Record<TraitId, number>>;
  abilities: { slot: Slot; id: AbilityId; lv: number }[];
  sets: SetId[];
  /** 보스 고유 무기 효과 */
  uniq: UniqId[];
}

/** 이 장비를 지금 직업으로 쓸 수 있는가 (무기는 계열이 맞아야 한다. 옛 장비·공용 부위는 누구나) */
export function usable(it: Item, g = G): boolean {
  const f = it.base ? BASES[it.base]?.fam : undefined;
  return !f || f === align(g);
}

export function loadout(g = G): Loadout {
  const rules = baseRules(g);
  const traits: Partial<Record<TraitId, number>> = {};
  const abilities: Loadout['abilities'] = [];
  const uniq: UniqId[] = [];
  const worn: Item[] = [];
  for (const slot of SLOTS) {
    const it = equipped(slot, g);
    if (!it || !usable(it, g)) continue;
    worn.push(it);
    const s = itemStats(it);
    rules.push(...s.rules);
    for (const [t, lv] of Object.entries(s.traits)) traits[t as TraitId] = Math.min(3, (traits[t as TraitId] ?? 0) + (lv ?? 0));
    if (s.ability) abilities.push({ slot, ...s.ability });
    if (s.uniq) uniq.push(s.uniq);
  }
  // 세트 효과: 특성 상한(3)을 1 넘을 수 있다
  const sets = activeSets(worn);
  const up = (t: TraitId, n = 1) => { traits[t] = Math.min(4, (traits[t] ?? 0) + n); };
  for (const s of sets) {
    if (s === 'slime') up('sticky');
    if (s === 'fang') up('sharp');
    if (s === 'wing') up('light');
    if (s === 'stone') up('sturdy', 2);
    if (s === 'thorn') up('counter', 2);
    if (s === 'web') up('bind');
    if (s === 'ghost') up('kibo');
    if (s === 'ink') { up('sharp'); up('kibo'); }
  }
  return { rules, traits, abilities, sets, uniq };
}

export const equipped = (slot: Slot, g = G) => g.items.find((i) => i.id === g.equip[slot]) ?? null;

export const matHave = (id: MatId, g = G) => (g.bag[id] ?? 0) + (g.store[id] ?? 0);

/** 처음 손에 넣은 재료 (전리품 창에서 "새 재료"로 보여 주고 비운다) */
export const freshMats = new Set<MatId>();

export function addBag(id: MatId, n: number) {
  if (!G.flags[`got_${id}`]) freshMats.add(id);
  G.bag[id] = (G.bag[id] ?? 0) + n;
  G.flags[`got_${id}`] = true;
  emit('gain', { id, n });
}

/** 가방 먼저 소모 (가방은 잃을 수 있으니까) */
export function spendMats(m: Mats): boolean {
  for (const [id, n] of Object.entries(m)) if (matHave(id as MatId) < (n ?? 0)) return false;
  for (const [id, n] of Object.entries(m)) {
    let left = n ?? 0;
    const k = id as MatId;
    const fromBag = Math.min(left, G.bag[k] ?? 0);
    G.bag[k] = (G.bag[k] ?? 0) - fromBag;
    left -= fromBag;
    G.store[k] = (G.store[k] ?? 0) - left;
  }
  return true;
}

export const align = (g = G): Align | null => jobDef(g.job)?.align ?? null;
export const hasJob = (id: JobId, g = G) => g.job === id;
export const tier = (g = G) => Math.min(3, Math.floor(g.progress / 3));
setAlchemistCheck(() => !!G && G.job === 'alchemist');

/** 새 장비를 가방(장비 목록)에 넣는다. 그 부위가 비어 있고 쓸 수 있으면 바로 장착 */
export function addItem(baseId: string, q: number): Item {
  const it = makeItem(G.nextId++, baseId, q);
  G.items.push(it);
  G.flags[`seen_${baseId}`] = true;
  if (!G.equip[it.slot] && usable(it)) G.equip[it.slot] = it.id;
  emit('gear', it);
  return it;
}

/** 계열 시작 무기: 그 계열 무기를 하나도 안 가졌으면 준다 (직업을 정하거나 계열이 바뀔 때) */
export function giveStarter(f: Fam): Item | null {
  if (G.items.some((it) => it.base && BASES[it.base]?.fam === f)) return null;
  const it = addItem(starterOf(f).id, rollQ(0, 0) % 50);
  // 계열이 바뀌어 지금 무기를 못 쓰면 시작 무기로 갈아 낀다
  const cur = equipped('weapon');
  if (cur && !usable(cur)) G.equip.weapon = it.id;
  return it;
}

// ---------- 로그 ----------
const logLines: string[] = [];
let logListener: (() => void) | null = null;
export function log(msg: string) {
  logLines.push(msg);
  if (logLines.length > 40) logLines.shift();
  logListener?.();
}
export const getLog = () => logLines;
export const onLog = (fn: () => void) => { logListener = fn; };
