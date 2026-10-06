// 임시 스프라이트: 기물은 기존 PNG, 몹·오브젝트는 흑/백 + 강조색 1개의 단순 도형 (Canva 이미지로 교체 예정)
import { ALIAS, artCanvas } from './art';

const imgs = new Map<string, HTMLImageElement>();

export function loadPieceImages(): Promise<void> {
  const names = ['wp', 'wn', 'wb', 'wr', 'wq', 'wk', 'bp', 'bn', 'bb', 'br', 'bq', 'bk'];
  return Promise.all(
    names.map(
      (n) =>
        new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => res();
          im.onerror = () => res();
          im.src = `pieces/${n}.png`;
          imgs.set(n, im);
        }),
    ),
  ).then(() => {});
}

export const pieceSrc = (n: string) => `pieces/${n}.png`;

const INK = '#141414';
const PAPER = '#f4f1ea';

function outline(ctx: CanvasRenderingContext2D, w: number) {
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** cx, cy = 중심 픽셀, s = 타일 크기, t = 시간(ms) */
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: string, cx: number, cy: number, s: number, t: number) {
  const [kind, id] = sprite.split(':');
  if (kind === 'p') {
    const im = imgs.get(id);
    if (im && im.complete && im.naturalWidth) {
      const size = s * 0.8;
      const ratio = im.naturalWidth / im.naturalHeight;
      const w = ratio >= 1 ? size : size * ratio;
      const h = ratio >= 1 ? size / ratio : size;
      ctx.drawImage(im, cx - w / 2, cy - h / 2 - s * 0.06, w, h);
    }
    return;
  }
  if (kind === 'm') {
    const art = artCanvas(`m:${ALIAS[id] ?? id}`);
    if (art) {
      // 그림 한 장 + 코드 연출: 숨쉬듯 살짝 늘었다 줄었다
      const small = id === 'slimelet' ? 0.68 : id === 'echo' ? 0.75 : id === 'strawpawn' ? 0.8 : id === 'inkdrop' ? 0.6 : 1;
      const box = s * 0.84 * small;
      const k = Math.min(box / art.width, box / art.height);
      const w = art.width * k;
      const h = art.height * k * (1 + Math.sin(t / 420) * 0.02);
      ctx.save();
      if (id === 'echo') ctx.globalAlpha *= 0.55;
      ctx.drawImage(art, cx - w / 2, cy + s * 0.34 - h, w, h);
      ctx.restore();
      return;
    }
  }
  // 재료 그림 (트레일러 등에서 판 위에 띄울 때)
  if (kind === 'mat') {
    const art = artCanvas(`mat:${id}`);
    if (art) {
      const box = s * 0.62;
      const k = Math.min(box / art.width, box / art.height);
      ctx.drawImage(art, cx - (art.width * k) / 2, cy - (art.height * k) / 2, art.width * k, art.height * k);
    }
    return;
  }
  if (kind === 'o') {
    const art = artCanvas(`o:${id}`);
    if (art) {
      // Canva 건물 그림: 몹과 같은 바닥선, 칸을 조금 더 채운다
      const box = s * 0.86;
      const k = Math.min(box / art.width, box / art.height);
      const w = art.width * k;
      const h = art.height * k;
      ctx.drawImage(art, cx - w / 2, cy + s * 0.38 - h, w, h);
      return;
    }
  }
  ctx.save();
  ctx.translate(cx, cy);
  const u = s / 100;
  ctx.scale(u, u);
  const lw = 5;
  if (kind === 'm') drawMob(ctx, id, t, lw);
  else {
    // 모든 오브젝트를 같은 크기·같은 바닥선에 맞춘다
    ctx.translate(0, -6);
    ctx.scale(0.72, 0.72);
    drawObj(ctx, id, t, lw + 1);
  }
  ctx.restore();
}

