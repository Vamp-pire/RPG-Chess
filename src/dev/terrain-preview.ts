import '../style.css';
import { randomEnc } from '../data/areas';
import { MobId, MOBS } from '../data/mobs';
import { loadArt } from '../render/art';
import { Ent, Renderer, Scene, TileKind, mkEnt } from '../render/board';
import { loadPieceImages } from '../render/sprites';

const SAMPLES: { title: string; note: string; biome: NonNullable<Parameters<typeof randomEnc>[1]>; mobs: MobId[] }[] = [
  { title: '얕은 연못', note: '두꺼비는 물을 뛰어넘지만, 폰이 돌아갈 옆길을 남겼어요.', biome: 'marsh', mobs: ['toad', 'spider', 'toad'] },
  { title: '부서진 돌담', note: 'L자 적이 돌담을 넘되, 중앙 통로는 막지 않아요.', biome: 'forest', mobs: ['bat', 'skeleton', 'rat'] },
  { title: '낮은 돌출 바위', note: '룩형 적은 시야를 얻지만 고지는 플레이어도 쓸 수 있어요.', biome: 'bastion', mobs: ['tower', 'snowpawn', 'tower'] },
  { title: '갈라진 빙판', note: '빙판은 짧은 사선으로만 놓아 이동을 강제하지 않아요.', biome: 'glacier', mobs: ['icesprite', 'frostbishop', 'snowpawn'] },
];

function sceneOf(enc: ReturnType<typeof randomEnc>, biome: NonNullable<Parameters<typeof randomEnc>[1]>): Scene {
  const tiles = Array.from({ length: enc.h }, () => Array.from({ length: enc.w }, () => 'floor' as TileKind));
  for (const [x, y] of enc.walls) tiles[y][x] = 'wall';
  for (const [x, y] of enc.water ?? []) tiles[y][x] = 'water';
  for (const kind of ['bush', 'ice', 'high'] as const) for (const [x, y] of enc[kind] ?? []) tiles[y][x] = kind;
  const ents: Ent[] = [mkEnt('hero', 'p:wp', enc.player[0], enc.player[1], { hp: 7, maxHp: 7 })];
  for (const [i, e] of enc.enemies.entries()) {
    const d = MOBS[e.m];
    ents.push(mkEnt(`enemy_${i}`, `m:${e.m}`, e.x, e.y, { hp: d.hp, maxHp: d.hp, bob: true }));
  }
  return { w: enc.w, h: enc.h, biome, tile: (x, y) => tiles[y][x], ents, marks: [], arrows: [] };
}

async function run() {
  await Promise.all([loadPieceImages(), loadArt()]);
  const root = document.getElementById('gallery')!;
  root.innerHTML = `
    <section class="terrain-head"><h1>야생 조우 지형 세트</h1><p>적 조합에만 맞추되, 길을 막지 않는 작은 자연 지형입니다.</p></section>
    <section class="terrain-grid"></section>`;
  const grid = root.querySelector('.terrain-grid')!;
  for (const sample of SAMPLES) {
    const enc = randomEnc(sample.mobs, sample.biome);
    const card = document.createElement('article');
    card.className = 'terrain-card';
    card.innerHTML = `<h2>${sample.title}</h2><p>${sample.note}</p><small>${enc.terrainHint}</small><div class="terrain-board"><canvas></canvas></div>`;
    grid.append(card);
    const canvas = card.querySelector('canvas')!;
    const renderer = new Renderer(canvas);
    renderer.draw(sceneOf(enc, sample.biome));
  }
}

void run();
