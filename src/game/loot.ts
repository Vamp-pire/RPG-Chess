// 장비 드랍: 몹은 재료와 함께 가끔 완성된 장비를 떨어뜨린다.
// - 일반 몹 약 12%, 처음 잡아 보는 몹은 확정, 엘리트도 확정, 보스는 처음 쓰러뜨릴 때 내 계열 고유 무기
// - 무기가 떨어지면 70%는 내 계열 무기 (못 쓰는 무기만 쌓이지 않게)
// - 천장: 내 계열 무기가 안 나온 전투가 8번 이어지면 다음엔 확정 / 훌륭한(80%) 이상이 안 나온 장비 25개면 다음은 훌륭한 이상
import { G, addItem, align, hasJob } from '../core/state';
import { Item, Slot, rollQ, qTier } from '../core/items';
import { DIFFS } from '../core/difficulty';
import { pick } from '../core/geom';
import { BASES, BaseDef, Fam, basesFrom, basesOfRegion, uniqueOf } from '../data/gear';
import { MOBS, MobId } from '../data/mobs';
import { perk } from './rewards';

export const PITY_FAM = 8;
export const PITY_Q = 25;
/** 엘리트 (장비 확정) */
const ELITE = new Set<MobId>(['hound', 'bonelord', 'giant', 'double', 'rook', 'blunder']);
/** 부위별로 떨어질 비중: 무기가 조금 더 흔하고 각인·유물은 드물다 (테스트: 40%면 무기만 쌓여 다른 부위가 비었다) */
const SLOT_W: Record<Slot, number> = { weapon: 30, boots: 25, armor: 25, engrave: 10, relic: 10 };

/** 도달한 가장 먼 지역 (상점·탑 보상의 기준) */
export const reachedRegion = () => (G.flags.king_dead ? 4 : G.flags.queen_dead ? 3 : G.flags.boss_dead ? 2 : 1);

function weighted(list: BaseDef[]): BaseDef | null {
  if (!list.length) return null;
  const total = list.reduce((s, b) => s + SLOT_W[b.slot], 0);
  let r = Math.random() * total;
  for (const b of list) {
    r -= SLOT_W[b.slot];
    if (r <= 0) return b;
  }
  return list[list.length - 1];
}

/** 이 몹에게서 나올 밑판 하나 (계열 보정 포함) */
function pickBase(m: MobId, region: number, elite: boolean, fam: Fam | null): BaseDef | null {
  let pool = basesFrom(m, region);
  if (elite && pool.some((b) => b.elite)) pool = pool.filter((b) => b.elite);
  if (!pool.length) pool = basesOfRegion(region).filter((b) => !!b.elite === elite);
  if (!pool.length) pool = basesOfRegion(region);
  let b = weighted(pool);
  if (b && b.slot === 'weapon' && fam && b.fam !== fam && Math.random() < 0.7) {
    const mine = pool.filter((x) => x.slot === 'weapon' && x.fam === fam);
    const alt = mine.length ? mine : basesOfRegion(region).filter((x) => x.slot === 'weapon' && x.fam === fam && !!x.elite === elite);
    if (alt.length) b = pick(alt);
  }
  return b;
}

export interface LootCtx {
  kills: MobId[];
  shiny: MobId[];
  /** 변이 접두어가 붙은 몹 (품질이 조금 높게) */
  prefixed: MobId[];
  region: number;
  /** 처음 쓰러뜨린 보스 */
  bossFirst?: MobId;
  /** 각성한 보스 */
  awake?: boolean;
  /** 처음 잡아 본 몹 (장비 하나 확정) */
  first?: MobId[];
}

/** 품질 굴리기 + 품질 천장 */
function qualityRoll(boost: number): number {
  const pity = Number(G.flags.pityQ ?? 0) >= PITY_Q;
  const q = rollQ(boost + (hasJob('hunter') ? 0.15 : 0) + (perk('shiny') ? 0.05 : 0), pity ? 80 : 0);
  G.flags.pityQ = qTier(q) >= 2 ? 0 : Number(G.flags.pityQ ?? 0) + 1;
  return q;
}

