// 오늘의 기보: 날짜로 정해지는 특별 전투 하나. 하루에 한 번 도전할 수 있다.
import { G, addBag, emit, save } from '../core/state';
import { DIFFS } from '../core/difficulty';
import { AREAS, AreaId, EncDef, randomEnc } from '../data/areas';
import { MOBS, MobId } from '../data/mobs';
import { MATS, MatId } from '../data/materials';
import { toast } from '../ui/dom';

export type DailyMod = 'shiny' | 'ice' | 'fury' | 'bush';
export const DAILY_MODS: Record<DailyMod, { name: string; desc: string }> = {
  shiny: { name: '빛나는 날', desc: '모든 적이 빛나는 개체다. 전리품이 넘친다.' },
  ice: { name: '얼음판', desc: '판 곳곳이 얼음이다. 밟으면 미끄러진다.' },
  fury: { name: '분노의 날', desc: '모든 적의 공격력 +1. 보상 두 배.' },
  bush: { name: '수풀의 날', desc: '판 곳곳이 수풀이다. 멀리서 오는 공격을 막아 준다.' },
};

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 날짜 문자열로 만드는 작은 난수 생성기 (mulberry32) */
function seeded(s: string) {
  let h = 1779033703;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 지금까지 가 본 야생 지역 중에서 고른다 */
function pool(): AreaId[] {
  return (Object.keys(AREAS) as AreaId[]).filter((a) => AREAS[a].random && G.flags[`v_${a}`]);
}

export interface Daily { key: string; area: AreaId; mod: DailyMod; enemies: MobId[]; done: boolean }

export function todayDaily(): Daily | null {
  const areas = pool();
  if (!areas.length) return null;
  const key = todayKey();
  const r = seeded(key + G.piece);
  const area = areas[Math.floor(r() * areas.length)];
  const table = AREAS[area].random!.table;
  const mods = Object.keys(DAILY_MODS) as DailyMod[];
  const mod = mods[Math.floor(r() * mods.length)];
  const a = table[Math.floor(r() * table.length)].party;
  const b = table[Math.floor(r() * table.length)].party;
  const enemies = [...a[Math.floor(r() * a.length)], ...b[Math.floor(r() * b.length)]].slice(0, 5);
  return { key, area, mod, enemies, done: G.flags.dailyDone === key };
}

/** 오늘의 전투 구성 (날짜로 고정된 난수를 잠깐 빌려 쓴다) */
export function dailyEnc(d: Daily): EncDef {
  const r = seeded(d.key + 'enc');
  const orig = Math.random;
  Math.random = r;
  try {
    const enc = randomEnc(d.enemies, AREAS[d.area].biome);
    enc.name = `오늘의 기보 — ${DAILY_MODS[d.mod].name}`;
    enc.daily = d.mod;
    const size = enc.w;
    const cells: [number, number][] = [];
    if (d.mod === 'ice' || d.mod === 'bush') {
      for (let i = 0; i < size + 2; i++) cells.push([Math.floor(r() * size), 2 + Math.floor(r() * (size - 3))]);
      const k = d.mod === 'ice' ? 'ice' : 'bush';
      enc[k] = cells.filter(([x, y]) => !enc.walls.some(([wx, wy]) => wx === x && wy === y) && !(x === enc.player[0] && y === enc.player[1]));
    }
    return enc;
  } finally {
    Math.random = orig;
  }
}

/** 이겼을 때 보상 */
export function dailyReward(d: Daily) {
  G.flags.dailyDone = d.key;
  const prev = String(G.flags.dailyLast ?? '');
  const y = new Date(Date.now() - 86400000);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  G.flags.dailyStreak = prev === yKey ? Number(G.flags.dailyStreak ?? 0) + 1 : 1;
  G.flags.dailyLast = d.key;
  G.flags.dailyWins = Number(G.flags.dailyWins ?? 0) + 1;
  const region = AREAS[d.area].region || 1;
  const mul = d.mod === 'fury' ? 2 : 1;
  const gold = Math.round(25 * region * mul * DIFFS[G.diff].gold);
  G.gold += gold;
  const rares: MatId[] = region >= 3 ? ['tusk', 'mirror', 'pearl'] : region === 2 ? ['mirror', 'silver', 'fang'] : ['pearl', 'silver', 'crack'];
  const m = rares[Math.floor(Math.random() * rares.length)];
  addBag(m, mul);
  emit('daily', G.flags.dailyStreak);
  save();
  toast(`오늘의 기보 완료! ${gold}G, ${MATS[m].name} ×${mul} (연속 ${G.flags.dailyStreak}일)`, 'rare');
}

export const dailyEnemyNames = (d: Daily) => d.enemies.map((m) => MOBS[m].name).join(', ');
