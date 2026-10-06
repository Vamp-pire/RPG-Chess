// 조합 공식: 재료 비율 -> 행마 조각 / 특성 / 능력
import { ABILITIES, AbilityId, MATS, MatId, TraitId } from '../data/materials';
import { MoveRule, previewPattern } from './rules';
import { KING, Vec, sameSet } from './geom';
import { BASES, BaseDef, FAM_TRAIT, Fam, UniqId } from '../data/gear';

export type Slot = 'weapon' | 'boots' | 'armor' | 'engrave' | 'relic';
export const SLOTS: Slot[] = ['weapon', 'boots', 'armor', 'engrave', 'relic'];

export const SLOT_INFO: Record<Slot, { name: string; noun: string; role: string }> = {
  weapon: { name: '무기', noun: '창', role: '공격 행마가 추가된다' },
  boots: { name: '신발', noun: '장화', role: '이동 행마가 추가된다' },
  armor: { name: '방어구', noun: '갑옷', role: '특성이 더 쉽게, 더 강하게 붙는다' },
  engrave: { name: '각인', noun: '각인', role: '이동 변칙 능력 (밀치기·타넘기·교환)' },
  relic: { name: '유물', noun: '유물', role: '지형 능력 (지형 조작·덫) — 재료가 많이 필요' },
};

/** 부위마다 필요한 핵심 재료(섬유 제외) 최소 개수 — 장비 하나에 전투 몇 번이 들도록 */
export const MIN_CORE: Record<Slot, number> = { weapon: 2, boots: 3, armor: 3, engrave: 4, relic: 5 };

export type Mats = Partial<Record<MatId, number>>;

/** 개조 효과: 재료 하나를 개조 칸에 넣어 고른 것 */
export type ModEff =
  | { t: 'dir'; d: Vec } // 그 재료 행마의 한 방향 (같은 방향을 또 넣으면 그 방향이 길어진다)
  | { t: 'trait' } // 그 재료의 특성 +1
  | { t: 'range' } // 가장 긴 미끄러지기 +1 칸
  | { t: 'legfree' } // L자 공격의 멱이 사라진다 (은빛 날개)
  | { t: 'pierce' }; // 미끄러지기가 말을 꿰뚫는다 (망령 정수)
export interface Mod { mat: MatId; e: ModEff }
/** 덤 효과: 품질이 높은 장비에 무작위로 붙는다 */
export type Affix = { t: 'trait'; id: TraitId } | { t: 'hp' };

export interface Item {
  id: number;
  slot: Slot;
  /** 옛 방식(재료 조합) 장비의 재료. 새 장비는 비어 있다 */
  mats: Mats;
  /** 옛 방식 품질 (−1~+2). 새 장비는 q(%)를 쓴다 */
  quality: number;
  level: number;
  /** 이 무기로 쓰러뜨린 몹 수 (숙련) */
  kills?: number;
  /** 새 장비: 밑판 id (없으면 옛 방식 장비) */
  base?: string;
  /** 품질 0~100% */
  q?: number;
  mods?: Mod[];
  affix?: Affix[];
}

export interface ItemStats {
  name: string;
  rules: MoveRule[];
  traits: Partial<Record<TraitId, number>>;
  ability?: { id: AbilityId; lv: number };
  shares: { id: MatId; n: number; share: number }[];
  notes: string[];
  quality: number;
  /** 새 장비 정보 (옛 방식 장비는 없음) */
  base?: BaseDef;
  fam?: Fam;
  uniq?: UniqId;
  /** 품질 % 와 구간 (0 평범한 ~ 4 걸작) */
  q?: number;
  tier?: number;
  /** 개조 칸 수 */
  slotsN: number;
  mods: Mod[];
  affix: Affix[];
  /** 덤 효과로 늘어난 최대 체력 */
  hp: number;
  legacy: boolean;
}

