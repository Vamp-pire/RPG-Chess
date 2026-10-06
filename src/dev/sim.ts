// 개발용 밸런스 시뮬레이터: 적당히 영리한 봇이 전투를 반복해 승률을 잰다.
import { Vec, cheb, eq, key } from '../core/geom';
import { genTargets } from '../core/rules';
import { G, maxHp, newGame } from '../core/state';
import { AREAS, AreaId, EncDef, FIXED_ENCS, expandEnc, randomEnc } from '../data/areas';
import { MobId } from '../data/mobs';
import { JobId, PieceId } from '../data/pieces';
import { fx } from '../render/fx';
import type { App } from '../game/app';
import { Item, Mats, Mod, Slot, makeItem } from '../core/items';
import { strongTurn } from './bot2';

type B = NonNullable<App['battle']>;

function danger(b: B): Set<string> {
  const s = new Set<string>();
  for (const m of b.scene.marks) if (m.kind === 'tele' || m.kind === 'line' || m.kind === 'erase' || m.kind === 'frost') s.add(key(m.x, m.y));
  return s;
}

/** 보통 실력의 플레이어를 흉내 낸다: 죽일 수 있으면 죽이고, 예고된 칸은 피하고, 다음 턴에 칠 수 있는 자리로 간다 */
export async function botTurn(b: B) {
  const bb = b as unknown as { rulesOf(a: unknown): unknown; allyGrid(a: unknown): unknown };
  // 동료가 있으면 체력 많은 쪽/공격 가능한 쪽을 번갈아 쓴다
  const live = b.allies.map((x, i) => [x, i] as const).filter(([x]) => x.hp > 0);
  if (live.length > 1) {
    // 주인공 우선, 주인공이 칠 수 없고 동료가 칠 수 있으면 동료
    b.active = 0;
    b.refresh();
    if (!b.targets.attacks.length) {
      const withAtk = live.find(([, i]) => { b.active = i; b.refresh(); return b.targets.attacks.length > 0; });
      b.active = withAtk ? withAtk[1] : 0;
      b.refresh();
    }
  }
  const a = b.cur;
  const dz = danger(b);
  const t = b.targets;
  const hpOf = (v: Vec) => b.unitAt(v[0], v[1])?.hp ?? 99;
  const myDmg = 1 + (a.ally === 'hero' && b.sharp ? 1 : 0);
  const onDanger = dz.has(key(a.x, a.y));
  const kill = t.attacks.filter((v) => hpOf(v) <= myDmg).sort((x, y) => hpOf(x) - hpOf(y))[0];
  if (kill) return b.click(kill[0], kill[1]);
  const incoming = b.enemies().reduce((s, e) => s + (e.intent?.t === 'attack' && e.intent.sq.some((v) => eq(v, [a.x, a.y])) ? e.atk : 0), 0) + (b.lines.some((l) => l.some((v) => eq(v, [a.x, a.y]))) ? 2 : 0);
  if (t.attacks.length && (!onDanger || a.hp > incoming + 1)) {
    // 보스를 칠 수 있으면 보스부터
    const boss = b.boss();
    const bossSq = boss ? t.attacks.find((v) => v[0] === boss.x && v[1] === boss.y) : undefined;
    const tg = bossSq ?? t.attacks.sort((x, y) => hpOf(x) - hpOf(y))[0];
    return b.click(tg[0], tg[1]);
  }
  const enemies = b.enemies();
  const near = (v: Vec) => Math.min(...enemies.map((e) => cheb(v, [e.x, e.y])));
  const canHitFrom = (v: Vec) => {
    const ox = a.x;
    const oy = a.y;
    a.x = v[0];
    a.y = v[1];
    const at = genTargets(bb.rulesOf(a) as never, v, bb.allyGrid(a) as never).attacks;
    a.x = ox;
    a.y = oy;
    // 제자리에 머물 적(공격·대기 예고)을 칠 수 있는 자리를 더 높게 친다
    const still = at.filter((p) => { const u = b.unitAt(p[0], p[1]); return u && u.intent?.t !== 'move' && u.intent?.t !== 'charge'; }).length;
    return still ? 2 : at.length ? 1 : 0;
  };
  const score = (v: Vec) => (canHitFrom(v) === 2 ? -60 : canHitFrom(v) === 1 ? -20 : 0) + (dz.has(key(v[0], v[1])) ? (a.hp > 2 ? 12 : 200) : 0) + near(v) * 4 + Math.random() * 3;
  const cur = score([a.x, a.y]) + 2;
  const best = t.moves.map((v) => [v, score(v)] as const).sort((x, y) => x[1] - y[1])[0];
  if (best && best[1] < cur) return b.click(best[0][0], best[0][1]);
  if (t.attacks.length) {
    const tg = t.attacks.sort((x, y) => hpOf(x) - hpOf(y))[0];
    return b.click(tg[0], tg[1]);
  }
  if (best) return b.click(best[0][0], best[0][1]);
  return b.pass();
}

