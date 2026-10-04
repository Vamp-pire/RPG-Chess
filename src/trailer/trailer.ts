// 트레일러 v2: 모든 장면을 게임 판 위에서 연출하고, 카메라(확대·이동·줌 펀치)로 찍는다.
// 효과(재료·망치질·강화·콤보)는 전부 게임의 판 좌표 이펙트 → 화면에 덧붙인 느낌이 나지 않게.
// 작업 캔버스(#work, 3200x1800)에 판을 크게 그리고, 카메라가 그 일부를 1280x720으로 담는다.
// 스포일러 금지: 보스 이름·정체, 비밀 지역, 숨은 무기, 엔딩은 넣지 않는다.
import { fx } from '../render/fx';
import { Ent, Renderer, Scene, TileKind, mkEnt } from '../render/board';
import { drawSprite, loadPieceImages } from '../render/sprites';
import { loadArt, loadArtHD } from '../render/art';
import { death, hitFx, lunge, moveEnt, popIn, squash } from '../render/anim';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { Biome } from '../data/areas';

const W = 1280;
const H = 720;
const FPS = 30;
const DUR = 28.5;
const out = document.getElementById('out') as HTMLCanvasElement;
const ctx = out.getContext('2d')!;
const work = document.getElementById('board') as HTMLCanvasElement;
const R = new Renderer(work);
const status = document.getElementById('status')!;

// ---------------- 상태 ----------------
let scene: Scene | null = null;
let tiles: TileKind[][] = [];
let now = 0;
let caption: { text: string; t0: number; big?: boolean } | null = null;
let titleT = -1;
let blackout = 0; // 화면을 덮는 어둠 (컷 전환용)
let dark = 0; // 판의 조명 (보스·제목에서 어둡게)
let tint = ''; // 장면 색조
// 카메라: 판 좌표 (x, y)를 화면 가운데에, z = 화면 세로에 보이는 칸 수
const cam = { x: 4, y: 4, z: 8, tx: 4, ty: 4, tz: 8, ease: 0.08, punch: 0, shake: 0 };
const camTo = (x: number, y: number, z: number, ease = 0.08) => { cam.tx = x; cam.ty = y; cam.tz = z; cam.ease = ease; };
const camCut = (x: number, y: number, z: number) => { cam.x = cam.tx = x; cam.y = cam.ty = y; cam.z = cam.tz = z; };
const punch = (p = 0.12, sh = 0) => { cam.punch = Math.max(cam.punch, p); cam.shake = Math.max(cam.shake, sh); };
const say = (text: string, big = false) => { caption = { text, t0: now, big }; };

function board(biome: Biome, w: number, h: number, walls: [number, number][] = [], extra: Partial<Record<TileKind, [number, number][]>> = {}): Scene {
  tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => 'floor' as TileKind));
  for (const [x, y] of walls) tiles[y][x] = 'wall';
  for (const [k, list] of Object.entries(extra) as [TileKind, [number, number][]][]) for (const [x, y] of list) tiles[y][x] = k;
  scene = { w, h, biome, tile: (x, y) => tiles[y][x], ents: [], marks: [], arrows: [] };
  fx.clear();
  return scene;
}
const ent = (id: string, sprite: string, x: number, y: number, extra: Partial<Ent> = {}) => {
  const e = mkEnt(id, sprite, x, y, { bob: sprite.startsWith('m:'), ...extra });
  scene!.ents.push(e);
  return e;
};
const find = (id: string) => scene!.ents.find((e) => e.id === id)!;
const remove = (id: string) => { scene!.ents = scene!.ents.filter((e) => e.id !== id); };

let combo = 0;
/** 달려들어 치고 쓰러뜨린 뒤 그 칸으로 */
/** 부딪히는 순간까지 걸리는 시간(초): 박자에 맞추려면 이만큼 먼저 출발한다 */
const STRIKE_LEAD = 0.23; // 웅크림 2프레임 + 돌진 4프레임 (30fps)
/** 웅크렸다가 대상 칸으로 곧장 돌진해 친다. 부딪히는 순간에 소리·효과 (약 0.2초 + 마무리) */
async function strike(heroId: string, targetId: string, dmg: number, color = '#ff5a4a') {
  const hh = find(heroId);
  const t = find(targetId);
  const x0 = hh.x;
  const y0 = hh.y;
  const dx = t.x - x0;
  const dy = t.y - y0;
  const d = Math.hypot(dx, dy) || 1;
  await fx.tween(60, (p) => { hh.x = x0 - (dx / d) * 0.14 * p; hh.y = y0 - (dy / d) * 0.14 * p; });
  await fx.tween(130, (p) => { hh.x = x0 + dx * p; hh.y = y0 + dy * p; hh.z = Math.sin(Math.PI * p) * 0.25; });
  hh.x = t.x;
  hh.y = t.y;
  hh.z = 0;
  // 부딪히는 순간
  sfxAt('hit');
  hitFx(t, dmg, color);
  punch(0.14, 8);
  combo++;
  fx.burst(t.x + 0.5, t.y + 0.5, color, 18, { speed: 3.2 });
  if (combo > 1) fx.text(t.x + 0.5, t.y - 0.2, `${combo} COMBO`, '#ffd65a', true);
  void death(t, t.sprite.split(':')[1] ?? targetId).then(() => remove(targetId));
  void squash(hh); // 눌림은 기다리지 않는다 (다음 박자의 출발을 밀지 않게)
}