/** 전투 승리: 장비를 굴려 장비 목록에 넣고, 얻은 것을 돌려준다 */
export function rollGear(c: LootCtx): Item[] {
  const out: Item[] = [];
  const fam = align();
  const region = Math.max(1, Math.min(4, c.region || 1));
  const mul = 0.8 + 0.25 * DIFFS[G.diff].rare;
  const give = (b: BaseDef | null, boost: number) => {
    if (!b || out.length >= 3) return;
    out.push(addItem(b.id, qualityRoll(boost)));
  };
  // 보스 첫 처치: 내 계열 고유 무기 (직업이 없으면 무작위 계열)
  if (c.bossFirst) {
    const f: Fam = fam ?? pick<Fam>(['light', 'dark', 'neutral']);
    const u = uniqueOf(c.bossFirst, f);
    if (u) give(u, 0.35);
  }
  // 각성한 보스: 그 지역 엘리트 장비 하나, 훌륭한 이상
  if (c.awake) {
    const pool = basesOfRegion(region).filter((b) => b.elite);
    if (pool.length) out.push(addItem(pick(pool).id, rollQ(0.35, 80)));
  }
  const pre = [...c.prefixed];
  for (const k of c.kills) {
    const d = MOBS[k];
    if (!d || !d.drops.length || d.ai === 'boss' || d.ai === 'queen') continue;
    const elite = ELITE.has(k);
    const pi = pre.indexOf(k);
    const isPre = pi >= 0;
    if (isPre) pre.splice(pi, 1);
    const fi = c.first?.indexOf(k) ?? -1;
    if (fi >= 0) c.first!.splice(fi, 1);
    const chance = elite || fi >= 0 ? 1 : 0.12 * mul * (isPre ? 1.5 : 1);
    if (Math.random() < chance) give(pickBase(k, region, elite, fam), elite ? 0.35 : isPre ? 0.25 : 0);
  }
  // 빛나는 개체: 절반 확률로 장비 하나 더, 품질 높게
  for (const k of c.shiny) if (Math.random() < 0.5) give(pickBase(k, region, false, fam), 0.3);
  // 계열 무기 천장
  if (fam && c.kills.length) {
    const got = out.some((it) => it.slot === 'weapon' && BASES[it.base!]?.fam === fam);
    const n = got ? 0 : Number(G.flags.pityFam ?? 0) + 1;
    if (n >= PITY_FAM) {
      const pool = basesOfRegion(region).filter((b) => b.slot === 'weapon' && b.fam === fam && !b.elite);
      if (pool.length) out.push(addItem(pick(pool).id, qualityRoll(0)));
      G.flags.pityFam = 0;
    } else G.flags.pityFam = n;
  }
  return out;
}

/** 상점 장비: 상점 밑판 + 오늘의 장비 둘 (도달한 지역에서, 평범한 품질) */
export function shopGear(): { base: BaseDef; price: number; key: string; q: number }[] {
  const r = reachedRegion();
  const d = new Date();
  const day = `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
  const list: BaseDef[] = Object.values(BASES).filter((b) => b.from.includes('shop'));
  const pool = basesOfRegion(r).filter((b) => !b.elite);
  const fam = align();
  // 내 계열 무기 하나 + 공용 부위 하나 (날짜로 고정)
  let seed = (Number(day) + r * 131) % 9973;
  const next = <T>(arr: T[]) => { seed = (seed * 37 + 11) % 9973; return arr[seed % arr.length]; };
  const weapons = pool.filter((b) => b.slot === 'weapon' && (!fam || b.fam === fam));
  const commons = pool.filter((b) => b.slot !== 'weapon');
  if (weapons.length) list.push(next(weapons));
  if (commons.length) list.push(next(commons));
  return list.map((b, i) => ({ base: b, price: (b.from.includes('shop') ? 30 : 45) * b.region, key: `gear_${day}_${b.id}`, q: 20 + ((seed + i * 17) % 30) }));
}