function eyes(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, r = 6, color = PAPER) {
  for (const x of [x1, x2]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    outline(ctx, 2.5);
    ctx.beginPath();
    ctx.arc(x + 1, y + 1, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  }
}

function drawMob(ctx: CanvasRenderingContext2D, id: string, t: number, lw: number) {
  const wob = Math.sin(t / 260);
  switch (id) {
    case 'slime':
    case 'slimelet': {
      const k = id === 'slime' ? 1 : 0.7;
      ctx.scale(k, k);
      const sq = 1 + wob * 0.05;
      ctx.beginPath();
      ctx.moveTo(-34 * sq, 26);
      ctx.bezierCurveTo(-40 * sq, -10, -20, -34 / sq, 0, -34 / sq);
      ctx.bezierCurveTo(20, -34 / sq, 40 * sq, -10, 34 * sq, 26);
      ctx.closePath();
      ctx.fillStyle = '#7ccf6b';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(-14, -16, 6, 4, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      eyes(ctx, -10, 10, 0, 6);
      break;
    }
    case 'rat': {
      ctx.beginPath();
      ctx.moveTo(28, 12);
      ctx.quadraticCurveTo(46, 18, 40, 34);
      outline(ctx, 3);
      ctx.beginPath();
      ctx.ellipse(0, 10, 30, 20, 0, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, lw);
      for (const x of [-18, 2]) {
        ctx.beginPath();
        ctx.arc(x, -12, 10, 0, Math.PI * 2);
        ctx.fillStyle = PAPER;
        ctx.fill();
        outline(ctx, lw - 1);
      }
      ctx.beginPath();
      ctx.arc(-26, 10, 4, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-14, 4, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bat': {
      const f = Math.sin(t / 110) * 0.35;
      for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.scale(sgn, 1);
        ctx.rotate(f);
        ctx.beginPath();
        ctx.moveTo(8, -4);
        ctx.lineTo(44, -20);
        ctx.lineTo(38, 0);
        ctx.lineTo(46, 10);
        ctx.lineTo(28, 8);
        ctx.lineTo(20, 16);
        ctx.closePath();
        ctx.fillStyle = '#8a6fa8';
        ctx.fill();
        outline(ctx, lw - 1);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 2, 17, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-12, -10); ctx.lineTo(-8, -26); ctx.lineTo(-2, -12);
      ctx.moveTo(12, -10); ctx.lineTo(8, -26); ctx.lineTo(2, -12);
      ctx.fillStyle = INK;
      ctx.fill();
      eyes(ctx, -6, 6, 0, 4);
      break;
    }
    case 'golem': {
      ctx.beginPath();
      ctx.roundRect(-34, -30, 68, 62, 14);
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(-34, -12);
      ctx.bezierCurveTo(-20, -24, -6, -6, 8, -20);
      ctx.bezierCurveTo(18, -30, 28, -16, 34, -22);
      ctx.lineTo(34, -30);
      ctx.lineTo(-34, -30);
      ctx.closePath();
      ctx.fillStyle = '#7d9a62';
      ctx.fill();
      outline(ctx, 3);
      ctx.fillStyle = INK;
      ctx.fillRect(-18, -2, 10, 6);
      ctx.fillRect(8, -2, 10, 6);
      ctx.beginPath();
      ctx.moveTo(-10, 18); ctx.lineTo(-2, 12); ctx.lineTo(6, 18);
      outline(ctx, 3);
      break;
    }
    case 'thorn': {
      ctx.rotate(wob * 0.05);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 26 : 40;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#a07a44';
      ctx.fill();
      outline(ctx, lw - 1);
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, 3);
      eyes(ctx, -7, 7, 0, 4);
      break;
    }
    case 'hound': {
      ctx.beginPath();
      ctx.ellipse(6, 10, 32, 18, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-18, -2);
      ctx.lineTo(-40, -6);
      ctx.lineTo(-30, 12);
      ctx.lineTo(-14, 12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-24, -8); ctx.lineTo(-18, -26); ctx.lineTo(-12, -6);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-26, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#c96a5a';
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.moveTo(-36, 8); ctx.lineTo(-33, 14); ctx.lineTo(-30, 8);
      ctx.fill();
      break;
    }
    case 'strawking':
    case 'strawpawn': {
      const big = id === 'strawking';
      const k = big ? 1.15 : 0.75;
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.moveTo(-26, 34);
      ctx.lineTo(26, 34);
      ctx.lineTo(16, 0);
      ctx.lineTo(-16, 0);
      ctx.closePath();
      ctx.fillStyle = '#e8c35a';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      for (let x = -12; x <= 12; x += 6) { ctx.moveTo(x, 4); ctx.lineTo(x * 1.5, 30); }
      outline(ctx, 2);
      ctx.beginPath();
      ctx.arc(0, -14, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#e8c35a';
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = INK;
      ctx.fillRect(-8, -18, 5, 5);
      ctx.fillRect(3, -18, 5, 5);
      if (big) {
        ctx.beginPath();
        ctx.moveTo(-16, -28); ctx.lineTo(-16, -44); ctx.lineTo(-8, -36); ctx.lineTo(0, -48); ctx.lineTo(8, -36); ctx.lineTo(16, -44); ctx.lineTo(16, -28);
        ctx.closePath();
        ctx.fillStyle = PAPER;
        ctx.fill();
        outline(ctx, 3);
      }
      break;
    }
    case 'toad': {
      const hop = Math.abs(Math.sin(t / 420)) * 3;
      ctx.translate(0, -hop);
      ctx.beginPath();
      ctx.ellipse(0, 10, 34, 22, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8fa05a';
      ctx.fill();
      outline(ctx, lw);
      for (const x of [-16, 16]) {
        ctx.beginPath();
        ctx.arc(x, -10, 11, 0, Math.PI * 2);
        ctx.fillStyle = '#8fa05a';
        ctx.fill();
        outline(ctx, lw - 1);
      }
      eyes(ctx, -16, 16, -10, 6);
      ctx.beginPath();
      ctx.moveTo(-18, 14);
      ctx.quadraticCurveTo(0, 22, 18, 14);
      outline(ctx, 3);
      break;
    }
    case 'spider': {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      const w = Math.sin(t / 150) * 3;
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(s * 10, -4 + i * 6);
        ctx.lineTo(s * 30, -18 + i * 12 + (i % 2 ? w : -w));
        ctx.lineTo(s * 40, -6 + i * 14);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 20, 0, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = '#b04040';
      for (const [x, y] of [[-6, -6], [6, -6], [-3, 0], [3, 0]]) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'skeleton':
    case 'bonelord': {
      const big = id === 'bonelord';
      if (big) ctx.scale(1.15, 1.15);
      ctx.beginPath();
      ctx.arc(0, -12, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#e8e2cf';
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(-8, -14, 5, 0, Math.PI * 2);
      ctx.arc(8, -14, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-7, 0, 14, 4);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 8); ctx.lineTo(0, 34);
      ctx.moveTo(-16, 14); ctx.lineTo(16, 14);
      ctx.moveTo(-12, 22); ctx.lineTo(12, 22);
      ctx.stroke();
      if (big) {
        ctx.beginPath();
        ctx.moveTo(-18, -28); ctx.lineTo(-14, -42); ctx.lineTo(-6, -32); ctx.lineTo(0, -44); ctx.lineTo(6, -32); ctx.lineTo(14, -42); ctx.lineTo(18, -28);
        ctx.closePath();
        ctx.fillStyle = '#c96a5a';
        ctx.fill();
        outline(ctx, 3);
      }
      break;
    }
    case 'wraith': {
      ctx.globalAlpha *= 0.8 + 0.2 * Math.sin(t / 300);
      ctx.beginPath();
      ctx.moveTo(-26, 34);
      ctx.lineTo(-26, -6);
      ctx.arc(0, -6, 26, Math.PI, 0);
      ctx.lineTo(26, 34);
      for (let i = 0; i < 4; i++) ctx.lineTo(26 - (i + 0.5) * 13, 34 - (i % 2 ? 0 : 10) + Math.sin(t / 200 + i) * 3);
      ctx.closePath();
      ctx.fillStyle = '#9fd8d0';
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(-9, -6, 5, 8, 0, 0, Math.PI * 2);
      ctx.ellipse(9, -6, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'misqueen':
    case 'echo': {
      const big = id === 'misqueen';
      ctx.scale(big ? 1.2 : 0.8, big ? 1.2 : 0.8);
      if (!big) ctx.globalAlpha *= 0.6;
      ctx.rotate(Math.PI); // 뒤집힌 퀸
      ctx.beginPath();
      ctx.moveTo(-24, 34); ctx.lineTo(24, 34); ctx.lineTo(16, 4); ctx.lineTo(-16, 4); ctx.closePath();
      ctx.fillStyle = '#b9a0e0';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(-22, 4); ctx.lineTo(-26, -24); ctx.lineTo(-12, -10); ctx.lineTo(0, -30); ctx.lineTo(12, -10); ctx.lineTo(26, -24); ctx.lineTo(22, 4);
      ctx.closePath();
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, lw);
      for (const x of [-26, 0, 26]) {
        ctx.beginPath();
        ctx.arc(x, x === 0 ? -34 : -28, 5, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      break;
    }
    case 'blunder': {
      // 지지직거리는 ?? 덩어리
      const g = Math.floor(t / 120) % 3;
      ctx.translate(g - 1, 0);
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = 26 + ((i * 7 + g * 5) % 11);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#d86ad8';
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = INK;
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('??', 0, 12);
      break;
    }
    case 'hopper': {
      // 메뚜기: 길쭉한 몸통 + 접힌 뒷다리 (튀어 오를 듯 움찔)
      const jump = Math.max(0, Math.sin(t / 180)) * 4;
      ctx.translate(0, -jump);
      ctx.beginPath();
      ctx.moveTo(-6, 6); ctx.lineTo(-30, -18); ctx.lineTo(-36, 22);
      ctx.moveTo(6, 6); ctx.lineTo(30, -18); ctx.lineTo(36, 22);
      outline(ctx, lw - 1);
      ctx.beginPath();
      ctx.ellipse(0, 4, 13, 28, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#9cc25a';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(-5, -24); ctx.quadraticCurveTo(-14, -42, -22, -40);
      ctx.moveTo(5, -24); ctx.quadraticCurveTo(14, -42, 22, -40);
      outline(ctx, 2.5);
      eyes(ctx, -7, 7, -14, 5);
      break;
    }
    case 'mole': {
      // 두더지: 흙더미 위 둥근 머리, 큰 앞발
      ctx.beginPath();
      ctx.ellipse(0, 26, 38, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8a6a48';
      ctx.fill();
      outline(ctx, lw - 1);
      ctx.beginPath();
      ctx.arc(0, 2, 26, Math.PI, 0);
      ctx.lineTo(26, 22);
      ctx.lineTo(-26, 22);
      ctx.closePath();
      ctx.fillStyle = '#5e4a3a';
      ctx.fill();
      outline(ctx, lw);
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * 24, 16, 10, 7, sx * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#e8c0a8';
        ctx.fill();
        outline(ctx, 3);
      }
      ctx.beginPath();
      ctx.arc(0, 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f0a0a0';
      ctx.fill();
      outline(ctx, 2.5);
      eyes(ctx, -9, 9, -8, 3.5);
      break;
    }
    case 'crow': {
      // 까마귀: 검은 몸통, 노란 부리, 퍼덕이는 날개
      const f = Math.sin(t / 140) * 0.3;
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.scale(sx, 1);
        ctx.rotate(f);
        ctx.beginPath();
        ctx.moveTo(8, -2); ctx.lineTo(40, -14); ctx.lineTo(34, 6); ctx.lineTo(16, 12);
        ctx.closePath();
        ctx.fillStyle = '#2e2e3a';
        ctx.fill();
        outline(ctx, lw - 1);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 22, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#3a3a4a';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(-5, -6); ctx.lineTo(0, 6); ctx.lineTo(5, -6);
      ctx.closePath();
      ctx.fillStyle = '#f0c040';
      ctx.fill();
      outline(ctx, 2.5);
      eyes(ctx, -8, 8, -12, 4);
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, lw);
    }
  }
}

function drawObj(ctx: CanvasRenderingContext2D, id: string, t: number, lw: number) {
  switch (id) {
    case 'forge': {
      const g = 0.6 + 0.4 * Math.sin(t / 300);
      ctx.beginPath();
      ctx.arc(0, 10, 36, Math.PI, 0);
      ctx.fillStyle = `rgba(255,140,40,${0.25 * g})`;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-34, -6); ctx.lineTo(30, -6); ctx.lineTo(38, -16); ctx.lineTo(38, -2); ctx.lineTo(20, 6); ctx.lineTo(12, 6); ctx.lineTo(16, 26); ctx.lineTo(-16, 26); ctx.lineTo(-12, 6); ctx.lineTo(-26, 6);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      break;
    }
    case 'shop': {
      ctx.beginPath();
      ctx.moveTo(-24, -10); ctx.quadraticCurveTo(-30, 32, 0, 32); ctx.quadraticCurveTo(30, 32, 24, -10); ctx.closePath();
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(-14, -10); ctx.lineTo(-18, -24); ctx.lineTo(18, -24); ctx.lineTo(14, -10);
      outline(ctx, lw);
      ctx.fillStyle = '#e6c25a';
      ctx.beginPath();
      ctx.arc(0, 12, 8, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 3);
      break;
    }
    case 'board': {
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(-32, -30, 64, 46);
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(-32, -30, 64, 46);
      ctx.fillRect(-4, 16, 8, 18);
      ctx.fillStyle = PAPER;
      ctx.fillRect(-24, -22, 18, 22);
      ctx.fillRect(4, -24, 20, 16);
      ctx.fillRect(2, -4, 16, 14);
      break;
    }
    case 'inn': {
      ctx.beginPath();
      ctx.moveTo(-36, -4); ctx.lineTo(0, -34); ctx.lineTo(36, -4); ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.fillRect(-26, -4, 52, 36);
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(-26, -4, 52, 36);
      ctx.fillStyle = '#e6a64a';
      ctx.fillRect(-8, 10, 16, 22);
      break;
    }
    case 'record': {
      ctx.beginPath();
      ctx.roundRect(-26, -38, 52, 76, 8);
      ctx.fillStyle = '#cfcac0';
      ctx.fill();
      outline(ctx, lw);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (let y = -26; y < 30; y += 8) {
        ctx.beginPath();
        ctx.moveTo(-16, y);
        ctx.lineTo(16 - ((y * 7) % 12), y);
        ctx.stroke();
      }
      break;
    }
    case 'herb': {
      const sway = Math.sin(t / 400) * 4;
      ctx.strokeStyle = '#6a8a3a';
      ctx.lineWidth = 5;
      for (const x of [-14, -4, 6, 16]) {
        ctx.beginPath();
        ctx.moveTo(x, 26);
        ctx.quadraticCurveTo(x + sway, 0, x + sway * 2, -14 + Math.abs(x) * 0.4);
        ctx.stroke();
      }
      break;
    }
    case 'sheep': {
      const b = Math.abs(Math.sin(t / 500)) * 3;
      ctx.translate(0, -b);
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * 18 + 10, Math.sin(a) * 12 + 4);
        ctx.arc(Math.cos(a) * 18, Math.sin(a) * 12 + 4, 10, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 4, 24, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, 3);
      ctx.beginPath();
      ctx.ellipse(-26, -2, 10, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      break;
    }
    case 'shrine': {
      ctx.beginPath();
      ctx.moveTo(-28, 34); ctx.lineTo(-28, -10); ctx.arc(0, -10, 28, Math.PI, 0); ctx.lineTo(28, 34);
      ctx.fillStyle = PAPER;
      ctx.fill();
      outline(ctx, lw);
      ctx.strokeStyle = '#e6c25a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-12, -8); ctx.lineTo(12, 20); ctx.moveTo(12, -8); ctx.lineTo(-12, 20);
      ctx.stroke();
      break;
    }
    case 'puzzle': {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 ? INK : PAPER;
        ctx.fillRect(-28 + x * 14, -28 + y * 14, 14, 14);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(-28, -28, 56, 56);
      ctx.fillStyle = '#e6c25a';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', 22, -22);
      break;
    }
    case 'fire': {
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(-26, 20, 52, 8);
      const f = Math.sin(t / 120) * 3;
      ctx.beginPath();
      ctx.moveTo(-18, 22); ctx.quadraticCurveTo(-22 + f, -4, 0, -30 - f); ctx.quadraticCurveTo(22 - f, -4, 18, 22);
      ctx.closePath();
      ctx.fillStyle = '#e8743a';
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(-8, 22); ctx.quadraticCurveTo(-8, 4, 0, -8 + f); ctx.quadraticCurveTo(8, 4, 8, 22);
      ctx.fillStyle = '#ffe08a';
      ctx.fill();
      break;
    }
    case 'stone':
    case 'altar':
    case 'gate': {
      const lit = 0.5 + 0.5 * Math.sin(t / 400);
      if (id === 'gate') {
        ctx.beginPath();
        ctx.moveTo(-30, 34); ctx.lineTo(-30, -10); ctx.arc(0, -10, 30, Math.PI, 0); ctx.lineTo(30, 34);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-18, 34); ctx.lineTo(-18, -8); ctx.arc(0, -8, 18, Math.PI, 0); ctx.lineTo(18, 34);
        ctx.fillStyle = `rgba(185,160,224,${0.4 + 0.4 * lit})`;
        ctx.fill();
      } else if (id === 'altar') {
        ctx.fillStyle = PAPER;
        ctx.fillRect(-30, 0, 60, 30);
        ctx.strokeStyle = INK;
        ctx.lineWidth = lw;
        ctx.strokeRect(-30, 0, 60, 30);
        ctx.beginPath();
        ctx.moveTo(-10, 0); ctx.lineTo(-4, 14); ctx.lineTo(4, 8); ctx.lineTo(10, 30);
        ctx.stroke();
        ctx.fillStyle = `rgba(230,194,90,${0.5 + 0.5 * lit})`;
        ctx.beginPath();
        ctx.arc(0, -10, 8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(-18, -34, 36, 68, [16, 16, 4, 4]);
        ctx.fillStyle = '#c8ccc8';
        ctx.fill();
        outline(ctx, lw);
        ctx.fillStyle = `rgba(120,200,190,${0.4 + 0.5 * lit})`;
        ctx.fillRect(-4, -20, 8, 30);
      }
      break;
    }
    case 'event': {
      // 떠도는 사건: 떠오른 두루마리에 물음표
      const bob = Math.sin(t / 380) * 4;
      ctx.translate(0, bob);
      ctx.fillStyle = 'rgba(255,214,90,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 34 + Math.sin(t / 250) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.roundRect(-22, -26, 44, 50, 8);
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = INK;
      ctx.font = 'bold 40px "IBM Plex Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 1);
      break;
    }
    case 'chest': {
      ctx.fillStyle = '#8a6a44';
      ctx.fillRect(-28, -10, 56, 36);
      ctx.beginPath();
      ctx.moveTo(-28, -10); ctx.quadraticCurveTo(0, -34, 28, -10); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw;
      ctx.strokeRect(-28, -10, 56, 36);
      ctx.fillStyle = '#e6c25a';
      ctx.fillRect(-5, -4, 10, 12);
      break;
    }
  }
}

/** 대화창 초상화: 말 그림을 크게 그린 이미지 주소 */
/**
 * 대화창 초상화. 말 그림 원본은 128px이라 그냥 늘리면 뭉개진다.
 * 말 그림은 몇 가지 단색(검정 테두리·흰 몸통 등)으로 된 평면 그림이므로,
 * 매끄럽게 키운 뒤 "색이 바뀌는 경계선"만 다시 날카롭게 그어 준다
 * (= 윤곽선을 따서 벡터로 다시 칠한 것과 같은 결과, 디자인은 원본 그대로).
 */
export function portraitUrl(sprite: string, _npcId?: string, size = 768): string {
  // 몬스터(컬러 그림): 원본 해상도 그대로 놓고 키운다 (판 위 크기로 줄여 그리면 화질을 절반 넘게 잃는다)
  if (sprite.startsWith('m:')) {
    const id = sprite.slice(2);
    const art = artCanvas(`m:${ALIAS[id] ?? id}`);
    if (art) return artPortrait(art, size);
  }
  const base = 160;
  const src = document.createElement('canvas');
  src.width = src.height = base;
  drawSprite(src.getContext('2d')!, sprite, base / 2, base / 2 + base * 0.05, base, 0);
  const pal = palette(src);
  // 2배씩 단계적으로 키워 경계가 고르게 번진 "높이 지도"를 만든다
  let c = src;
  let n = base;
  while (n < size) {
    const m = Math.min(size, n * 2);
    const d = document.createElement('canvas');
    d.width = d.height = m;
    const x = d.getContext('2d')!;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, m, m);
    c = d;
    n = m;
  }
  // 단색 체스 말 그림에만 (몬스터 같은 컬러 그림은 색을 몇 개로 줄이면 뭉개진다)
  if (sprite.startsWith('p:') && pal.length) recontour(c, pal);
  return c.toDataURL('image/png');
}

/**
 * 컬러 그림 초상화: 원본을 바닥 쪽에 맞춰 놓고 2배씩 키운 뒤,
 * 외곽(투명 경계)을 또렷하게 자르고 색 경계에 언샤프 마스크를 걸어 흐림을 줄인다.
 */
function artPortrait(art: HTMLCanvasElement, size: number): string {
  const pad = Math.round(Math.max(art.width, art.height) * 0.08);
  const side = Math.max(art.width, art.height) + pad * 2;
  let c = document.createElement('canvas');
  c.width = c.height = side;
  c.getContext('2d')!.drawImage(art, (side - art.width) / 2, side - pad - art.height);
  let n = side;
  while (n < size) {
    const m = Math.min(size, n * 2);
    const d = document.createElement('canvas');
    d.width = d.height = m;
    const x = d.getContext('2d')!;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, m, m);
    c = d;
    n = m;
  }
  crispen(c, Math.max(1, Math.round(n / side)));
  return c.toDataURL('image/png');
}

/** 외곽선 자르기 + 언샤프 마스크 (반경 r 픽셀 상자 흐림 대비) */
function crispen(c: HTMLCanvasElement, r: number) {
  const x = c.getContext('2d')!;
  const { width: w, height: hh } = c;
  const img = x.getImageData(0, 0, w, hh);
  const s = img.data;
  const src = new Uint8ClampedArray(s);
  // 가로·세로 상자 흐림 (적분 없이 단순 이동 평균)
  const blur = new Float32Array(w * hh * 3);
  const tmp = new Float32Array(w * hh * 3);
  for (let y = 0; y < hh; y++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[(y * w + Math.min(w - 1, Math.max(0, i))) * 4 + ch];
      for (let i = 0; i < w; i++) {
        tmp[(y * w + i) * 3 + ch] = acc / (2 * r + 1);
        const out = Math.max(0, i - r);
        const inn = Math.min(w - 1, i + r + 1);
        acc += src[(y * w + inn) * 4 + ch] - src[(y * w + out) * 4 + ch];
      }
    }
  }
  for (let i = 0; i < w; i++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(Math.min(hh - 1, Math.max(0, k)) * w + i) * 3 + ch];
      for (let y = 0; y < hh; y++) {
        blur[(y * w + i) * 3 + ch] = acc / (2 * r + 1);
        const out = Math.max(0, y - r);
        const inn = Math.min(hh - 1, y + r + 1);
        acc += tmp[(inn * w + i) * 3 + ch] - tmp[(out * w + i) * 3 + ch];
      }
    }
  }
  const amt = 0.9;
  for (let p = 0, q = 0; p < s.length; p += 4, q += 3) {
    const a = src[p + 3] / 255;
    if (a === 0) continue;
    s[p + 3] = Math.round(sstep(0.3, 0.7, a) * 255); // 실루엣을 또렷하게
    for (let ch = 0; ch < 3; ch++) s[p + ch] = src[p + ch] + (src[p + ch] - blur[q + ch]) * amt;
  }
  x.putImageData(img, 0, 0);
}

interface PalC { l: number; r: number; g: number; b: number }
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 원본에서 실제로 쓰인 단색들 (밝기 히스토그램의 봉우리) */
function palette(c: HTMLCanvasElement): PalC[] {
  const s = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const B = 32;
  const cnt = new Array(B).fill(0);
  const sum = Array.from({ length: B }, () => [0, 0, 0]);
  let total = 0;
  for (let p = 0; p < s.length; p += 4) {
    if (s[p + 3] < 230) continue;
    const k = Math.min(B - 1, Math.floor((lum(s[p], s[p + 1], s[p + 2]) / 256) * B));
    cnt[k]++;
    sum[k][0] += s[p]; sum[k][1] += s[p + 1]; sum[k][2] += s[p + 2];
    total++;
  }
  const out: PalC[] = [];
  for (let k = 0; k < B; k++) {
    const peak = cnt[k] > total * 0.04 && cnt[k] >= (cnt[k - 1] ?? 0) && cnt[k] >= (cnt[k + 1] ?? 0);
    if (!peak) continue;
    const r = sum[k][0] / cnt[k], g = sum[k][1] / cnt[k], b = sum[k][2] / cnt[k];
    out.push({ l: lum(r, g, b), r, g, b });
  }
  return out.sort((a, b) => a.l - b.l);
}

/** 번진 경계를 원래 색들 사이의 날카로운 경계로 되돌린다 (가장자리는 1~2px만 부드럽게) */
function recontour(c: HTMLCanvasElement, pal: PalC[]) {
  const x = c.getContext('2d')!;
  const img = x.getImageData(0, 0, c.width, c.height);
  const s = img.data;
  for (let p = 0; p < s.length; p += 4) {
    const a = s[p + 3] / 255;
    if (a === 0) continue;
    // 투명 경계: 절반 지점에서 잘라 매끈한 외곽선
    s[p + 3] = Math.round(sstep(0.38, 0.62, a) * 255);
    const L = lum(s[p], s[p + 1], s[p + 2]);
    let col: PalC;
    if (pal.length === 1 || L <= pal[0].l) col = pal[0];
    else if (L >= pal[pal.length - 1].l) col = pal[pal.length - 1];
    else {
      let i = 0;
      while (i < pal.length - 2 && L > pal[i + 1].l) i++;
      const lo = pal[i], hi = pal[i + 1];
      const t = sstep(0.4, 0.6, (L - lo.l) / Math.max(1, hi.l - lo.l));
      col = { l: 0, r: lo.r + (hi.r - lo.r) * t, g: lo.g + (hi.g - lo.g) * t, b: lo.b + (hi.b - lo.b) * t };
    }
    s[p] = col.r; s[p + 1] = col.g; s[p + 2] = col.b;
  }
  x.putImageData(img, 0, 0);
}