// 영상 시각 t초가 될 때까지 기다린다 (프레임 단위로 step에서 풀어 줌)
let waiters: { t: number; r: () => void }[] = [];
const until = (t: number) => new Promise<void>((r) => { if (now >= t) r(); else waiters.push({ t, r }); });

// ---------------- 소리 시점 ----------------
const SFX: { t: number; k: string }[] = [];
const sfxAt = (k: string) => SFX.push({ t: now, k });

// ---------------- 타임라인 (120BPM → 0.5초 박자에 맞춘다) ----------------
interface Ev { t: number; fn: () => void; done?: boolean }
let EVENTS: Ev[] = [];
function timeline(): Ev[] {
  const E: Ev[] = [];
  const at = (t: number, fn: () => void) => E.push({ t, fn });

  // 1) 어둠 속 말 하나 (0~3): 떨어져 박히고, 판이 깨어난다
  at(0, () => {
    board('meadow', 8, 8);
    ent('hero', 'p:wp', 3, 3, { alpha: 0 });
    dark = 0.85;
    blackout = 1;
    camCut(3.5, 3.5, 2.8);
    camTo(3.5, 3.6, 4.0, 0.012);
  });
  at(0.3, () => { blackout = 0; });
  at(0.9, () => {
    const hh = find('hero');
    hh.alpha = 1;
    void fx.tween(380, (p) => { hh.z = 2.2 * (1 - p) * (1 - p); }).then(() => {
      punch(0.22, 12);
      fx.burst(3.5, 3.8, '#f0d27a', 50, { speed: 4.5, life: 1000 });
      sfxAt('boom');
    });
  });
  at(1.3, () => { void fx.tween(1200, (p) => { dark = 0.85 - 0.45 * p; }); });
  at(1.5, () => say('체스 말 하나.'));

  // 2) 탐험 (3~6): 카메라가 걸음을 따라간다
  at(3.0, () => {
    board('meadow', 8, 8, [[1, 2], [6, 6], [3, 6]]);
    ent('herb', 'o:herb', 6, 0);
    ent('s1', 'm:slime', 6, 2);
    ent('s2', 'm:rat', 2, 1);
    ent('s3', 'm:bat', 6, 5);
    ent('hero', 'p:wp', 1, 6);
    dark = 0;
    camCut(1.8, 6, 4.2);
    sfxAt('whoosh');
    say('정해진 수를 벗어나, 어디로든.');
  });
  const path: [number, number][] = [[2, 5], [3, 4], [4, 4], [5, 3]];
  path.forEach((p, i) => at(3.5 + i * 0.5, () => { void moveEnt(find('hero'), p); camTo(p[0] + 0.5, p[1] + 0.3, 4.4 - i * 0.2, 0.1); sfxAt('step'); }));
  at(5.5, () => { fx.text(6.5, 1.7, '!', '#ff5a4a', true); camTo(5.8, 2.8, 3.4, 0.14); punch(0.08); sfxAt('tick'); });

  // 3) 대장간 (6~9.5): 재료가 판 위를 날아 대장간 칸으로 — 9칸 판의 정가운데, 모든 배치를 좌우 대칭으로
  at(6.0, () => {
    board('town', 9, 7, [[0, 0], [8, 0], [0, 6], [8, 6]]);
    ent('forge', 'o:forge', 4, 3, { plate: true });
    camCut(4.5, 3.5, 5);
    camTo(4.5, 3.5, 4.4, 0.035);
    sfxAt('whoosh');
    say('재료를 섞어, 움직임을 벼린다.');
  });
  const mats: [string, number, number][] = [['gel', 4, 0], ['moss', 7, 1], ['tooth', 7, 5], ['wing', 4, 6], ['fang', 1, 5], ['silk', 1, 1]];
  mats.forEach(([m, x, y], i) => at(6.25 + i * 0.13, () => {
    const e = ent(`mat${i}`, `mat:${m}`, x, y);
    void popIn(e);
    void fx.wait(260).then(() => moveEnt(e, [4, 3])).then(() => {
      remove(`mat${i}`);
      fx.burst(4.5, 3.5, '#ffb060', 8, { speed: 2 });
    });
    sfxAt('tick');
  }));
  [7.5, 8.0, 8.5].forEach((t, i) => at(t, () => {
    const last = i === 2;
    void squash(find('forge'));
    punch(last ? 0.24 : 0.12, last ? 16 : 8);
    fx.burst(4.5, 3.5, last ? '#ffd65a' : '#ff9a3a', last ? 70 : 28, { speed: last ? 5.5 : 3.4, life: 900 });
    // 쾅!(왼쪽) 쾅!(오른쪽) 완벽!(가운데 위)
    const [tx, ty] = ([[3.4, 2.7], [5.6, 2.7], [4.5, 2.1]] as const)[i];
    fx.text(tx, ty, last ? '완벽!' : '쾅!', last ? '#ffd65a' : '#ff9a3a', true);
    sfxAt(last ? 'perfect' : 'hammer');
  }));
  // 완성품: 주인공 말과 헷갈리지 않게 빛나는 재료(송곳니)로
  at(8.9, () => {
    remove('forge');
    const w = ent('weapon', 'mat:fang', 4, 3, { glow: 'rgba(255,214,90,0.9)' });
    void popIn(w);
    sfxAt('chord');
  });

  // 4) 강화 연타 (9.5~11): 박자마다 줌 펀치. 자막은 아래, +1 +2 +3은 완성품 위에 좌·중·우
  at(9.5, () => say('강화! 강화! 강화!'));
  [9.5, 10.0, 10.5].forEach((t, i) => at(t, () => {
    fx.text(4.5 + (i - 1) * 0.9, 2.3, `+${i + 1}`, '#ffd65a', true);
    fx.burst(4.5, 3.5, '#ffd65a', 30 + i * 25, { speed: 3 + i, life: 800 });
    punch(0.16 + i * 0.06, 6 + i * 5);
    camTo(4.5, 3.3, 4.0 - i * 0.3, 0.2);
    sfxAt('up');
  }));

  // 5) 연속 처치 (11~15): 박자마다 한 마리
  at(11.0, () => {
    board('forest', 7, 7, [[0, 0], [6, 0]], { bush: [[1, 5], [5, 5]], high: [[3, 5]] });
    // 폰답게 대각선으로만 잡아 나간다: (3,5)→(2,4)→(3,3)→(2,2)→(3,1)→(4,0)
    ent('e1', 'm:slime', 2, 4);
    ent('e2', 'm:rat', 3, 3);
    ent('e3', 'm:bat', 2, 2);
    ent('e4', 'm:skeleton', 3, 1);
    ent('e5', 'm:golem', 4, 0);
    ent('hero', 'p:wp', 3, 5);
    combo = 0;
    camCut(3, 4.6, 4.4);
    sfxAt('whoosh');
    say('한 수, 또 한 수.');
  });
  // 한 번 치는 데 박자(0.5초)보다 짧게 끝나도록 하고, 앞 공격이 끝나야 다음 공격을 시작한다
  const tg: [string, number, number][] = [['e1', 2, 4], ['e2', 3, 3], ['e3', 2, 2], ['e4', 3, 1], ['e5', 4, 0]];
  at(11.5 - STRIKE_LEAD - 0.05, () => void (async () => {
    for (let i = 0; i < tg.length; i++) {
      const [id, x, y] = tg[i];
      await until(11.5 + i * 0.5 - STRIKE_LEAD); // 부딪히는 순간이 정확히 박자 위에
      camTo(x + 0.5, y + 1.2, 3.6 - i * 0.12, 0.2);
      await strike('hero', id, i === 4 ? 3 : 2);
    }
  })());
  at(14.2, () => { fx.text(3.5, 1.0, '5 연속 처치!', '#ffd65a', true); camTo(3.5, 2.5, 5, 0.12); punch(0.2, 10); sfxAt('win'); });

  // 6) 빛나는 개체 (15~16.5)
  at(15.0, () => {
    const s = ent('shiny', 'm:wolf', 5, 1, { glow: 'rgba(255,214,90,0.75)' });
    void popIn(s);
    fx.burst(5.5, 2.5, '#ffd65a', 30, { speed: 4 });
    fx.text(5.5, 1.5, '빛나는 개체!', '#ffd65a', true);
    camTo(5, 2.2, 3.2, 0.2);
    sfxAt('chime');
  });
  at(16.03 - STRIKE_LEAD, () => { void strike('hero', 'shiny', 4, '#ffd65a'); });
  at(16.25, () => { fx.burst(5.5, 1.5, '#ffd65a', 90, { speed: 5, life: 1100 }); punch(0.15, 8); sfxAt('coins'); });

  // 7) 지역 몽타주 (16.5~19.5): 0.75초 컷, 카메라는 계속 미끄러진다
  at(16.5, () => {
    board('marsh', 8, 8, [], { water: [[2, 2], [3, 2], [2, 3], [5, 5], [6, 5]] });
    ent('t1', 'm:toad', 5, 2); ent('t2', 'm:spider', 2, 5); ent('t3', 'm:wraith', 6, 1); ent('hero', 'p:wp', 4, 6);
    camCut(2.5, 4, 4.6); camTo(5, 3.5, 4.2, 0.05); sfxAt('whoosh');
    say('늪을 지나, 눈보라 너머로.');
  });
  at(16.9, () => { void moveEnt(find('t1'), [5, 4]); sfxAt('step'); });
  at(17.25, () => {
    board('tundra', 8, 8, [[2, 2], [5, 5]], { ice: [[3, 4], [4, 4], [4, 3]] });
    ent('w1', 'm:wolf', 2, 1); ent('w2', 'm:wolf', 5, 1); ent('i1', 'm:icesprite', 6, 3); ent('hero', 'p:wp', 3, 6);
    camCut(5.5, 2.5, 4.6); camTo(3.5, 3.5, 4.2, 0.05); sfxAt('whoosh');
  });
  at(17.6, () => { void moveEnt(find('w1'), [3, 3]); void moveEnt(find('w2'), [4, 3]); sfxAt('step'); });
  at(18.0, () => {
    board('fold', 8, 8, [[3, 0], [3, 1], [4, 6], [4, 7]]);
    ent('k1', 'm:inkblot', 2, 3); ent('k2', 'm:annot', 5, 2); ent('k3', 'm:bookworm', 6, 5); ent('hero', 'p:wp', 1, 6);
    camCut(4, 5.5, 4.6); camTo(4, 2.5, 4.2, 0.05); sfxAt('whoosh');
  });
  at(18.4, () => { void moveEnt(find('k1'), [2, 4]); sfxAt('step'); });
  at(18.75, () => {
    board('glacier', 8, 8, [[1, 1], [6, 6]], { ice: [[2, 4], [5, 4], [3, 3]] });
    ent('b1', 'm:frostbishop', 5, 1); ent('b2', 'm:giant', 2, 1); ent('hero', 'p:wp', 4, 6);
    camCut(4, 2, 4.6); camTo(4, 4, 4.0, 0.05); sfxAt('whoosh');
  });
  at(19.1, () => { void moveEnt(find('b1'), [3, 3]); sfxAt('step'); });

  // 8) 판이 지워지는 옥좌 (19.5~22.5): 정체는 어둠 속에
  at(19.5, () => {
    board('throne', 7, 7);
    ent('boss', 'p:bk', 3, 1, { glow: 'rgba(220,50,20,0.85)' });
    ent('hero', 'p:wp', 3, 6);
    dark = 0.75;
    tint = 'rgba(110,18,8,0.3)';
    camCut(3.5, 5.5, 4.4);
    camTo(3.5, 3.0, 5.2, 0.025);
    sfxAt('rumble');
  });
  const ring: [number, number][] = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (Math.min(x, y, 6 - x, 6 - y) <= 1 && x !== 3) ring.push([x, y]);
  // 바깥 겹 먼저, 같은 겹 안에서는 위에서부터 시계 방향으로 (좌우가 같은 박자에 사라지게 짝지어 정렬)
  ring.sort((a, b) => Math.min(a[0], a[1], 6 - a[0], 6 - a[1]) - Math.min(b[0], b[1], 6 - b[0], 6 - b[1]) || a[1] - b[1] || Math.abs(a[0] - 3) - Math.abs(b[0] - 3));
  ring.forEach(([x, y], i) => at(19.6 + Math.floor(i / 2) * 0.07, () => {
    if (tiles[y]?.[x] === 'floor') {
      tiles[y][x] = 'void';
      fx.burst(x + 0.5, y + 0.5, '#ff9a3a', 7, { speed: 1.5, grav: -0.2, life: 700 });
      if (i % 4 === 0) sfxAt('crack');
    }
  }));
  at(21.0, () => { say('판을 지우는 왕들.', true); punch(0.26, 18); fx.burst(3.5, 1.5, '#ff5a2a', 60, { speed: 4, life: 1000 }); sfxAt('boom'); });

  // 9) 승급 (22.5~24.5)
  at(22.5, () => {
    caption = null;
    board('meadow', 9, 7);
    ent('hero', 'p:wp', 4, 3, { glow: 'rgba(255,214,90,0.6)' });
    dark = 0.35;
    tint = '';
    camCut(4.5, 3.4, 3.4);
    camTo(4.5, 3.3, 4.4, 0.03);
    sfxAt('rise');
  });
  at(23.0, () => {
    const hh = find('hero');
    void fx.tween(500, (p) => { hh.z = Math.sin(p * Math.PI) * 0.7; });
    void fx.wait(250).then(() => { hh.sprite = 'p:wn'; });
    fx.burst(4.5, 3.5, '#ffd65a', 140, { speed: 6, life: 1300 });
    fx.text(4.5, 2.5, '승급!', '#ffd65a', true);
    punch(0.26, 14);
    void fx.tween(600, (p) => { dark = 0.35 * (1 - p); });
    sfxAt('win');
    say('틀을 넘어, 더 멀리.');
  });

  // 10) 정적 → 제목 (24.5~28.5)
  at(24.5, () => { caption = null; blackout = 1; });
  at(25.0, () => {
    board('meadow', 15, 9);
    ent('hero', 'p:wp', 7, 6);
    dark = 0.72;
    blackout = 0;
    camCut(7.5, 4.5, 6);
    camTo(7.5, 4.8, 7, 0.008);
    titleT = now;
    punch(0.1, 0); // 제목 장면은 흔들지 않는다 (흔들림이 좌우를 어긋나 보이게 함)
    sfxAt('boom');
    sfxAt('chord');
  });
  return E.sort((a, b) => a.t - b.t);
}

