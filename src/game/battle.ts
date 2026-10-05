import { KING, ORTH, Vec, cheb, eq, key, manh, pick, shuffle, sign } from '../core/geom';
import { Grid, MoveRule, Targets, genTargets } from '../core/rules';
import { G, HP_MUL, Loadout, emit, equipped, loadout, maxHp, tier } from '../core/state';
import { ABILITIES } from '../data/materials';
import { AREAS, EncDef, TENSION } from '../data/areas';
import { MOBS, MobId } from '../data/mobs';
import { COMPANIONS, CompanionId, PIECES } from '../data/pieces';
import { Arrow, Ent, Mark, Scene, TileKind, mkEnt } from '../render/board';
import { death, flash, hitFx, lunge, moveEnt, popIn, squash } from '../render/anim';
import { easeInOut, easeOut, fx } from '../render/fx';
import { clearCoach, coachNow, cutin, h, toast } from '../ui/dom';
import { DIFFS } from '../core/difficulty';
import { sfx } from '../core/sfx';
import { perk } from './rewards';
import { runRule } from './runrules';
import { bossFell } from './throne';

type Intent =
  | { t: 'attack'; sq: Vec[]; hidden?: boolean; blur?: boolean }
  | { t: 'move'; to: Vec }
  | { t: 'charge'; dir: Vec; path: Vec[] }
  | { t: 'idle'; why?: string };

interface BUnit {
  uid: number;
  mob: MobId | null;
  ally?: 'hero' | CompanionId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  intent: Intent | null;
  stun: number;
  ent: Ent;
  revived?: boolean;
  summoned?: boolean;
  /** 잘못 둔 퀸: 공격 뒤 '잘못 놓아' 주인공 곁에 넘어진 상태 (다음 적 턴은 일어나느라 아무것도 못 한다) */
  tripped?: boolean;
  rested?: boolean;
  /** 숨 고르기 박자 (보통·어려움: 공격 두 번 뒤 한 번 쉰다) */
  breathN?: number;
  rootNext?: boolean;
  rooted?: boolean;
  /** 빛나는 개체: 체력 +1, 8방향 1칸 행마가 더 붙고 전리품이 많다 */
  shiny?: boolean;
  absorbed?: boolean;
  /** 세 번의 아군 턴 동안 피해를 받지 않아 반격 태세가 됐는가 */
  unhitTurns?: number;
  retaliating?: boolean;
  hitThisTurn?: boolean;
}

export type BattleResult = 'win' | 'lose' | 'flee';

export interface BattleCallbacks {
  end(r: BattleResult, kills: MobId[]): void;
  refresh(): void;
}

type Mode = { t: 'ability'; i: number } | { t: 'heal' } | null;

let UID = 1;
export interface Frame { note: string; tiles: string; units: [string, number, number, number][] }
const WALKABLE = new Set<TileKind>(['floor', 'throne', 'bush', 'ice', 'high']);
/** 엘리트 (빛나는 개체가 되지 않고, 어려움에서 체력이 늘어난다) */
const ELITE = new Set<MobId>(['hound', 'bonelord', 'rook', 'blunder']);
/** 숨은 빠르기 (화면엔 안 보임): 0 느림 · 1 보통(기본) · 2 빠름. 난이도의 haste와 곱해 '한 번 더 움직일' 확률이 된다 */
const SPEED: Partial<Record<MobId, number>> = {
  rat: 2, bat: 2, hound: 2, wolf: 2, spider: 2, inkblot: 2, erased: 2, wraith: 2, icesprite: 2,
  slime: 0, slimelet: 0, golem: 0, thorn: 0, giant: 0, bookworm: 0, tower: 0, strawpawn: 0, snowpawn: 0,
};

export class Battle {
  w: number;
  h: number;
  tiles: TileKind[][];
  units: BUnit[] = [];
  allies: BUnit[] = [];
  active = 0;
  traps = new Map<string, number>();
  erase: Vec[] = [];
  /** 얼어붙은 킹의 서리 폭풍 예고 칸 */
  frost: Vec[] = [];
  lines: Vec[][] = [];
  bossTick = 0;
  /** 다음 적 턴에 보스가 순간 이동할 칸 / 말을 부를 칸 (한 턴 앞서 판 위에 보여 준다) */
  warpTo: Vec | null = null;
  summonAt: Vec[] = [];
  /** 밀짚왕이 폰을 흡수한 횟수 (전투마다 최대 3번) */
  absorbs = 0;
  phase = 1;
  turn = 1;
  mode: Mode = null;
  busy = false;
  over = false;
  lo: Loadout;
  sharp: number;
  dodge: number;
  sturdy: number;
  stickyLeft: number;
  bind: number;
  undying: number;
  counter: number;
  will = false;
  cds: number[];
  kills: MobId[] = [];
  shinyKills: MobId[] = [];
  /** 업적용 기록: 어떻게 쓰러뜨렸나 / 주인공이 무엇을 했나 */
  hows: { mob: MobId; how: string }[] = [];
  /** 다시 보기용 기록: 턴마다 판 상태 */
  frames: Frame[] = [];
  note = '';
  acts = { move: 0, attack: 0, ability: 0 };
  willFired = false;
  dmgTaken = 0;
  /** 입장 컷인에서 보여 준 보스 규칙 (전투 내내 패널에 남긴다) */
  bossNote = '';
  gunReload = 0;
  dmgLog = new Map<string, { hits: number; dmg: number }>();
  scene: Scene;
  targets: Targets = { moves: [], attacks: [] };
  modeTargets: Vec[] = [];

