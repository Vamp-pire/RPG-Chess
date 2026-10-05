import { Vec } from '../core/geom';
import { Biome } from '../data/areas';
import { fx } from './fx';
import { prefs } from '../core/prefs';
import { drawSprite } from './sprites';

export type TileKind = 'floor' | 'wall' | 'void' | 'throne' | 'water' | 'bush' | 'ice' | 'high';
export type MarkKind = 'move' | 'attack' | 'ability' | 'tele' | 'erase' | 'trap' | 'exit' | 'locked' | 'talk' | 'select' | 'goal' | 'line' | 'ally' | 'heal' | 'frost' | 'tap' | 'warp' | 'summon' | 'blur';
export interface Mark { x: number; y: number; kind: MarkKind; /** 칸 위에 적는 글자 (예고 칸의 피해 숫자 등) */ label?: string }
export interface Arrow { from: Vec; to: Vec; color: string; /** 지나는 칸들 (있으면 하나로 이어진 꺾인 화살표) */ via?: Vec[] }

export interface Ent {
  id: string;
  sprite: string;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  alpha: number;
  flash: number;
  flashColor?: string;
  hp?: number;
  maxHp?: number;
  badge?: string;
  bob?: boolean;
  glow?: string;
  plate?: boolean;
  label?: string;
}

/** 판 가장자리 밖의 지역 이동 표시 */
export interface Edge { side: 'n' | 's' | 'w' | 'e'; open: boolean; label: string; hot: boolean; goal?: boolean }

export interface Scene {
  w: number;
  h: number;
  biome: Biome;
  tile(x: number, y: number): TileKind;
  ents: Ent[];
  marks: Mark[];
  arrows: Arrow[];
  edges?: Edge[];
}

export const mkEnt = (id: string, sprite: string, x: number, y: number, extra: Partial<Ent> = {}): Ent => ({
  id, sprite, x, y, z: 0, sx: 1, sy: 1, alpha: 1, flash: 0, ...extra,
});

const AMBIENT: Partial<Record<Biome, 'snow' | 'fog' | 'dust' | 'leaf' | 'ember' | 'ink'>> = {
  forest: 'leaf', marsh: 'fog', ruins: 'dust', throne: 'ember', camp: 'ember', tower: 'dust',
  frostpost: 'snow', tundra: 'snow', glacier: 'snow', bastion: 'snow', kingpeak: 'snow',
  fold: 'ink', inkwell: 'ink', lastpage: 'ink', margin: 'dust',
};

const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

const PAL: Record<Biome, { a: string; b: string; wall: string; bg: string }> = {
  town: { a: '#e9dfc9', b: '#c9b58f', wall: '#6e6152', bg: '#2a241d' },
  meadow: { a: '#dfe8c2', b: '#a9c07f', wall: '#6d7a52', bg: '#1f261a' },
  forest: { a: '#c9d6b4', b: '#7f9a6a', wall: '#3c4f33', bg: '#151c13' },
  hills: { a: '#dcd6c6', b: '#a8a08a', wall: '#5d5a50', bg: '#22211c' },
  throne: { a: '#efe0b0', b: '#c9a95a', wall: '#6e5a2a', bg: '#1d180c' },
  camp: { a: '#e6dcc4', b: '#b8a07a', wall: '#6a5238', bg: '#231c14' },
  marsh: { a: '#c8d2c0', b: '#8a9a82', wall: '#4a5040', bg: '#151a16' },
  ruins: { a: '#d4d0c8', b: '#9a948a', wall: '#55504a', bg: '#1a1918' },
  tower: { a: '#ddd4ea', b: '#9a8cb4', wall: '#4a3f5e', bg: '#16121d' },
  erased: { a: '#f6f6f4', b: '#dcdcd8', wall: '#9a9a9a', bg: '#e8e8e4' },
  frostpost: { a: '#eef3f6', b: '#c3d3dd', wall: '#6a7a86', bg: '#1a2128' },
  tundra: { a: '#f2f6f8', b: '#cfdde6', wall: '#7d8e9a', bg: '#18202a' },
  glacier: { a: '#e4f1f8', b: '#a9cadc', wall: '#5a7c92', bg: '#101a22' },
  bastion: { a: '#e3e6ea', b: '#aab2bc', wall: '#4e5864', bg: '#14181e' },
  kingpeak: { a: '#f4f8fb', b: '#bcd6e6', wall: '#4a6680', bg: '#0e1620' },
  margin: { a: '#faf6ec', b: '#e6dcc4', wall: '#8a7a5a', bg: '#f0e8d4' },
  fold: { a: '#f1ead8', b: '#d2c6a8', wall: '#6e6048', bg: '#2a2418' },
  inkwell: { a: '#e8e4ec', b: '#b6aec6', wall: '#3a3448', bg: '#141220' },
  lastpage: { a: '#fbf7ea', b: '#d9c99a', wall: '#2a2a3a', bg: '#0c0c12' },
};