// ---------- 품질 ----------
export const Q_TIERS = [
  { name: '평범한', min: 0, slots: 1, affix: 0, color: '#c9c2b0' },
  { name: '좋은', min: 50, slots: 2, affix: 0, color: '#7fd08a' },
  { name: '훌륭한', min: 80, slots: 2, affix: 1, color: '#6fb6ff' },
  { name: '뛰어난', min: 95, slots: 3, affix: 1, color: '#c08cff' },
  { name: '걸작', min: 100, slots: 3, affix: 2, color: '#f0c95a' },
];
export const qTier = (q: number) => (q >= 100 ? 4 : q >= 95 ? 3 : q >= 80 ? 2 : q >= 50 ? 1 : 0);
export const qName = (q: number) => Q_TIERS[qTier(q)].name;
/** 망치질로 올릴 수 있는 품질 상한 (걸작은 드랍으로만) */
export const HAMMER_Q_MAX = 99;

/**
 * 품질 굴리기: 평범한 60% · 좋은 30% · 훌륭한 8% · 뛰어난 1.8% · 걸작 0.2%.
 * boost(0~1): 높을수록 위쪽으로 (엘리트·접두어 몹·빛나는 개체·사냥꾼). floor: 이 품질 이상 확정 (천장)
 */
export function rollQ(boost = 0, floor = 0, rnd = Math.random): number {
  const u = 1 - (1 - rnd()) * (1 - Math.min(0.9, boost));
  let q: number;
  if (u < 0.6) q = Math.floor((u / 0.6) * 50);
  else if (u < 0.9) q = 50 + Math.floor(((u - 0.6) / 0.3) * 30);
  else if (u < 0.98) q = 80 + Math.floor(((u - 0.9) / 0.08) * 15);
  else if (u < 0.998) q = 95 + Math.floor(((u - 0.98) / 0.018) * 5);
  else q = 100;
  if (q < floor) q = floor + Math.floor(rnd() * Math.max(1, 95 - floor));
  return Math.max(0, Math.min(100, q));
}

/** 개조 상한: 새 방향 2개, 사거리 +2, 특성 +2 */
export const MOD_CAP = { dir: 2, range: 2, trait: 2 };

export const ITEM_MAX_LEVEL = 3;
export const FRAG_MIN = 0.3;
export const TRAIT_MIN = 0.4;
export const ARMOR_TRAIT_MIN = 0.2;

export function totalOf(m: Mats, withBinder = true) {
  let t = 0;
  for (const [id, n] of Object.entries(m)) {
    if (!n) continue;
    if (!withBinder && MATS[id as MatId].binder) continue;
    t += n;
  }
  return t;
}


const LEGACY = { slotsN: 0, mods: [] as Mod[], affix: [] as Affix[], hp: 0, legacy: true };