  constructor(public enc: EncDef, private cb: BattleCallbacks, opts: { ambush?: boolean } = {}) {
    this.w = enc.w;
    this.h = enc.h;
    this.tiles = Array.from({ length: enc.h }, () => Array.from({ length: enc.w }, () => 'floor' as TileKind));
    for (const [x, y] of enc.walls) this.tiles[y][x] = 'wall';
    for (const [x, y] of enc.water ?? []) this.tiles[y][x] = 'water';
    for (const k of ['bush', 'ice', 'high'] as const) for (const [x, y] of enc[k] ?? []) this.tiles[y][x] = k;
    if (enc.throne) this.tiles[enc.throne[1]][enc.throne[0]] = 'throne';
    // 판 규칙 카드(환생): 빙판·수풀의 판이면 일반 전투 판 곳곳에 몇 칸
    const rr = runRule();
    if ((rr === 'ice' || rr === 'bush') && !enc.boss && !enc.hold && !enc.guest) {
      const taken = new Set([...enc.enemies.map((e) => key(e.x, e.y)), key(enc.player[0], enc.player[1])]);
      const spots: Vec[] = [];
      for (let y = 1; y < enc.h - 1; y++) for (let x = 0; x < enc.w; x++) if (this.tiles[y][x] === 'floor' && !taken.has(key(x, y))) spots.push([x, y]);
      for (const [x, y] of shuffle(spots).slice(0, 4)) this.tiles[y][x] = rr;
    }
    this.placeEnemyTerrain();
    this.lo = loadout();
    this.sharp = (this.lo.traits.sharp ?? 0) + (perk('first') ? 1 : 0);
    this.dodge = this.lo.traits.light ?? 0;
    this.sturdy = (this.lo.traits.sturdy ?? 0) + (perk('brace') ? 1 : 0);
    this.stickyLeft = this.lo.traits.sticky ?? 0;
    this.bind = this.lo.traits.bind ?? 0;
    this.undying = this.lo.sets.includes('bone') ? 2 : this.lo.traits.undying ? 1 : 0;
    this.counter = this.lo.traits.counter ? this.lo.traits.counter + 1 : 0;
    this.cds = this.lo.abilities.map(() => 0);
    // 용사의 의지: 쉬움은 전투마다, 그 밖에는 쉬어야 다시 차오른다
    this.will = !DIFFS[G.diff].willEachBattle && !!G.flags.will_used;
    const t = tier();
    for (const e of enc.enemies) {
      this.addEnemy(e.m, e.x, e.y, t);
      G.flags[`seen_${e.m}`] = true;
    }
    // 각성한 보스(재도전): 체력 1.5배, 처음부터 2단계
    if (enc.awake) {
      const b = this.boss();
      if (b) {
        b.hp = Math.round(b.hp * 1.5);
        b.maxHp = b.hp;
        b.ent.hp = b.hp;
        b.ent.maxHp = b.hp;
        b.ent.glow = 'rgba(200,80,255,0.45)';
        if (b.mob === 'misqueen' || b.mob === 'author') b.atk = 2;
        this.phase = 2;
      }
    }
    // 스테일메이트(버티기): 저자는 처음부터 펜을 고쳐 쥔 상태. 치지 않고 버티는 것이 목표
    if (enc.hold) {
      this.phase = 2;
      const b = this.units.find((u) => u.mob === 'author');
      if (b) b.atk = 2;
      this.bossNote = `저자를 치지 않고 ${enc.hold}턴을 버티자. 필기 줄과 지워지는 칸을 피하라. (주석은 쳐도 된다)`;
    }
    // 오늘의 기보 — 분노의 날: 모든 적 공격 +1
    if (enc.daily === 'fury') for (const u of this.units) u.atk++;
    // 들쥐 무리: 셋 이상이면 모두 체력 +1
    const rats = this.units.filter((u) => u.mob === 'rat');
    if (rats.length >= 3) for (const r of rats) { r.hp++; r.maxHp++; r.ent.hp = r.hp; r.ent.maxHp = r.maxHp; }
    if (opts.ambush && this.enemies()[0]) {
      const u = this.enemies()[0];
      u.hp = Math.max(1, u.hp - 1);
      u.ent.hp = u.hp;
    }
    // 주인공 + 동료(최대 2) + 시험 전투 손님
    const mh = maxHp();
    const heroImg = PIECES[G.piece].img;
    this.allies.push({ uid: 0, mob: null, ally: 'hero', x: enc.player[0], y: enc.player[1], hp: G.hp, maxHp: mh, atk: 1, intent: null, stun: 0, ent: mkEnt('hero', `p:${heroImg}`, enc.player[0], enc.player[1], { hp: G.hp, maxHp: mh }) });
    const comps = [...G.party];
    if (enc.guest && !comps.includes(enc.guest)) comps.push(enc.guest);
    for (const c of comps.slice(0, 3)) {
      const spot = this.nearFree(enc.player);
      if (!spot) break;
      const d = COMPANIONS[c];
      const up = !!G.flags[`cup_${c}`];
      const chp = HP_MUL * (d.hp + (perk('ally') ? 1 : 0) + (up ? 2 : 0));
      this.allies.push({ uid: UID++, mob: null, ally: c, x: spot[0], y: spot[1], hp: chp, maxHp: chp, atk: up ? 2 : 1, intent: null, stun: 0, ent: mkEnt(`c_${c}`, `p:${d.img}`, spot[0], spot[1], { hp: chp, maxHp: chp, glow: 'rgba(90,150,230,0.25)' }) });
    }
    // 세트 효과: 점액(시작 체력 +1), 서리(가장 가까운 적을 얼린다)
    if (this.lo.sets.includes('slime') && this.hero.hp < this.hero.maxHp) {
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + HP_MUL);
      this.hero.ent.hp = this.hero.hp;
      G.hp = this.hero.hp;
    }
    if (this.lo.sets.includes('frost')) {
      const near = this.units.slice().sort((p, q) => cheb([p.x, p.y], enc.player) - cheb([q.x, q.y], enc.player))[0];
      if (near) {
        near.stun = 1;
        near.ent.glow = 'rgba(150,210,255,0.6)';
      }
    }
    this.scene = {
      w: this.w,
      h: this.h,
      biome: G.area === 'town' ? 'meadow' : G.area === 'erased' ? 'erased' : G.area,
      tile: (x, y) => this.tiles[y][x],
      ents: [],
      marks: [],
      arrows: [],
    };
    this.syncEnts();
    this.computeIntents();
    this.snap('시작');
    this.refresh();
  }

  /** 지금 판 상태를 한 장 기록한다 */
  snap(note: string) {
    const T: Record<TileKind, string> = { floor: '.', wall: '#', void: ' ', throne: 't', water: '~', bush: 'b', ice: 'i', high: 'h' };
    this.frames.push({
      note,
      tiles: this.tiles.map((r) => r.map((k) => T[k]).join('')).join('/'),
      units: [
        ...this.allies.filter((a) => a.hp > 0).map((a) => [a.ent.sprite, a.x, a.y, a.hp] as [string, number, number, number]),
        ...this.enemies().map((u) => [u.ent.sprite, u.x, u.y, u.hp] as [string, number, number, number]),
      ],
    });
  }

  // ---------- 기본 ----------
  private addEnemy(m: MobId, x: number, y: number, t: number) {
    const d = MOBS[m];
    const minion = m === 'slimelet' || m === 'strawpawn' || m === 'echo';
    // 숨은 난이도: 일반 몹은 2단계마다 +1, 보스는 단계마다 +1
    const big = d.ai === 'boss' || d.ai === 'queen' || ELITE.has(m);
    // 숨은 난이도: 진행 단계 + 난이도(엘리트·보스) + 환생 횟수(최대 +2)
    const reb = minion ? 0 : Math.min(2, Number(G.flags.rebirth ?? 0));
    const bonus = (d.ai === 'boss' || d.ai === 'queen' ? t : minion ? 0 : Math.floor(t / 2)) + (big ? DIFFS[G.diff].bossHp : minion ? 0 : DIFFS[G.diff].mobHp) + reb;
    const shiny = !minion && !big && !this.enc.guest && (this.enc.daily === 'shiny' || Math.random() < (DIFFS[G.diff].shiny + (perk('shiny') ? 0.03 : 0)) * (runRule() === 'shiny' ? 3 : 1));
    // 지역 리듬 보정 (일반 몹만, 최소 체력 1)
    const tension = !minion && !big ? TENSION[G.area] ?? 0 : 0;
    // 판이 넓고 몹이 많은 대신 일반 몹 체력을 깎는다: 2지역 -25%, 3·4지역 -30% (엘리트는 덜, 보스는 그대로).
    // 2지역은 -30%였는데 몹 기본 체력이 1지역과 비슷해서 대부분 체력 1이 되어 1지역보다 쉬웠다 (베타 제보) → -25%, 늪의 체력 -1도 없앰
    const reg = AREAS[G.area]?.region ?? 1;
    const isBoss = d.ai === 'boss' || d.ai === 'queen';
    const scale = minion || isBoss || reg < 2 ? 1 : reg === 2 ? (big ? 0.9 : 0.75) : big ? 0.85 : 0.7;
    const hp = HP_MUL * Math.max(1, Math.round((d.hp + bonus + tension) * scale) + (shiny ? 1 : 0));
    const sprite = m === 'rook' ? 'p:br' : `m:${m}`;
    const u: BUnit = { uid: UID++, mob: m, x, y, hp, maxHp: hp, atk: d.atk, intent: null, stun: 0, shiny, ent: mkEnt(`u${UID}`, sprite, x, y, { hp, maxHp: hp, bob: true, ...(shiny ? { glow: 'rgba(255,214,90,0.55)' } : {}) }) };
    if (shiny) {
      fx.text(x + 0.5, y, '빛나는 개체!', '#ffd65a', true);
      fx.burst(x + 0.5, y + 0.5, '#ffd65a', 14, { speed: 2 });
      toast(`빛나는 ${d.name}! 조금 더 강하지만 전리품이 많다.`, 'rare');
    }
    this.units.push(u);
    return u;
  }

  private nearFree(p: Vec): Vec | null {
    for (let r = 1; r < 4; r++) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], ...KING]) {
      const x = p[0] + dx * r;
      const y = p[1] + dy * r;
      if (this.free(x, y)) return [x, y];
    }
    return null;
  }

  /** 몹의 행마 (빛나는 개체는 8방향 1칸이 더 붙는다) */
  /** 멀리서 치는 적인가 (2칸 이상 닿는 공격 행마가 있다) — 수풀을 좋아한다. 아니면 붙어 치는 적 — 고지를 좋아한다 */
  private isRangedMob(m: MobId) {
    return MOBS[m].attack.some((r) => r.kind === 'leap' || (r.kind === 'slide' && r.range > 1));
  }

  /**
   * 일반 전투(떠도는 몹과의 조우) 시작 때, 난이도만큼 몇몇 적 곁에 그 적에게 유리한 지형을 깐다.
   * 멀리 치는 적 → 제자리(또는 곁)에 수풀, 붙어 치는 적 → 주인공 쪽 곁에 고지. 주인공 시작 칸 둘레는 비운다.
   */
  private placeEnemyTerrain() {
    const n = DIFFS[G.diff].terrain;
    const enc = this.enc;
    if (!n || !enc.terrainName || enc.boss || enc.hold || enc.guest || enc.daily) return;
    const [px, py] = enc.player;
    const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && (this.tiles[y][x] === 'floor') && cheb([x, y], [px, py]) > 1;
    let left = n;
    for (const e of shuffle(enc.enemies.slice())) {
      if (left <= 0) break;
      const ranged = this.isRangedMob(e.m);
      const kind: TileKind = ranged ? 'bush' : 'high';
      const near = KING.map(([dx, dy]) => [e.x + dx, e.y + dy] as Vec).filter(([x, y]) => ok(x, y));
      let spot: Vec | undefined;
      if (ranged && ok(e.x, e.y)) spot = [e.x, e.y];
      else spot = near.sort((a, b) => cheb(a, [px, py]) - cheb(b, [px, py]))[0];
      if (!spot) continue;
      this.tiles[spot[1]][spot[0]] = kind;
      left--;
    }
  }

  /** 적이 서 있는 지형이 마음에 드는가 (이동 고를 때 동점을 깨는 작은 가산점) */
  private terrainPref(u: BUnit, [x, y]: Vec) {
    const t = this.tileAt(x, y);
    if (t === 'bush') return this.isRangedMob(u.mob!) ? 0.5 : 0;
    if (t === 'high') return this.isRangedMob(u.mob!) ? 0 : 0.5;
    return 0;
  }

  /** 고지 위의 적은 공격 +1 (주인공과 같은 규칙) */
  private highBonus(u: BUnit) {
    return this.tileAt(u.x, u.y) === 'high' ? 1 : 0;
  }

  private mobRules(u: BUnit, k: 'move' | 'attack'): MoveRule[] {
    const base = MOBS[u.mob!][k];
    return u.shiny ? [...base, { kind: 'step', dirs: KING, range: 1, mode: 'both' }] : base;
  }

  private nameOf(a: BUnit) {
    return a.ally === 'hero' ? '용사' : COMPANIONS[a.ally as CompanionId].name;
  }

  enemies = () => this.units.filter((u) => u.hp > 0);
  liveAllies = () => this.allies.filter((a) => a.hp > 0);
  get hero() { return this.allies[0]; }
  get cur() { return this.allies[this.active]?.hp > 0 ? this.allies[this.active] : this.hero; }
  boss = () => this.units.find((u) => u.hp > 0 && (MOBS[u.mob!].ai === 'boss' || MOBS[u.mob!].ai === 'queen'));
  unitAt = (x: number, y: number) => this.units.find((u) => u.hp > 0 && u.x === x && u.y === y) ?? null;
  allyAt = (x: number, y: number) => this.allies.find((a) => a.hp > 0 && a.x === x && a.y === y) ?? null;
  inb = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h;
  floor = (x: number, y: number) => this.inb(x, y) && WALKABLE.has(this.tiles[y][x]);
  tileAt = (x: number, y: number) => (this.inb(x, y) ? this.tiles[y][x] : 'wall');
  free = (x: number, y: number) => this.floor(x, y) && !this.unitAt(x, y) && !this.allyAt(x, y);
  nearestAlly = (p: Vec) => this.liveAllies().sort((a, b) => cheb([a.x, a.y], p) - cheb([b.x, b.y], p) || manh([a.x, a.y], p) - manh([b.x, b.y], p))[0];

  private syncEnts() {
    this.scene.ents = [...this.units.filter((u) => u.ent.alpha > 0).map((u) => u.ent), ...this.allies.filter((a) => a.ent.alpha > 0).map((a) => a.ent)];
  }

  private rulesOf(a: BUnit): MoveRule[] {
    if (a.ally !== 'hero') return COMPANIONS[a.ally as CompanionId].rules;
    // 총은 재장전 중엔 쏠 수 없다
    return this.gunReload > 0 ? this.lo.rules.filter((r) => !r.gun) : this.lo.rules;
  }

  get hasGun() {
    return this.lo.rules.some((r) => r.gun);
  }

  /** 총이 아니면 닿지 않는 적인가 (= 이번 공격은 사격) */
  private isShot(a: BUnit, u: BUnit) {
    if (a.ally !== 'hero' || !this.hasGun || this.gunReload > 0) return false;
    const melee = genTargets(this.lo.rules.filter((r) => !r.gun), [a.x, a.y], this.allyGrid(a)).attacks;
    return !melee.some((t) => eq(t, [u.x, u.y]));
  }

  /** 사격 연출: 총구 섬광 → 탄 궤적 → 명중 */
  private async shootFx(a: BUnit, u: BUnit, onHit: () => void) {
    sfx('shot');
    const x0 = a.x + 0.5;
    const y0 = a.y + 0.45;
    const x1 = u.x + 0.5;
    const y1 = u.y + 0.5;
    const d = Math.hypot(x1 - x0, y1 - y0) || 1;
    // 반동: 쏘는 방향 반대로 살짝 밀림
    const rx = -((x1 - x0) / d) * 0.12;
    const ry = -((y1 - y0) / d) * 0.12;
    fx.burst(x0 + (x1 - x0) / d * 0.4, y0 + (y1 - y0) / d * 0.4, '#fff3b0', 10, { speed: 2.5, life: 180, size: 0.09, shape: 'spark' });
    fx.text(x0, y0 - 0.45, '탕!', '#ffe27a', true);
    fx.shake(6, 220);
    await fx.tween(70, (p) => { a.ent.x = a.x + rx * p; a.ent.y = a.y + ry * p; });
    // 탄 궤적: 선을 따라 짧게 빛나는 점들
    const steps = Math.max(6, Math.round(d * 5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      fx.parts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, vx: 0, vy: 0, life: 160 + i * 12, max: 160 + i * 12, size: 0.07, color: '#ffe9a0', grav: 0, shape: 'dot' });
    }
    await fx.wait(90);
    fx.stop(80);
    onHit();
    fx.burst(x1, y1, '#9a8a7a', 8, { speed: 1.2, grav: -0.2, life: 500, size: 0.12 }); // 화약 연기
    await fx.tween(160, (p) => { a.ent.x = a.x + rx * (1 - p); a.ent.y = a.y + ry * (1 - p); });
    a.ent.x = a.x;
    a.ent.y = a.y;
  }

  private allyGrid(me: BUnit): Grid {
    return {
      w: this.w,
      h: this.h,
      passable: this.floor,
      occ: (x, y) => (this.unitAt(x, y) ? 'enemy' : this.allyAt(x, y) && this.allyAt(x, y) !== me ? 'block' : null),
    };
  }

  private gridFor(u: BUnit): Grid {
    const ghost = MOBS[u.mob!].tags?.includes('ghost');
    return {
      w: this.w,
      h: this.h,
      passable: ghost ? (x, y) => this.inb(x, y) && this.tiles[y][x] !== 'void' : this.floor,
      occ: (x, y) => {
        if (this.allyAt(x, y)) return 'enemy';
        const o = this.unitAt(x, y);
        return o && o !== u ? 'block' : null;
      },
    };
  }

  refresh() {
    const a = this.cur;
    if (this.busy || this.over) this.targets = { moves: [], attacks: [] };
    else {
      this.targets = genTargets(this.rulesOf(a), [a.x, a.y], this.allyGrid(a));
      if (a.rooted) this.targets.moves = [];
      // 수풀 속 적은 멀리서 칠 수 없다
      this.targets.attacks = this.targets.attacks.filter(([x, y]) => this.tileAt(x, y) !== 'bush' || cheb([a.x, a.y], [x, y]) <= 1);
    }
    const marks: Mark[] = [];
    const arrows: Arrow[] = [];
    // 예고 칸마다 받을 피해를 모은다 (여러 적이 겹치면 합)
    const teleDmg = new Map<string, number>();
    const addTele = (u: BUnit, x: number, y: number) => {
      const k = `${x},${y}`;
      const tgt = this.allyAt(x, y) ?? undefined;
      teleDmg.set(k, (teleDmg.get(k) ?? 0) + (u.atk + this.synergy(u, tgt).bonus + this.highBonus(u)) * (cheb([u.x, u.y], [x, y]) <= 1 ? 2 : 1));
    };
    for (const u of this.enemies()) {
      const it = u.intent;
      if (!it) continue;
      if (it.t === 'attack' && it.hidden) continue;
      if (it.t === 'attack' && it.blur) {
        for (const [x, y] of it.sq) for (const [dx, dy] of [[0, 0], ...KING]) if (this.floor(x + dx, y + dy)) marks.push({ x: x + dx, y: y + dy, kind: 'blur' });
        continue;
      }
      if (it.t === 'attack') for (const [x, y] of it.sq) addTele(u, x, y);
      if (it.t === 'charge') for (const [x, y] of it.path) { const k = `${x},${y}`; teleDmg.set(k, (teleDmg.get(k) ?? 0) + (u.atk + this.synergy(u, this.allyAt(x, y) ?? undefined).bonus + this.highBonus(u)) * 2); }
      if (it.t === 'move') arrows.push({ from: [u.x, u.y], to: it.to, color: 'rgba(150,30,30,0.55)' });
    }
    for (const [k, d] of teleDmg) {
      const [x, y] = k.split(',').map(Number);
      marks.push({ x, y, kind: 'tele', label: `-${d}` });
    }
    for (const [x, y] of this.erase) marks.push({ x, y, kind: 'erase' });
    for (const [x, y] of this.frost) marks.push({ x, y, kind: 'frost' });
    if (this.warpTo) marks.push({ x: this.warpTo[0], y: this.warpTo[1], kind: 'warp' });
    for (const [x, y] of this.summonAt) marks.push({ x, y, kind: 'summon' });
    for (const l of this.lines) for (const [x, y] of l) marks.push({ x, y, kind: 'line' });
    for (const k of this.traps.keys()) {
      const [x, y] = k.split(',').map(Number);
      marks.push({ x, y, kind: 'trap' });
    }
    if (!this.busy && !this.over) {
      if (this.liveAllies().length > 1) {
        marks.push({ x: a.x, y: a.y, kind: 'ally' });
      }
      if (this.mode) {
        this.modeTargets = this.mode.t === 'ability' ? this.abilityTargets(this.mode.i) : this.healTargets();
        for (const [x, y] of this.modeTargets) marks.push({ x, y, kind: this.mode.t === 'heal' ? 'heal' : 'ability' });
      } else {
        for (const [x, y] of this.targets.moves) marks.push({ x, y, kind: 'move' });
        for (const [x, y] of this.targets.attacks) marks.push({ x, y, kind: 'attack', ...(cheb([a.x, a.y], [x, y]) <= 1 ? { label: '×2' } : {}) });
        // 첫 안내: 칠 수 있는 적, 없으면 예고 칸이 아닌 이동 칸을 손가락으로 짚는다
        const cn = coachNow();
        if (cn === 'battle') {
          const tele = new Set(marks.filter((m) => m.kind === 'tele').map((m) => `${m.x},${m.y}`));
          const t = this.targets.attacks[0] ?? this.targets.moves.find(([x, y]) => !tele.has(`${x},${y}`)) ?? this.targets.moves[0];
          if (t) marks.push({ x: t[0], y: t[1], kind: 'tap' });
        } else if (cn === 'ally') {
          const o = this.liveAllies().find((u) => u !== a);
          if (o) marks.push({ x: o.x, y: o.y, kind: 'tap' });
        }
      }
    }
    this.scene.marks = marks;
    this.scene.arrows = arrows;
    this.syncEnts();
    this.cb.refresh();
  }

  // ---------- 입력 ----------
  async click(x: number, y: number) {
    if (this.busy || this.over) return;
    if (this.mode) {
      const m = this.mode;
      this.mode = null;
      if (this.modeTargets.some((t) => eq(t, [x, y]))) {
        if (m.t === 'ability') {
          this.acts.ability++;
          this.note = `능력: ${ABILITIES[this.lo.abilities[m.i].id].name}`;
          sfx('ability');
          emit('ability');
          await this.act(() => this.useAbility(m.i, [x, y]));
        }
        else await this.act(() => this.heal(this.allyAt(x, y)!));
      } else this.refresh();
      return;
    }
    // 다른 아군을 누르면 그 말로 바꿔 든다
    const al = this.allyAt(x, y);
    if (al && al !== this.cur) {
      this.active = this.allies.indexOf(al);
      this.refresh();
      return;
    }
    const a = this.cur;
    if (this.targets.attacks.some((t) => eq(t, [x, y]))) {
      if (a.ally === 'hero') this.acts.attack++;
      this.note = `${this.nameOf(a)} → ${MOBS[this.unitAt(x, y)!.mob!].name} 공격`;
      await this.act(() => this.allyAttack(a, this.unitAt(x, y)!));
    } else if (this.targets.moves.some((t) => eq(t, [x, y]))) {
      if (a.ally === 'hero') this.acts.move++;
      this.note = `${this.nameOf(a)} ${'abcdefgh'[x]}${this.h - y}로 이동`;
      await this.act(async () => {
        const ox = a.x;
        const oy = a.y;
        await moveEnt(a.ent, [x, y]);
        a.x = x;
        a.y = y;
        // 얼음: 같은 방향으로 한 칸 더 미끄러진다
        if (this.tileAt(x, y) === 'ice') {
          const nx = x + sign(x - ox);
          const ny = y + sign(y - oy);
          if (this.free(nx, ny)) {
            fx.text(x + 0.5, y, '미끄덩!', '#bfe3f2');
            await moveEnt(a.ent, [nx, ny]);
            a.x = nx;
            a.y = ny;
          }
        }
      });
    }
  }

  selectAbility(i: number) {
    if (this.busy || this.over || this.cds[i] > 0) return;
    this.active = 0;
    this.mode = this.mode?.t === 'ability' && this.mode.i === i ? null : { t: 'ability', i };
    this.refresh();
  }

  selectHeal() {
    if (this.busy || this.over) return;
    this.mode = this.mode?.t === 'heal' ? null : { t: 'heal' };
    this.refresh();
  }

  selectAlly(i: number) {
    if (this.busy || this.over || this.allies[i]?.hp <= 0) return;
    this.active = i;
    this.mode = null;
    clearCoach('ally');
    this.refresh();
  }

  /**
   * 둘 수 있는 수가 하나도 없는가 (모든 아군이 이동·공격 불가, 쓸 수 있는 능력도 없음).
   * 버티기를 없앤 대신, 이때만 턴을 넘길 수 있다 (아무 이득 없음).
   */
  stuck(): boolean {
    for (const a of this.liveAllies()) {
      const t = genTargets(this.rulesOf(a), [a.x, a.y], this.allyGrid(a));
      if (t.attacks.length || (!a.rooted && t.moves.length)) return false;
    }
    return !this.lo.abilities.some((_, i) => this.cds[i] === 0 && this.abilityTargets(i).length > 0);
  }

  /** 수가 없을 때만: 아무것도 하지 않고 턴을 넘긴다 */
  async pass() {
    if (this.busy || this.over || !this.stuck()) return;
    const a = this.cur;
    this.note = `${this.nameOf(a)} — 둘 수가 없다`;
    await this.act(async () => {
      fx.text(a.x + 0.5, a.y, '둘 수가 없다', '#cfc6b0');
      await squash(a.ent);
    });
  }

  /** 보스전 포기: 패배와 같게 처리 */
  giveUp() {
    if (this.busy || this.over) return;
    this.over = true;
    this.cb.end('lose', this.kills);
  }

  flee() {
    if (this.busy || this.over || this.enc.noFlee) return;
    this.over = true;
    G.hp = Math.max(1, G.hp - DIFFS[G.diff].fleeCost);
    this.cb.end('flee', this.kills);
  }

  private async act(fn: () => Promise<void>) {
    clearCoach('battle');
    this.busy = true;
    for (const a of this.allies) a.rooted = false;
    this.refresh();
    await fn();
    if (this.checkEnd()) { this.snap(`${this.turn}. ${this.note} — 끝`); return; }
    await this.enemyPhase();
    this.armRetaliations();
    this.snap(`${this.turn}. ${this.note}`);
    if (this.checkEnd()) return;
    // 버티기 전투: 정한 턴을 다 버티면 승리
    if (this.enc.hold && this.turn >= this.enc.hold && this.hero.hp > 0) {
      this.over = true;
      this.refresh();
      setTimeout(() => this.cb.end('win', this.kills), fx.instant ? 0 : 450);
      return;
    }
    if (this.enc.hold) this.bossNote = `버티기 ${this.turn}/${this.enc.hold} — 저자를 치지 않고 끝까지 서 있자.`;
    this.turn++;
    this.tickClock();
    this.cds = this.cds.map((c) => Math.max(0, c - 1));
    this.gunReload = Math.max(0, this.gunReload - 1);
    for (const a of this.allies) {
      a.rooted = !!a.rootNext;
      a.rootNext = false;
    }
    if (this.cur.hp <= 0) this.active = 0;
    this.computeIntents();
    this.busy = false;
    fx.turnAt = fx.time; // 판 테두리 반짝 (내 차례)
    this.refresh();
  }

  /**
   * 지역 몹의 흔적: 지나간 칸의 땅이 바뀌어 판이 조금씩 달라진다 (와리가리 한 자리만 반복하기 어렵게).
   * 늪 두꺼비 → 물웅덩이(못 지나감), 얼음 정령·서리 비숍 → 빙판(미끄러짐), 잉크 얼룩 → 번진 잉크(수풀처럼 먼 공격을 막음).
   * 한 전투에 6칸까지, 보스전·버티기·시험 전투에는 없음
   */
  private trails = 0;
  private leaveTrail(u: BUnit, [x, y]: Vec) {
    if (this.enc.boss || this.enc.hold || this.enc.guest || this.trails >= 6) return;
    const kind: TileKind | null = u.mob === 'toad' ? 'water' : u.mob === 'icesprite' || u.mob === 'frostbishop' ? 'ice' : u.mob === 'inkblot' ? 'bush' : null;
    if (!kind || this.tiles[y]?.[x] !== 'floor' || Math.random() > 0.3) return;
    if (kind === 'water' && this.allies.some((a) => cheb([a.x, a.y], [x, y]) <= 1)) return; // 바로 옆을 물로 막아 가두지는 않는다
    this.tiles[y][x] = kind;
    this.trails++;
    fx.text(x + 0.5, y + 0.3, kind === 'water' ? '물웅덩이' : kind === 'ice' ? '빙판' : '번진 잉크', kind === 'water' ? '#7fb8e0' : kind === 'ice' ? '#d8eef8' : '#9a8fb0');
  }

  /** 한 번 더 움직이기 (난이도 × 숨은 빠르기). 일반 AI 몹만, 아직 칠 수 없을 때만 다가간다 */
  private async extraStep(u: BUnit) {
    if (u.hp <= 0 || this.enc.hold || this.enc.guest) return;
    const d = MOBS[u.mob!];
    if (d.ai !== 'basic') return;
    const p = (DIFFS[G.diff].haste + (runRule() === 'swift' ? 0.1 : 0)) * (SPEED[u.mob!] ?? 1);
    if (!p || Math.random() >= p) return;
    if (this.hitTarget(u, [u.x, u.y])) return;
    const it = this.decide(u, new Set());
    if (it.t !== 'move' || !this.free(it.to[0], it.to[1])) return;
    fx.text(u.x + 0.5, u.y - 0.2, '재빠름!', '#9ad7ff');
    await moveEnt(u.ent, it.to);
    u.x = it.to[0];
    u.y = it.to[1];
    await this.trapCheck(u);
  }

  /** 초읽기 한도 (0 = 없음). 보스전은 1.6배 길게, 버티기·시험·오늘의 기보는 없음 */
  get clockLimit(): number {
    const c = DIFFS[G.diff].clock;
    if (!c || this.enc.hold || this.enc.guest || this.enc.daily) return 0;
    // 체력 2배 규칙으로 전투가 길어진 만큼 초읽기도 1.5배 늦게
    return Math.round(c * 1.5 * (this.enc.boss ? 1.6 : 1));
  }
  clockFury = 0;
  /** 초읽기: 한도를 넘기면 4턴마다 가장 가까운 적 하나의 공격만 +1 (최대 3회). */
  private tickClock() {
    const L = this.clockLimit;
    if (!L || this.turn <= L || this.clockFury >= 3 || (this.turn - L - 1) % 4 !== 0) return;
    const u = this.enemies().sort((a, b) => cheb([a.x, a.y], [this.hero.x, this.hero.y]) - cheb([b.x, b.y], [this.hero.x, this.hero.y]))[0];
    if (!u) return;
    this.clockFury++;
    u.atk++;
    fx.text(u.x + 0.5, u.y - 0.3, '초읽기 +1', '#ffb27a', true);
    fx.shake(4);
    toast(`⏳ 초읽기 ${this.clockFury}단계 — ${MOBS[u.mob!].name}의 공격 +1`, 'bad');
  }

  private checkEnd(): boolean {
    if (this.over) return true;
    if (this.hero.hp <= 0) {
      this.over = true;
      this.refresh();
      setTimeout(() => this.cb.end('lose', this.kills), fx.instant ? 0 : 500);
      return true;
    }
    if (this.enemies().length === 0) {
      this.over = true;
      this.refresh();
      setTimeout(() => this.cb.end('win', this.kills), fx.instant ? 0 : 450);
      return true;
    }
    return false;
  }

  // ---------- 아군 행동 ----------
  private async allyAttack(a: BUnit, u: BUnit) {
    let dmg = a.ally === 'hero' ? 1 : a.atk;
    const isHero = a.ally === 'hero';
    // 반격 태세: 맞기 전에 기억해 둔다 (맞으면 dmgEnemy가 태세를 푼다)
    const stance = isHero && !!u.retaliating;
    // 수풀 속 적은 멀리서 오는 공격(사격 포함)을 막는다 — 주인공과 같은 규칙
    if (this.tileAt(u.x, u.y) === 'bush' && cheb([a.x, a.y], [u.x, u.y]) > 1) {
      if (isHero && this.isShot(a, u)) this.gunReload = 3;
      await lunge(a.ent, [u.x, u.y], () => {});
      fx.text(u.x + 0.5, u.y - 0.25, '수풀에 숨음', '#9fd08a');
      await this.checkPhase();
      return;
    }
    // 사격: 3 피해(명사수 +1), 쏜 다음 두 턴 재장전, 쓰러뜨려도 그 칸으로 들어가지 않는다
    if (this.isShot(a, u)) {
      let shotDead = false;
      const shotDmg = 3 + (perk('shot') ? 1 : 0);
      await this.shootFx(a, u, () => { shotDead = this.dmgEnemy(u, shotDmg, 1); }); // 사격은 멀리서 치는 것이라 1배
      this.gunReload = 3; // 이번 턴 끝에 1 줄어, 다음 두 턴 동안 못 쏜다
      if (shotDead) await this.kill(u, false, 'shot');
      else if (stance) await this.retaliate(u, a);
      await this.checkPhase();
      return;
    }
    // 날카로움: 전투마다 처음 N번 +1
    if (isHero && this.sharp > 0) {
      dmg++;
      this.sharp--;
    }
    // 고지에서 내려치면 +1
    if (this.tileAt(a.x, a.y) === 'high') {
      dmg++;
      fx.text(a.x + 0.5, a.y - 0.2, '고지!', '#f0d27a');
    }
    let dead = false;
    const ax = Math.abs(u.x - a.x);
    const ay = Math.abs(u.y - a.y);
    const how = !isHero ? 'ally' : (ax === 1 && ay === 2) || (ax === 2 && ay === 1) ? 'knight' : 'melee';
    // 붙어서 치면 2배, 떨어져서(미끄러져 오거나 L자로 뛰어) 치면 1배
    const melee = cheb([a.x, a.y], [u.x, u.y]) <= 1;
    if (!melee) fx.text(u.x + 0.5, u.y - 0.45, '먼 공격', '#cfd8e8');
    await lunge(a.ent, [u.x, u.y], () => { sfx('hit'); dead = this.dmgEnemy(u, dmg, melee ? 2 : 1, melee); });
    if (dead) {
      const to: Vec = [u.x, u.y];
      // 폰이 잡는 방식(바로 아래 대각선 칸에서의 일격, 주인공·동료 모두)이었나 — 숨은 엔딩 단서용
      this.pawnCapture = Math.abs(u.x - a.x) === 1 && a.y === u.y + 1;
      await this.kill(u, false, how);
      this.pawnCapture = false;
      if (this.free(to[0], to[1])) {
        await moveEnt(a.ent, to);
        a.x = to[0];
        a.y = to[1];
      }
    } else if (stance && u.hp > 0 && await this.retaliate(u, a)) {
      // 반격을 받았으면 속박은 걸리지 않는다
    } else if (u.hp > 0 && ((isHero && this.bind > 0) || a.ally === 'ghostknight')) {
      if (isHero) this.bind--;
      u.intent = { t: 'idle', why: '묶임' };
      fx.text(u.x + 0.5, u.y - 0.1, '속박', '#cfe0ff');
    }
    await this.checkPhase();
  }

  /**
   * 반격 태세인 적이 주인공에게 맞고 살아남으면, 난이도 확률로 그 자리에서 바로 되받아친다.
   * 주인공이 친 것과 같은 행마(같은 방향·거리)로 친다: 붙어서 맞았으면 붙어서(2배), 멀리서 맞았으면 그 거리에서(1배).
   * 확률에 실패해도 태세는 풀린다. 반격했으면 true.
   */
  private async retaliate(u: BUnit, a: BUnit): Promise<boolean> {
    u.retaliating = false;
    u.ent.glow = u.shiny ? 'rgba(255,214,90,0.55)' : undefined;
    if (Math.random() >= DIFFS[G.diff].retaliate) {
      fx.text(u.x + 0.5, u.y - 0.35, '반격 실패', '#c8b9a6');
      return false;
    }
    fx.text(u.x + 0.5, u.y - 0.35, '반격!', '#ffb27a', true);
    await lunge(u.ent, [a.x, a.y], () => {});
    await this.hitAlly(a, 1, u);
    return true;
  }

  private healTargets(): Vec[] {
    const p = this.cur;
    return this.liveAllies().filter((a) => a !== p && cheb([a.x, a.y], [p.x, p.y]) <= 1 && a.hp < a.maxHp).map((a) => [a.x, a.y] as Vec);
  }

  private async heal(t: BUnit) {
    const n = Math.min(2 * HP_MUL, t.maxHp - t.hp);
    t.hp += n;
    t.ent.hp = t.hp;
    if (t.ally === 'hero') G.hp = t.hp;
    fx.text(t.x + 0.5, t.y, `+${n}`, '#8fe0a0');
    fx.burst(t.x + 0.5, t.y + 0.5, '#bff0c8', 10, { speed: 1.5, grav: -0.3 });
    await flash(t.ent, '#bff0c8');
  }

  private shielded(u: BUnit) {
    return u.mob === 'strawking' && this.phase === 2 && this.tiles[u.y][u.x] === 'throne' && this.units.some((o) => o.hp > 0 && o.mob === 'strawpawn');
  }

  private dmgEnemy(u: BUnit, dmg: number, mul = HP_MUL, melee = false): boolean {
    dmg *= mul;
    if (this.enc.hold && u.mob === 'author') {
      fx.text(u.x + 0.5, u.y + 0.1, '…치지 않는다', '#cfd8ff');
      return false;
    }
    if (this.shielded(u)) {
      fx.text(u.x + 0.5, u.y + 0.1, '밀짚 방벽!', '#ffd35a');
      flash(u.ent, '#ffd35a');
      fx.shake(2);
      return false;
    }
    u.hp = Math.max(0, u.hp - dmg);
    u.ent.hp = u.hp;
    u.hitThisTurn = true;
    u.unhitTurns = 0;
    u.retaliating = false;
    u.ent.glow = u.shiny ? 'rgba(255,214,90,0.55)' : undefined;
    hitFx(u.ent, dmg, undefined, melee);
    return u.hp <= 0;
  }

  /** 지금 처리 중인 처치가 '폰이 잡는 방식'의 일격인가 (allyAttack이 kill 직전에 세운다) */
  private pawnCapture = false;

  private async kill(u: BUnit, noDrop = false, how = 'other') {
    u.hp = 0;
    if (['melee', 'knight', 'shot'].includes(how)) {
      const w = equipped('weapon');
      if (w) w.kills = (w.kills ?? 0) + 1;
    }
    const d = MOBS[u.mob!];
    // 해골 기사: 첫 죽음은 무너질 뿐, 곧 다시 일어난다
    if (d.tags?.includes('revive') && !u.revived && !noDrop) {
      await death(u.ent, u.mob ?? '');
      const spot = this.free(u.x, u.y) ? ([u.x, u.y] as Vec) : this.nearFree([u.x, u.y]);
      if (spot) {
        const s = this.addEnemy(u.mob!, spot[0], spot[1], 0);
        s.hp = 1;
        s.maxHp = u.maxHp;
        s.ent.hp = 1;
        s.ent.maxHp = u.maxHp;
        s.revived = true;
        s.intent = { t: 'idle', why: '쓰러짐' };
        this.syncEnts();
        fx.text(spot[0] + 0.5, spot[1], '다시 일어선다!', '#e8e2cf');
        await popIn(s.ent);
      }
      return;
    }
    if (u.mob && !noDrop) {
      // 숨은 엔딩 「다음 보스」의 단서: 보스를 폰답게 끝냈는가
      if (u.mob === 'strawking') bossFell('straw', this.hero.hp > 0 && this.tileAt(this.hero.x, this.hero.y) === 'throne');
      if (u.mob === 'misqueen') bossFell('queen', u.y === 0);
      if (u.mob === 'frozenking') bossFell('king', this.pawnCapture);
      this.kills.push(u.mob);
      this.hows.push({ mob: u.mob, how });
      if (u.shiny) this.shinyKills.push(u.mob);
    }
    await death(u.ent, u.mob ?? '');
    this.syncEnts();
    // 분열: 슬라임은 하나, 잉크 얼룩은 둘로 튄다
    const splitTo = u.mob === 'slime' ? 'slimelet' : d.split;
    if (splitTo && !noDrop) {
      const spots = shuffle(KING.map(([dx, dy]) => [u.x + dx, u.y + dy] as Vec).filter(([x, y]) => this.free(x, y)));
      for (const [x, y] of spots.slice(0, u.mob === 'slime' ? 1 : 2)) {
        const s = this.addEnemy(splitTo, x, y, 0);
        s.ent.x = u.x;
        s.ent.y = u.y;
        this.syncEnts();
        fx.text(x + 0.5, y, '분열!', u.mob === 'slime' ? '#bdf0b0' : '#a0a0c0');
        await Promise.all([moveEnt(s.ent, [x, y]), popIn(s.ent)]);
      }
    }
    if (d.ai === 'boss' || d.ai === 'queen') {
      fx.shake(8, 400);
      this.lines = [];
      this.erase = [];
      for (const o of this.enemies()) await this.kill(o, true);
    }
  }

  private async checkPhase() {
    const b = this.boss();
    if (b && this.phase === 1 && b.hp <= Math.floor(b.maxHp / 2)) {
      this.phase = 2;
      if (b.mob === 'strawking') {
        this.bossNote = '옥좌로 물러나 밀짚 폰을 방패로 삼고, 곁에 붙은 폰을 흡수해 체력을 되찾는다. 폰부터 치우자!';
        await cutin('밀짚왕이 분노한다', '옥좌로 물러나 밀짚 폰을 방패로 삼고, 곁에 붙은 폰을 흡수해 체력을 되찾는다. 폰부터 치우자!', 'phase');
      } else if (b.mob === 'frozenking') {
        b.atk = 2;
        this.bossNote = '킹이 파수꾼과 자리를 바꾸듯 물러나고, 서리 폭풍이 더 자주 몰아친다. 킹의 손도 더 매서워졌다.';
        await cutin('캐슬링!', '킹이 파수꾼과 자리를 바꾸듯 물러나고, 서리 폭풍이 더 자주 몰아친다. 킹의 손도 더 매서워졌다.', 'phase');
        await this.blinkAway(b);
        await this.summonNear(b, 'tower');
      } else if (b.mob === 'author') {
        b.atk = 2;
        this.bossNote = '저자가 펜을 고쳐 쥔다. 필기가 두 줄로 늘고, 판의 가장자리가 지워지기 시작한다.';
        await cutin('마지막 장', '저자가 펜을 고쳐 쥔다. 필기가 두 줄로 늘고, 판의 가장자리가 지워지기 시작한다.', 'phase');
      } else {
        b.atk = 2; // 분노한 퀸은 더 세게 친다
        this.bossNote = '체크 라인이 두 줄로 늘고, 퀸이 판 위를 제멋대로 옮겨 다니며 더 세게 친다.';
        await cutin('퀸이 수를 무른다', '체크 라인이 두 줄로 늘고, 퀸이 판 위를 제멋대로 옮겨 다니며 더 세게 친다.', 'phase');
      }
    }
    for (const u of this.enemies()) {
      if (MOBS[u.mob!].tags?.includes('summoner') && !u.summoned && u.hp <= Math.floor(u.maxHp / 2)) {
        u.summoned = true;
        const spots = KING.map(([dx, dy]) => [u.x + dx, u.y + dy] as Vec).filter(([x, y]) => this.free(x, y)).slice(0, 1);
        for (const [x, y] of spots) {
          const s = this.addEnemy(MOBS[u.mob!].summon ?? 'skeleton', x, y, 0);
          s.intent = { t: 'idle', why: '소환됨' };
          this.syncEnts();
          fx.burst(x + 0.5, y + 0.5, '#e8e2cf', 10, { speed: 2 });
          await popIn(s.ent);
        }
        fx.text(u.x + 0.5, u.y - 0.2, '일어나라!', '#e8e2cf', true);
      }
    }
  }

  // ---------- 능력 ----------
  private abilityTargets(i: number): Vec[] {
    const ab = this.lo.abilities[i];
    const hr = this.hero;
    const p: Vec = [hr.x, hr.y];
    const res: Vec[] = [];
    const around = (r: number) => {
      const out: Vec[] = [];
      for (let y = p[1] - r; y <= p[1] + r; y++) for (let x = p[0] - r; x <= p[0] + r; x++) if (this.inb(x, y) && !(x === p[0] && y === p[1])) out.push([x, y]);
      return out;
    };
    switch (ab.id) {
      case 'push':
        return around(1).filter(([x, y]) => this.unitAt(x, y));
      case 'hop':
        for (const [dx, dy] of KING) {
          const n = this.unitAt(p[0] + dx, p[1] + dy) ?? this.allyAt(p[0] + dx, p[1] + dy);
          if (n && this.free(p[0] + dx * 2, p[1] + dy * 2)) res.push([p[0] + dx * 2, p[1] + dy * 2]);
        }
        return res;
      case 'swap':
        return around(2 + ab.lv).filter(([x, y]) => {
          const u = this.unitAt(x, y);
          return u && MOBS[u.mob!].ai !== 'boss' && MOBS[u.mob!].ai !== 'queen';
        });
      case 'terrain':
        return around(ab.lv >= 2 ? 2 : 1).filter(([x, y]) => this.tiles[y][x] === 'wall' || (this.tiles[y][x] === 'floor' && this.free(x, y)));
      case 'trap':
        return around(2).filter(([x, y]) => this.tiles[y][x] === 'floor' && this.free(x, y) && !this.traps.has(key(x, y)));
      case 'pull':
        for (const [dx, dy] of KING) {
          for (let k = 1; k <= 2 + ab.lv; k++) {
            const x = p[0] + dx * k;
            const y = p[1] + dy * k;
            if (!this.inb(x, y) || this.tiles[y][x] === 'wall') break;
            const u = this.unitAt(x, y);
            if (u) {
              if (k >= 2 && MOBS[u.mob!].ai !== 'boss' && MOBS[u.mob!].ai !== 'queen') res.push([x, y]);
              break;
            }
            if (this.allyAt(x, y)) break;
          }
        }
        return res;
      case 'blink':
        return around(1 + ab.lv).filter(([x, y]) => this.free(x, y));
    }
    return res;
  }

  private async useAbility(i: number, t: Vec) {
    const ab = this.lo.abilities[i];
    const def = ABILITIES[ab.id];
    this.cds[i] = Math.max(2, def.cd - (this.lo.traits.kibo ?? 0) - (perk('kibo') ? 1 : 0));
    const hr = this.hero;
    const pe = hr.ent;
    fx.text(hr.x + 0.5, hr.y - 0.1, def.name, '#8fc0ff');
    switch (ab.id) {
      case 'push': {
        const u = this.unitAt(t[0], t[1])!;
        const d: Vec = [sign(t[0] - hr.x), sign(t[1] - hr.y)];
        let fell = false;
        await lunge(pe, t, () => {});
        for (let k = 0; k < ab.lv; k++) {
          const nx = u.x + d[0];
          const ny = u.y + d[1];
          if (this.inb(nx, ny) && this.tiles[ny][nx] === 'void') {
            await moveEnt(u.ent, [nx, ny]);
            u.x = nx;
            u.y = ny;
            fell = true;
            break;
          }
          if (!this.free(nx, ny)) {
            if (this.dmgEnemy(u, 1)) await this.kill(u, false, 'push');
            break;
          }
          await moveEnt(u.ent, [nx, ny]);
          u.x = nx;
          u.y = ny;
          await this.trapCheck(u);
          if (u.hp <= 0) break;
        }
        if (fell) {
          fx.text(u.x + 0.5, u.y, '추락!', '#ffb070');
          emit('fall', u.mob);
          await this.kill(u, false, 'fall');
        }
        break;
      }
      case 'hop': {
        const mid: Vec = [(hr.x + t[0]) / 2, (hr.y + t[1]) / 2];
        const x0 = pe.x;
        const y0 = pe.y;
        await fx.tween(320, (p) => {
          pe.x = x0 + (t[0] - x0) * p;
          pe.y = y0 + (t[1] - y0) * p;
          pe.z = Math.sin(Math.PI * p) * 0.7;
        }, easeInOut);
        pe.z = 0;
        await squash(pe);
        hr.x = t[0];
        hr.y = t[1];
        const u = this.unitAt(mid[0], mid[1]);
        if (u && ab.lv >= 2 && this.dmgEnemy(u, 1)) await this.kill(u, false, 'hop');
        break;
      }
      case 'swap': {
        const u = this.unitAt(t[0], t[1])!;
        const a: Vec = [hr.x, hr.y];
        fx.burst(a[0] + 0.5, a[1] + 0.5, '#e6c25a', 8, { speed: 1.5 });
        fx.burst(t[0] + 0.5, t[1] + 0.5, '#e6c25a', 8, { speed: 1.5 });
        await fx.tween(260, (p) => { pe.alpha = 1 - p; u.ent.alpha = 1 - p; });
        pe.x = t[0]; pe.y = t[1]; u.ent.x = a[0]; u.ent.y = a[1];
        hr.x = t[0]; hr.y = t[1]; u.x = a[0]; u.y = a[1];
        await fx.tween(260, (p) => { pe.alpha = p; u.ent.alpha = p; });
        await this.trapCheck(u);
        break;
      }
      case 'terrain': {
        const [x, y] = t;
        await lunge(pe, t, () => {});
        if (this.tiles[y][x] === 'wall') {
          this.tiles[y][x] = 'floor';
          fx.burst(x + 0.5, y + 0.5, '#8a8270', 12, { shape: 'chip', grav: 1, speed: 2.5 });
          fx.shake(4);
        } else {
          this.tiles[y][x] = 'wall';
          fx.burst(x + 0.5, y + 0.8, '#6d6452', 8, { shape: 'chip', speed: 1.5 });
          fx.shake(3);
        }
        break;
      }
      case 'trap': {
        this.traps.set(key(t[0], t[1]), 1 + ab.lv);
        fx.burst(t[0] + 0.5, t[1] + 0.6, '#a07a44', 8, { speed: 1.2 });
        await fx.wait(150);
        break;
      }
      case 'pull': {
        const u = this.unitAt(t[0], t[1])!;
        const d: Vec = [sign(t[0] - hr.x), sign(t[1] - hr.y)];
        const to: Vec = [hr.x + d[0], hr.y + d[1]];
        fx.burst(t[0] + 0.5, t[1] + 0.5, '#dfe4ea', 8, { speed: 1.5 });
        await moveEnt(u.ent, to);
        u.x = to[0];
        u.y = to[1];
        await this.trapCheck(u);
        break;
      }
      case 'blink': {
        fx.burst(hr.x + 0.5, hr.y + 0.5, '#c9d6f0', 12, { speed: 2 });
        await fx.tween(160, (p) => { pe.alpha = 1 - p; });
        pe.x = t[0];
        pe.y = t[1];
        hr.x = t[0];
        hr.y = t[1];
        fx.burst(t[0] + 0.5, t[1] + 0.5, '#c9d6f0', 12, { speed: 2 });
        await fx.tween(160, (p) => { pe.alpha = p; });
        break;
      }
    }
    await this.checkPhase();
  }

  /** 공격이 빗나간 적: 킹처럼 8방향으로 딱 한 칸, 가장 가까운 아군 쪽으로 다가선다 */
  private async chaseAfterMiss(u: BUnit) {
    const allies = this.liveAllies();
    if (!allies.length) return;
    const near = (p: Vec) => Math.min(...allies.map((a) => cheb(p, [a.x, a.y])));
    const now = near([u.x, u.y]);
    if (now <= 1) return;
    const moves = KING.map(([dx, dy]) => [u.x + dx, u.y + dy] as Vec)
      .filter(([x, y]) => this.floor(x, y) && this.free(x, y) && !this.erase.some((e) => eq(e, [x, y])));
    let best: Vec | null = null;
    for (const m of moves) if (near(m) < (best ? near(best) : now)) best = m;
    if (!best) return;
    fx.text(u.x + 0.5, u.y - 0.2, '따라붙음', '#ffb27a');
    await moveEnt(u.ent, best);
    u.x = best[0];
    u.y = best[1];
    await this.trapCheck(u);
  }

  private async trapCheck(u: BUnit) {
    const k = key(u.x, u.y);
    const d = this.traps.get(k);
    if (d === undefined || u.hp <= 0) return;
    this.traps.delete(k);
    fx.text(u.x + 0.5, u.y, '덫!', '#e0b070');
    if (this.dmgEnemy(u, d)) await this.kill(u, false, 'trap');
  }

  // ---------- 적 ----------
  /** from에서 공격할 수 있는 아군 (없으면 null) */
  private hitTarget(u: BUnit, from: Vec): BUnit | null {
    const at = genTargets(this.mobRules(u, 'attack'), from, this.gridFor(u)).attacks;
    let best: BUnit | null = null;
    for (const [x, y] of at) {
      const a = this.allyAt(x, y);
      if (a && (!best || a.ally === 'hero')) best = a;
    }
    return best;
  }

  computeIntents() {
    const reserved = new Set<string>();
    for (const u of this.enemies()) u.intent = this.decide(u, reserved);
    this.hiddenRules();
    const b = this.boss();
    this.erase = [];
    this.lines = [];
    if (b?.mob === 'strawking') {
      // 첫 보스라 숨 돌릴 틈을 준다: 1단계 3턴마다, 2단계 2턴마다 칸이 사라진다 (베타 피드백: 너무 셈)
      const eInt = this.phase === 1 ? 3 : 2;
      if ((this.bossTick + 1) % eInt === 0) this.erase = this.pickErase(this.phase === 1 ? 1 : 2);
    }
    if (b?.mob === 'misqueen' && (this.bossTick + 1) % (this.phase === 1 ? 3 : 2) === 0) this.lines = this.pickLines(this.phase === 1 ? 1 : 2, b);
    this.frost = [];
    // 얼어붙은 킹: 2턴마다(2단계는 매 턴) 주인공 근처 두 칸에 서리 폭풍
    if (b?.mob === 'frozenking' && (this.bossTick + 1) % (this.phase === 2 ? 2 : 3) === 0) this.frost = this.pickFrost(this.phase === 2 ? 2 : 1);
    // 저자: 3턴마다 필기(줄 공격), 2단계에선 가장자리를 지운다
    if (b?.mob === 'author') {
      if ((this.bossTick + 1) % 2 === 0) this.lines = this.pickLines(this.phase === 1 ? 1 : 2, b);
      if (this.phase === 2 && (this.bossTick + 1) % 2 === 0) this.erase = this.pickErase(1);
    }
    // 순간 이동·소환 예고: 다음 적 턴에 일어날 일을 지금 정해 판 위에 표시한다
    this.warpTo = null;
    this.summonAt = [];
    if (!b) return;
    const nt = this.bossTick + 1;
    const bPos: Vec = b.intent?.t === 'move' ? b.intent.to : [b.x, b.y];
    const count = (m: MobId) => this.enemies().filter((u) => u.mob === m).length;
    if (b.mob === 'misqueen' && this.phase === 2 && nt % 4 === 0) {
      const hr = this.hero;
      const spots: Vec[] = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.free(x, y) && cheb([x, y], [hr.x, hr.y]) >= 3) spots.push([x, y]);
      if (spots.length) this.warpTo = pick(spots);
      if (count('echo') < 2) { const s = this.summonSpot(this.warpTo ?? bPos); if (s) this.summonAt.push(s); }
    }
    if (b.mob === 'strawking' && nt % (this.phase === 1 ? 5 : 4) === 0) { const s = this.summonSpot(bPos); if (s) this.summonAt.push(s); }
    if (b.mob === 'frozenking' && this.phase === 2 && nt % 4 === 0 && count('tower') < 2) { const s = this.summonSpot(bPos); if (s) this.summonAt.push(s); }
    if (b.mob === 'author' && nt % 3 === 0 && count('annot') < 2) { const s = this.summonSpot(bPos); if (s) this.summonAt.push(s); }
  }

  /**
   * 난이도별 숨은 장치 (안 맞는 사이클 깨기):
   * - 기습: 3지역부터 엘리트 일부가 예고 없이 덮친다 (아주 가끔)
   * - 흐린 예고: 3지역부터 일반 몹 예고가 정확한 칸 대신 '이 근처'로만 보인다
   * 버티기·시험 전투·오늘의 기보에는 쓰지 않는다
   */
  private hiddenRules() {
    if (this.enc.hold || this.enc.guest || this.enc.daily) return;
    const D = DIFFS[G.diff];
    const hr = this.hero;
    if (hr.hp <= 0) return;
    const late = (AREAS[G.area]?.region ?? 1) >= 3;
    const isBoss = (u: BUnit) => { const a = MOBS[u.mob!].ai; return a === 'boss' || a === 'queen'; };
    for (const u of this.enemies()) {
      const it = u.intent;
      const fog = runRule() === 'fog';
      if (it?.t !== 'attack' || isBoss(u) || (!late && !fog)) continue;
      const elite = ELITE.has(u.mob!) || ['giant', 'double', 'frostbishop', 'erased', 'bookworm'].includes(u.mob!);
      if (elite && D.ambush && Math.random() < D.ambush) it.hidden = true;
      else if (!elite && Math.random() < Math.max(D.blur, fog ? 0.2 : 0)) it.blur = true;
    }
  }

  /** 보스 곁에서 말을 부를 칸 (아래쪽 빈칸 우선) */
  private summonSpot(p: Vec, avoid: Vec | null = null): Vec | null {
    const spots = KING.map(([dx, dy]) => [p[0] + dx, p[1] + dy] as Vec).filter(([x, y]) => this.free(x, y) && !(avoid && eq(avoid, [x, y]))).sort((a, c) => c[1] - a[1]);
    return spots[0] ?? null;
  }

  /** 주인공 주변(거리 2 안)의 빈 칸 n개 */
  private pickFrost(n: number): Vec[] {
    const hr = this.hero;
    const c: Vec[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.floor(x, y) || this.unitAt(x, y) || cheb([x, y], [hr.x, hr.y]) > 2) continue;
      c.push([x, y]);
    }
    // 주인공 칸은 반드시 하나 포함 (비켜서야 한다)
    const out: Vec[] = [[hr.x, hr.y]];
    const rest = shuffle(c.filter(([x, y]) => x !== hr.x || y !== hr.y));
    return [...out, ...rest.slice(0, n - 1)];
  }

  private decide(u: BUnit, reserved: Set<string>): Intent {
    const d = MOBS[u.mob!];
    if (u.stun > 0) {
      u.stun--;
      return { t: 'idle', why: '경직' };
    }
    const tgt = this.nearestAlly([u.x, u.y]);
    if (!tgt) return { t: 'idle' };
    const P: Vec = [tgt.x, tgt.y];
    const distAny = (s: Vec) => Math.min(...this.liveAllies().map((a) => cheb(s, [a.x, a.y]) * 10 + manh(s, [a.x, a.y])));
    // 벽을 돌아가는 길까지 센 거리: 이 칸에서 몇 수 움직여야 아군을 칠 수 있나 (직선 거리만 보면 벽 뒤에서 멈춰 버린다)
    const steps = this.stepsToHit(u);
    const near = (s: Vec) => steps(s) * 1000 + distAny(s);
    switch (d.ai) {
      case 'turret': {
        // 룩 파수꾼: 상하좌우 3칸 줄을 쏜다 (벽이나 첫 말에서 멈춤)
        const sq: Vec[] = [];
        for (const [dx, dy] of ORTH) {
          for (let r = 1; r <= 3; r++) {
            const x = u.x + dx * r;
            const y = u.y + dy * r;
            if (!this.floor(x, y) || (this.unitAt(x, y) && this.unitAt(x, y) !== u)) break;
            sq.push([x, y]);
            if (this.allyAt(x, y)) break;
          }
        }
        return { t: 'attack', sq };
      }
      case 'static':
        return { t: 'attack', sq: KING.map(([dx, dy]) => [u.x + dx, u.y + dy] as Vec).filter(([x, y]) => this.floor(x, y)) };
      case 'pawn': {
        const dy = sign(P[1] - u.y) || 1;
        for (const dx of [-1, 1]) if (this.allyAt(u.x + dx, u.y + dy)) return { t: 'attack', sq: [[u.x + dx, u.y + dy]] };
        const f: Vec = [u.x, u.y + dy];
        if (this.free(f[0], f[1]) && !reserved.has(key(f[0], f[1]))) {
          reserved.add(key(f[0], f[1]));
          return { t: 'move', to: f };
        }
        return { t: 'idle' };
      }
      case 'charge': {
        for (const a of this.liveAllies()) {
          if ((u.x !== a.x && u.y !== a.y) || cheb([u.x, u.y], [a.x, a.y]) > 4) continue;
          const dir: Vec = [sign(a.x - u.x), sign(a.y - u.y)];
          const path: Vec[] = [];
          let x = u.x;
          let y = u.y;
          for (;;) {
            x += dir[0];
            y += dir[1];
            if (!this.floor(x, y) || this.unitAt(x, y)) break;
            path.push([x, y]);
            if (this.allyAt(x, y)) break;
          }
          if (path.length && eq(path[path.length - 1], [a.x, a.y])) return { t: 'charge', dir, path };
        }
        return this.decideMove(u, reserved, (s) => Math.min(Math.abs(s[0] - P[0]), Math.abs(s[1] - P[1])) * 10 + manh(s, P));
      }
      case 'queen': {
        // 퀸은 연속으로 공격하지 않고, 체크 라인이 터지는 턴에도 직접 공격하지 않는다
        const ht = this.hitTarget(u, [u.x, u.y]);
        const lineTurn = (this.bossTick + 1) % (this.phase === 1 ? 3 : 2) === 0;
        // 넘어진 다음 턴엔 바로 일어나 평소대로 움직인다 (사용자 결정: 한 턴 곁에 오는 것만)
        u.tripped = false;
        if (ht && !u.summoned && !lineTurn) {
          u.summoned = true;
          return { t: 'attack', sq: [[ht.x, ht.y]] };
        }
        // 공격한 다음 턴: 또 잘못 둔다 — 주인공 바로 곁 칸에 내려앉아 넘어진다 (체력 2배 규칙에서 붙어 칠 틈을 주려고)
        // 공격하지 않은 턴에도 가끔(10%) 잘못 놓아 넘어진다 — 체력 2배 규칙에서 퀸전이 너무 길어져서
        if (u.summoned || (!ht && Math.random() < 0.1)) {
          u.summoned = false;
          const hr = this.hero;
          const spots = genTargets(this.mobRules(u, 'move'), [u.x, u.y], this.gridFor(u)).moves.filter(([x, y]) => cheb([x, y], [hr.x, hr.y]) === 1 && this.free(x, y) && !reserved.has(key(x, y)) && !this.erase.some((e) => eq(e, [x, y])));
          if (spots.length) {
            const to = pick(spots);
            reserved.add(key(to[0], to[1]));
            u.tripped = true;
            return { t: 'move', to };
          }
        }
        return this.decideMove(u, reserved, (s) => (this.hitTarget(u, s) ? 0 : 10 + near(s)) + (eq(s, [u.x, u.y]) ? 5 : 0));
      }
      case 'boss': {
        // 보스는 공격한 다음 턴에 숨을 고른다 (그 틈이 반격 타이밍)
        const ht = this.hitTarget(u, [u.x, u.y]);
        if (ht && !u.summoned) {
          u.summoned = true;
          return { t: 'attack', sq: [[ht.x, ht.y]] };
        }
        if (u.summoned) {
          u.summoned = false;
          if (ht) return { t: 'idle', why: '숨 고르기' };
        }
        if (this.phase === 2 && this.enc.throne) {
          const T = this.enc.throne;
          if (eq([u.x, u.y], T)) return { t: 'idle', why: '옥좌' };
          return this.decideMove(u, reserved, (s) => cheb(s, T) * 10 + manh(s, T), true);
        }
        return this.decideMove(u, reserved, near);
      }
      default: {
        const ht = this.hitTarget(u, [u.x, u.y]);
        if (d.tags?.includes('breath') && ht) {
          // 쉬움: 공격·쉬기 번갈아 / 보통·어려움: 공격·공격·쉬기 (베타 피드백: 공격 사이클이 너무 쉽게 나옴)
          const cycle = DIFFS[G.diff].breath;
          u.breathN = ((u.breathN ?? 0) + 1) % cycle;
          if (u.breathN === 0) return { t: 'idle', why: '숨 고르기' };
        }
        if (ht) return { t: 'attack', sq: [[ht.x, ht.y]] };
        // 주인공의 행마를 일부 읽는다 (난이도별 확률): 칠 수 없는 칸에서 주인공 사정거리에 서는 것을 피하고,
        // 칠 수 있는 칸이 여럿이면 주인공이 되받아칠 수 없는 쪽을 고른다. 길 찾기 거리보다는 가볍게 (멈춰 서지 않게)
        const aware = Math.random() < DIFFS[G.diff].aware;
        return this.decideMove(u, reserved, (s) => (this.hitTarget(u, s) ? (aware && this.heroCanHit(u, s) ? 3 : 0) : 10 + near(s) + (aware && this.heroCanHit(u, s) ? 600 : 0)));
      }
    }
  }

  /**
   * 적 u가 칸 s에서 출발해 아군을 칠 수 있는 칸까지 최소 몇 번 움직여야 하나 (자기 행마로, 벽·구멍은 막힘, 다른 적은 비켜 준다고 본다).
   * 못 가면 99. 같은 판단 안에서는 결과를 기억해 둔다
   */
  private stepsToHit(u: BUnit): (s: Vec) => number {
    const ghost = MOBS[u.mob!].tags?.includes('ghost');
    const g: Grid = {
      w: this.w,
      h: this.h,
      passable: ghost ? (x, y) => this.inb(x, y) && this.tiles[y][x] !== 'void' : this.floor,
      occ: (x, y) => (this.allyAt(x, y) ? 'enemy' : null),
    };
    const mv = this.mobRules(u, 'move');
    const at = this.mobRules(u, 'attack');
    const canHit = (p: Vec) => genTargets(at, p, g).attacks.some(([x, y]) => this.allyAt(x, y));
    const memo = new Map<string, number>();
    return (s: Vec) => {
      const k0 = key(s[0], s[1]);
      const m = memo.get(k0);
      if (m !== undefined) return m;
      let res = 99;
      const seen = new Set([k0]);
      let front: Vec[] = [s];
      for (let d = 0; front.length && d < 30; d++) {
        if (front.some(canHit)) { res = d; break; }
        const next: Vec[] = [];
        for (const p of front) {
          for (const q of genTargets(mv, p, g).moves) {
            const k = key(q[0], q[1]);
            if (seen.has(k) || !this.floor(q[0], q[1]) && !ghost) continue;
            seen.add(k);
            next.push(q);
          }
        }
        front = next;
      }
      memo.set(k0, res);
      return res;
    };
  }

