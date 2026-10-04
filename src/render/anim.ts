// 공용 짧은 연출 (기본 등급: 0.1~0.3초)
import { Vec } from '../core/geom';
import { Ent } from './board';
import { easeInOut, easeOut, easeOutBack, fx, linear } from './fx';

export async function moveEnt(e: Ent, to: Vec) {
  const fx0 = e.x;
  const fy0 = e.y;
  const dx = to[0] - fx0;
  const dy = to[1] - fy0;
  const straight = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (!straight) {
    // 점프: 포물선 + 착지 눌림
    await fx.tween(300, (p) => {
      e.x = fx0 + dx * p;
      e.y = fy0 + dy * p;
      e.z = Math.sin(Math.PI * p) * 0.55;
    }, easeInOut);
    e.z = 0;
    await squash(e);
    fx.burst(to[0] + 0.5, to[1] + 0.85, 'rgba(90,80,60,0.6)', 6, { speed: 1.2, life: 300, size: 0.07 });
    return;
  }
  const dur = dist <= 1 ? 150 : 140 + dist * 45;
  await fx.tween(dur, (p) => {
    e.x = fx0 + dx * p;
    e.y = fy0 + dy * p;
    e.z = dist <= 1 ? Math.sin(Math.PI * p) * 0.12 : 0;
    if (dist > 1 && Math.random() < 0.5) fx.parts.push({ x: e.x + 0.5, y: e.y + 0.7, vx: 0, vy: 0, life: 200, max: 200, size: 0.1, color: 'rgba(255,255,255,0.35)', grav: 0, shape: 'dot' });
  }, easeOut);
  e.x = to[0];
  e.y = to[1];
  e.z = 0;
}

export function squash(e: Ent) {
  return fx.tween(140, (p) => {
    const k = Math.sin(Math.PI * p) * 0.14;
    e.sx = 1 + k;
    e.sy = 1 - k;
  }, linear).then(() => { e.sx = 1; e.sy = 1; });
}

/** 제자리 공격: 목표 방향으로 살짝 들이받고 복귀. onHit은 타격 순간 */
export async function lunge(e: Ent, target: Vec, onHit: () => void) {
  const x0 = e.x;
  const y0 = e.y;
  const dx = target[0] - x0;
  const dy = target[1] - y0;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  await fx.tween(70, (p) => { e.x = x0 - ux * 0.08 * p; e.y = y0 - uy * 0.08 * p; }, easeOut);
  const reach = Math.min(0.45, d - 0.35);
  await fx.tween(90, (p) => { e.x = x0 + ux * reach * p; e.y = y0 + uy * reach * p; }, easeOut);
  onHit();
  await fx.tween(140, (p) => { e.x = x0 + ux * reach * (1 - p); e.y = y0 + uy * reach * (1 - p); }, easeOut);
  e.x = x0;
  e.y = y0;
}

export function flash(e: Ent, color = '#ffffff', dur = 220) {
  e.flashColor = color;
  return fx.tween(dur, (p) => { e.flash = 1 - p; }, linear);
}

export function hitFx(e: Ent, dmg: number, color = '#ff5a4a', melee = false) {
  fx.stop(melee ? 80 : 55);
  fx.shake(melee ? 6 : dmg >= 2 ? 4 : 3);
  flash(e, '#ff2a1a');
  // 붙어서 친 2배 피해는 크고 주황색, 떨어져서 친 피해는 흰색에 가깝게
  fx.text(e.x + 0.5, e.y + 0.1, melee ? `-${dmg}!` : `-${dmg}`, melee ? '#ffa23a' : color, melee);
  fx.burst(e.x + 0.5, e.y + 0.5, color, 6, { speed: 2, life: 300, size: 0.07 });
}

const DEATH_COLORS: Record<string, string[]> = {
  slime: ['#7ccf6b', '#b6ecaa'],
  slimelet: ['#9ddc8e'],
  rat: ['#ddd', '#888'],
  bat: ['#8a6fa8', '#222'],
  golem: ['#7d9a62', '#bbb', '#777'],
  thorn: ['#a07a44', '#5a3a1a'],
  hound: ['#222', '#c96a5a'],
  strawking: ['#e8c35a', '#fff0b0'],
  strawpawn: ['#e8c35a'],
  rook: ['#333', '#999'],
};

export async function death(e: Ent, mob: string) {
  const cols = DEATH_COLORS[mob] ?? ['#ccc'];
  const heavy = mob === 'golem' || mob === 'rook';
  for (const c of cols) fx.burst(e.x + 0.5, e.y + 0.5, c, heavy ? 9 : 7, { speed: heavy ? 2.2 : 3, grav: heavy ? 1.2 : 0.4, shape: heavy ? 'chip' : 'dot', life: 550, size: heavy ? 0.11 : 0.09 });
  await fx.tween(220, (p) => {
    e.alpha = 1 - p;
    e.sx = 1 + p * 0.25;
    e.sy = 1 - p * 0.4;
  }, easeOut);
  e.alpha = 0;
}

export function popIn(e: Ent) {
  e.sx = 0.2;
  e.sy = 0.2;
  return fx.tween(260, (p) => { e.sx = p; e.sy = p; }, easeOutBack);
}