export class Renderer {
  ctx: CanvasRenderingContext2D;
  ts = 60;
  ox = 0;
  oy = 0;
  cw = 0;
  ch = 0;
  hover: Vec | null = null;
  /** 칸에 마우스를 올렸을 때 보여 줄 경로 미리 보기 (탐험 중에만 app이 넣어 준다) */
  hoverInfo: ((cell: Vec) => { from: Vec; path: Vec[]; label: string; warn?: boolean } | null) | null = null;
  private hoverCache: { key: string; info: { from: Vec; path: Vec[]; label: string; warn?: boolean } | null } | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('mousemove', (e) => { this.hover = this.pick(e); });
    canvas.addEventListener('mouseleave', () => { this.hover = null; });
  }

  layout(scene: Scene) {
    const parent = this.canvas.parentElement!;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.cw = w;
    this.ch = h;
    const ih = Math.max(0, h - this.bottomInset); // 판 아래 행동 줄만큼 비운다
    // 터치 화면에서는 판 바깥(가장자리 화살표) 띠를 넓혀 누르기 쉽게
    const pad = scene.edges ? (COARSE ? 46 : 30) : 12;
    // 창이 너무 작거나 숨겨져도 음수 크기로 그리다 오류가 나지 않게
    this.ts = Math.max(4, Math.floor(Math.min((w - pad * 2) / scene.w, (ih - pad * 2) / scene.h)));
    this.ox = Math.floor((w - this.ts * scene.w) / 2);
    this.oy = Math.floor((ih - this.ts * scene.h) / 2);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 판 아래에 겹쳐 놓은 행동 줄 높이 (px) — 판은 그 위 공간에 맞춘다 */
  bottomInset = 0;

  pick(e: MouseEvent | PointerEvent): Vec | null {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - this.ox) / this.ts);
    const y = Math.floor((e.clientY - r.top - this.oy) / this.ts);
    return [x, y];
  }

  cx = (x: number) => this.ox + (x + 0.5) * this.ts;
  cy = (y: number) => this.oy + (y + 0.5) * this.ts;

  draw(scene: Scene) {
    this.layout(scene);
    if (this.cw < 20 || this.ch < 20) return; // 보이지 않는 동안은 그리지 않는다
    const { ctx, ts } = this;
    const t = fx.time;
    const pal = PAL[scene.biome];
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.save();
    const [sx, sy] = fx.shakeOffset();
    ctx.translate(sx, sy);

    // 판 테두리
    ctx.fillStyle = '#0c0b09';
    ctx.fillRect(this.ox - 6, this.oy - 6, ts * scene.w + 12, ts * scene.h + 12);

    for (let y = 0; y < scene.h; y++) {
      for (let x = 0; x < scene.w; x++) {
        const k = scene.tile(x, y);
        const px = this.ox + x * ts;
        const py = this.oy + y * ts;
        if (k === 'void') {
          ctx.fillStyle = '#050505';
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = 'rgba(255,120,40,0.35)';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, ts - 4, ts - 4);
          continue;
        }
        ctx.fillStyle = (x + y) % 2 ? pal.b : pal.a;
        ctx.fillRect(px, py, ts, ts);
        if (k === 'water') {
          ctx.fillStyle = (x + y) % 2 ? '#3f6a78' : '#4f7e8c';
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = 'rgba(220,240,245,0.45)';
          ctx.lineWidth = 2;
          for (let i = 0; i < 2; i++) {
            const wy = py + ts * (0.35 + i * 0.3);
            const ph = t / 500 + x + i * 2;
            ctx.beginPath();
            ctx.moveTo(px + ts * 0.15, wy + Math.sin(ph) * 2);
            ctx.quadraticCurveTo(px + ts * 0.5, wy - 4 + Math.sin(ph + 1) * 2, px + ts * 0.85, wy + Math.sin(ph + 2) * 2);
            ctx.stroke();
          }
          continue;
        }
        if (k === 'wall') {
          ctx.fillStyle = pal.wall;
          ctx.beginPath();
          ctx.roundRect(px + ts * 0.1, py + ts * 0.12, ts * 0.8, ts * 0.78, ts * 0.14);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(px + ts * 0.18, py + ts * 0.2, ts * 0.3, ts * 0.08);
        } else if (k === 'bush') {
          // 수풀: 풀잎 세 다발
          ctx.fillStyle = 'rgba(70,120,60,0.85)';
          for (const [bx, by] of [[0.28, 0.62], [0.52, 0.5], [0.74, 0.66]]) {
            ctx.beginPath();
            ctx.moveTo(px + ts * (bx - 0.12), py + ts * (by + 0.2));
            ctx.quadraticCurveTo(px + ts * (bx - 0.06), py + ts * (by - 0.2), px + ts * bx, py + ts * (by - 0.28));
            ctx.quadraticCurveTo(px + ts * (bx + 0.06), py + ts * (by - 0.2), px + ts * (bx + 0.12), py + ts * (by + 0.2));
            ctx.fill();
          }
        } else if (k === 'ice') {
          ctx.fillStyle = 'rgba(190,225,245,0.75)';
          ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + ts * 0.2, py + ts * 0.35); ctx.lineTo(px + ts * 0.45, py + ts * 0.2);
          ctx.moveTo(px + ts * 0.5, py + ts * 0.8); ctx.lineTo(px + ts * 0.8, py + ts * 0.55);
          ctx.stroke();
        } else if (k === 'high') {
          // 고지: 한 단 높은 돌판
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px + ts * 0.1, py + ts * 0.2, ts * 0.84, ts * 0.76);
          ctx.fillStyle = 'rgba(255,248,230,0.55)';
          ctx.fillRect(px + ts * 0.06, py + ts * 0.08, ts * 0.84, ts * 0.76);
          ctx.strokeStyle = 'rgba(90,70,40,0.6)';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + ts * 0.06, py + ts * 0.08, ts * 0.84, ts * 0.76);
        } else if (k === 'throne') {
          ctx.fillStyle = 'rgba(230,194,90,0.55)';
          ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
          ctx.strokeStyle = '#6e5a2a';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 8, py + 8, ts - 16, ts - 16);
        }
      }
    }

    if (scene.edges) this.drawEdges(scene, t);
    this.drawMarks(scene, t);

    for (const a of scene.arrows) this.drawArrow(a);

    const ents = scene.ents.slice().sort((a, b) => a.y - b.y);
    for (const e of ents) this.drawEnt(e, t);

    // 퀘스트 목표(금빛 원+별)는 건물·말에 가리지 않게 개체 위에
    this.drawGoals(scene);

    // 내 차례가 오면 판 테두리가 잠깐 금빛으로 반짝인다 (연출 생략을 켜도 차례가 바뀐 걸 알 수 있게)
    const since = fx.time - fx.turnAt;
    if (since >= 0 && since < 650) {
      const k = 1 - since / 650;
      ctx.save();
      ctx.strokeStyle = `rgba(255,214,110,${0.9 * k})`;
      ctx.lineWidth = 3 + 5 * k;
      ctx.shadowColor = 'rgba(255,200,90,0.9)';
      ctx.shadowBlur = 16 * k;
      ctx.strokeRect(this.ox - 2, this.oy - 2, ts * scene.w + 4, ts * scene.h + 4);
      ctx.restore();
    }

    // 파티클
    for (const p of fx.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const px = this.ox + p.x * ts;
      const py = this.oy + p.y * ts;
      const s = p.size * ts;
      if (p.shape === 'chip') ctx.fillRect(px - s / 2, py - s / 2, s, s);
      else if (p.shape === 'spark') {
        ctx.fillRect(px - s, py - s / 4, s * 2, s / 2);
      } else {
        ctx.beginPath();
        ctx.arc(px, py, s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const tx of fx.texts) {
      const a = Math.min(1, tx.life / 300);
      ctx.globalAlpha = a;
      const fpx = Math.round(ts * (tx.size ?? (tx.big ? 0.42 : 0.3)));
      ctx.font = `bold ${fpx}px "IBM Plex Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      // 노란 옥좌·보라 탑 판 위에서도 읽히게: 두꺼운 어두운 테두리 + 그림자 (베타 제보: '소환'·'무르기' 글씨가 묻힘). 작은 글씨는 테두리도 얇게
      ctx.lineWidth = Math.min(Math.max(5, ts * 0.08), Math.max(3, fpx * 0.27));
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(12,10,8,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 8;
      const px = this.ox + tx.x * ts;
      const py = this.oy + tx.y * ts;
      ctx.strokeText(tx.text, px, py);
      ctx.shadowBlur = 0;
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, px, py);
    }
    ctx.globalAlpha = 1;

    if (prefs().ambient) this.drawAmbient(scene, t);

    if (this.hover) {
      const [hx, hy] = this.hover;
      if (hx >= 0 && hy >= 0 && hx < scene.w && hy < scene.h) {
        ctx.strokeStyle = 'rgba(20,20,20,0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.ox + hx * ts + 1, this.oy + hy * ts + 1, ts - 2, ts - 2);
        this.drawHoverPath(scene, [hx, hy]);
      }
    }
    ctx.restore();
  }

  /** 자동 이동 미리 보기: 실제로 걸어갈 경로(흰 점선)와 걸음 수 */
  private drawHoverPath(scene: Scene, cell: Vec) {
    if (!this.hoverInfo) return;
    // 같은 칸·같은 상태면 다시 계산하지 않는다 (경로 탐색은 칸이 바뀔 때만)
    const key = `${cell[0]},${cell[1]}|${scene.ents.map((e) => `${e.id}@${Math.round(e.x)},${Math.round(e.y)}`).join(';')}`;
    if (!this.hoverCache || this.hoverCache.key !== key) this.hoverCache = { key, info: this.hoverInfo(cell) };
    const info = this.hoverCache.info;
    if (!info || !info.path.length) return;
    const { ctx, ts } = this;
    const c = (p: Vec): [number, number] => [this.ox + (p[0] + 0.5) * ts, this.oy + (p[1] + 0.5) * ts];
    ctx.save();
    ctx.setLineDash([ts * 0.12, ts * 0.1]);
    ctx.lineWidth = Math.max(2, ts * 0.05);
    ctx.strokeStyle = info.warn ? 'rgba(255,200,150,0.85)' : 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(...c(info.from));
    for (const p of info.path) ctx.lineTo(...c(p));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    for (const p of info.path) {
      const [x, y] = c(p);
      ctx.beginPath();
      ctx.arc(x, y, ts * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    // 걸음 수 표시 (마우스가 올라간 칸 위)
    const [lx, ly] = c(cell);
    ctx.font = `700 ${Math.round(Math.max(11, ts * 0.2))}px 'IBM Plex Sans KR', sans-serif`;
    const tw = ctx.measureText(info.label).width + 12;
    const th = Math.max(16, ts * 0.3);
    const bx = Math.min(this.ox + scene.w * ts - tw - 2, Math.max(this.ox + 2, lx - tw / 2));
    const by = Math.max(this.oy + 2, ly - ts * 0.5 - th - 2);
    ctx.fillStyle = 'rgba(18,14,10,0.88)';
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, th, 6);
    ctx.fill();
    ctx.fillStyle = info.warn ? '#ffc896' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.label, bx + tw / 2, by + th / 2 + 1);
    ctx.restore();
  }

  /** 지역 분위기 입자: 판 위에 가볍게 흩날린다 (시간으로 위치를 계산해 상태를 따로 두지 않는다) */
  private drawAmbient(scene: Scene, t: number) {
    const kind = AMBIENT[scene.biome];
    if (!kind) return;
    const { ctx, ts } = this;
    const W = ts * scene.w;
    const H = ts * scene.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox, this.oy, W, H);
    ctx.clip();
    const n = kind === 'fog' ? 7 : 26;
    for (let i = 0; i < n; i++) {
      const seed = i * 97.13;
      const sp = 0.6 + ((seed * 7) % 10) / 10;
      const fx0 = ((seed * 13) % 100) / 100;
      const ph = t / 1000;
      let x = 0;
      let y = 0;
      if (kind === 'snow' || kind === 'leaf' || kind === 'ink') {
        y = (((ph * sp * 0.12 + fx0 * 3.7) % 1) + 1) % 1;
        x = fx0 + Math.sin(ph * sp + seed) * 0.03;
      } else if (kind === 'ember') {
        y = 1 - ((((ph * sp * 0.1 + fx0 * 5.1) % 1) + 1) % 1);
        x = fx0 + Math.sin(ph * 2 * sp + seed) * 0.02;
      } else {
        x = (((ph * sp * 0.03 + fx0) % 1) + 1) % 1;
        y = ((seed * 31) % 100) / 100 + Math.sin(ph * sp + seed) * 0.04;
      }
      const px = this.ox + x * W;
      const py = this.oy + y * H;
      if (kind === 'fog') {
        const g = ctx.createRadialGradient(px, py, 0, px, py, ts * 1.6);
        g.addColorStop(0, 'rgba(235,240,235,0.22)');
        g.addColorStop(1, 'rgba(235,240,235,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - ts * 1.6, py - ts * 1.6, ts * 3.2, ts * 3.2);
        continue;
      }
      ctx.fillStyle = kind === 'snow' ? 'rgba(255,255,255,0.85)' : kind === 'ember' ? 'rgba(255,150,60,0.7)' : kind === 'leaf' ? 'rgba(110,150,80,0.6)' : kind === 'ink' ? 'rgba(30,30,45,0.55)' : 'rgba(160,140,110,0.45)';
      const s = kind === 'snow' ? ts * 0.05 : kind === 'leaf' ? ts * 0.07 : ts * 0.035;
      ctx.beginPath();
      if (kind === 'leaf') ctx.ellipse(px, py, s, s * 0.5, ph * sp + seed, 0, Math.PI * 2);
      else ctx.arc(px, py, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawMarks(scene: Scene, t: number) {
    const { ctx, ts } = this;
    const pulse = 0.5 + 0.5 * Math.sin(t / 220);
    for (const m of scene.marks) {
      const px = this.ox + m.x * ts;
      const py = this.oy + m.y * ts;
      const cx = px + ts / 2;
      const cy = py + ts / 2;
      switch (m.kind) {
        case 'move':
          ctx.fillStyle = 'rgba(30,30,30,0.28)';
          ctx.beginPath();
          ctx.arc(cx, cy, ts * 0.14, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'talk':
          ctx.fillStyle = 'rgba(230,180,40,0.35)';
          ctx.fillRect(px + 3, py + 3, ts - 6, ts - 6);
          break;
        case 'ability':
          ctx.fillStyle = 'rgba(70,130,230,0.35)';
          ctx.fillRect(px + 3, py + 3, ts - 6, ts - 6);
          ctx.strokeStyle = 'rgba(40,90,200,0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 4, py + 4, ts - 8, ts - 8);
          break;
        case 'attack': {
          ctx.strokeStyle = 'rgba(200,40,40,0.9)';
          ctx.lineWidth = 3;
          const c = ts * 0.25;
          ctx.beginPath();
          for (const [ax, ay, dx, dy] of [[px + 3, py + 3, 1, 1], [px + ts - 3, py + 3, -1, 1], [px + 3, py + ts - 3, 1, -1], [px + ts - 3, py + ts - 3, -1, -1]]) {
            ctx.moveTo(ax, ay + dy * c);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + dx * c, ay);
          }
          ctx.stroke();
          if (m.label) {
            // 붙어서 치면 2배
            const fsz = Math.max(9, Math.round(ts * 0.14));
            ctx.font = `800 ${fsz}px 'IBM Plex Sans KR', sans-serif`;
            ctx.textAlign = 'center';
            const bw = fsz * 1.9;
            const bh = fsz * 1.25;
            ctx.fillStyle = 'rgba(255,140,40,0.92)';
            ctx.beginPath();
            ctx.roundRect(px + 3, py + 3, bw, bh, 5); // 왼쪽 위 (오른쪽 위는 예고 피해 숫자 자리)
            ctx.fill();
            ctx.fillStyle = '#1a0e04';
            // 기준선을 직접 정한다 (앞서 그린 표시의 'top'이 남아 글자가 배지 아래로 밀려 나가던 것)
            const prevBase = ctx.textBaseline;
            ctx.textBaseline = 'middle';
            ctx.fillText(m.label, px + 3 + bw / 2, py + 3 + bh / 2 + 1);
            ctx.textBaseline = prevBase;
          }
          break;
        }
        case 'blur':
          // 흐린 예고: 이 근처 어딘가를 노린다 (정확한 칸은 모른다)
          ctx.fillStyle = `rgba(220,50,40,${0.06 + 0.07 * pulse})`;
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = 'rgba(170,30,30,0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 5]);
          ctx.strokeRect(px + 5, py + 5, ts - 10, ts - 10);
          ctx.setLineDash([]);
          break;
        case 'tele':
          ctx.fillStyle = `rgba(220,50,40,${0.18 + 0.2 * pulse})`;
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = `rgba(160,20,20,${0.5 + 0.3 * pulse})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(px + 3, py + 3, ts - 6, ts - 6);
          ctx.setLineDash([]);
          // 이 칸에 서 있으면 받을 피해 (오른쪽 위)
          if (m.label) {
            ctx.font = `800 ${Math.round(ts * 0.26)}px 'IBM Plex Sans KR', sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.lineWidth = Math.max(2, ts * 0.06);
            ctx.strokeStyle = 'rgba(40,0,0,0.85)';
            ctx.strokeText(m.label, px + ts - 5, py + 4);
            ctx.fillStyle = '#ffd0c8';
            ctx.fillText(m.label, px + ts - 5, py + 4);
          }
          break;
        case 'frost':
          // 서리 폭풍 예고: 푸른 눈송이 칸
          ctx.fillStyle = `rgba(120,190,255,${0.25 + 0.3 * pulse})`;
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const an = (i * Math.PI) / 3;
            ctx.moveTo(cx - Math.cos(an) * ts * 0.28, cy - Math.sin(an) * ts * 0.28);
            ctx.lineTo(cx + Math.cos(an) * ts * 0.28, cy + Math.sin(an) * ts * 0.28);
          }
          ctx.stroke();
          break;
        case 'erase':
          ctx.fillStyle = `rgba(255,130,30,${0.25 + 0.3 * pulse})`;
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = '#3a1a05';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            ctx.moveTo(px + ts * (0.2 + i * 0.2), py + ts * 0.15);
            ctx.lineTo(px + ts * (0.1 + i * 0.22), py + ts * 0.85);
          }
          ctx.stroke();
          break;
        case 'trap':
          ctx.fillStyle = '#6a4a24';
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(px + ts * (0.2 + i * 0.25), py + ts * 0.75);
            ctx.lineTo(px + ts * (0.3 + i * 0.25), py + ts * 0.45);
            ctx.lineTo(px + ts * (0.4 + i * 0.25), py + ts * 0.75);
            ctx.fill();
          }
          break;
        case 'exit':
          ctx.fillStyle = `rgba(255,230,140,${0.3 + 0.35 * pulse})`;
          ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
          ctx.strokeStyle = '#6a4a10';
          ctx.lineWidth = 3;
          ctx.strokeRect(px + 5, py + 5, ts - 10, ts - 10);
          break;
        case 'locked':
          ctx.fillStyle = 'rgba(60,60,60,0.35)';
          ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
          ctx.strokeStyle = 'rgba(40,40,40,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 8, py + 8); ctx.lineTo(px + ts - 8, py + ts - 8);
          ctx.moveTo(px + ts - 8, py + 8); ctx.lineTo(px + 8, py + ts - 8);
          ctx.stroke();
          break;
        case 'select':
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 3;
          ctx.strokeRect(px + 2, py + 2, ts - 4, ts - 4);
          break;
        case 'ally':
          ctx.strokeStyle = `rgba(60,140,230,${0.5 + 0.4 * pulse})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(px + 3, py + 3, ts - 6, ts - 6, ts * 0.15);
          ctx.stroke();
          break;
        case 'heal':
          ctx.fillStyle = 'rgba(90,200,120,0.35)';
          ctx.fillRect(px + 3, py + 3, ts - 6, ts - 6);
          ctx.fillStyle = '#2a8a44';
          ctx.fillRect(cx - ts * 0.04, cy - ts * 0.14, ts * 0.08, ts * 0.28);
          ctx.fillRect(cx - ts * 0.14, cy - ts * 0.04, ts * 0.28, ts * 0.08);
          break;
        case 'line':
          ctx.fillStyle = `rgba(150,90,220,${0.2 + 0.25 * pulse})`;
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = 'rgba(90,40,160,0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 4, cy);
          ctx.lineTo(px + ts - 4, cy);
          ctx.moveTo(cx, py + 4);
          ctx.lineTo(cx, py + ts - 4);
          ctx.stroke();
          break;
        case 'warp':
        case 'summon': {
          // 예고: 다음 적 턴에 보스가 순간 이동할 칸(보라) / 말이 나타날 칸(금빛)
          const warp = m.kind === 'warp';
          ctx.save();
          ctx.setLineDash([ts * 0.1, ts * 0.07]);
          ctx.lineDashOffset = -performance.now() / 60;
          ctx.strokeStyle = warp ? 'rgba(200,160,255,0.95)' : 'rgba(255,211,90,0.95)';
          ctx.lineWidth = 3;
          ctx.strokeRect(px + 5, py + 5, ts - 10, ts - 10);
          ctx.setLineDash([]);
          ctx.fillStyle = warp ? 'rgba(170,120,240,0.18)' : 'rgba(255,211,90,0.14)';
          ctx.fillRect(px + 5, py + 5, ts - 10, ts - 10);
          ctx.font = `700 ${Math.round(ts * 0.18)}px 'IBM Plex Sans KR', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = warp ? '#e6d4ff' : '#ffe7a3';
          ctx.fillText(warp ? '무르기' : '소환', cx, py + ts * 0.82);
          ctx.restore();
          break;
        }
        case 'tap': {
          // 첫 안내: 퍼져 나가는 고리 + 칸을 누르는 손가락
          const now = performance.now() / 1000;
          for (let k = 0; k < 2; k++) {
            const ph = (now * 0.9 + k * 0.5) % 1;
            ctx.strokeStyle = `rgba(255,235,150,${0.85 * (1 - ph)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, ts * (0.18 + 0.32 * ph), 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(255,225,120,0.22)';
          ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
          const bob = Math.sin(now * 5) * ts * 0.05;
          ctx.font = `${Math.round(ts * 0.42)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👆', cx + ts * 0.22, cy + ts * 0.32 + bob);
          break;
        }
        case 'goal':
          break; // 금빛 원+별은 건물·말 위에 그린다 (drawGoals)
      }
    }
  }

  /** 각 변 바깥에 길 표시: 열린 길은 금색 화살표, 막힌 길은 회색. 그 변에 서 있으면 맥동 */
  private drawEdges(scene: Scene, t: number) {
    const { ctx, ts } = this;
    const W = ts * scene.w;
    const H = ts * scene.h;
    const pulse = 0.5 + 0.5 * Math.sin(t / 220);
    for (const e of scene.edges!) {
      const horiz = e.side === 'n' || e.side === 's';
      const cx = e.side === 'w' ? this.ox - 18 : e.side === 'e' ? this.ox + W + 18 : this.ox + W / 2;
      const cy = e.side === 'n' ? this.oy - 18 : e.side === 's' ? this.oy + H + 18 : this.oy + H / 2;
      const len = (horiz ? W : H) * 0.9;
      // 변 전체를 따라 옅은 띠
      ctx.fillStyle = e.open ? (e.hot ? `rgba(255,210,90,${0.25 + 0.3 * pulse})` : e.goal ? `rgba(255,205,70,${0.2 + 0.2 * pulse})` : 'rgba(255,210,90,0.1)') : 'rgba(150,150,150,0.08)';
      if (horiz) ctx.fillRect(cx - len / 2, cy - 7, len, 14);
      else ctx.fillRect(cx - 7, cy - len / 2, 14, len);
      // 화살표
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(e.side === 'n' ? -Math.PI / 2 : e.side === 's' ? Math.PI / 2 : e.side === 'w' ? Math.PI : 0);
      ctx.fillStyle = e.open ? (e.hot || e.goal ? '#ffd35a' : '#b8964a') : '#666';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-4, -9);
      ctx.lineTo(-4, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // 이름표
      ctx.font = `700 ${Math.max(11, Math.round(ts * 0.17))}px "IBM Plex Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = e.open ? '#f4e6c4' : '#999';
      if (horiz) ctx.fillText(e.label, cx + (e.side === 'n' || e.side === 's' ? ts * 1.3 : 0), cy + 5);
      else {
        ctx.save();
        ctx.translate(cx, cy + ts * 1.3);
        ctx.rotate(e.side === 'w' ? -Math.PI / 2 : Math.PI / 2);
        ctx.fillText(e.label, 0, 5);
        ctx.restore();
      }
    }
  }

  /** 퀘스트 안내 목표: 금빛 맥동 고리 + 별 (개체를 다 그린 뒤 맨 위에) */
  private drawGoals(scene: Scene) {
    const { ctx, ts } = this;
    const pulse = (Math.sin(performance.now() / 260) + 1) / 2;
    for (const m of scene.marks) {
      if (m.kind !== 'goal') continue;
      const px = this.ox + m.x * ts;
      const py = this.oy + m.y * ts;
      const cx = px + ts / 2;
      const cy = py + ts / 2;
      ctx.save();
      // 어두운 그림자 대신 금빛 광채 (건물 위에서도 밝게 보이게)
      ctx.shadowColor = 'rgba(255,215,90,0.9)';
      ctx.shadowBlur = 12;
      const r = ts * (0.36 + 0.06 * pulse);
      ctx.strokeStyle = `rgba(255,205,70,${0.75 + 0.25 * pulse})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff07a';
      ctx.strokeStyle = '#b07a10';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const sy = py - ts * 0.08 - pulse * ts * 0.05;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? ts * 0.09 : ts * 0.21;
        ctx.lineTo(cx + Math.cos(a) * rr, sy + ts * 0.12 + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawArrow(a: Arrow) {
    const { ctx, ts } = this;
    // 경로를 따라 하나로 이어진 점선 + 끝에만 화살촉
    if (a.via && a.via.length) {
      const pts = [a.from, ...a.via, a.to].map((p) => [this.cx(p[0]), this.cy(p[1])] as [number, number]);
      const n = pts.length;
      const [lx, ly] = pts[n - 2];
      const [ex, ey] = pts[n - 1];
      const ang = Math.atan2(ey - ly, ex - lx);
      // 시작은 내 말에서 조금 떨어져서, 끝은 목표 고리 앞에서 멈춘다
      const [sx0, sy0] = pts[0];
      const [nx0, ny0] = pts[1];
      const a0 = Math.atan2(ny0 - sy0, nx0 - sx0);
      const start: [number, number] = [sx0 + Math.cos(a0) * ts * 0.28, sy0 + Math.sin(a0) * ts * 0.28];
      const end: [number, number] = [ex - Math.cos(ang) * ts * 0.34, ey - Math.sin(ang) * ts * 0.34];
      ctx.save();
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -performance.now() / 70;
      ctx.beginPath();
      ctx.moveTo(...start);
      for (let i = 1; i < n - 1; i++) ctx.lineTo(...pts[i]);
      ctx.lineTo(end[0] - Math.cos(ang) * 8, end[1] - Math.sin(ang) * 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.translate(...end);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-14, -8);
      ctx.lineTo(-14, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    const x1 = this.cx(a.from[0]);
    const y1 = this.cy(a.from[1]);
    const x2 = this.cx(a.to[0]);
    const y2 = this.cy(a.to[1]);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1) - ts * 0.3;
    if (len <= 0) return;
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(ang);
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(ts * 0.25, 0);
    ctx.lineTo(len - 6, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(len - 12, -7);
    ctx.lineTo(len - 12, 7);
    ctx.fill();
    ctx.restore();
  }

  private drawEnt(e: Ent, t: number) {
    const { ctx, ts } = this;
    if (e.alpha <= 0) return;
    const cx = this.ox + (e.x + 0.5) * ts;
    const cy = this.oy + (e.y + 0.5) * ts;
    ctx.save();
    ctx.globalAlpha = e.alpha;
    if (e.plate) {
      const px = this.ox + Math.round(e.x) * ts;
      const py = this.oy + Math.round(e.y) * ts;
      ctx.fillStyle = 'rgba(40,30,20,0.16)';
      ctx.strokeStyle = 'rgba(40,30,20,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(px + ts * 0.08, py + ts * 0.08, ts * 0.84, ts * 0.84, ts * 0.12);
      ctx.fill();
      ctx.stroke();
    }
    // 그림자
    const zs = Math.max(0.4, 1 - e.z * 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ts * 0.34, ts * 0.3 * zs, ts * 0.09 * zs, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e.glow) {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, ts * 0.6);
      g.addColorStop(0, e.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - ts, cy - ts, ts * 2, ts * 2);
    }
    const bob = e.bob ? Math.sin(t / 380 + e.x * 1.3) * ts * 0.025 : 0;
    const py = cy - e.z * ts + bob;
    ctx.translate(cx, py + ts * 0.36);
    ctx.scale(e.sx, e.sy);
    ctx.translate(-cx, -(py + ts * 0.36));
    drawSprite(ctx, e.sprite, cx, py, ts, t);
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = e.alpha * e.flash * 0.7;
      ctx.fillStyle = e.flashColor ?? '#fff';
      ctx.beginPath();
      ctx.arc(cx, py, ts * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    if (e.maxHp && e.hp !== undefined && e.alpha > 0.3) {
      const n = e.maxHp;
      const by = cy + ts * 0.4;
      {
        // 체력이 많으면 칸이 너무 가늘어져 안 보였다 (각성 퀸 + 실험 체력 배율 — 베타 제보) → 한 줄 막대 + 숫자
        const total = ts * 0.8;
        const bx = cx - total / 2;
        const bh = ts * 0.09;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx, by, total, bh);
        ctx.fillStyle = e.id.startsWith('c_') || e.id === 'hero' ? '#4aa86a' : '#d23a2a';
        ctx.fillRect(bx, by, total * Math.max(0, e.hp) / n, bh);
        const fs = Math.max(9, Math.round(ts * 0.13));
        ctx.font = `700 ${fs}px "IBM Plex Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(`${e.hp}/${n}`, cx, by - 2);
        ctx.fillStyle = '#fff';
        ctx.fillText(`${e.hp}/${n}`, cx, by - 2);
      }
    }
    if (e.label && ts >= 40) {
      const fs = Math.max(9, Math.round(ts * 0.16));
      ctx.font = `700 ${fs}px "IBM Plex Sans KR", sans-serif`;
      ctx.textAlign = 'center';
      const tw = ctx.measureText(e.label).width + 8;
      const ly = cy + ts * 0.5 - fs * 0.35;
      ctx.fillStyle = 'rgba(20,16,12,0.72)';
      ctx.beginPath();
      ctx.roundRect(cx - tw / 2, ly - fs * 0.85, tw, fs * 1.2, 4);
      ctx.fill();
      ctx.fillStyle = '#f4ead4';
      ctx.fillText(e.label, cx, ly);
    }
    if (e.badge) {
      ctx.font = `bold ${Math.round(ts * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111';
      ctx.fillRect(cx + ts * 0.14, cy - ts * 0.48, ts * 0.32, ts * 0.26);
      ctx.fillStyle = '#ffd35a';
      ctx.fillText(e.badge, cx + ts * 0.3, cy - ts * 0.28);
    }
  }
}
