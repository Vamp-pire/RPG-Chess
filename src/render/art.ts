import { BASE_LIST } from '../data/gear';
// Canva에서 만든 그림 불러오기: 흰 배경을 가장자리부터 지워 투명하게 만든 뒤 잘라 둔다.
// 파일이 없으면 코드로 그린 임시 도형을 그대로 쓴다.
const MOBS = ['slime', 'rat', 'bat', 'golem', 'thorn', 'hound', 'strawking', 'strawpawn', 'toad', 'spider', 'skeleton', 'wraith', 'bonelord', 'misqueen', 'blunder',
  'wolf', 'icesprite', 'snowpawn', 'frostbishop', 'tower', 'giant', 'frozenking', 'inkblot', 'erased', 'annot', 'bookworm', 'double', 'author',
  // 장비 개편 새 몹 (캔바로 만든 그림)
  'hopper', 'mole', 'crow', 'snake', 'turtle', 'statue', 'cannon', 'bear', 'rabbit', 'smudge', 'brilliant', 'number'];
const MATS = ['gel', 'tooth', 'wing', 'moss', 'thorn', 'fiber', 'pearl', 'silver', 'crack', 'fang', 'shard', 'crown', 'skin', 'silk', 'bone', 'ecto', 'mirror', 'blunder', 'qcrown', 'fogkey', 'trigger',
  'fur', 'frost', 'ice', 'tusk', 'kcrown', 'ink', 'page', 'quill', 'lastword'];
/** 마을 건물 (없으면 코드 도형) */
const OBJS = ['forge', 'shop', 'inn', 'board', 'record', 'puzzle', 'smith', 'peddler'];
/** 장비 그림 (밑판 id, 캔바로 만든 것만 — 없으면 부위 이모지) */
export const GEAR_ART = new Set(BASE_LIST.map((b) => b.id));
export const ALIAS: Record<string, string> = { slimelet: 'slime', echo: 'misqueen', inkdrop: 'inkblot' };

const canvases = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

export const artCanvas = (k: string) => canvases.get(k) ?? null;
/** 도감·대장간의 <img>용 주소. 처음 필요할 때 만든다 (시작할 때 66장을 다 변환하면 첫 화면이 늦어짐) */
export const artUrl = (k: string) => {
  if (!urls.has(k)) {
    const c = canvases.get(k);
    if (!c) return null;
    urls.set(k, c.toDataURL('image/png'));
  }
  return urls.get(k)!;
};

function cutout(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const light = (i: number) => px[i] > 222 && px[i + 1] > 222 && px[i + 2] > 222;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!light(i)) continue;
    px[i + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // 경계의 밝은 픽셀은 반투명하게 (계단 현상 완화)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (px[i + 3] === 0) continue;
      const nearClear = px[(p - 1) * 4 + 3] === 0 || px[(p + 1) * 4 + 3] === 0 || px[(p - w) * 4 + 3] === 0 || px[(p + w) * 4 + 3] === 0;
      if (!nearClear) continue;
      const m = Math.min(px[i], px[i + 1], px[i + 2]);
      if (m > 170) px[i + 3] = Math.max(0, Math.min(255, (255 - m) * 3));
    }
  }
  ctx.putImageData(data, 0, 0);
  // 내용이 있는 부분만 잘라 낸다
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= 20) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 <= x0 || y1 <= y0) return c;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function loadOne(key: string, src: string): Promise<void> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        canvases.set(key, cutout(img));
      } catch { /* 처리 실패 시 임시 도형 사용 */ }
      res();
    };
    img.onerror = () => res();
    img.src = src;
  });
}

export function loadArt(): Promise<void> {
  return Promise.all([
    ...MOBS.map((m) => loadOne(`m:${m}`, `art/mobs/${m}.jpg`)),
    ...MATS.map((m) => loadOne(`mat:${m}`, `art/mats/${m}.jpg`)),
    ...OBJS.map((o) => loadOne(`o:${o}`, `art/objs/${o}.jpg`)),
    ...[...GEAR_ART].map((g) => loadOne(`g:${g}`, `art/gear/${g}.jpg`)),
  ]).then(() => {});
}

/**
 * 고화질 몬스터 그림 (Canva 원본을 512px로 받은 것, art/mobs_hd).
 * 첫 화면은 200px 그림으로 빨리 띄우고, 그 뒤 한 장씩 불러와 같은 열쇠(m:이름)를 고화질로 바꿔 끼운다.
 * 대화 초상화·판 위 몬스터·도감·트레일러가 모두 자동으로 고화질을 쓴다.
 */
let hdStarted: Promise<void> | null = null;
export function loadArtHD(): Promise<void> {
  hdStarted ??= (async () => {
    for (const m of MOBS) {
      await new Promise<void>((res) => {
        const img = new Image();
        img.onload = () => {
          try {
            canvases.set(`m:${m}`, cutout(img));
            urls.delete(`m:${m}`);
          } catch { /* 실패하면 200px 그림을 그대로 쓴다 */ }
          res();
        };
        img.onerror = () => res();
        img.src = `art/mobs_hd/${m}.jpg`;
      });
      // 한 장씩 처리하며 숨 돌리기 (화면이 버벅이지 않게)
      await new Promise((r) => setTimeout(r, 0));
    }
  })();
  return hdStarted;
}
