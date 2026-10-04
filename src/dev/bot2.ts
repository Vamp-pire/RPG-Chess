// 개발용 '강한 봇': 가능한 모든 행동(공격·이동·이동 능력)을 하나씩 따져 보고 가장 좋은 수를 둔다.
// 이번 적 턴에 맞을 피해(예고), 다음 턴 위협, 다음 턴 공격 가능 여부, 킬·보스 피해를 점수로 합산한다.
// 약한 봇(sim.ts botTurn)이 하한선, 이 봇이 상한선에 가깝다. 사람의 실제 실력은 대개 그 사이.
import { KING, Vec, cheb, eq, key } from '../core/geom';
import { genTargets } from '../core/rules';
import { MOBS } from '../data/mobs';
import type { App } from '../game/app';
import { botTurn } from './sim';

type B = NonNullable<App['battle']>;
type U = B['units'][number];
// 비공개 메서드를 개발용으로 빌려 쓴다
interface Priv {
  rulesOf(a: U): never;
  allyGrid(a: U): never;
  mobRules(u: U, k: 'move' | 'attack'): never;
  gridFor(u: U): never;
}

interface Cand { kind: 'attack' | 'move' | 'brace' | 'ability'; x: number; y: number; ab?: number; score: number }

const progress = new WeakMap<object, { hp: number; turn: number }>();

