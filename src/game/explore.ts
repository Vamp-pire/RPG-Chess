import { RECORD_NEED, recordBlocks, recordText } from './record';
import { KING, KNIGHT, ORTH, Vec, cheb, eq, key, pick, rand, shuffle } from '../core/geom';
import { Grid, MoveRule, Targets, genTargets } from '../core/rules';
import { G, hasJob, loadout, matHave } from '../core/state';
import { AREAS, AreaDef, AreaId, Exit, FixedMob, Mover, ObjDef, SIDE_NAME, Side, onSide, pickParty } from '../data/areas';
import { sfx } from '../core/sfx';
import { eventDef, rollEvent } from './events';
import { eggStep } from './eggs';
import { MobId } from '../data/mobs';
import { PIECES } from '../data/pieces';
import { Edge, Ent, Mark, Scene, mkEnt } from '../render/board';
import { moveEnt, popIn } from '../render/anim';
import { fx } from '../render/fx';
import { clearCoach, coachNow, dialog, toast } from '../ui/dom';

export const exitOpen = (ex: Exit | undefined, ignoreRecord = false): boolean => {
  if (!ex?.to) return false;
  if (ex.req === 'promoted') return G.promoted;
  if (ex.req === 'fogkey') return matHave('fogkey') > 0 || !!G.flags.fogOpen;
  if (ex.req === 'rook') return !!G.flags.rook_gone;
  if (ex.gate && !G.flags[ex.gate]) return false;
  if (ex.req === 'promoted2' && !G.promoted2) return false;
  if (ex.req === 'promoted3' && !G.flags.promoted3) return false;
  // 보스 지역: 그 지역 기록률이 모자라면 닫혀 있다
  if (!ignoreRecord && recordBlocks(ex.to)) return false;
  return true;
};

/** 닫힌 출구의 안내: 기록률 때문이면 기록률 안내 */
export const lockedMsg = (ex: Exit): string => {
  const r = !ex.gate || G.flags[ex.gate] ? recordBlocks(ex.to) : 0;
  if (r) {
    const { pct, detail } = recordText(r);
    return `이 너머는 아직 기보에 적히지 않았다. 이 지역을 더 기록해야 길이 보인다.\n지역 기록 ${pct}% / ${RECORD_NEED}% (${detail})\n몹 잡기 · 의뢰 끝내기 · 새 장비 얻기로 채워요.`;
  }
  return ex.locked ?? '갈 수 없다.';
};

export interface RMob {
  rid: string;
  fixed?: FixedMob;
  x: number;
  y: number;
  sprite: MobId;
  party?: MobId[];
  mover: Mover;
  ent: Ent;
  /** 눈토끼: 굴로 사라지기까지 남은 걸음 */
  life?: number;
}

export interface RObj {
  def: ObjDef;
  x: number;
  y: number;
  ent: Ent;
}

export interface ExploreHooks {
  objVisible(d: ObjDef): boolean;
  interact(o: RObj): void | Promise<void>;
  startBattle(m: RMob, ambush: boolean): void;
  askTravel(to: AreaId, side: Side, go: () => void): void;
  travel(to: AreaId, side: Side, from: Vec): void;
  locked(msg: string): void;
  refresh(): void;
  guide(): { pos: Vec; label: string; side?: Side } | null;
  badge(d: ObjDef): string;
}

let RID = 1;
const SIDES: Side[] = ['n', 'e', 's', 'w'];

/** 탐험 판에서 몹이 한 걸음마다 움직일 확률 (떠도는 몹·쫓는 몹 모두) */
const MOB_MOVE_CHANCE = 0.12;

export class Explore {
  area!: AreaDef;
  mobs: RMob[] = [];
  objs: RObj[] = [];
  walls = new Set<string>();
  water = new Set<string>();
  scene!: Scene;
  pEnt!: Ent;
  busy = false;
  targets: Targets = { moves: [], attacks: [] };

  constructor(private hooks: ExploreHooks) {}