export type BotKind = 'weak' | 'strong';
export async function runBattle(app: App, enc: EncDef, maxTurns = 80, bot: BotKind = 'weak'): Promise<{ win: boolean; lose: boolean; turns: number; hpLeft: number; dmg: number }> {
  let result: 'win' | 'lose' | 'flee' | null = null;
  const orig = app.endBattle.bind(app);
  app.endBattle = (r, k) => { result = r; orig(r, k); };
  app.startEncounter(enc);
  const b = app.battle!;
  let n = 0;
  while (!b.over && n < maxTurns) {
    await (bot === 'strong' ? strongTurn(b) : botTurn(b));
    n++;
  }
  await new Promise((r) => setTimeout(r, 5));
  app.endBattle = orig;
  return { win: result === 'win', lose: result === 'lose', turns: b.turn, hpLeft: G.hp, dmg: b.dmgTaken };
}

export interface Setup { piece: PieceId; items?: [Slot, Mats, number?, number?][]; /** 새 장비: [밑판 id, 품질 %, 강화] */ gear?: [string, number?, number?, Mod[]?][]; job?: JobId; promoted?: boolean; promoted2?: boolean; party?: ('soldier' | 'ghostknight' | 'priest')[]; progress?: number; hpFrac?: number; flags?: Record<string, boolean>; bonusHp?: number; diff?: 'easy' | 'normal' | 'hard'; area?: AreaId }

export function setup(s: Setup) {
  newGame(s.piece, s.diff ?? 'normal');
  if (s.area) G.area = s.area;
  Object.assign(G.flags, s.flags ?? {});
  G.bonusHp = s.bonusHp ?? 0;
  G.promoted = !!s.promoted;
  G.promoted2 = !!s.promoted2;
  G.party = s.party ?? [];
  G.progress = s.progress ?? 0;
  G.job = s.job ?? 'alchemist';
  const items: Item[] = (s.items ?? []).map(([slot, mats, level, kills], i) => ({ id: i + 1, slot, mats, quality: 0, level: level ?? 0, kills: kills ?? 0 }));
  for (const [b, q, lv, mods] of s.gear ?? []) items.push({ ...makeItem(items.length + 1, b, q ?? 30), level: lv ?? 0, affix: [], mods: mods ?? [] });
  G.items = items;
  for (const it of items) G.equip[it.slot] = it.id;
  G.hp = Math.max(1, Math.round(maxHp() * (s.hpFrac ?? 1)));
}

export async function sim(app: App, s: Setup, encName: string | MobId[], n = 30, bot: BotKind = 'weak') {
  // 시뮬레이션이 실제 저장을 덮어쓰지 않도록 저장을 잠깐 막는다
  const keys = ['chessforge_save_v1', 'chessforge_save_v1_s2', 'chessforge_save_v1_s3'];
  const saved = keys.map((k) => localStorage.getItem(k));
  fx.instant = true;
  try {
    return await simInner(app, s, encName, n, bot);
  } finally {
    fx.instant = false;
    keys.forEach((k, i) => { const v = saved[i]; if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); });
  }
}

async function simInner(app: App, s: Setup, encName: string | MobId[], n: number, bot: BotKind) {
  let wins = 0;
  let loses = 0;
  let turns = 0;
  let hp = 0;
  for (let i = 0; i < n; i++) {
    setup(s);
    const base = typeof encName === 'string' ? FIXED_ENCS[encName] : randomEnc(encName, G.area);
    const enc = expandEnc(base, AREAS[G.area].region);
    const r = await runBattle(app, enc, 80, bot);
    if (r.win) { wins++; hp += r.hpLeft; }
    if (r.lose) loses++;
    turns += r.turns;
  }
  fx.instant = false;
  return { enc: typeof encName === 'string' ? encName : encName.join('+'), piece: s.piece, winRate: Math.round((wins / n) * 100), loseRate: Math.round((loses / n) * 100), avgTurns: +(turns / n).toFixed(1), avgHpLeftOnWin: wins ? +(hp / wins).toFixed(1) : 0 };
}

export const _eq = eq;