/** 적 u가 칸 s로 옮겼을 때 주인공(과 동료)이 바로 칠 수 있나 */
  private heroCanHit(u: BUnit, s: Vec): boolean {
    for (const a of this.liveAllies()) {
      const base = this.allyGrid(a);
      const g: Grid = { ...base, occ: (x, y) => (x === s[0] && y === s[1] ? 'enemy' : x === u.x && y === u.y ? null : base.occ(x, y)) };
      if (genTargets(this.rulesOf(a), [a.x, a.y], g).attacks.some((p) => eq(p, s))) return true;
    }
    return false;
  }

  private decideMove(u: BUnit, reserved: Set<string>, score: (s: Vec) => number, strict = false): Intent {
    const moves = genTargets(this.mobRules(u, 'move'), [u.x, u.y], this.gridFor(u)).moves.filter(([x, y]) => this.floor(x, y) && !reserved.has(key(x, y)) && !this.erase.some((e) => eq(e, [x, y])));
    let best: Vec | null = null;
    // 지형 읽기: 난이도의 '행마 읽기' 확률로, 점수가 거의 같으면 좋아하는 지형(수풀·고지)을 고른다
    const terr = Math.random() < DIFFS[G.diff].aware;
    const sc = (p: Vec) => score(p) - (terr ? this.terrainPref(u, p) : 0);
    let bs = sc([u.x, u.y]);
    for (const m of moves) {
      const s = sc(m);
      if (s < bs) {
        bs = s;
        best = m;
      }
    }
    if (!best && !strict && moves.length && Math.random() < 0.3) best = pick(moves);
    if (!best) return { t: 'idle' };
    reserved.add(key(best[0], best[1]));
    return { t: 'move', to: best };
  }

  /** 적 조합 시너지: 공격력 보너스와 그 이유 */
  synergy(u: BUnit, tgt?: BUnit): { bonus: number; why: string } {
    const live = this.enemies();
    if (u.mob === 'skeleton' && live.some((o) => o.mob === 'bonelord' && cheb([o.x, o.y], [u.x, u.y]) <= 2)) return { bonus: 1, why: '뼈의 명령' };
    if (u.mob === 'wolf' && live.some((o) => o !== u && o.mob === 'wolf' && cheb([o.x, o.y], [u.x, u.y]) <= 1)) return { bonus: 1, why: '무리 사냥' };
    if (u.mob === 'toad' && tgt?.rooted) return { bonus: 1, why: '묶인 먹잇감' };
    if (u.mob === 'annot' && live.some((o) => o.mob === 'author')) return { bonus: 1, why: '저자의 주석' };
    return { bonus: 0, why: '' };
  }

  private atkOf(u: BUnit, tgt?: BUnit) {
    const s = this.synergy(u, tgt);
    if (s.bonus) fx.text(u.x + 0.5, u.y - 0.3, s.why, '#ff9a7a');
    const hb = this.highBonus(u);
    if (hb) fx.text(u.x + 0.5, u.y - 0.15, '고지!', '#f0d27a');
    return u.atk + s.bonus + hb;
  }

  private async enemyPhase() {
    // 지난 턴에 준비한 반격 태세는 이번 아군 행동에서만 유효하다.
    for (const u of this.enemies()) if (u.retaliating) {
      u.retaliating = false;
      u.ent.glow = u.shiny ? 'rgba(255,214,90,0.55)' : undefined;
    }
    // 슬라임 옆의 골렘은 젤을 흡수해 체력을 1 회복한다 (골렘마다 한 번)
    for (const g of this.enemies().filter((o) => o.mob === 'golem' && !o.absorbed && o.hp < o.maxHp)) {
      if (this.enemies().some((s) => (s.mob === 'slime' || s.mob === 'slimelet') && cheb([s.x, s.y], [g.x, g.y]) <= 1)) {
        g.absorbed = true;
        g.hp++;
        g.ent.hp = g.hp;
        fx.text(g.x + 0.5, g.y - 0.2, '젤 흡수 +1', '#7ccf6b');
      }
    }
    for (const u of this.enemies().slice()) {
      if (u.hp <= 0 || this.hero.hp <= 0) continue;
      const it = u.intent;
      if (!it) continue;
      const tags = MOBS[u.mob!].tags ?? [];
      if (it.t === 'attack') {
        const targets = it.sq.map(([x, y]) => this.allyAt(x, y)).filter((a): a is BUnit => !!a);
        if (MOBS[u.mob!].ai === 'static' || MOBS[u.mob!].ai === 'turret') {
          await squash(u.ent);
          for (const a of targets) await this.hitAlly(a, this.atkOf(u, a), u);
        } else {
          const tgt = targets[0];
          if (it.hidden) fx.text(u.x + 0.5, u.y - 0.3, '기습!', '#ff5a4a', true);
          let hit = false;
          await lunge(u.ent, tgt ? [tgt.x, tgt.y] : it.sq[0], () => { hit = !!tgt; });
          if (hit && tgt) {
            await this.hitAlly(tgt, this.atkOf(u, tgt), u);
            if (tags.includes('root') && tgt.hp > 0) {
              tgt.rootNext = true;
              fx.text(tgt.x + 0.5, tgt.y - 0.3, '묶임!', '#dfe4ea');
            }
          } else {
            fx.text(it.sq[0][0] + 0.5, it.sq[0][1] + 0.3, '빗나감', '#ccc');
            // 빗나간 적은 킹처럼 한 칸 따라붙는다 (예고를 피해 치고 빠지는 카이팅 억제). 쉬움은 그대로.
            // 보스도 따라붙는다 (베타 제보: 밀짚왕만 안 따라붙어 이상하다 + '피해를 안 받는 사이클'이 너무 쉽다)
            if (DIFFS[G.diff].chase) await this.chaseAfterMiss(u);
          }
        }
      } else if (it.t === 'move') {
        const [x, y] = it.to;
        if (this.free(x, y)) {
          const from: Vec = [u.x, u.y];
          await moveEnt(u.ent, [x, y]);
          u.x = x;
          u.y = y;
          await this.trapCheck(u);
          // 눈사람 폰: 판 끝(아래 줄)에 닿으면 서리 비숍으로 승급
          if (u.mob === 'snowpawn' && u.hp > 0 && u.y === this.h - 1) await this.promoteEnemy(u, 'frostbishop');
          this.leaveTrail(u, from);
          if (u.tripped) { fx.text(u.x + 0.5, u.y - 0.3, '잘못 놓아 넘어졌다!', '#d9b8ff', true); fx.shake(3); }
          // 재빠른 몹은 가끔 한 번 더 움직인다 (일반 몹만, 다가가기만 하고 바로 치지는 않는다)
          await this.extraStep(u);
        }
      } else if (it.t === 'charge') {
        let x = u.x;
        let y = u.y;
        let tgt: BUnit | null = null;
        for (;;) {
          const nx = x + it.dir[0];
          const ny = y + it.dir[1];
          if (!this.floor(nx, ny)) break;
          const a = this.allyAt(nx, ny);
          if (a) { tgt = a; break; }
          if (this.unitAt(nx, ny)) break;
          x = nx;
          y = ny;
        }
        if (x !== u.x || y !== u.y) {
          await moveEnt(u.ent, [x, y]);
          u.x = x;
          u.y = y;
          fx.shake(3);
        }
        if (tgt) {
          await lunge(u.ent, [tgt.x, tgt.y], () => {});
          await this.hitAlly(tgt, this.atkOf(u, tgt), u);
        }
        u.stun = 1;
        await this.trapCheck(u);
      }
    }
    await this.bossEvents();
  }

  /** 세 턴 동안 건드리지 않은 일반 적은 다음 아군 차례 한 번 동안 반격 태세가 된다 (발동 확률은 난이도). */
  private armRetaliations() {
    const chance = DIFFS[G.diff].retaliate;
    if (!chance || this.enc.boss || this.enc.hold || this.enc.guest || this.enc.daily) return;
    for (const u of this.enemies()) {
      const ai = MOBS[u.mob!].ai;
      if (ai !== 'basic' && ai !== 'charge') continue;
      if (u.hitThisTurn) {
        u.hitThisTurn = false;
        u.unhitTurns = 0;
        continue;
      }
      u.unhitTurns = (u.unhitTurns ?? 0) + 1;
      if (u.unhitTurns < 3) continue;
      u.unhitTurns = 0;
      u.retaliating = true;
      u.ent.glow = 'rgba(255,174,92,0.7)';
      fx.text(u.x + 0.5, u.y - 0.25, `반격 태세 ${Math.round(chance * 100)}%`, '#ffbf7a', false, 2400, 0.17);
    }
  }

  private async bossEvents() {
    const b = this.boss();
    if (!b) return;
    this.bossTick++;
    if (b.mob === 'strawking') await this.strawEvents(b);
    else if (b.mob === 'frozenking') await this.kingEvents(b);
    else if (b.mob === 'author') await this.authorEvents(b);
    else await this.queenEvents(b);
  }

  private async kingEvents(b: BUnit) {
    // 서리 폭풍: 예고된 칸이 얼음이 되고, 그 위의 아군은 1 피해
    for (const [x, y] of this.frost) {
      fx.burst(x + 0.5, y + 0.5, '#dff2ff', 10, { speed: 1.5, life: 600 });
      if (this.tiles[y][x] === 'floor') this.tiles[y][x] = 'ice';
      const a = this.allyAt(x, y);
      if (a) await this.hitAlly(a, 1, null, true, '서리 폭풍');
    }
    if (this.frost.length) fx.shake(3);
    this.frost = [];
    // 2단계: 4턴마다 룩 파수꾼을 세운다 (동시에 둘까지)
    if (this.phase === 2 && this.bossTick % 4 === 0 && this.enemies().filter((u) => u.mob === 'tower').length < 2) await this.summonNear(b, 'tower');
  }

  private async authorEvents(b: BUnit) {
    // 필기: 줄 위의 모든 말이 2 피해 (퀸의 체크 라인과 같은 방식)
    for (const line of this.lines) {
      for (const [x, y] of line) fx.burst(x + 0.5, y + 0.5, '#2a2a3a', 4, { speed: 1, life: 400 });
      fx.shake(5);
      for (const [x, y] of line) {
        const a = this.allyAt(x, y);
        if (a) await this.hitAlly(a, 2, null, true, '저자의 필기');
        const u = this.unitAt(x, y);
        if (u && u !== b && u.hp > 0 && this.dmgEnemy(u, 2)) await this.kill(u, false, 'line');
      }
    }
    this.lines = [];
    // 지우개: 가장자리 칸이 사라진다
    for (const [x, y] of this.erase) {
      this.tiles[y][x] = 'void';
      fx.burst(x + 0.5, y + 0.5, '#f4f1ea', 10, { speed: 1.5 });
      const u = this.unitAt(x, y);
      if (u && !(this.enc.hold && u.mob === 'author')) await this.kill(u, true);
      const a = this.allyAt(x, y);
      if (a) {
        await this.hitAlly(a, 1, null, true, '지우개');
        const spot = this.nearFree([x, y]);
        if (spot) {
          await moveEnt(a.ent, spot);
          a.x = spot[0];
          a.y = spot[1];
        }
      }
    }
    this.erase = [];
    // 주석을 부른다 (동시에 둘까지)
    if (this.bossTick % 3 === 0 && this.enemies().filter((u) => u.mob === 'annot').length < 2) await this.summonNear(b, 'annot');
  }

  private async strawEvents(b: BUnit) {
    for (const [x, y] of this.erase) {
      this.tiles[y][x] = 'void';
      fx.burst(x + 0.5, y + 0.5, '#ff9a3a', 10, { speed: 1.5, grav: -0.2, life: 700 });
      fx.burst(x + 0.5, y + 0.5, '#2a1a0a', 6, { shape: 'chip', speed: 1 });
      const u = this.unitAt(x, y);
      if (u) await this.kill(u, true);
      const a = this.allyAt(x, y);
      if (a) {
        if (a.ally === 'hero' && ((this.lo.traits.sticky ?? 0) >= 2 || this.stickyLeft > 0)) {
          if ((this.lo.traits.sticky ?? 0) < 2) this.stickyLeft--;
          fx.text(x + 0.5, y, '점착!', '#bdf0b0');
        } else await this.hitAlly(a, 1, null, true, '지워지는 칸');
        const spot = this.nearFree([x, y]);
        if (spot) {
          await moveEnt(a.ent, spot);
          a.x = spot[0];
          a.y = spot[1];
        }
      }
    }
    if (this.erase.length) fx.shake(3);
    this.erase = [];
    // 2단계: 옆에 붙은 밀짚 폰을 흡수해 체력 2 회복 (2턴에 한 번) — 폰부터 치워야 한다
    if (this.phase === 2 && this.bossTick % 2 === 0 && b.hp < b.maxHp && this.absorbs < 3) {
      const p = this.enemies().find((u) => u.mob === 'strawpawn' && cheb([u.x, u.y], [b.x, b.y]) <= 1);
      if (p) {
        this.absorbs++;
        await this.kill(p, true);
        b.hp = Math.min(b.maxHp, b.hp + 2);
        b.ent.hp = b.hp;
        fx.text(b.x + 0.5, b.y - 0.3, '밀짚 흡수 +2', '#e8c35a', true);
      }
    }
    const sInt = this.phase === 1 ? 4 : 3;
    if (this.bossTick % sInt === 0) await this.summonNear(b, 'strawpawn');
  }

  private async queenEvents(b: BUnit) {
    // 체크 라인 발사: 줄 위의 모든 말(적 포함)이 2 피해
    for (const line of this.lines) {
      for (const [x, y] of line) fx.burst(x + 0.5, y + 0.5, '#b98cf0', 4, { speed: 1, life: 400 });
      fx.shake(5);
      for (const [x, y] of line) {
        const a = this.allyAt(x, y);
        if (a) await this.hitAlly(a, 2, null, true, '체크 라인');
        const u = this.unitAt(x, y);
        if (u && u !== b && u.hp > 0) {
          if (this.dmgEnemy(u, 2)) {
            emit('lineKill', u.mob);
            await this.kill(u, false, 'line');
          }
        }
      }
    }
    this.lines = [];
    if (this.phase === 2) {
      if (this.bossTick % 4 === 0) {
        const hr = this.hero;
        const spots: Vec[] = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.free(x, y) && cheb([x, y], [hr.x, hr.y]) >= 3) spots.push([x, y]);
        const planned = this.warpTo && this.free(this.warpTo[0], this.warpTo[1]) ? this.warpTo : null;
        if (planned || spots.length) {
          const s = planned ?? pick(spots);
          fx.burst(b.x + 0.5, b.y + 0.5, '#b9a0e0', 12, { speed: 2 });
          await fx.tween(150, (p) => { b.ent.alpha = 1 - p; });
          b.x = s[0]; b.y = s[1]; b.ent.x = s[0]; b.ent.y = s[1];
          await fx.tween(150, (p) => { b.ent.alpha = p; });
          fx.text(s[0] + 0.5, s[1], '무르기!', '#d8c0ff');
        }
      }
      // 메아리는 동시에 둘까지만
      if (this.bossTick % 4 === 0 && this.enemies().filter((u) => u.mob === 'echo').length < 2) await this.summonNear(b, 'echo');
    }
  }

  /** 보스가 주인공에게서 먼 빈칸으로 물러난다 */
  private async blinkAway(b: BUnit) {
    const hr = this.hero;
    const spots: Vec[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.free(x, y) && cheb([x, y], [hr.x, hr.y]) >= 3) spots.push([x, y]);
    if (!spots.length) return;
    const s = pick(spots);
    fx.burst(b.x + 0.5, b.y + 0.5, MOBS[b.mob!].color, 12, { speed: 2 });
    await fx.tween(150, (p) => { b.ent.alpha = 1 - p; });
    b.x = s[0]; b.y = s[1]; b.ent.x = s[0]; b.ent.y = s[1];
    await fx.tween(150, (p) => { b.ent.alpha = p; });
  }

  /** 적 승급: 같은 자리에서 다른 몹으로 바뀐다 */
  private async promoteEnemy(u: BUnit, to: MobId) {
    const d = MOBS[to];
    u.mob = to;
    u.hp = d.hp;
    u.maxHp = d.hp;
    u.atk = d.atk;
    u.ent.sprite = `m:${to}`;
    u.ent.hp = u.hp;
    u.ent.maxHp = u.maxHp;
    fx.text(u.x + 0.5, u.y - 0.2, '승급!', '#a8d8ef', true);
    fx.burst(u.x + 0.5, u.y + 0.5, d.color, 14, { speed: 2 });
    await squash(u.ent);
  }

  private async summonNear(b: BUnit, m: MobId) {
    const planned = this.summonAt.find(([x, y]) => this.free(x, y));
    const spots = KING.map(([dx, dy]) => [b.x + dx, b.y + dy] as Vec).filter(([x, y]) => this.free(x, y)).sort((a, c) => c[1] - a[1]);
    if (!planned && !spots.length) return;
    if (planned) this.summonAt = this.summonAt.filter((s) => s !== planned);
    const [x, y] = planned ?? spots[0];
    const p = this.addEnemy(m, x, y, 0);
    this.syncEnts();
    fx.text(x + 0.5, y, '소환', m === 'echo' ? '#d8c0ff' : '#ffd35a');
    fx.burst(x + 0.5, y + 0.5, MOBS[m].color, 10, { speed: 2 });
    await popIn(p.ent);
  }

  private pickLines(n: number, q: BUnit): Vec[][] {
    const hr = this.hero;
    const types = [[1, 0], [0, 1], [1, 1], [1, -1]] as Vec[];
    const chosen = types.sort(() => Math.random() - 0.5).slice(0, n);
    return chosen.map(([dx, dy]) => {
      const out: Vec[] = [];
      for (let k = -8; k <= 8; k++) {
        const x = hr.x + dx * k;
        const y = hr.y + dy * k;
        if (this.inb(x, y) && this.tiles[y][x] !== 'wall' && !(x === q.x && y === q.y)) out.push([x, y]);
      }
      return out;
    });
  }

  private pickErase(n: number): Vec[] {
    const cands: Vec[] = [];
    let floors = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.tiles[y][x] !== 'floor') continue;
        floors++;
        if (this.unitAt(x, y)) continue;
        const edge = ORTH.some(([dx, dy]) => !this.inb(x + dx, y + dy) || this.tiles[y + dy][x + dx] === 'void');
        if (edge) cands.push([x, y]);
      }
    }
    if (floors <= 18) return [];
    const out: Vec[] = [];
    for (let i = 0; i < n && cands.length; i++) out.push(cands.splice(Math.floor(Math.random() * cands.length), 1)[0]);
    return out;
  }

  private async hitAlly(a: BUnit, dmg: number, src: BUnit | null, env = false, why = '') {
    // 붙어서 맞으면 2배, 멀리서면 1배. 판 효과(줄·서리·지우개)는 그대로 1배 — 전투가 길어진 만큼 여러 번 맞으니 합은 예전과 비슷하다
    const meleeHit = !env && !!src && cheb([src.x, src.y], [a.x, a.y]) <= 1;
    dmg *= meleeHit ? 2 : 1;
    const ae = a.ent;
    const isHero = a.ally === 'hero';
    if (isHero && !env && this.dodge > 0) {
      this.dodge--;
      fx.text(a.x + 0.5, a.y, '회피!', '#bfe6ff');
      const x0 = ae.x;
      await fx.tween(160, (p) => { ae.x = x0 + Math.sin(Math.PI * p) * 0.25; }, easeOut);
      ae.x = x0;
      return;
    }
    // 방어 효과(방진·견고)는 한 번 맞을 때 겹쳐 쓰지 않는다: 최대 -1 (베타 제보: 다 합치면 아예 안 죽는다)
    let reduced = false;
    // 폰 병사의 방진
    const soldier = this.allies.find((x) => x.ally === 'soldier' && x.hp > 0);
    if (soldier && (a === soldier || isHero) && cheb([soldier.x, soldier.y], [this.hero.x, this.hero.y]) <= 1 && dmg > 0) {
      dmg--;
      reduced = true;
      fx.text(a.x + 0.5, a.y - 0.2, '방진', '#cfe0ff');
    }
    // 수풀: 멀리서 오는 공격은 막아 준다
    if (src && dmg > 0 && this.tileAt(a.x, a.y) === 'bush' && cheb([src.x, src.y], [a.x, a.y]) > 1) {
      dmg = 0;
      fx.text(a.x + 0.5, a.y - 0.25, '수풀에 숨음', '#9fd08a');
    }
    if (isHero && this.sturdy > 0 && dmg > 0 && !reduced) {
      dmg--;
      this.sturdy--;
      fx.text(a.x + 0.5, a.y - 0.2, '견고', '#d8e0c0');
    }
    if (dmg <= 0) {
      flash(ae, '#ffffff');
      return;
    }
    a.hp = Math.max(0, a.hp - dmg);
    ae.hp = a.hp;
    if (dmg > 0) sfx('hurt');
    hitFx(ae, dmg, undefined, meleeHit);
    if (isHero) {
      this.dmgTaken += dmg;
      // 패배 원인 기록
      const cause = why || (src ? `${MOBS[src.mob!].name}의 공격` : '알 수 없음');
      const rec = this.dmgLog.get(cause) ?? { hits: 0, dmg: 0 };
      rec.hits++;
      rec.dmg += dmg;
      this.dmgLog.set(cause, rec);
      if (a.hp <= 0 && G.piece === 'pawn' && !this.will) {
        this.will = true;
        this.willFired = true;
        a.hp = Math.min(a.maxHp, perk('will') ? 2 : 1);
        a.ent.hp = a.hp;
        if (!DIFFS[G.diff].willEachBattle) G.flags.will_used = true;
        fx.text(a.x + 0.5, a.y - 0.3, '용사의 의지!', '#ffe27a', true);
        fx.burst(a.x + 0.5, a.y + 0.5, '#ffe27a', 16, { speed: 3 });
        toast(DIFFS[G.diff].willEachBattle ? '용사의 의지로 버텼다! (전투마다 1번)' : '용사의 의지로 버텼다! (여관이나 모닥불에서 쉬면 다시 차올라요)', 'rare');
      }
      if (a.hp <= 0 && this.undying > 0) {
        this.undying--;
        a.hp = 1;
        fx.text(a.x + 0.5, a.y - 0.3, '불굴!', '#e8e2cf', true);
      }
      ae.hp = a.hp;
      G.hp = a.hp;
    } else if (a.hp <= 0) {
      fx.text(a.x + 0.5, a.y - 0.2, '기절', '#aaa');
      await fx.tween(250, (p) => { ae.alpha = 1 - p * 0.8; });
      ae.alpha = 0;
      toast(`${COMPANIONS[a.ally as CompanionId].name}이(가) 쓰러졌다. 전투가 끝나면 회복한다.`, 'bad');
      this.syncEnts();
    }
    if (isHero && this.counter > 0 && src && src.hp > 0 && cheb([src.x, src.y], [a.x, a.y]) <= 1) {
      this.counter--;
      fx.text(a.x + 0.5, a.y - 0.4, '반격', '#e0b070');
      if (this.dmgEnemy(src, 1)) await this.kill(src, false, 'counter');
      await this.checkPhase();
    }
    this.cb.refresh();
  }

  // ---------- 사이드 패널 ----------
  /** 판 바로 아래 행동 줄: 능력·축복·턴 넘기기·후퇴/포기 */
  renderActionBar(el: HTMLElement) {
    el.innerHTML = '';
    const lock = this.busy || this.over;
    this.lo.abilities.forEach((a, i) => {
      const d = ABILITIES[a.id];
      const on = this.mode?.t === 'ability' && this.mode.i === i;
      const b = h('button', { class: `act-btn ability ${on ? 'on' : ''}`, disabled: this.cds[i] > 0 || lock || this.cur.ally !== 'hero', title: d.desc(a.lv) },
        h('b', {}, `✨ ${d.name}`), h('small', {}, this.cds[i] > 0 ? `${this.cds[i]}턴 뒤` : on ? '칸을 고르세요' : `Lv${a.lv}`));
      b.addEventListener('click', () => this.selectAbility(i));
      el.append(b);
    });
    if (this.cur.ally === 'priest') {
      const hb = h('button', { class: `act-btn ability ${this.mode?.t === 'heal' ? 'on' : ''}`, disabled: lock || !this.healTargets().length, title: '인접한 아군 체력 +2' }, h('b', {}, '✚ 축복'), h('small', {}, '인접 아군 +2'));
      hb.addEventListener('click', () => this.selectHeal());
      el.append(hb);
    }
    if (this.hasGun) el.append(h('span', { class: `act-chip ${this.gunReload ? 'warn' : ''}` }, this.gunReload ? `🔫 재장전 ${this.gunReload}턴` : '🔫 장전됨 (적을 눌러 사격)'));
    if (!lock && this.stuck()) {
      const w = h('button', { class: 'act-btn', title: '움직일 칸도 칠 적도 없다. 이번 턴을 넘긴다.' }, h('b', {}, '⏭ 턴 넘기기'));
      w.addEventListener('click', () => this.pass());
      el.append(w);
    }
    el.append(h('span', { class: 'act-gap' }));
    if (this.enc.noFlee && !this.enc.guest) {
      const gu = h('button', { class: 'act-btn ghost', disabled: lock, title: '이 전투를 포기한다. 쓰러졌을 때와 같이 처리된다.' }, h('b', {}, '포기'));
      gu.addEventListener('click', () => { if (confirm('이 전투를 포기할까요? 쓰러졌을 때와 같이 가방 재료 일부를 잃고 거점에서 깨어나요.')) this.giveUp(); });
      el.append(gu);
    }
    if (!this.enc.noFlee) {
      const f = h('button', { class: 'act-btn ghost', disabled: lock, title: '전투에서 빠져나간다' }, h('b', {}, '후퇴'), DIFFS[G.diff].fleeCost ? h('small', {}, `HP -${DIFFS[G.diff].fleeCost}`) : null);
      f.addEventListener('click', () => this.flee());
      el.append(f);
    }
    if (!this.lo.abilities.length && !this.hasGun && this.cur.ally !== 'priest') el.prepend(h('span', { class: 'act-hint' }, '각인·유물을 만들면 여기에 능력이 생겨요'));
  }

  renderPanel(el: HTMLElement) {
    el.innerHTML = '';
    if (this.bossNote) el.append(h('div', { class: 'card boss-note' }, h('div', { class: 'sub' }, '보스 규칙'), h('p', {}, this.bossNote)));
    const L = this.clockLimit;
    if (L && this.turn > L - 6) el.append(h('div', { class: 'card clock-note' }, this.turn <= L ? `⏳ 초읽기까지 ${L - this.turn + 1}턴 — 길어지면 가까운 적부터 조금씩 강해진다` : `⏳ 초읽기 ${this.clockFury}단계 — 4턴마다 가까운 적 하나의 공격 +1`));
    const scholar = G.job === 'scholar';
    const mh = maxHp();
    const hr = this.hero;
    el.append(
      h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('b', {}, `⚔ ${this.enc.name}`), h('span', { class: 'muted' }, `${this.turn}턴`)),
        h('div', { class: 'hpbar' }, h('i', { style: { width: `${(hr.hp / mh) * 100}%` } }), h('span', {}, `HP ${hr.hp} / ${mh}`)),
        h('div', { class: 'chips' },
          this.sharp ? h('span', { class: 'chip' }, `날카로움 ${this.sharp}`) : null,
          this.dodge ? h('span', { class: 'chip' }, `회피 ${this.dodge}`) : null,
          this.sturdy ? h('span', { class: 'chip' }, `견고 ${this.sturdy}`) : null,
          this.bind ? h('span', { class: 'chip' }, `속박 ${this.bind}`) : null,
          this.undying ? h('span', { class: 'chip' }, '불굴') : null,
          this.hasGun ? h('span', { class: `chip ${this.gunReload ? 'warn' : 'gun'}` }, this.gunReload ? `총 재장전 ${this.gunReload}턴` : '총 장전됨') : null,
          this.counter ? h('span', { class: 'chip' }, `반격 ${this.counter}`) : null,
          G.piece === 'pawn' ? h('span', { class: `chip ${this.will ? 'off' : ''}`, title: this.will ? (DIFFS[G.diff].willEachBattle ? '이번 전투에서 이미 썼어요' : '여관이나 모닥불에서 쉬면 다시 차올라요') : '쓰러질 피해를 한 번 버텨요' }, this.will ? '용사의 의지 (소진)' : '용사의 의지') : null,
          hr.rooted ? h('span', { class: 'chip warn' }, '묶임: 이동 불가') : null,
        ),
      ),
    );
    if (this.allies.length > 1) {
      const box = h('div', { class: 'card' }, h('div', { class: 'sub' }, '이번 턴에 움직일 말 (말을 눌러도 바뀐다)'));
      this.allies.forEach((a, i) => {
        const name = a.ally === 'hero' ? PIECES[G.piece].name : COMPANIONS[a.ally as CompanionId].name;
        const b = h('button', { class: `btn ally-btn ${this.active === i ? 'on' : ''}`, disabled: a.hp <= 0 || this.busy || this.over },
          name, h('small', {}, a.hp > 0 ? ` HP ${a.hp}/${a.maxHp}` : ' 기절'), a.rooted ? h('small', {}, ' 묶임') : null);
        b.addEventListener('click', () => this.selectAlly(i));
        box.append(b);
      });
      if (this.cur.ally !== 'hero') box.append(h('p', { class: 'hint' }, COMPANIONS[this.cur.ally as CompanionId].passive));
      el.append(box);
    }
    const list = h('div', { class: 'card' }, h('div', { class: 'sub' }, '적'));
    for (const u of this.enemies()) {
      const d = MOBS[u.mob!];
      const it = u.intent;
      const itxt = !it ? '' : it.t === 'attack' ? (it.hidden ? '???' : it.blur ? '공격 예고 (어딘가 근처)' : '공격 예고') : it.t === 'charge' ? '돌진 예고!' : it.t === 'move' ? '이동' : it.why ?? '대기';
      list.append(h('div', { class: 'enemy-row' },
        h('span', { class: u.shiny ? 'shiny-name' : '' }, u.shiny ? `✨ 빛나는 ${d.name}` : d.name, this.shielded(u) ? ' 🛡' : '', u.revived ? ' (부활)' : ''),
        h('span', { class: 'muted' }, `HP ${u.hp}/${u.maxHp}`, this.synergy(u).bonus ? h('b', { class: 'syn' }, ` ${this.synergy(u).why} +1`) : ''),
        h('span', { class: `intent ${it?.t ?? ''}` }, u.retaliating ? `반격 태세 ${Math.round(DIFFS[G.diff].retaliate * 100)}%` : itxt),
        h('div', { class: 'small muted w100' }, scholar ? `공격 ${u.atk} · ${d.desc}` : d.desc, u.shiny ? ' 8방향 1칸으로도 움직이고 공격한다.' : ''),
      ));
    }
    if (this.lines.length) list.append(h('p', { class: 'hint warn-text' }, '보라색 줄 = 다음 적 턴에 체크 라인이 2 피해를 준다 (적도 맞는다).'));
    if (this.warpTo) list.append(h('p', { class: 'hint warn-text' }, '보라색 점선 = 다음 적 턴에 퀸이 수를 무를 자리. 그 칸을 피하자.'));
    if (this.summonAt.length) list.append(h('p', { class: 'hint warn-text' }, '금빛 점선 = 다음 적 턴에 새 적이 소환될 자리. 미리 길을 비우거나 막자.'));
    if (this.erase.length) list.append(h('p', { class: 'hint warn-text' }, '주황색 칸 = 다음 적 턴에 지워진다.'));
    if (this.frost.length) list.append(h('p', { class: 'hint warn-text' }, '푸른 눈송이 칸 = 다음 적 턴에 서리 폭풍 (1 피해, 얼음이 된다).'));
    const flat = this.tiles.flat();
    const terr = [flat.includes('bush') ? '수풀: 멀리서 오는 공격을 막아 줘요(적도 같아요)' : '', flat.includes('ice') ? '얼음: 밟으면 한 칸 더 미끄러져요' : '', flat.includes('high') ? '고지: 여기서 공격하면 피해 +1(적도 같아요)' : ''].filter(Boolean);
    if (this.enc.terrainName) list.append(h('p', { class: 'hint' }, `전장 지형 — ${this.enc.terrainName}: ${this.enc.terrainHint}`));
    if (terr.length) list.append(h('p', { class: 'hint' }, `지형 — ${terr.join(' · ')}`));
    el.append(list);
    el.append(h('p', { class: 'hint' }, this.mode ? '파란 칸을 누르면 능력을 써요. 다른 곳을 누르면 취소돼요.' : '점은 이동할 수 있는 칸, 붉은 테두리는 공격할 수 있는 적이에요. 붉게 깜빡이는 칸은 적이 다음에 공격할 자리예요.'));
  }
}