// ---------------- 그리기 ----------------
const ease3 = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function drawWorld() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0c0b09';
  ctx.fillRect(0, 0, W, H);
  if (!scene) return;
  R.draw(scene);
  const dpr = work.width / (work.clientWidth || work.width);
  // 카메라: 목표로 부드럽게, 줌 펀치·흔들림은 빠르게 사라진다
  const e = Math.min(1, cam.ease * 2);
  cam.x += (cam.tx - cam.x) * e;
  cam.y += (cam.ty - cam.y) * e;
  cam.z += (cam.tz - cam.z) * e;
  cam.punch *= 0.8;
  cam.shake *= 0.78;
  const z = cam.z * (1 - cam.punch);
  const k = H / (z * R.ts * dpr);
  const hw = (z * W) / H / 2;
  const hh = z / 2;
  const clampAxis = (c: number, half: number, size: number) => (size <= half * 2 ? size / 2 : Math.min(size - half, Math.max(half, c)));
  const vx = clampAxis(cam.x, hw, scene.w);
  const vy = clampAxis(cam.y, hh, scene.h);
  const fxp = (R.ox + vx * R.ts) * dpr;
  const fyp = (R.oy + vy * R.ts) * dpr;
  const sx = (Math.random() - 0.5) * cam.shake;
  const sy = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(k, 0, 0, k, W / 2 - k * fxp + sx, H / 2 - k * fyp + sy);
  ctx.drawImage(work, 0, 0);
  ctx.restore();
}

