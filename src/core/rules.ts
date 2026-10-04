// 행마(움직임) 규칙: 모든 이동·공격 패턴은 이 조각들의 합이다.
import { DIAG, JUMP2, KING, KNIGHT, ORTH, RING2, RING3, Vec, key, sameSet } from './geom';

export type RuleKind = 'step' | 'slide' | 'leap';
export type RuleMode = 'move' | 'attack' | 'both';

export interface MoveRule {
  kind: RuleKind;
  dirs: Vec[];
  range: number;
  mode: RuleMode;
  pierce?: boolean;
  /** 히든 무기 총: 쏜 뒤 재장전이 필요하다 */
  gun?: boolean;
  /**
   * 멱 (장기의 마처럼): L자로 뛸 때 먼저 지나는 곧은 칸(긴 쪽 방향으로 한 칸)에
   * 말이나 벽이 있으면 그 방향으로는 갈 수도 칠 수도 없다
   */
  leg?: boolean;
  /** 압축한 무기 행마: 이 행마로 칠 때 추가 피해 */
  dmg?: number;
}

export type Occ = 'enemy' | 'block' | null;

export interface Grid {
  w: number;
  h: number;
  passable(x: number, y: number): boolean;
  occ(x: number, y: number): Occ;
}

export interface Targets {
  moves: Vec[];
  attacks: Vec[];
}

export function genTargets(rules: MoveRule[], from: Vec, g: Grid): Targets {
  const mv = new Map<string, Vec>();
  const at = new Map<string, Vec>();
  for (const r of rules) {
    const canMove = r.mode !== 'attack';
    const canAtk = r.mode !== 'move';
    for (const [dx, dy] of r.dirs) {
      if (r.leg && r.kind === 'leap' && Math.abs(dx) + Math.abs(dy) === 3) {
        const lx = from[0] + (Math.abs(dx) === 2 ? Math.sign(dx) : 0);
        const ly = from[1] + (Math.abs(dy) === 2 ? Math.sign(dy) : 0);
        const out = lx < 0 || ly < 0 || lx >= g.w || ly >= g.h;
        if (out || !g.passable(lx, ly) || g.occ(lx, ly)) continue; // 멱이 막혔다
      }
      const steps = r.kind === 'slide' ? r.range : 1;
      for (let i = 1; i <= steps; i++) {
        const x = from[0] + dx * i;
        const y = from[1] + dy * i;
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) break;
        if (!g.passable(x, y)) break;
        const o = g.occ(x, y);
        if (o) {
          if (o === 'enemy' && canAtk) at.set(key(x, y), [x, y]);
          if (r.pierce && r.kind === 'slide') continue;
          break;
        }
        if (canMove) mv.set(key(x, y), [x, y]);
      }
    }
  }
  return { moves: [...mv.values()], attacks: [...at.values()] };
}

/** 빈 판 기준 미리보기: 오프셋 -> 모드 */
export function previewPattern(rules: MoveRule[], R = 3): Map<string, RuleMode> {
  const res = new Map<string, RuleMode>();
  const add = (k: string, m: RuleMode) => {
    const p = res.get(k);
    if (!p) res.set(k, m);
    else if (p !== m) res.set(k, 'both');
  };
  for (const r of rules) {
    for (const [dx, dy] of r.dirs) {
      const steps = r.kind === 'slide' ? r.range : 1;
      for (let i = 1; i <= steps; i++) {
        const x = dx * i;
        const y = dy * i;
        if (Math.abs(x) > R || Math.abs(y) > R) break;
        add(key(x, y), r.mode);
      }
    }
  }
  return res;
}

export function dirName(d: Vec[]) {
  if (sameSet(d, KING)) return '8방향';
  if (sameSet(d, ORTH)) return '상하좌우';
  if (sameSet(d, DIAG)) return '대각선';
  if (sameSet(d, KNIGHT)) return 'L자 점프';
  if (sameSet(d, JUMP2)) return '상하좌우 2칸 점프';
  if (sameSet(d, RING3)) return '??? 3칸 도약';
  if (sameSet(d, [...RING2, ...RING3])) return '제멋대로 도약';
  return '특수 방향';
}

export function describeRule(r: MoveRule) {
  if (r.gun) return '8방향 4칸까지 사격 (3 피해 · 쏜 뒤 2턴 재장전)';
  const m = r.mode === 'move' ? '이동' : r.mode === 'attack' ? '공격' : '이동·공격';
  const k = r.kind === 'slide' ? `${r.range}칸까지` : r.kind === 'step' ? '1칸' : '';
  return `${dirName(r.dirs)} ${k} ${m}${r.pierce ? ' (관통)' : ''}`.replace(/\s+/g, ' ');
}