  enter(id: AreaId) {
    fx.clear();
    this.busy = false; // 패배 후 마을로 돌아올 때 이동 잠금이 남지 않도록
    const a = AREAS[id];
    this.area = a;
    G.area = id;
    G.flags[`v_${id}`] = true;
    this.walls = new Set(a.walls.map(([x, y]) => key(x, y)));
    this.water = new Set((a.water ?? []).map(([x, y]) => key(x, y)));
    const PLATED = ['forge', 'shop', 'board', 'inn', 'record', 'puzzle', 'shrine'];
    const LABELED = [...PLATED, 'npc', 'bridgeRook', 'merchant'];
    this.objs = a.objs.filter((d) => this.hooks.objVisible(d)).map((d) => ({
      def: d,
      x: d.x,
      y: d.y,
      ent: mkEnt(d.id, d.sprite, d.x, d.y, { plate: PLATED.includes(d.kind), label: LABELED.includes(d.kind) ? d.label : undefined }),
    }));
    this.mobs = [];
    for (const f of a.mobs) {
      if (f.once && G.flags[f.once]) continue;
      if (f.req && !G.flags[f.req]) continue;
      // 이긴 고정 몹은 여관·모닥불에서 쉬기 전까지 다시 나오지 않는다
      if (G.flags[`cleared_${f.id}`]) continue;
      this.mobs.push({ rid: `m${RID++}`, fixed: f, x: f.x, y: f.y, sprite: f.sprite, mover: f.mover, ent: mkEnt(f.id, `m:${f.sprite}`, f.x, f.y, { bob: true, glow: f.req ? 'rgba(200,80,255,0.45)' : ['hound', 'strawking', 'bonelord', 'misqueen', 'blunder', 'giant', 'frozenking', 'double', 'author'].includes(f.sprite) ? 'rgba(220,60,40,0.35)' : undefined }) });
    }
    if (a.random) {
      const free: Vec[] = [];
      for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) {
        if (this.blockedTile(x, y) || this.objAt(x, y) || this.mobAt(x, y)) continue;
        if (cheb([x, y], G.pos) < 3) continue;
        free.push([x, y]);
      }
      const spots = shuffle(free);
      // 2지역부터 판 위의 몹도 하나 더
      const n = a.random.n + (a.region >= 2 ? 1 : 0);
      for (let i = 0; i < n && i < spots.length; i++) {
        const t = pick(a.random.table);
        const [x, y] = spots[i];
        this.mobs.push({ rid: `m${RID++}`, x, y, sprite: t.sprite, party: pickParty(t), mover: t.mover, ent: mkEnt(`r${RID}`, `m:${t.sprite}`, x, y, { bob: true }) });
      }
    }
    // 첫 전투를 빨리: 아직 한 번도 싸우지 않았으면 들판 입구 가까이에 혼자 있는 슬라임 하나 (첫 10분 다듬기)
    if (a.id === 'meadow' && G.battles === 0 && G.job && !this.mobs.some((m) => cheb([m.x, m.y], G.pos) <= 3)) {
      const near: Vec[] = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const d = cheb([x, y], G.pos);
        if (d >= 2 && d <= 3 && !this.blockedTile(x, y) && !this.objAt(x, y) && !this.mobAt(x, y)) near.push([x, y]);
      }
      if (near.length) {
        const [x, y] = pick(near);
        this.mobs.push({ rid: `m${RID++}`, x, y, sprite: 'slime', party: ['slime'], mover: 'none', ent: mkEnt(`r${RID}`, 'm:slime', x, y, { bob: true }) });
      }
    }
    // 눈토끼: 설원 탐험판에 아주 가끔 (잡기 아주 어렵다 — 사용자 결정)
    if ((a.id === 'tundra' || a.id === 'glacier') && Math.random() < 0.12) {
      const far: Vec[] = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (!this.blockedTile(x, y) && !this.objAt(x, y) && !this.mobAt(x, y) && cheb([x, y], G.pos) >= 4) far.push([x, y]);
      if (far.length) {
        const [x, y] = pick(far);
        this.mobs.push({ rid: `m${RID++}`, x, y, sprite: 'rabbit', mover: 'flee', life: 10, ent: mkEnt(`r${RID}`, 'm:rabbit', x, y, { bob: true, glow: 'rgba(255,255,255,0.5)' }) });
        fx.text(x + 0.5, y, '눈토끼다!', '#ffffff', true);
      }
    }
    // 떠도는 사건 칸 (야생 지역에 가끔)
    if (rollEvent()) {
      const free: Vec[] = [];
      for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) {
        if (this.blockedTile(x, y) || this.objAt(x, y) || this.mobAt(x, y) || cheb([x, y], G.pos) < 2) continue;
        free.push([x, y]);
      }
      if (free.length) {
        const [x, y] = pick(free);
        const d = eventDef(x, y);
        this.objs.push({ def: d, x, y, ent: mkEnt('evt', d.sprite, x, y) });
      }
    }
    this.pEnt = mkEnt('player', `p:${PIECES[G.piece].img}`, G.pos[0], G.pos[1]);
    this.scene = {
      w: 8,
      h: 8,
      biome: a.biome,
      tile: (x, y) => (this.walls.has(key(x, y)) ? 'wall' : this.water.has(key(x, y)) ? 'water' : 'floor'),
      ents: [],
      marks: [],
      arrows: [],
      edges: [],
    };
    this.refresh();
    popIn(this.pEnt);
  }

  /** 전투에서 돌아왔을 때 (같은 판 유지) */
  resume() {
    if (!this.pEnt) return;
    this.pEnt.x = G.pos[0];
    this.pEnt.y = G.pos[1];
    this.pEnt.alpha = 1;
    this.busy = false;
    this.refresh();
  }

  removeMob(m: RMob) {
    this.mobs = this.mobs.filter((x) => x !== m);
    if (this.scene) this.refresh();
  }

  removeObj(id: string) {
    this.objs = this.objs.filter((o) => o.def.id !== id);
    if (this.scene) this.refresh();
  }

  blockedTile = (x: number, y: number) => this.walls.has(key(x, y)) || this.water.has(key(x, y));
  objAt = (x: number, y: number) => this.objs.find((o) => o.x === x && o.y === y) ?? null;
  mobAt = (x: number, y: number) => this.mobs.find((m) => m.x === x && m.y === y) ?? null;

  /** 도착한 변에서 가장 가까운 빈 칸 */
  landing(side: Side, want: Vec): Vec {
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < 8 && y < 8 && !this.blockedTile(x, y) && !this.objAt(x, y) && !this.mobAt(x, y);
    const cells: Vec[] = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (free(x, y)) cells.push([x, y]);
    const depth = (p: Vec) => (side === 'n' ? p[1] : side === 's' ? 7 - p[1] : side === 'w' ? p[0] : 7 - p[0]);
    cells.sort((a, b) => depth(a) * 10 + cheb(a, want) - (depth(b) * 10 + cheb(b, want)));
    return cells[0] ?? want;
  }

  /** 탐험에서 몹을 칠 수 있는 행마: 이동 행마 + 장비의 공격 행마 */
  attackRules(): MoveRule[] {
    return [...this.moveRules(), ...loadout().rules.filter((r) => r.mode !== 'move')];
  }

  moveRules(): MoveRule[] {
    const rules = loadout().rules.filter((r) => r.mode !== 'attack').map((r) => ({ ...r, mode: 'both' as const }));
    rules.push({ kind: 'step', dirs: hasJob('wanderer') ? KING : ORTH, range: 1, mode: 'both' });
    return rules;
  }

  private grid(): Grid {
    return {
      w: 8,
      h: 8,
      passable: (x, y) => !this.blockedTile(x, y),
      occ: (x, y) => {
        if (this.mobAt(x, y)) return 'enemy';
        const o = this.objAt(x, y);
        if (o && !o.def.walk) return 'block';
        return null;
      },
    };
  }

  refresh() {
    // 이동은 이동 행마로, 공격은 무기 행마까지 포함해서 (탐험 중에도 무기 사거리 안의 몹을 바로 칠 수 있다)
    this.targets = this.busy ? { moves: [], attacks: [] } : { moves: genTargets(this.moveRules(), G.pos, this.grid()).moves, attacks: genTargets(this.attackRules(), G.pos, this.grid()).attacks };
    const marks: Mark[] = [];
    const edges: Edge[] = [];
    const gd = this.hooks.guide();
    for (const s of SIDES) {
      const ex = this.area.exits[s];
      if (!ex) continue;
      const open = exitOpen(ex);
      const label = open ? (G.flags[`v_${ex.to}`] ? AREAS[ex.to!].name : '???') : '막힘';
      edges.push({ side: s, open, label, hot: onSide(G.pos, s), goal: gd?.side === s });
    }
    this.scene.edges = edges;
    const arrows: Scene['arrows'] = [];
    if (gd && !(gd.pos[0] === G.pos[0] && gd.pos[1] === G.pos[1])) {
      marks.push({ x: gd.pos[0], y: gd.pos[1], kind: 'goal' });
      // 자동 이동이 실제로 갈 길을 한 걸음씩 화살표로 잇는다
      const path = this.busy ? null : this.guidePath(gd.pos);
      if (path && path.length) {
        // 자동 이동이 갈 길 전체를 하나의 화살표로 (끝은 목표 칸)
        const last = path[path.length - 1];
        const via = path.slice(0, -1);
        const end = eq(last, gd.pos) || this.objAt(gd.pos[0], gd.pos[1]) || this.mobAt(gd.pos[0], gd.pos[1]) ? gd.pos : last;
        if (!eq(end, last)) via.push(last);
        arrows.push({ from: G.pos, to: end, via, color: 'rgba(230,170,30,0.85)' });
      } else if (!path && cheb(gd.pos, G.pos) > 1) arrows.push({ from: G.pos, to: gd.pos, color: 'rgba(230,170,30,0.45)' });
    }
    this.scene.arrows = arrows;
    if (!this.busy) {
      for (const [x, y] of this.targets.moves) marks.push({ x, y, kind: 'move' });
      for (const [x, y] of this.targets.attacks) marks.push({ x, y, kind: 'attack' });
      for (const o of this.objs) if (!o.def.walk && cheb([o.x, o.y], G.pos) === 1) marks.push({ x: o.x, y: o.y, kind: 'talk' });
      // 첫 안내: 실제로 누를 칸을 손가락으로 짚는다
      const cn = coachNow();
      if (cn === 'move') {
        const t = (gd ? this.guidePath(gd.pos)?.[0] : null) ?? this.targets.moves[0];
        if (t) marks.push({ x: t[0], y: t[1], kind: 'tap' });
      } else if (cn === 'edge') marks.push({ x: G.pos[0], y: G.pos[1], kind: 'tap' });
    }
    this.scene.marks = marks;
    // 퀘스트를 줄 수 있으면 !, 보고할 수 있으면 ?
    for (const o of this.objs) o.ent.badge = this.hooks.badge(o.def) || undefined;
    this.scene.ents = [...this.objs.map((o) => o.ent), ...this.mobs.map((m) => m.ent), this.pEnt];
    this.hooks.refresh();
  }

  /** 판 밖을 눌렀을 때: 가장자리에 서 있으면 지역 이동 확인 */
  private tryLeave(x: number, y: number) {
    this.leave(y < 0 ? 'n' : y > 7 ? 's' : x < 0 ? 'w' : 'e');
  }

  private leave(side: Side) {
    const ex = this.area.exits[side];
    if (!ex) {
      toast(`${SIDE_NAME[side]}으로는 길이 없다.`, 'info');
      return;
    }
    if (!onSide(G.pos, side)) {
      toast(`${SIDE_NAME[side]} 가장자리 칸까지 가야 나갈 수 있다.`, 'info');
      return;
    }
    if (!exitOpen(ex)) {
      this.hooks.locked(lockedMsg(ex));
      return;
    }
    this.hooks.askTravel(ex.to!, side, async () => {
      this.busy = true;
      const d: Vec = side === 'n' ? [0, -0.6] : side === 's' ? [0, 0.6] : side === 'w' ? [-0.6, 0] : [0.6, 0];
      const x0 = this.pEnt.x;
      const y0 = this.pEnt.y;
      await fx.tween(220, (p) => { this.pEnt.x = x0 + d[0] * p; this.pEnt.y = y0 + d[1] * p; this.pEnt.alpha = 1 - p; });
      this.busy = false;
      clearCoach('edge', 'drop');
      this.hooks.travel(ex.to!, side, [...G.pos] as Vec);
    });
  }

  async click(x: number, y: number) {
    if (this.busy) return;
    if (x < 0 || y < 0 || x > 7 || y > 7) {
      this.tryLeave(x, y);
      return;
    }
    const o = this.objAt(x, y);
    // 가장자리 칸에 선 채로 내 칸을 한 번 더 누르면 나가기 (손가락으로 판 바깥을 누르기 어려울 때)
    if (!o && eq([x, y], G.pos)) {
      const sides = (['n', 's', 'w', 'e'] as Side[]).filter((s) => onSide(G.pos, s) && this.area.exits[s]);
      if (sides.length === 1) this.leave(sides[0]);
      else if (sides.length > 1) dialog('어느 쪽으로?', '모서리 칸이라 두 방향으로 나갈 수 있어요.', [...sides.map((s) => ({ label: SIDE_NAME[s], onPick: () => this.leave(s) })), { label: '머문다', onPick: () => {} }]);
      return;
    }
    // 서 있는 시설을 다시 누르면 다시 연다
    if (o && o.def.walk && eq([x, y], G.pos)) {
      await this.hooks.interact(o);
      return;
    }
    if (o && !o.def.walk) {
      if (cheb([x, y], G.pos) === 1) await this.hooks.interact(o);
      else if (!(await this.autoWalk([x, y], true))) fx.text(x + 0.5, y + 0.2, '가까이 가자', '#fff');
      return;
    }
    const m = this.mobAt(x, y);
    if (m && !this.targets.attacks.some((t) => eq(t, [x, y]))) {
      // 먼 몹을 누르면 칠 수 있는 자리까지 걸어간다
      await this.autoWalk([x, y], false, (p) => genTargets(this.attackRules(), p, this.grid()).attacks.some((t) => eq(t, [x, y])));
      return;
    }
    if (m && this.targets.attacks.some((t) => eq(t, [x, y]))) {
      this.busy = true;
      this.refresh();
      await moveEnt(this.pEnt, [x - Math.sign(x - G.pos[0]) * 0.4, y - Math.sign(y - G.pos[1]) * 0.4]);
      this.pEnt.x = G.pos[0];
      this.pEnt.y = G.pos[1];
      this.hooks.startBattle(m, hasJob('assassin') && m.mover === 'none');
      return;
    }
    if (!this.targets.moves.some((t) => eq(t, [x, y]))) {
      await this.autoWalk([x, y], false);
      return;
    }
    this.busy = true;
    this.refresh();
    const res = await this.step([x, y]);
    this.busy = false;
    if (res === 'battle') return;
    this.refresh();
  }

  /** 한 걸음: 이동 → 밟은 오브젝트 → 몹 움직임. 전투가 시작되면 'battle' */
  private async step(to: Vec): Promise<'ok' | 'battle' | 'stop'> {
    sfx('step');
    await moveEnt(this.pEnt, to);
    const from: Vec = [G.pos[0], G.pos[1]];
    G.pos = [to[0], to[1]];
    eggStep(G.area, from, to);
    clearCoach('move');
    const wo = this.objAt(to[0], to[1]);
    if (wo && wo.def.walk) {
      await this.hooks.interact(wo);
      return 'stop';
    }
    const hit = await this.mobsTurn();
    if (hit) {
      // 잠금은 풀지 않는다: 전투로 넘어가는 동안 NPC에게 말을 걸면 대화가 전투 화면 위에 남았다 (베타 제보). 돌아오면 resume이 푼다
      this.hooks.startBattle(hit, false);
      return 'battle';
    }
    return 'ok';
  }

  /** 먼 칸을 누르면 여러 걸음 자동 이동. 몹이 가까워지면 멈춘다. adjacentTo면 그 칸 옆까지 */
  private async autoWalk(target: Vec, adjacentTo: boolean, goal?: (p: Vec) => boolean): Promise<boolean> {
    const path = this.findPath(target, adjacentTo, goal);
    if (!path) return false;
    this.busy = true;
    this.refresh();
    // 몹은 내가 한 걸음 갈 때마다 움직이므로 처음 길이 막힐 수 있다 (베타 제보: 미끄러지는 걸음이 몹 칸에 내려 겹침).
    // 매 걸음 전에 그 걸음이 아직 가능한지 보고, 막혔으면 그 자리에서 길을 다시 찾는다
    let plan = path;
    for (let n = 0; plan.length && n < path.length + 8; n++) {
      let s = plan[0];
      if (!genTargets(this.moveRules(), G.pos, this.grid()).moves.some((t) => eq(t, s))) {
        const again = this.findPath(target, adjacentTo, goal);
        if (!again || !again.length) break;
        plan = again;
        s = plan[0];
      }
      plan = plan.slice(1);
      const r = await this.step(s);
      if (r === 'battle') return true;
      if (r === 'stop') break;
      const near = this.mobs.find((mm) => cheb([mm.x, mm.y], G.pos) <= 1);
      if (near && plan.length) {
        fx.text(G.pos[0] + 0.5, G.pos[1] - 0.2, '멈춤!', '#ffd35a');
        // 처음 몇 번은 왜 멈췄는지 알려 준다
        const n = Number(G.flags.stopTold ?? 0);
        if (n < 3) { G.flags.stopTold = n + 1; toast('몹 바로 옆이라 멈췄어요. 붉은 점선 칸은 몹 곁이에요. 몹이 내 칸으로 오거나 내가 몹을 누르면 싸움이 시작돼요.', 'info'); }
        break;
      }
    }
    this.busy = false;
    this.refresh();
    return true;
  }

  /**
   * 최적 경로 (다익스트라). 비용 = ① 걸음 수(몹은 내가 한 걸음 할 때마다 움직이므로 가장 중요)
   * ② 몹 바로 옆 칸에 내려서는 횟수(자동 이동이 거기서 멈춘다) ③ 실제로 미끄러진 칸 수(같으면 덜 걷는 자연스러운 길).
   * 걸음 수 제한 없음. 목표에 못 닿으면 fallback일 때 목표에 가장 가까이 갈 수 있는 칸까지의 길을 준다.
   */
  findPath(target: Vec, adjacentTo: boolean, goal?: (p: Vec) => boolean, fallback = true): Vec[] | null {
    const rules = this.moveRules();
    const g = this.grid();
    const done = goal ?? ((p: Vec) => (adjacentTo ? cheb(p, target) === 1 : eq(p, target)));
    const targetMob = this.mobAt(target[0], target[1]);
    const nearMob = (p: Vec) => this.mobs.some((m) => m !== targetMob && cheb([m.x, m.y], p) <= 1);
    const cost = new Map<string, number>([[key(G.pos[0], G.pos[1]), 0]]);
    const prev = new Map<string, Vec | null>([[key(G.pos[0], G.pos[1]), null]]);
    const closed = new Set<string>();
    const open: Vec[] = [G.pos];
    let best: Vec | null = null;
    while (open.length) {
      // 가장 싼 칸을 꺼낸다 (칸이 64개뿐이라 단순 선형 탐색으로 충분)
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (cost.get(key(open[i][0], open[i][1]))! < cost.get(key(open[bi][0], open[bi][1]))!) bi = i;
      const p = open.splice(bi, 1)[0];
      const pk = key(p[0], p[1]);
      if (closed.has(pk)) continue;
      closed.add(pk);
      if (!eq(p, G.pos) && done(p)) { best = p; break; }
      for (const q of genTargets(rules, p, g).moves) {
        const k = key(q[0], q[1]);
        if (closed.has(k)) continue;
        // 도중에 밟으면 발동하는 오브젝트는 목적지일 때만 지나간다
        const wo = this.objAt(q[0], q[1]);
        if (wo && !eq(q, target)) continue;
        const c = cost.get(pk)! + 1000 + (nearMob(q) && !done(q) ? 120 : 0) + cheb(p, q);
        if (c < (cost.get(k) ?? Infinity)) {
          cost.set(k, c);
          prev.set(k, p);
          open.push(q);
        }
      }
    }
    // 못 닿으면: 목표와 가장 가까운(체비셰프 거리) 도달 칸, 같으면 더 싼 칸
    if (!best && fallback) {
      let bd = cheb(G.pos, target);
      for (const k of closed) {
        const [x, y] = k.split(',').map(Number) as Vec;
        const d = cheb([x, y], target);
        if (d < bd || (best && d === bd && cost.get(k)! < cost.get(key(best[0], best[1]))!)) { bd = d; best = [x, y]; }
      }
    }
    if (!best || eq(best, G.pos)) return null;
    const path: Vec[] = [];
    let c: Vec | null = best;
    while (c && !eq(c, G.pos)) {
      path.unshift(c);
      c = prev.get(key(c[0], c[1])) ?? null;
    }
    return path;
  }

  /** 안내 목표까지 실제 자동 이동과 같은 규칙으로 계산한 길 (화살표용) */
  guidePath(pos: Vec): Vec[] | null {
    const o = this.objAt(pos[0], pos[1]);
    if (o && !o.def.walk) return cheb(pos, G.pos) === 1 ? [] : this.findPath(pos, true);
    if (this.mobAt(pos[0], pos[1])) {
      if (genTargets(this.attackRules(), G.pos, this.grid()).attacks.some((t) => eq(t, pos))) return [];
      return this.findPath(pos, false, (p) => genTargets(this.attackRules(), p, this.grid()).attacks.some((t) => eq(t, pos)));
    }
    return this.findPath(pos, false);
  }

  /** 마우스를 올린 칸까지의 자동 이동 미리 보기 (누르면 실제로 이 길로 간다) */
  previewPath(cell: Vec): { from: Vec; path: Vec[]; label: string; warn?: boolean } | null {
    if (this.busy || eq(cell, G.pos)) return null;
    if (this.targets.moves.some((t) => eq(t, cell))) return { from: G.pos, path: [cell], label: '1걸음' };
    if (this.targets.attacks.some((t) => eq(t, cell))) return null;
    const path = this.guidePath(cell);
    if (!path || !path.length) return null;
    const last = path[path.length - 1];
    const o = this.objAt(cell[0], cell[1]);
    const reached = this.mobAt(cell[0], cell[1]) ? genTargets(this.attackRules(), last, this.grid()).attacks.some((t) => eq(t, cell)) : o && !o.def.walk ? cheb(last, cell) === 1 : eq(last, cell);
    // 도착 전에 몹 옆에 서면 자동 이동이 거기서 멈춘다
    const warn = path.slice(0, -1).some((p) => this.mobs.some((m) => cheb([m.x, m.y], p) <= 1));
    const label = `${reached ? '' : '가까이 '}${path.length}걸음${warn ? ' · 몹 옆에서 멈출 수 있음' : ''}`;
    return { from: G.pos, path, label, warn };
  }

  /** 여러 후보 칸 중 실제로 가장 빨리 닿는 칸 (가장자리 출구 고르기용) */
  nearestByPath(cells: Vec[]): Vec | null {
    let best: Vec | null = null;
    let bl = Infinity;
    for (const c of cells) {
      if (eq(c, G.pos)) return c;
      const p = this.findPath(c, false, undefined, false);
      const l = p ? p.length * 100 + p.reduce((s, q, i) => s + cheb(i ? p[i - 1] : G.pos, q), 0) : Infinity;
      if (l < bl) { bl = l; best = c; }
    }
    return best ?? cells[0] ?? null;
  }

  /** 플레이어가 움직일 때만 움직이는 몹들. 플레이어에게 닿은 몹을 돌려준다 */
  private async mobsTurn(): Promise<RMob | null> {
    const P = G.pos;
    const anims: Promise<void>[] = [];
    let hit: RMob | null = null;
    const blocked = (x: number, y: number) => x < 0 || y < 0 || x > 7 || y > 7 || this.blockedTile(x, y) || !!this.objAt(x, y) || !!this.mobAt(x, y);
    for (const m of this.mobs.slice()) {
      // 눈토끼: 늘 움직인다. 한두 칸 뛰어 주인공에게서 가장 먼 칸으로, 걸음이 다하면 굴로 사라진다
      if (m.mover === 'flee') {
        m.life = (m.life ?? 10) - 1;
        if (m.life <= 0) {
          fx.text(m.x + 0.5, m.y, '굴로 사라졌다', '#e8eef8');
          this.mobs = this.mobs.filter((x) => x !== m);
          continue;
        }
        const jumps: Vec[] = [...KING, [0, -2], [2, 0], [0, 2], [-2, 0], [2, -2], [2, 2], [-2, 2], [-2, -2]];
        const opts = jumps.map(([dx, dy]) => [m.x + dx, m.y + dy] as Vec).filter(([x, y]) => !blocked(x, y) && !eq([x, y], P));
        const far = (p: Vec) => cheb(p, P) * 10 + Math.abs(p[0] - P[0]) + Math.abs(p[1] - P[1]);
        opts.sort((a, b) => far(b) - far(a));
        if (opts.length && far(opts[0]) >= far([m.x, m.y])) {
          m.x = opts[0][0];
          m.y = opts[0][1];
          anims.push(moveEnt(m.ent, opts[0]));
        }
        continue;
      }
      let to: Vec | null = null;
      // 탐험 판의 몹은 아주 가끔만 움직인다 (판이 덜 어수선하게)
      if (Math.random() >= MOB_MOVE_CHANCE) continue;
      if (m.mover === 'wander') {
        const opts = ORTH.map(([dx, dy]) => [m.x + dx, m.y + dy] as Vec).filter(([x, y]) => eq([x, y], P) || !blocked(x, y));
        if (opts.length) to = pick(opts);
      } else if (m.mover === 'chase' && cheb([m.x, m.y], P) <= 4) {
        const opts = KING.map(([dx, dy]) => [m.x + dx, m.y + dy] as Vec).filter(([x, y]) => eq([x, y], P) || !blocked(x, y));
        opts.sort((a, b) => cheb(a, P) - cheb(b, P));
        if (opts.length && cheb(opts[0], P) < cheb([m.x, m.y], P)) to = opts[0];
      }
      if (!to) continue;
      if (eq(to, P)) {
        if (!hit) {
          hit = m;
          fx.text(m.x + 0.5, m.y, '!', '#ff5a4a', true);
        }
        continue;
      }
      m.x = to[0];
      m.y = to[1];
      anims.push(moveEnt(m.ent, to));
    }
    // 떠돌이 상인: L자로 뛴다
    const merch = this.objs.find((o) => o.def.kind === 'merchant');
    if (merch) {
      const opts = KNIGHT.map(([dx, dy]) => [merch.x + dx, merch.y + dy] as Vec).filter(([x, y]) => !blocked(x, y) && !eq([x, y], P));
      if (opts.length && rand(3) > 0) {
        const t = pick(opts);
        merch.x = t[0];
        merch.y = t[1];
        anims.push(moveEnt(merch.ent, t));
      }
    }
    await Promise.all(anims);
    return hit;
  }
}