export function computeItem(slot: Slot, mats: Mats, quality = 0): ItemStats {
  // 숨은 조합: 녹슨 방아쇠 + 거울 파편 + 기보 파편을 무기로 벼리면 총
  if (slot === 'weapon' && (mats.trigger ?? 0) >= 1 && (mats.mirror ?? 0) >= 1 && (mats.shard ?? 0) >= 1) {
    const core = totalOf(mats, false);
    const shares = (Object.entries(mats) as [MatId, number][]).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, share: core ? n / core : 0 }));
    return {
      name: '기보 밖의 총',
      rules: [{ kind: 'slide', dirs: KING, range: 4, mode: 'attack', gun: true }], // 끝까지 → 4칸 (장거리 공짜 딜이 너무 셌다, 베타 제보)
      traits: {},
      shares,
      notes: ['체스에는 없는 무기. 8방향 4칸까지 사격 3 피해, 쏜 뒤 두 턴 재장전. 다른 재료는 섞이지 않는다.'],
      quality,
      ...LEGACY,
    };
  }
  const notes: string[] = [];
  const core = totalOf(mats, false);
  const binder = mats.fiber ?? 0;
  const shares = (Object.entries(mats) as [MatId, number][])
    .filter(([id, n]) => n > 0 && !MATS[id].binder)
    .map(([id, n]) => ({ id, n, share: core ? n / core : 0 }))
    .sort((a, b) => b.n - a.n || (MATS[b.id].rare ? 1 : 0) - (MATS[a.id].rare ? 1 : 0));

  const rules: MoveRule[] = [];
  const traits: Partial<Record<TraitId, number>> = {};
  let ability: ItemStats['ability'];

  // 1) 행마 조각 (무기=공격, 신발=이동), 비율 30% 이상인 상위 2개
  if (slot === 'weapon' || slot === 'boots') {
    const mode = slot === 'weapon' ? 'attack' : 'move';
    let used = 0;
    for (const s of shares) {
      const f = MATS[s.id].frag;
      if (!f) continue;
      if (s.share < FRAG_MIN) {
        notes.push(`${MATS[s.id].name}: 비율 ${Math.round(s.share * 100)}% (30% 미만) → 행마 조각 탈락`);
        continue;
      }
      if (used >= 2) {
        notes.push(`${MATS[s.id].name}: 행마 조각은 최대 2개까지`);
        continue;
      }
      used++;
      // 같은 재료를 더 넣으면 미끄러지는 칸이 늘어난다: 2개당 1칸 (베타 피드백: 1개당 1칸은 너무 후함)
      const range = f.kind === 'slide' ? Math.min(7, f.range + Math.floor((s.n - 1) / 2)) : 1;
      // 무기의 L자 공격에는 멱이 있다 (장기의 마처럼 바로 옆 곧은 칸이 막히면 그쪽으로는 못 친다 — 카이팅 억제)
      // 은빛 날개를 30% 이상 넣으면 멱을 넘는다 (달빛 아래 두 번 뛴 박쥐의 날개)
      const legFree = shares.some((x) => x.id === 'silver' && x.share >= FRAG_MIN);
      const leg = !legFree && mode === 'attack' && f.kind === 'leap' && f.dirs.some(([dx, dy]) => Math.abs(dx) + Math.abs(dy) === 3);
      rules.push({ kind: f.kind, dirs: f.dirs, range, mode, ...(leg ? { leg: true } : {}) });
      if (legFree && mode === 'attack' && f.kind === 'leap') notes.push(`은빛 날개: L자 공격이 멱을 넘어요`);
      if (leg) notes.push(`${MATS[s.id].name}: L자 공격은 멱이 있어요 — 치려는 쪽 바로 옆 곧은 칸이 막혀 있으면 못 쳐요`);
    }
  }

  // 망령 정수: 비율 30% 이상이면 이 장비의 슬라이드가 말을 통과한다
  if (shares.some((s) => MATS[s.id].phase && s.share >= FRAG_MIN)) {
    for (const r of rules) if (r.kind === 'slide') r.pierce = true;
    if (rules.some((r) => r.pierce)) notes.push('망령 정수: 슬라이드가 관통 이동이 됨');
  }

  // 2) 특성
  const tmin = slot === 'armor' ? ARMOR_TRAIT_MIN : TRAIT_MIN;
  for (const s of shares) {
    const t = MATS[s.id].trait;
    if (!t) continue;
    if (s.share < tmin) {
      notes.push(`${MATS[s.id].name}: 비율 ${Math.round(s.share * 100)}% (${Math.round(tmin * 100)}% 미만) → 특성 없음`);
      continue;
    }
    let lv = 1 + Math.floor((s.n - 1) / 2);
    if (slot === 'armor') lv += 1;
    traits[t] = Math.min(3, (traits[t] ?? 0) + lv);
  }

  // 3) 능력 (각인/유물): 해당 부위 능력을 가진 재료 중 가장 많은 것
  if (slot === 'engrave' || slot === 'relic') {
    const cands = shares.filter((s) => {
      const a = MATS[s.id].ability;
      return a && ABILITIES[a].slot === slot;
    });
    if (cands.length) {
      const top = cands[0];
      const a = MATS[top.id].ability!;
      const need = ABILITIES[a].need;
      if (top.n >= need) ability = { id: a, lv: Math.min(3, 1 + Math.floor((top.n - need) / 2)) };
      else notes.push(`${ABILITIES[a].name}: ${MATS[top.id].name} ${need}개 이상 필요`);
    } else if (core > 0) {
      notes.push(`${SLOT_INFO[slot].name} 능력을 가진 재료가 없음 → 특성만 붙는다`);
    }
  }

  // 4) 품질: 결합제는 2개 이상이면 +1 (그 이상은 쌓이지 않는다), 미니게임 ±1
  const q = quality + (binder >= 2 ? 1 : 0);
  if (q !== 0) applyQuality(q, rules, traits, ability);

  const top = shares[0];
  const name = top ? `${MATS[top.id].short} ${SLOT_INFO[slot].noun}` : `빈 ${SLOT_INFO[slot].noun}`;
  return { name, rules, traits, ability, shares, notes, quality: q, ...LEGACY };
}