export async function strongTurn(b: B) {
  // 5턴 동안 적 체력이 줄지 않으면 머뭇거림 → 우직한 봇처럼 밀어붙인다
  const total = b.enemies().reduce((s, e) => s + e.hp, 0) + b.enemies().length * 100;
  const pr = progress.get(b);
  if (!pr || total < pr.hp) progress.set(b, { hp: total, turn: b.turn });
  else if (b.turn - pr.turn >= 5) {
    if (b.turn - pr.turn >= 8) progress.set(b, { hp: total, turn: b.turn });
    return botTurn(b);
  }
  const P = b as unknown as Priv;
  // 동료가 있으면: 주인공이 칠 수 없고 동료가 칠 수 있으면 동료 차례
  const live = b.allies.map((x, i) => [x, i] as const).filter(([x]) => x.hp > 0);
  if (live.length > 1) {
    b.active = 0;
    b.refresh();
    if (!b.targets.attacks.length) {
      const withAtk = live.find(([, i]) => { b.active = i; b.refresh(); return b.targets.attacks.length > 0; });
      b.active = withAtk ? withAtk[1] : 0;
      b.refresh();
    }
  }
  const a = b.cur;
  const hero = a.ally === 'hero';
  const enemies = b.enemies();
  const danger = new Map<string, number>();
  const addD = (x: number, y: number, n: number) => danger.set(key(x, y), (danger.get(key(x, y)) ?? 0) + n);
  for (const e of enemies) {
    const it = e.intent;
    if (!it) continue;
    const atk = e.atk + (b.synergy(e).bonus || 0);
    if (it.t === 'attack') for (const [x, y] of it.sq) addD(x, y, atk);
    if (it.t === 'charge') for (const [x, y] of it.path) addD(x, y, atk);
  }
  for (const l of b.lines) for (const [x, y] of l) addD(x, y, 2);
  for (const [x, y] of b.erase) addD(x, y, 1);
  for (const [x, y] of b.frost) addD(x, y, 1);

  const myDmg = 1 + (hero && b.sharp > 0 ? 1 : 0) + (b.tileAt(a.x, a.y) === 'high' ? 1 : 0);
  const armor = hero ? Math.min(1, b.sturdy) : 0;
  /** p에 서 있을 때 이번 적 턴에 받을 피해 (죽을 적 제외) */
  const incomingAt = (p: Vec, dead?: U, braced = false) => {
    let d = danger.get(key(p[0], p[1])) ?? 0;
    if (dead?.intent?.t === 'attack' && dead.intent.sq.some((s) => eq(s, p))) d -= dead.atk;
    if (b.tileAt(p[0], p[1]) === 'bush') {
      // 수풀: 멀리서 오는 공격은 막힌다 (대략: 인접하지 않은 적의 몫을 뺀다)
      for (const e of enemies) if (e !== dead && e.intent?.t === 'attack' && e.intent.sq.some((s) => eq(s, p)) && cheb([e.x, e.y], p) > 1) d -= e.atk;
    }
    if (braced) d -= enemies.filter((e) => e !== dead && e.intent?.t === 'attack' && e.intent.sq.some((s) => eq(s, p))).length;
    return Math.max(0, d - armor);
  };
  /** 다음 턴에 p를 노릴 수 있는 적의 공격력 합 (지금 자리 1배, 한 걸음 뒤 0.5배) */
  const threatAt = (p: Vec, dead?: U) => {
    let t = 0;
    for (const e of enemies) {
      if (e === dead) continue;
      const g = P.gridFor(e);
      const now = genTargets(P.mobRules(e, 'attack'), [e.x, e.y], g).attacks.some((s) => eq(s, p)) || cheb([e.x, e.y], p) <= 1;
      if (now) { t += e.atk; continue; }
      const moves = genTargets(P.mobRules(e, 'move'), [e.x, e.y], g).moves.slice(0, 20);
      if (moves.some((m) => genTargets(P.mobRules(e, 'attack'), m, g).attacks.some((s) => eq(s, p)) || cheb(m, p) <= 1)) t += e.atk * 0.5;
    }
    return t;
  };
  /** p에서 다음 턴에 칠 수 있는 적 (보스 우선) */
  const offenseAt = (p: Vec, dead?: U) => {
    const ox = a.x;
    const oy = a.y;
    a.x = p[0];
    a.y = p[1];
    const at = genTargets(P.rulesOf(a), p, P.allyGrid(a)).attacks;
    a.x = ox;
    a.y = oy;
    let s = 0;
    for (const [x, y] of at) {
      const u = b.unitAt(x, y);
      if (!u || u === dead) continue;
      const boss = MOBS[u.mob!].ai === 'boss' || MOBS[u.mob!].ai === 'queen';
      s = Math.max(s, boss ? 3 : u.hp <= myDmg ? 2.5 : 1.5);
    }
    return s;
  };
  const nearest = (p: Vec, dead?: U) => {
    const rest = enemies.filter((e) => e !== dead);
    return rest.length ? Math.min(...rest.map((e) => cheb(p, [e.x, e.y]))) : 0;
  };
  const hp = a.hp;
  const willLeft = hero && !b.will ? 1 : 0;
  const evalPos = (p: Vec, dead?: U, braced = false) => {
    const inc = incomingAt(p, dead, braced);
    let s = 0;
    if (inc >= hp) s -= willLeft && inc === hp ? 60 : 900; // 죽는 수는 피한다
    s -= inc * (hp - inc <= 2 ? 22 : 12);
    // 전투가 길어질수록 더 공격적으로 (늘어지는 걸 막는다)
    const calm = 1 - 0.7 * Math.min(1, b.turn / 30);
    s -= threatAt(p, dead) * (hp <= 3 ? 6 : 2.5) * calm;
    const off = offenseAt(p, dead);
    s += off * 9;
    if (!off) s -= nearest(p, dead) * 1.5;
    return s;
  };

  const cands: Cand[] = [];
  for (const [x, y] of b.targets.attacks) {
    const u = b.unitAt(x, y);
    if (!u) continue;
    const boss = MOBS[u.mob!].ai === 'boss' || MOBS[u.mob!].ai === 'queen';
    // 붙어서 치면 2배, 떨어져서 치면 1배 (적 체력도 2배)
    const dmg = (cheb([a.x, a.y], [x, y]) <= 1 ? 2 : 1) * myDmg + (hero && b.gunReload === 0 && b.hasGun && cheb([a.x, a.y], [x, y]) > 1 ? 1 : 0);
    const kill = u.hp <= dmg && !(u.mob === 'skeleton' && !u.revived);
    const land: Vec = kill && cheb([a.x, a.y], [x, y]) <= 1 ? [x, y] : [a.x, a.y];
    const last = kill && enemies.length === 1;
    const score = (last ? 5000 : 0) + (kill ? 90 : 0) + Math.min(dmg, u.hp) * (boss ? 30 : 25) + evalPos(land, kill ? u : undefined);
    cands.push({ kind: 'attack', x, y, score });
  }
  // 치지 않고 움직이기만 하면 전투가 늘어진다: 공격할 수 있는데 안 치면 벌점
  const stall = (b.targets.attacks.length ? 12 : 4) + b.turn * 0.4;
  for (const [x, y] of b.targets.moves) cands.push({ kind: 'move', x, y, score: evalPos([x, y]) - stall });
  // 이동 능력 (순간이동·타넘기·교환): 목적지 칸으로 평가
  if (hero) {
    b.lo.abilities.forEach((ab, i) => {
      if (b.cds[i] > 0 || !['blink', 'hop', 'swap'].includes(ab.id)) return;
      b.selectAbility(i);
      for (const [x, y] of b.modeTargets.slice(0, 30)) {
        const dest: Vec = ab.id === 'hop' ? [x + Math.sign(x - a.x), y + Math.sign(y - a.y)] : [x, y];
        cands.push({ kind: 'ability', x, y, ab: i, score: evalPos(dest) - 4 });
      }
      b.mode = null;
      b.refresh();
    });
  }
  cands.sort((p, q) => q.score - p.score);
  const best = cands[0];
  if (!best) return b.pass();
  if (best.kind === 'ability') {
    b.selectAbility(best.ab!);
    return b.click(best.x, best.y);
  }
  return b.click(best.x, best.y);
}

export const _k = KING;