function drawCaption() {
  if (!caption) return;
  const age = now - caption.t0;
  const life = 1.9;
  if (age > life) return;
  const a = Math.min(1, age / 0.12) * Math.min(1, (life - age) / 0.3);
  const s = age < 0.18 ? 1.12 - (age / 0.18) * 0.12 : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, caption.big ? H * 0.5 : H * 0.84);
  ctx.scale(s, s);
  ctx.font = `700 ${caption.big ? 84 : 54}px 'Gowun Batang', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 26;
  ctx.lineWidth = caption.big ? 10 : 7;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10,6,2,0.85)';
  ctx.strokeText(caption.text, 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = caption.big ? '#ffe7a3' : '#fff6e0';
  ctx.fillText(caption.text, 0, 0);
  ctx.restore();
}

function drawTitle() {
  if (titleT < 0) return;
  const t = now - titleT;
  const p = ease3(t / 0.7);
  ctx.save();
  ctx.globalAlpha = p;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = 1.15 - 0.15 * p;
  ctx.translate(W / 2, H / 2 - 20);
  ctx.scale(s, s);
  ctx.font = "700 112px 'Gowun Batang', serif";
  ctx.shadowColor = 'rgba(240,200,110,0.55)';
  ctx.shadowBlur = 40 * p;
  const g = ctx.createLinearGradient(0, -50, 0, 50);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(1, '#d4a94a');
  ctx.fillStyle = g;
  ctx.fillText('기보 밖의 한 수', 0, 0);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = ease3((t - 0.6) / 0.6);
  ctx.font = "700 30px 'Gowun Batang', serif";
  ctx.fillStyle = '#efe3c8';
  ctx.fillText('체스 말 하나로 떠나는 조합·강화 RPG', 0, 92);
  ctx.restore();
}

function draw() {
  drawWorld();
  if (dark > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.12, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, `rgba(0,0,0,${dark * 0.35})`);
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.96, dark + 0.2)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H); }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  drawCaption();
  drawTitle();
  if (blackout > 0) { ctx.globalAlpha = blackout; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (now > DUR - 0.8) { ctx.globalAlpha = Math.min(1, (now - (DUR - 0.8)) / 0.8); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

async function step(i: number) {
  now = i / FPS;
  for (const e of EVENTS) if (!e.done && e.t <= now) { e.done = true; e.fn(); }
  const due = waiters.filter((w) => w.t <= now);
  waiters = waiters.filter((w) => w.t > now);
  for (const w of due) w.r();
  fx.update(1000 / FPS);
  for (let k = 0; k < 10; k++) await Promise.resolve();
  draw();
}

function reset() {
  EVENTS = timeline();
  waiters = [];
  SFX.length = 0;
  caption = null;
  titleT = -1;
  blackout = 0;
  dark = 0;
  tint = '';
  combo = 0;
  Object.assign(cam, { x: 4, y: 4, z: 8, tx: 4, ty: 4, tz: 8, ease: 0.08, punch: 0, shake: 0 });
  fx.clear();
  scene = null;
}

// ---------------- 소리: 오케스트라풍 RPG (현악·금관·팀파니·합창 + 잔향) ----------------
// D단조, 2초(한 마디)마다 Dm–B♭–F–C. 구간마다 악기가 쌓이고, 정적 뒤 D장조 화음으로 끝난다.
async function renderAudio(): Promise<AudioBuffer> {
  const sr = 48000;
  const ac = new OfflineAudioContext(2, Math.ceil(sr * DUR), sr);
  // 버스 압축 → 음량 보정 → 리미터 (평균 음량을 올리되 0dB를 넘지 않게)
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  const makeup = ac.createGain();
  makeup.gain.value = 1.6;
  const lim = ac.createDynamicsCompressor();
  lim.threshold.value = -4;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.08;
  comp.connect(makeup).connect(lim).connect(ac.destination);
  const dry = ac.createGain();
  dry.gain.value = 0.85;
  dry.connect(comp);
  // 잔향: 지수적으로 줄어드는 스테레오 잡음으로 만든 홀 울림
  const rev = ac.createConvolver();
  const ir = ac.createBuffer(2, sr * 3, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / sr) * 2.3);
  }
  rev.buffer = ir;
  const wet = ac.createGain();
  wet.gain.value = 0.3;
  rev.connect(wet).connect(comp);

  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  interface V { a?: number; r?: number; lp?: number; lp0?: number; det?: number[]; pan?: number; send?: number; bp?: number; glide?: number }
  /** 발진기 여러 개(디튠) → 필터 → 엔벨로프 → 팬 → 원음·잔향 */
  const voice = (type: OscillatorType, f: number, t: number, dur: number, vol: number, o: V = {}) => {
    if (t >= DUR) return;
    const a = o.a ?? 0.01;
    const r = o.r ?? 0.3;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.lp0 ?? o.lp ?? 18000, t);
    if (o.lp0 !== undefined) lp.frequency.exponentialRampToValueAtTime(o.lp ?? 2000, t + Math.max(0.05, a * 1.5));
    let head: AudioNode = lp;
    if (o.bp) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = o.bp; b.Q.value = 0.9; lp.connect(b); head = b; }
    const p = ac.createStereoPanner();
    p.pan.value = o.pan ?? 0;
    head.connect(g).connect(p);
    p.connect(dry);
    const s = ac.createGain();
    s.gain.value = o.send ?? 0.6;
    p.connect(s).connect(rev);
    for (const c of o.det ?? [0]) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      if (o.glide) osc.frequency.exponentialRampToValueAtTime(f * o.glide, t + dur);
      osc.detune.value = c;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  };
  const noise = (t: number, dur: number, vol: number, o: { hp?: number; lp?: number; swell?: boolean; send?: number } = {}) => {
    if (t >= DUR) return;
    const b = ac.createBuffer(1, Math.max(1, Math.floor(sr * dur)), sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const k = i / d.length;
      d[i] = (Math.random() * 2 - 1) * (o.swell ? k * k : Math.pow(1 - k, 2));
    }
    const s = ac.createBufferSource();
    s.buffer = b;
    const f1 = ac.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = o.hp ?? 40;
    const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp ?? 16000;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(f1).connect(f2).connect(g);
    g.connect(dry);
    const sg = ac.createGain(); sg.gain.value = o.send ?? 0.5;
    g.connect(sg).connect(rev);
    s.start(t);
  };
  // 악기
  const strings = (t: number, ns: number[], dur: number, vol: number) => ns.forEach((n, i) => voice('sawtooth', hz(n), t, dur, vol, { a: 0.35, r: 0.5, lp: 1500, det: [-9, 0, 9], pan: (i - 1) * 0.3, send: 0.7 }));
  const stacc = (t: number, n: number, vol: number) => voice('sawtooth', hz(n), t, 0.2, vol, { a: 0.01, r: 0.15, lp: 1800, det: [-6, 6], send: 0.4 });
  const brass = (t: number, ns: number[], dur: number, vol: number) => ns.forEach((n, i) => voice('sawtooth', hz(n), t, dur, vol, { a: 0.06, r: 0.35, lp0: 300, lp: 2200, det: [-5, 5], pan: (i - 1) * 0.2, send: 0.6 }));
  const horn = (t: number, n: number, dur: number, vol: number) => voice('sawtooth', hz(n), t, dur, vol, { a: 0.05, r: 0.2, lp0: 400, lp: 1700, det: [-4, 4], send: 0.7 });
  const choir = (t: number, ns: number[], dur: number, vol: number) => ns.forEach((n, i) => voice('triangle', hz(n), t, dur, vol, { a: 0.8, r: 0.8, lp: 2600, bp: 900, det: [-14, 0, 14], pan: (i - 1) * 0.4, send: 0.9 }));
  const timp = (t: number, vol: number, n = 38) => { voice('sine', hz(n), t, 1.1, vol, { a: 0.005, r: 1.0, glide: 0.96, send: 0.5 }); noise(t, 0.12, vol * 0.4, { lp: 400 }); };
  const taiko = (t: number, vol: number) => { voice('sine', 105, t, 0.55, vol, { a: 0.003, r: 0.5, glide: 0.42, send: 0.4 }); noise(t, 0.08, vol * 0.5, { lp: 900 }); };
  const crash = (t: number, vol: number, dur = 2.2) => noise(t, dur, vol, { hp: 5000, send: 0.7 });
  const swell = (t: number, dur: number, vol: number) => noise(t, dur, vol, { hp: 4500, swell: true, send: 0.6 });
  const glock = (t: number, n: number, vol: number) => { voice('sine', hz(n), t, 0.9, vol, { a: 0.002, r: 0.85, send: 0.8 }); voice('sine', hz(n) * 2.76, t, 0.3, vol * 0.25, { a: 0.002, r: 0.28, send: 0.8 }); };
  const harp = (t: number, ns: number[], step = 0.05, vol = 0.12) => ns.forEach((n, i) => voice('triangle', hz(n), t + i * step, 0.7, vol, { a: 0.003, r: 0.65, lp: 3500, send: 0.8 }));
  const anvil = (t: number, vol: number) => { [1, 2.76, 5.4].forEach((k, i) => voice('sine', 640 * k, t, 0.6 - i * 0.15, vol / (i + 1), { a: 0.001, r: 0.5 - i * 0.12, send: 0.5 })); noise(t, 0.05, vol * 0.8, { hp: 2000 }); };

  // 화성
  const CH = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]; // Dm B♭ F C
  const ROOT = [38, 34, 41, 36];

  // 0~3: 낮은 현과 합창이 깔리고, 팀파니 롤이 착지(약 1.3초)로 몰아친다
  strings(0.05, [38, 45], 3.1, 0.05);
  choir(0.2, [50, 57], 2.9, 0.035);
  for (let t = 0.45, i = 0; t < 1.25; t += 0.055, i++) timp(t, 0.05 + i * 0.012);
  // 3~19.5: 마디마다 화음, 구간마다 악기가 쌓인다
  for (let bar = 0; bar < 9; bar++) {
    const t0 = 3 + bar * 2;
    if (t0 >= 19.5) break;
    const c = bar % 4;
    const ch = CH[c];
    const len = Math.min(2, 19.5 - t0);
    strings(t0, ch, len + 0.25, t0 < 6 ? 0.04 : t0 < 11 ? 0.05 : 0.06);
    strings(t0, [ROOT[c]], len + 0.25, 0.06);
    if (t0 >= 11) choir(t0, ch.map((n) => n + 12), len + 0.2, 0.025);
    for (let k = 0; k < 8; k++) {
      const t = t0 + k * 0.25;
      if (t >= 19.5) break;
      const pat = [0, 12, 7, 12, 0, 12, 7, 10][k];
      stacc(t, ROOT[c] + 12 + pat, t < 6 ? 0.035 : t < 11 ? 0.045 : 0.055);
      const beat = k % 2 === 0;
      if (k === 0) timp(t, 0.35, ROOT[c]);
      else if (t >= 6 && k === 4) timp(t, 0.28, ROOT[c]);
      else if (t >= 11 && beat) taiko(t, 0.3);
      if (t >= 16.5) taiko(t + 0.125, 0.18);
    }
    if (t0 >= 6) brass(t0, ch, 0.9, t0 < 11 ? 0.05 : 0.065);
  }
  // 대장간의 반짝임 (6~9.5)
  for (let t = 6.2, i = 0; t < 9.4; t += 0.125, i++) glock(t, [74, 77, 81, 86][i % 4] - (Math.floor(t - 6) % 2 ? 0 : 2), 0.035);
  // 영웅의 선율 (11~16.5) — 호른
  const MEL = [62, 65, 69, 67, 65, 64, 65, 69, 74, 72, 69];
  MEL.forEach((n, i) => horn(11 + i * 0.5, n, 0.48, 0.09));
  crash(11, 0.22);
  crash(16.5, 0.2);
  // 19.5~22.5: 어두운 왕좌 — 낮은 금관과 단조 합창
  brass(19.5, [34, 38, 41], 3.0, 0.07);
  choir(19.6, [50, 53, 58], 2.9, 0.04);
  for (let t = 19.5; t < 22.4; t += 1) taiko(t, 0.35);
  // 22.5~24.45: 상승 — 현이 올라가고 심벌이 부풀며 북이 빨라진다
  for (let i = 0; i < 18; i++) stacc(22.5 + i * 0.105, 50 + [0, 2, 3, 5, 7, 9, 10, 12][i % 8] + Math.floor(i / 8) * 12, 0.04 + i * 0.003);
  swell(22.5, 1.95, 0.25);
  for (let t = 22.5, d = 0.25; t < 24.4; t += d, d = Math.max(0.06, d * 0.85)) timp(t, 0.18, 38);
  // 24.45~25: 정적 / 25: 장조로 끝나는 마지막 화음
  const FIN = [50, 54, 57, 62];
  brass(25, FIN, 3.4, 0.08);
  strings(25, [...FIN, 66, 69], 3.4, 0.05);
  strings(25, [26, 38], 3.4, 0.07);
  choir(25.05, [62, 66, 69], 3.3, 0.04);
  timp(25, 0.6);
  taiko(25, 0.45);
  crash(25, 0.3, 3.2);
  harp(25.5, [62, 66, 69, 74, 78, 81, 86], 0.07, 0.07);

  // 장면 효과음: 묵직하게 (낮은 몸통 + 짧은 잡음, 잔향 조금). 마지막 제목 장면(25초~)의 쾅·화음만 원래 소리 그대로
  const thud = (t: number, vol: number, f = 70, len = 0.35) => voice('sine', f, t, len, vol, { a: 0.003, r: len * 0.9, glide: 0.5, send: 0.35 });
  for (const { t, k } of SFX) {
    const finale = t >= 24.9;
    switch (k) {
      case 'boom':
        if (finale) { timp(t, 0.55); taiko(t, 0.4); crash(t, 0.18); }
        else { timp(t, 0.6, 33); taiko(t, 0.5); thud(t, 0.5, 55, 0.9); noise(t, 0.5, 0.25, { lp: 900, send: 0.6 }); }
        break;
      case 'whoosh': noise(t, 0.45, 0.12, { hp: 120, lp: 1600, swell: true, send: 0.4 }); thud(t + 0.4, 0.18, 60, 0.3); break;
      case 'step': thud(t, 0.22, 95, 0.16); noise(t, 0.05, 0.08, { lp: 700 }); break;
      case 'tick': voice('triangle', hz(57), t, 0.4, 0.08, { a: 0.002, r: 0.38, lp: 1200, send: 0.5 }); thud(t, 0.12, 80, 0.15); break;
      case 'hammer': thud(t, 0.55, 75, 0.45); anvil(t, 0.12); noise(t, 0.12, 0.22, { lp: 1800, send: 0.5 }); break;
      case 'perfect': thud(t, 0.6, 62, 0.6); anvil(t, 0.14); [62, 66, 69, 74].forEach((n, i) => glock(t + i * 0.05, n, 0.05)); break;
      case 'chord':
        if (finale) harp(t, [62, 65, 69, 74, 77, 81]);
        else { harp(t, [50, 53, 57, 62, 65, 69], 0.06, 0.1); strings(t, [38, 45], 1.6, 0.06); }
        break;
      case 'up': brass(t, [50, 57], 0.4, 0.08); timp(t, 0.35, 38); break;
      case 'hit': thud(t, 0.6, 85, 0.3); taiko(t, 0.35); noise(t, 0.09, 0.25, { lp: 2200, send: 0.3 }); break;
      case 'win': [57, 57, 62].forEach((n, i) => horn(t + i * 0.12, n, i === 2 ? 0.6 : 0.11, 0.1)); timp(t + 0.24, 0.4, 38); break;
      case 'chime': [69, 74, 81].forEach((n, i) => glock(t + i * 0.08, n, 0.06)); thud(t, 0.2, 70, 0.4); break;
      case 'coins': for (let i = 0; i < 6; i++) glock(t + i * 0.05, 74 + ((i * 5) % 12), 0.035); thud(t, 0.25, 65, 0.4); break;
      case 'rumble': noise(t, 2.4, 0.12, { lp: 220 }); thud(t, 0.4, 40, 2.4); break;
      case 'crack': noise(t, 0.16, 0.18, { lp: 1200, send: 0.4 }); thud(t, 0.25, 60, 0.25); break;
      case 'rise': harp(t, [38, 45, 50, 53, 57, 62], 0.09, 0.07); break;
    }
  }
  return ac.startRendering();
}


// ---------------- 영상 만들기 ----------------
const yieldTask = () => new Promise<void>((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
let busy = false;
async function renderVideo() {
  if (busy) { status.textContent = '이미 렌더링 중이에요'; return; }
  busy = true;
  for (const b of document.querySelectorAll('button')) b.disabled = true;
  try { await renderVideoInner(); } finally { busy = false; for (const b of document.querySelectorAll('button')) b.disabled = false; }
}

async function renderVideoInner() {
  const N = Math.round(DUR * FPS);
  status.textContent = '효과음 시점 모으는 중…';
  reset();
  for (let i = 0; i < N; i++) { await step(i); if (i % 60 === 0) await yieldTask(); }
  const sfx = SFX.slice();
  reset();
  SFX.push(...sfx);
  const audio = await renderAudio();
  SFX.length = 0;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 }, fastStart: 'in-memory' });
  const ve = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { status.textContent = '영상 오류: ' + e.message; } });
  ve.configure({ codec: 'avc1.4d0028', width: W, height: H, bitrate: 7_500_000, framerate: FPS });
  for (let i = 0; i < N; i++) {
    await step(i);
    const f = new VideoFrame(out, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    ve.encode(f, { keyFrame: i % FPS === 0 });
    f.close();
    if (ve.encodeQueueSize > 8 || i % 30 === 0) await yieldTask();
    if (i % 30 === 0) status.textContent = `영상 ${Math.round((i / N) * 100)}%`;
  }
  await ve.flush();
  const ae = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { status.textContent = '소리 오류: ' + e.message; } });
  ae.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 });
  const L = audio.getChannelData(0);
  const Rr = audio.getChannelData(1);
  for (let o = 0; o < L.length; o += 1024) {
    const n = Math.min(1024, L.length - o);
    const data = new Float32Array(n * 2);
    data.set(L.subarray(o, o + n), 0);
    data.set(Rr.subarray(o, o + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o / 48000) * 1e6), data });
    ae.encode(ad);
    ad.close();
  }
  await ae.flush();
  muxer.finalize();
  const buf = (muxer.target as ArrayBufferTarget).buffer;
  status.textContent = '저장 중…';
  const r = await fetch('/__save_trailer?name=trailer.mp4', { method: 'POST', body: buf });
  status.textContent = await r.text();
  (window as unknown as { __trailerDone: string }).__trailerDone = status.textContent;
}

async function preview() {
  if (busy) return;
  reset();
  const t0 = performance.now();
  let i = 0;
  const N = Math.round(DUR * FPS);
  const loop = async () => {
    const want = Math.floor(((performance.now() - t0) / 1000) * FPS);
    while (i <= want && i < N) await step(i++);
    if (i < N) requestAnimationFrame(() => void loop());
  };
  void loop();
}

/** 확인용: sec초 장면을 그려 trailer-out/<name>.png 로 저장 */
async function still(sec: number, name?: string) {
  if (busy) return;
  busy = true;
  try { await stillInner(sec, name); } finally { busy = false; }
}
async function stillInner(sec: number, name?: string) {
  reset();
  const n = Math.round(sec * FPS);
  for (let i = 0; i <= n; i++) { await step(i); if (i % 60 === 0) await yieldTask(); }
  if (name) {
    const blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), 'image/png'));
    await fetch(`/__save_trailer?name=${name}.png`, { method: 'POST', body: blob });
  }
}

/** 확인용: 한 번 쭉 돌리면서 여러 시점을 4열 밑그림 한 장으로 모아 trailer-out/<name>.png 로 저장 */
async function sheet(times: number[], name = 'sheet') {
  if (busy) return;
  busy = true;
  try { await sheetInner(times, name); } finally { busy = false; }
}
async function sheetInner(times: number[], name: string) {
  reset();
  const cols = 4;
  const cw = 480;
  const chh = 270;
  const sh = document.createElement('canvas');
  sh.width = cw * cols;
  sh.height = chh * Math.ceil(times.length / cols);
  const x = sh.getContext('2d')!;
  const want = times.map((t) => Math.round(t * FPS));
  const last = Math.max(...want);
  for (let i = 0; i <= last; i++) {
    await step(i);
    want.forEach((f, k) => {
      if (f !== i) return;
      x.drawImage(out, (k % cols) * cw, Math.floor(k / cols) * chh, cw, chh);
      x.fillStyle = '#ff0';
      x.font = '18px sans-serif';
      x.fillText(`${times[k]}s`, (k % cols) * cw + 6, Math.floor(k / cols) * chh + 20);
    });
    if (i % 60 === 0) await yieldTask();
  }
  const blob = await new Promise<Blob>((r) => sh.toBlob((b) => r(b!), 'image/png'));
  await fetch(`/__save_trailer?name=${name}.png`, { method: 'POST', body: blob });
}

/** 확인용: t0~t1초 동안 개체의 위치를 프레임마다 기록 */
async function track(id: string, t0: number, t1: number) {
  if (busy) return [];
  reset();
  const outp: string[] = [];
  for (let i = 0; i <= Math.round(t1 * FPS); i++) {
    await step(i);
    const e = scene?.ents.find((x) => x.id === id);
    if (now >= t0 && e) outp.push(`${now.toFixed(2)}:${e.x.toFixed(2)},${e.y.toFixed(2)}`);
  }
  return outp;
}

const fonts = ["700 48px 'Gowun Batang'"].map((f) => document.fonts.load(f, '기보 밖의 한 수 완벽 승급 강화 체스 말 하나 새 움직임 연속 처치 빛나는 개체 늪 눈보라 판 지우는 왕들 틀 넘어 멀리 정해진 벗어나 어디로든'));
Promise.all([loadPieceImages(), loadArt().then(() => loadArtHD()), ...fonts]).then(() => {
  document.getElementById('play')!.addEventListener('click', () => void preview());
  document.getElementById('render')!.addEventListener('click', () => void renderVideo());
  Object.assign(window, { trailer: { preview, renderVideo, still, track, sheet } });
  status.textContent = '준비됨';
  void still(1.8);
});