function applyQuality(q: number, rules: MoveRule[], traits: Partial<Record<TraitId, number>>, ability?: { id: AbilityId; lv: number }) {
  const slide = rules.filter((r) => r.kind === 'slide').sort((a, b) => b.range - a.range)[0];
  if (slide) {
    slide.range = Math.max(1, Math.min(7, slide.range + q));
    return;
  }
  const tk = (Object.keys(traits) as TraitId[]).sort((a, b) => (traits[b] ?? 0) - (traits[a] ?? 0))[0];
  if (tk) {
    traits[tk] = Math.max(1, Math.min(3, (traits[tk] ?? 0) + q));
    return;
  }
  if (ability) ability.lv = Math.max(1, Math.min(3, ability.lv + q));
}

export function itemStats(it: Item): ItemStats {
  if (it.base && BASES[it.base]) return computeBase(it);
  const s = computeItem(it.slot, it.mats, it.quality);
  s.name = `옛 ${s.name}`;
  if (it.level > 0) s.name += ` +${it.level}`;
  return s;
}

const clone = (r: MoveRule): MoveRule => ({ ...r, dirs: r.dirs.map((d) => [d[0], d[1]] as Vec) });
const addTrait = (traits: Partial<Record<TraitId, number>>, t: TraitId, n = 1) => { traits[t] = Math.min(3, (traits[t] ?? 0) + n); };

/** 강화 한 단계: +1·+3은 가장 긴 미끄러지기(없으면 특성·능력), +2는 계열 특성 */
function levelUp(lv: number, rules: MoveRule[], traits: Partial<Record<TraitId, number>>, ability: ItemStats['ability'], fam: Fam | undefined, slot: Slot) {
  const famT: TraitId = fam ? FAM_TRAIT[fam] : slot === 'armor' ? 'sturdy' : 'sharp';
  for (let i = 1; i <= lv; i++) {
    if (i === 2) { addTrait(traits, famT); continue; }
    const before = JSON.stringify([rules, traits, ability]);
    applyQuality(1, rules, traits, ability);
    if (JSON.stringify([rules, traits, ability]) === before) addTrait(traits, famT);
  }
}

/** 개조 효과 하나를 적용한다 */
function applyMod(m: Mod, slot: Slot, rules: MoveRule[], traits: Partial<Record<TraitId, number>>, modRules: MoveRule[]) {
  const d = MATS[m.mat];
  const e = m.e;
  if (e.t === 'trait' && d.trait) addTrait(traits, d.trait);
  else if (e.t === 'dir' && d.frag && (slot === 'weapon' || slot === 'boots')) {
    const mode = slot === 'weapon' ? 'attack' : 'move';
    // 같은 재료·같은 방향을 또 넣으면 그 방향이 길어진다
    const same = modRules.find((r) => r.kind === d.frag!.kind && sameSet(r.dirs, [e.d]) && r.mode === mode);
    if (same && (same.kind === 'slide' || same.kind === 'hop')) { same.range = Math.min(7, same.range + 1); return; }
    const leg = mode === 'attack' && d.frag.kind === 'leap' && Math.abs(e.d[0]) + Math.abs(e.d[1]) === 3;
    const r: MoveRule = { kind: d.frag.kind, dirs: [[e.d[0], e.d[1]]], range: d.frag.kind === 'slide' ? Math.min(2, d.frag.range) : d.frag.kind === 'hop' ? 3 : 1, mode, ...(leg ? { leg: true } : {}) };
    modRules.push(r);
    rules.push(r);
  } else if (e.t === 'range') {
    const r = rules.filter((x) => x.kind === 'slide' || x.kind === 'hop').sort((a, b) => b.range - a.range)[0];
    if (r) r.range = Math.min(7, r.range + 1);
  } else if (e.t === 'legfree') for (const r of rules) delete r.leg;
  else if (e.t === 'pierce') for (const r of rules) if (r.kind === 'slide') r.pierce = true;
}

