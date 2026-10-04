import { BAL } from './balance';
// 조합 공식: 재료 비율 -> 행마 조각 / 특성 / 능력
import { ABILITIES, AbilityId, MATS, MatId, TraitId } from '../data/materials';
import { MoveRule } from './rules';
import { KING } from './geom';

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

export interface Item {
  id: number;
  slot: Slot;
  mats: Mats;
  quality: number;
  level: number;
  /** 이 무기로 쓰러뜨린 몹 수 (숙련) */
  kills?: number;
  /** 무기 행마의 방향 고르기·압축 (재료별) */
  shape?: Shape;
}

/** 재료별 행마 모양: dir = 그 재료 행마 방향 중 하나만 (null이면 전체), range = 미끄러지는 칸 수를 줄임 */
export type Shape = Partial<Record<MatId, ShapeEntry>>;
/**
 * 한 방향 집중: 재료 한 개마다 방향 하나 (picks = 방향 번호 목록, 재료 개수만큼 골라야 완성).
 * 같은 방향을 여러 번 고르면 그 방향이 길어진다(미끄러지는 행마: 1개당 1칸).
 * caps = 방향별로 칸 수를 더 줄이는 압축 (선택). dir/range는 예전 저장(재료 종류당 방향 하나) 호환용
 */
export interface ShapeEntry { picks?: number[]; caps?: Record<number, number>; dir?: number | null; range?: number }

/** 이 재료 n개에 대해 고른 방향 목록 (예전 저장은 그 방향 하나에 n개 모두) */
export function shapePicks(e: ShapeEntry | undefined, n: number): number[] {
  if (!e) return [];
  if (e.picks) return e.picks.slice(0, n);
  if (e.dir !== null && e.dir !== undefined) return Array(n).fill(e.dir);
  return [];
}
/** 미끄러지는 행마에서 한 방향에 c개를 몰았을 때 칸 수 */
export const slideRangeFor = (base: number, c: number) => Math.min(7, base + c - 1);

/**
 * 압축 피해: 원래 칸 수(방향 수 × 칸)에서 얼마나 줄였나.
 * 딱 한 칸만 남기면 +2, 3분의 1 이하로 줄이면 +1, 그 밖엔 +0
 */
export function compressBonus(before: number, after: number): number {
  if (after >= before) return 0;
  if (after <= 1) return 2;
  return after / before <= 1 / 3 ? 1 : 0;
}

export interface ItemStats {
  name: string;
  rules: MoveRule[];
  traits: Partial<Record<TraitId, number>>;
  ability?: { id: AbilityId; lv: number };
  shares: { id: MatId; n: number; share: number }[];
  notes: string[];
  quality: number;
}

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

/** 숙련 모드: 재료 총량으로 부위 결정 */
export function slotByTotal(total: number): Slot | null {
  if (total < 2) return null;
  if (total <= 3) return 'weapon';
  if (total === 4) return 'boots';
  if (total === 5) return 'armor';
  if (total === 6) return 'engrave';
  return 'relic';
}

export function computeItem(slot: Slot, mats: Mats, quality = 0, shape?: Shape): ItemStats {
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
      // 무기: 방향을 하나만 고르거나 칸 수를 줄여 '압축'하면 그 행마로 칠 때 피해가 오른다
      // 한 방향 집중(실험): 재료 한 개마다 방향 하나. 아직 하나도 안 골랐으면 원래 모양 그대로
      const sh = slot === 'weapon' && BAL.compress ? shape?.[s.id] : undefined;
      const picks = shapePicks(sh, s.n).filter((d) => f.dirs[d]);
      if (!picks.length) {
        rules.push({ kind: f.kind, dirs: f.dirs, range, mode, ...(leg ? { leg: true } : {}) });
      } else {
        // 방향별 개수 → 미끄러지는 행마는 몰아준 만큼 길어지고, caps로 원하면 더 줄인다(압축)
        const cnt = new Map<number, number>();
        for (const d of picks) cnt.set(d, (cnt.get(d) ?? 0) + 1);
        const groups = [...cnt].map(([d, c]) => {
          const full = f.kind === 'slide' ? slideRangeFor(f.range, c) : 1;
          const cap = sh?.caps?.[d];
          return { d, r: f.kind === 'slide' && cap ? Math.max(1, Math.min(full, cap)) : full };
        });
        // 피해 보너스: 원래 모양의 칸 수 대비 남은 칸 수(이 재료의 모든 방향 합) — 1칸 +2, 3분의 1 이하 +1
        const cells = groups.reduce((t, g) => t + g.r, 0);
        const dmg = compressBonus(f.dirs.length * (f.kind === 'slide' ? range : 1), cells);
        const extra = { ...(leg ? { leg: true } : {}), ...(dmg ? { dmg } : {}) };
        if (f.kind === 'slide') for (const g of groups) rules.push({ kind: f.kind, dirs: [f.dirs[g.d]], range: g.r, mode, ...extra });
        else rules.push({ kind: f.kind, dirs: groups.map((g) => f.dirs[g.d]), range: 1, mode, ...extra });
        if (dmg) notes.push(`${MATS[s.id].name}: 한 방향 집중 — 이 행마로 치면 피해 +${dmg}`);
        if (picks.length < s.n) notes.push(`${MATS[s.id].name}: 방향을 ${s.n - picks.length}개 더 골라야 해요`);
      }
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
  return { name, rules, traits, ability, shares, notes, quality: q };
}

function applyQuality(q: number, rules: MoveRule[], traits: Partial<Record<TraitId, number>>, ability?: { id: AbilityId; lv: number }) {
  const slide = rules.filter((r) => r.kind === 'slide' && !r.dmg).sort((a, b) => b.range - a.range)[0];
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

export function itemStats(it: Item) {
  const s = computeItem(it.slot, it.mats, it.quality, it.shape);
  if (it.level > 0) s.name += ` +${it.level}`;
  return s;
}

export function mergeMats(a: Mats, b: Mats): Mats {
  const r: Mats = { ...a };
  for (const [id, n] of Object.entries(b)) r[id as MatId] = (r[id as MatId] ?? 0) + (n ?? 0);
  return r;
}