/** 새 장비(밑판 + 품질 + 개조 + 덤 + 강화)의 성능 */
export function computeBase(it: Item): ItemStats {
  const b = BASES[it.base!];
  const q = it.q ?? 0;
  const tier = qTier(q);
  const rules = b.rules.map(clone);
  const traits: Partial<Record<TraitId, number>> = { ...(b.traits ?? {}) };
  const ability = b.ability ? { ...b.ability } : undefined;
  const modRules: MoveRule[] = [];
  const mods = it.mods ?? [];
  for (const m of mods) applyMod(m, b.slot, rules, traits, modRules);
  let hp = 0;
  for (const a of it.affix ?? []) {
    if (a.t === 'hp') hp += 1;
    else addTrait(traits, a.id);
  }
  levelUp(it.level, rules, traits, ability, b.fam, b.slot);
  const notes: string[] = [];
  if (b.unique) notes.push(`고유: ${UNIQ_DESC[b.unique]}`);
  if (rules.some((r) => r.gun)) notes.push('체스에는 없는 무기. 8방향 4칸까지 사격 3 피해, 쏜 뒤 두 턴 재장전.');
  const pre = tier > 0 ? `${Q_TIERS[tier].name} ` : '';
  return {
    name: `${pre}${b.name}${it.level > 0 ? ` +${it.level}` : ''}`,
    rules, traits, ability, shares: [], notes, quality: 0,
    base: b, fam: b.fam, uniq: b.unique, q, tier,
    slotsN: Q_TIERS[tier].slots + (alchemistSlot() ? 1 : 0),
    mods, affix: it.affix ?? [], hp, legacy: false,
  };
}

/** 연금술사: 개조 칸 +1 (state를 직접 부르면 순환 참조라 state가 등록한다) */
let alchemistSlot = () => false;
export const setAlchemistCheck = (fn: () => boolean) => { alchemistSlot = fn; };
const UNIQ_DESC: Record<UniqId, string> = { crowd: '포위 돌파 — 붙어 있는 적이 둘 이상이면 피해 +1', aim: '정조준 — 제자리에서 치면 피해 +1', swap: '자리 바꾸기 — 친 적이 살아남으면 자리를 바꾼다' };
const TRAIT_NAME: Record<TraitId, string> = { sticky: '점착', sharp: '날카로움', light: '경량', sturdy: '견고', counter: '반격', kibo: '기보 이탈', bind: '속박', undying: '불굴' };

export type ModOpt = { e: ModEff; label: string; ok: boolean; why?: string };
/** 이 장비에 이 재료로 할 수 있는 개조 (상한을 넘는 것은 ok=false와 이유) */
export function modOptions(it: Item, mat: MatId): ModOpt[] {
  const b = BASES[it.base ?? ''];
  if (!b) return [];
  const d = MATS[mat];
  const mods = it.mods ?? [];
  const out: ModOpt[] = [];
  const stats = computeBase(it);
  const full = mods.length >= stats.slotsN;
  const nDir = mods.filter((m) => m.e.t === 'dir').length;
  const nRange = mods.filter((m) => m.e.t === 'range').length;
  const nTrait = mods.filter((m) => m.e.t === 'trait').length;
  // 같은 방향을 다시 넣어 길게 한 횟수도 사거리 개조로 센다
  const extends_ = mods.filter((m, i) => m.e.t === 'dir' && mods.slice(0, i).some((p) => p.mat === m.mat && p.e.t === 'dir' && eqv(p.e.d, (m.e as { d: Vec }).d))).length;
  const newDirs = nDir - extends_;
  const hasLine = stats.rules.some((r) => r.kind === 'slide' || r.kind === 'hop');
  if (d.frag && (b.slot === 'weapon' || b.slot === 'boots')) {
    const line = d.frag.kind === 'slide' || d.frag.kind === 'hop';
    for (const v of d.frag.dirs) {
      const extend = mods.some((m) => m.mat === mat && m.e.t === 'dir' && eqv(m.e.d, v));
      if (extend && !line) continue;
      // 이미 닿는 칸만 더하는 방향은 고를 수 없게 (헛개조 방지)
      const mode = b.slot === 'weapon' ? 'attack' : 'move';
      const trial = computeBase({ ...it, mods: [...mods, { mat, e: { t: 'dir', d: v } }] });
      const before = new Set([...previewPattern(stats.rules.filter((r) => r.mode !== (mode === 'attack' ? 'move' : 'attack')), 4).keys()]);
      const adds = [...previewPattern(trial.rules.filter((r) => r.mode !== (mode === 'attack' ? 'move' : 'attack')), 4).keys()].some((k) => !before.has(k));
      const ok = adds && (extend ? nRange + extends_ < MOD_CAP.range : newDirs < MOD_CAP.dir);
      out.push({ e: { t: 'dir', d: v }, label: extend ? '이 방향 더 길게' : '이 방향 추가', ok, why: ok ? undefined : !adds ? '이미 닿는 칸이에요' : extend ? `사거리 개조는 +${MOD_CAP.range}까지` : `새 방향은 ${MOD_CAP.dir}개까지` });
    }
  }
  if (d.trait) {
    const ok = nTrait < MOD_CAP.trait;
    out.push({ e: { t: 'trait' }, label: `${TRAIT_NAME[d.trait]} +1`, ok, why: ok ? undefined : `특성 개조는 ${MOD_CAP.trait}번까지` });
  }
  if (mat === 'silver' && b.slot === 'weapon' && stats.rules.some((r) => r.leg)) out.push({ e: { t: 'legfree' }, label: 'L자 공격의 멱 없애기', ok: !mods.some((m) => m.e.t === 'legfree') });
  if (mat === 'ecto' && stats.rules.some((r) => r.kind === 'slide' && !r.pierce)) out.push({ e: { t: 'pierce' }, label: '미끄러지기 관통', ok: !mods.some((m) => m.e.t === 'pierce') });
  if (d.rare && !d.key && hasLine) {
    const ok = nRange + extends_ < MOD_CAP.range;
    out.push({ e: { t: 'range' }, label: '가장 긴 줄 +1칸', ok, why: ok ? undefined : `사거리 개조는 +${MOD_CAP.range}까지` });
  }
  if (full) for (const o of out) { o.ok = false; o.why = '개조 칸이 다 찼어요'; }
  return out;
}
const eqv = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1];

/** 개조 효과 한 줄 설명 */
export function modLabel(m: Mod): string {
  const d = MATS[m.mat];
  const e = m.e;
  if (e.t === 'trait') return `${d.short}: ${TRAIT_NAME[d.trait!]} +1`;
  if (e.t === 'range') return `${d.short}: 사거리 +1`;
  if (e.t === 'legfree') return `${d.short}: 멱 없음`;
  if (e.t === 'pierce') return `${d.short}: 관통`;
  return `${d.short}: ${arrowOf(e.d)} 방향`;
}
export function arrowOf([x, y]: Vec): string {
  const key = `${Math.sign(x)},${Math.sign(y)}`;
  const base = ({ '0,-1': '↑', '1,-1': '↗', '1,0': '→', '1,1': '↘', '0,1': '↓', '-1,1': '↙', '-1,0': '←', '-1,-1': '↖' } as Record<string, string>)[key] ?? '·';
  if (Math.abs(x) + Math.abs(y) === 3) return `${base}(L)`;
  return Math.max(Math.abs(x), Math.abs(y)) === 2 ? `${base}${base}` : base;
}
export const affixLabel = (a: Affix) => (a.t === 'hp' ? '최대 체력 +1' : `${TRAIT_NAME[a.id]} +1`);

/** 덤 효과 굴리기 (계열 특성이 조금 더 잘 나온다) */
export function rollAffix(n: number, fam?: Fam): Affix[] {
  const pool: Affix[] = [{ t: 'hp' }, { t: 'trait', id: 'sharp' }, { t: 'trait', id: 'sturdy' }, { t: 'trait', id: 'light' }, { t: 'trait', id: 'kibo' }];
  if (fam) pool.push({ t: 'trait', id: FAM_TRAIT[fam] }, { t: 'trait', id: FAM_TRAIT[fam] });
  const out: Affix[] = [];
  while (out.length < n && pool.length) {
    const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (!out.some((x) => JSON.stringify(x) === JSON.stringify(a))) out.push(a);
  }
  return out;
}

/** 새 장비 하나 만들기 */
export function makeItem(id: number, baseId: string, q: number): Item {
  const b = BASES[baseId];
  return { id, slot: b.slot, mats: {}, quality: 0, level: 0, base: baseId, q, mods: [], affix: rollAffix(Q_TIERS[qTier(q)].affix, b.fam) };
}

export function mergeMats(a: Mats, b: Mats): Mats {
  const r: Mats = { ...a };
  for (const [id, n] of Object.entries(b)) r[id as MatId] = (r[id as MatId] ?? 0) + (n ?? 0);
  return r;
}
