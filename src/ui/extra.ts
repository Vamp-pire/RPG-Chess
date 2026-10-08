import { termify } from './glossary';
import { G, exportCode, importCode } from '../core/state';
import { AREAS, AreaId, FIXED_ENCS, ObjDef } from '../data/areas';
import { MobId } from '../data/mobs';
import { basesFrom } from '../data/gear';
import { exitOpen } from '../game/explore';
import { h, modal } from './dom';
import { sfx } from '../core/sfx';
import { fx } from '../render/fx';
import { prefs, setPref } from '../core/prefs';
import { DIFFS, DIFF_ORDER, Diff } from '../core/difficulty';
import { versionLabel } from '../core/release';
import { musicPrefsChanged } from '../core/bgm';
import { openCredits, openPatchNotes } from './release';

/** 새 게임 난이도 고르기. 설명은 일부만 보여 준다 */
export function openDifficulty(onPick: (d: Diff) => void) {
  const root = h('div', { class: 'diff-pick' });
  const m = modal('난이도', root, { wide: true, closable: false });
  const cards = h('div', { class: 'diff-cards' });
  for (const id of DIFF_ORDER) {
    const d = DIFFS[id];
    const c = h('button', { class: `diff-card d-${id}` }, h('b', {}, d.name), h('ul', {}, ...d.shown.map((t) => h('li', {}, t))), h('small', { class: 'muted' }, '…그 밖에도 달라지는 것이 있어요'));
    c.addEventListener('click', () => { m.close(); onPick(id); });
    cards.append(c);
  }
  root.append(cards, h('p', { class: 'hint' }, '게임 중에 설정에서 난이도를 낮출 수는 있지만, 올릴 수는 없어요.'));
}

// 지도: 지역을 대략적인 위치에 배치 (방문한 곳만 이름이 보인다)
const MAP_POS: Partial<Record<AreaId, [number, number]>> = {
  erased: [1, 0], hills: [2, 0], throne: [3, 0],
  forest: [0, 1], town: [1, 1], meadow: [2, 1],
  marsh: [0, 2], camp: [1, 2], ruins: [2, 2],
  tower: [0, 3],
  tundra: [0, 4], frostpost: [1, 4], glacier: [2, 4],
  bastion: [1, 5],
  kingpeak: [1, 6], margin: [2, 6], fold: [3, 6],
  inkwell: [2, 7], lastpage: [3, 7],
};

/**
 * 지도 바탕의 영역: 칸마다 어느 장(지역)의 땅인지. 빈칸도 채워 지도 전체가 꽉 찬 사각형이 되고,
 * 경계는 계단처럼 엇갈려 단조로운 네모가 되지 않게 한다. 0 = 지워진 칸(발견 전엔 1장 땅으로 보인다)
 */
const TERRAIN: number[][] = [
  [1, 0, 1, 1],
  [1, 1, 1, 2],
  [2, 2, 2, 2],
  [2, 2, 2, 3],
  [3, 3, 3, 3],
  [3, 3, 3, 4],
  [3, 3, 4, 4],
  [3, 4, 4, 4],
];
/** 영역마다 빈 땅에 놓는 장 이름과 무늬 */
const TERRAIN_INFO: Record<number, { name: string; deco: string; label: [number, number] }> = {
  1: { name: '제1장 · 첫 수', deco: '🌾', label: [0, 0] },
  2: { name: '제2장 · 혼전의 늪', deco: '💧', label: [1, 3] },
  3: { name: '제3장 · 얼어붙은 종반', deco: '❄️', label: [0, 5] },
  4: { name: '제4장 · 여백', deco: '✒️', label: [1, 7] },
};

/** 거점: 거점끼리는 지도에서 바로 옮겨 갈 수 있다 */
export const OUTPOSTS: AreaId[] = ['town', 'camp', 'frostpost', 'margin'];
const BOSS_ENCS = ['boss', 'queen', 'king', 'author', 'blunder'];

export interface MapOpts {
  target: { area: AreaId; text: string } | null;
  badge?: (d: ObjDef) => string;
  travel?: (a: AreaId) => void;
  /** 지도에서 고른 목적지 (안내 화살표가 그쪽으로) */
  dest?: AreaId | null;
  setDest?: (a: AreaId | null) => void;
}

/** 지역 사이 경로 (열린 길만) */
function routeTo(from: AreaId, to: AreaId): AreaId[] {
  const prev = new Map<AreaId, AreaId | null>([[from, null]]);
  const q: AreaId[] = [from];
  while (q.length) {
    const a = q.shift()!;
    if (a === to) break;
    for (const ex of Object.values(AREAS[a].exits)) {
      if (!ex?.to || prev.has(ex.to) || !exitOpen(ex)) continue;
      prev.set(ex.to, a);
      q.push(ex.to);
    }
  }
  if (!prev.has(to)) return [];
  const path: AreaId[] = [];
  for (let c: AreaId | null = to; c; c = prev.get(c) ?? null) path.unshift(c);
  return path;
}

export function openMap(opts: MapOpts | { area: AreaId; text: string } | null) {
  const o: MapOpts = opts && 'target' in opts ? opts : { target: opts as MapOpts['target'] };
  const target = o.target;
  // 두 번째 승급 전에는 3지역 이후를 보여 주지 않는다 (스포일러 방지)
  const rows = G.promoted2 ? 8 : 4;
  const visible = (a: AreaId) => !!MAP_POS[a] && MAP_POS[a]![1] < rows && !(a === 'erased' && !G.flags.erasedSeen);
  const seen = (a: AreaId) => !!G.flags[`v_${a}`];
  const route = target ? routeTo(G.area, target.area) : [];
  const wrap = h('div', { class: 'map-wrap' });
  // 바탕: 장마다 다른 땅 (경계 모서리만 둥글게 → 덩어리진 영역으로 보인다)
  const terr = (x: number, y: number) => {
    const t = TERRAIN[y]?.[x];
    if (t === undefined) return -1;
    return t === 0 && !G.flags.erasedSeen ? 1 : t;
  };
  const land = h('div', { class: 'map-land', style: { gridTemplateRows: `repeat(${rows}, 1fr)` } });
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < 4; x++) {
      const t = terr(x, y);
      const diff = (dx: number, dy: number) => terr(x + dx, y + dy) !== t || y + dy >= rows;
      const r = (a: boolean, b: boolean) => (a && b ? '16px' : '3px');
      land.append(h('div', { class: `map-t t${t}`, style: { borderRadius: `${r(diff(0, -1), diff(-1, 0))} ${r(diff(0, -1), diff(1, 0))} ${r(diff(0, 1), diff(1, 0))} ${r(diff(0, 1), diff(-1, 0))}` } }));
    }
  }
  const grid = h('div', { class: `map-grid ${rows > 4 ? 'tall' : ''}`, style: { gridTemplateRows: `repeat(${rows}, 1fr)` } });
  // 길: 두 지역 중 하나라도 가 봤으면 선을 긋는다 (안내 경로는 금색)
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'map-lines');
  svg.setAttribute('viewBox', `0 0 4 ${rows}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const drawn = new Set<string>();
  for (const a of Object.keys(MAP_POS) as AreaId[]) {
    if (!visible(a)) continue;
    for (const ex of Object.values(AREAS[a].exits)) {
      const b = ex?.to;
      if (!b || !visible(b) || (!seen(a) && !seen(b))) continue;
      const k = [a, b].sort().join('-');
      if (drawn.has(k)) continue;
      drawn.add(k);
      const [x1, y1] = MAP_POS[a]!;
      const [x2, y2] = MAP_POS[b]!;
      const onRoute = route.includes(a) && route.includes(b) && Math.abs(route.indexOf(a) - route.indexOf(b)) === 1;
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', String(x1 + 0.5)); ln.setAttribute('y1', String(y1 + 0.5));
      ln.setAttribute('x2', String(x2 + 0.5)); ln.setAttribute('y2', String(y2 + 0.5));
      ln.setAttribute('class', `${onRoute ? 'route' : ''} ${exitOpen(ex) ? '' : 'locked'}`);
      ln.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(ln);
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < 4; x++) {
      const id = (Object.keys(MAP_POS) as AreaId[]).find((a) => MAP_POS[a]![0] === x && MAP_POS[a]![1] === y);
      if (!id || !visible(id)) {
        // 빈 땅: 장 이름 또는 그 땅의 무늬
        const t = terr(x, y);
        const info = TERRAIN_INFO[t];
        const isLabel = info && info.label[0] === x && info.label[1] === y;
        grid.append(h('div', { class: `map-cell empty t${t} ${isLabel ? 'label' : ''}` }, info ? (isLabel ? h('span', { class: 'map-chapter' }, info.name) : h('span', { class: 'map-deco' }, info.deco)) : null));
        continue;
      }
      const s = seen(id);
      const here = G.area === id;
      const goal = target?.area === id;
      const d = AREAS[id];
      // 아이콘: 시설 · 이야기(!/?) · 보스 · 각성 보스
      const icons: string[] = [];
      if (s) {
        if (d.objs.some((b) => b.kind === 'forge')) icons.push('🔨');
        if (d.objs.some((b) => b.kind === 'shop')) icons.push('🛒');
        if (d.objs.some((b) => b.kind === 'inn')) icons.push('🔥');
        const bs = o.badge ? d.objs.map((b) => o.badge!(b)).filter(Boolean) : [];
        if (bs.includes('?')) icons.push('❓');
        else if (bs.includes('!')) icons.push('❗');
        if (d.mobs.some((m) => BOSS_ENCS.includes(m.enc) && !(m.once && G.flags[m.once]) && !(m.req && !G.flags[m.req]))) icons.push('👑');
        if (d.mobs.some((m) => m.req && G.flags[m.req] && !(m.once && G.flags[m.once]))) icons.push('✦');
        // 아직 못 본 장비를 떨어뜨리는 몹이 나오는 곳 (어디서 사냥할지 고르기 쉽게)
        const mobsHere = new Set<MobId>([...d.mobs.filter((m) => !(m.once && G.flags[m.once])).flatMap((m) => FIXED_ENCS[m.enc]?.enemies.map((e) => e.m) ?? []), ...(d.random?.table.flatMap((t) => t.party.flat()) ?? [])]);
        if ([...mobsHere].some((m) => basesFrom(m, d.region).some((b) => !G.flags[`seen_${b.id}`]))) icons.push('🎁');
      }
      const cell = h('div', { class: `map-cell r${d.region} ${here ? 'here' : ''} ${goal ? 'goal' : ''} ${s ? '' : 'unseen'} ${route.includes(id) && !here ? 'on-route' : ''}` },
        h('b', {}, s ? d.name : '???'),
        icons.length ? h('span', { class: 'map-icons' }, icons.join('')) : null,
        here ? h('small', {}, '현재 위치') : null,
        goal ? h('small', {}, `★ ${target!.text}`) : null,
        o.dest === id && !here ? h('small', { class: 'map-dest' }, '📍 목적지') : null,
      );
      // 가 본 지역을 누르면 그곳을 목적지로: 판 위 안내 화살표가 그쪽 길을 따라간다
      if (o.setDest && s && !here) {
        cell.classList.add('pickable');
        cell.title = `${d.name}을(를) 목적지로 정하기`;
        cell.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.map-go')) return;
          md.close();
          o.setDest!(id);
        });
      }
      // 거점 → 거점 빠른 이동
      if (o.travel && s && !here && OUTPOSTS.includes(id) && OUTPOSTS.includes(G.area)) {
        const b = h('button', { class: 'btn small map-go' }, '이동');
        b.addEventListener('click', () => { md.close(); o.travel!(id); });
        cell.append(b);
      }
      grid.append(cell);
    }
  }
  wrap.append(land, svg, grid);
  const legend = h('p', { class: 'hint' }, '선 = 이어진 길(점선은 아직 막힘), 금색 = 안내 경로. 🔨 대장간 · 🛒 상점 · 🔥 쉼터 · ❗ 새 이야기 · ❓ 보고 · 👑 보스 · ✦ 각성 보스 · 🎁 아직 못 본 장비가 나오는 곳. 거점(마을·야영지·서리 초소·여백)에 있을 때는 가 본 다른 거점으로 바로 이동할 수 있다.');
  legend.append(' 가 본 지역을 누르면 그곳을 목적지로 정해, 판 위 화살표가 그쪽 길을 안내해요.');
  const extra = o.dest && o.setDest ? h('button', { class: 'btn small' }, '목적지 안내 끄기') : null;
  extra?.addEventListener('click', () => { md.close(); o.setDest!(null); });
  const md = modal('지도', h('div', {}, wrap, legend, extra), { wide: true });
}

export function openHelp() {
  const sec = (t: string, ...lines: string[]) => h('div', { class: 'help-sec' }, h('h3', {}, t), h('ul', {}, ...lines.map((l) => h('li', {}, ...termify(l)))));
  modal('도움말', h('div', { class: 'help' },
    sec('기본',
      '점 찍힌 칸은 갈 수 있는 곳이에요. 먼 칸을 누르면 알아서 걸어가요. 붉은 테두리가 쳐진 적은 지금 칠 수 있어요.',
      '판 가장자리에 서서 바깥 화살표나 내가 선 칸을 한 번 더 누르면 옆 지역으로 넘어가요. 금빛 별과 화살표는 퀘스트 목적지예요.',
      '퀘스트 목록에서 퀘스트를 누르면 그쪽으로 안내해 줘요.',
      '몹을 오른쪽 클릭(터치는 길게 누르기)하면 행마·버릇·떨어뜨리는 장비가 담긴 정보 카드가 떠요.',
      '보스 길은 그 지역 기록률(옆 패널 📖)이 60% 이상이어야 열려요. 몹 잡기·의뢰·새 장비로 채워요.',
      '버그나 의견은 옆 메뉴의 💬(F)로 언제든 보낼 수 있어요.'),
    sec('전투',
      '공격은 제자리에서 해요. 적이 쓰러지면 그 칸으로 들어가요. 바로 옆 칸에서 붙어서 치면 피해가 2배, 떨어져서 치면 1배예요. 적도 똑같아요.',
      '붉게 깜빡이는 칸은 적이 다음에 칠 곳이에요. 비켜서면 빗나가요. 옅은 붉은 점선이 넓게 깔리면, 그 근처 어딘가를 노린다는 뜻이에요.',
      '주황 칸은 곧 지워질 칸, 보라 줄은 퀸의 체크 라인이에요.',
      '동료가 있으면 한 턴에 말 하나만 움직여요. 판에서 다른 말을 누르면 바꿀 수 있어요.'),
    sec('놓치기 쉬운 전투 규칙',
      '수풀 안에 있으면 2칸 이상 떨어진 적의 공격을 막아요. 고지에서 공격하면 피해가 1 늘고, 빙판을 밟으면 움직인 방향으로 한 칸 더 미끄러져요. 수풀과 고지는 적도 똑같이 써요 — 멀리 치는 적은 수풀에, 붙어 치는 적은 고지에 자리 잡으려 해요.',
      '일반 적을 세 번의 아군 턴 동안 건드리지 않으면 한 턴 동안 반격 태세(주황빛)가 돼요. 그 적을 치면 표시된 확률로 그 자리에서 바로, 내가 친 것과 같은 행마로 되받아쳐요 — 붙어서 쳤으면 붙어서, 멀리서 쳤으면 그 거리에서요. 한 턴 기다리면 태세가 풀려요.',
      '초읽기가 시작되면 4턴마다 가장 가까운 적 하나의 공격이 1씩 올라가요. 오래 끄는 싸움보다, 장비를 갖춰 짧게 끝내는 편이 안전해요.',
      '금빛 점선은 소환 예정 칸, 보라색 점선은 퀸이 수를 무를 예정 칸이에요. 둘 다 다음 적 턴에 발동하니 미리 자리를 잡으세요.'),
    sec('장비',
      '장비는 몹이 떨어뜨려요. 몹마다 떨어뜨리는 장비가 정해져 있고, 처음 잡아 보는 몹과 엘리트는 꼭 하나를 줘요. 비어 있는 부위는 바로 장착돼요.',
      '무기는 직업 계열에 묶여 있어요. 빛은 붙어서 치는 인파이팅, 어둠은 멀리서 치는 아웃파이팅, 중립은 L자·뛰어넘기 같은 변칙. 신발·방어구·각인·유물은 누구나 써요.',
      '품질(%)이 높을수록 개조 칸이 많고 덤 효과가 붙어요: 평범한 → 좋은 → 훌륭한 → 뛰어난 → 걸작(100%). 높은 품질은 드물어요.',
      '천장: 내 계열 무기가 안 나온 전투가 8번 이어지면 다음엔 꼭 나와요. 훌륭한 이상이 안 나온 장비가 25개 쌓이면 다음은 꼭 훌륭한 이상이에요.',
      '안 쓰는 장비는 장비 창에서 분해해 재료로 돌려받아요.'),
    sec('대장간',
      '개조: 장비의 개조 칸 하나에 재료 하나를 넣고, 그 재료가 가진 효과 하나를 골라요. 행마 재료는 방향 하나를 더하고(같은 방향을 또 넣으면 길어져요), 특성 재료는 특성 +1을 줘요.',
      '개조에는 한도가 있어요: 새 방향 2개, 사거리 +2, 특성 +2까지.',
      '강화(+1~+3): 골드와 그 장비의 재료가 들어요. 망치질하면 품질도 1~5% 올라요 (99%까지 — 걸작은 드랍으로만).',
      '무기의 L자 공격에는 장기의 마처럼 멱이 있어요. 치려는 쪽 바로 옆 곧은 칸이 막혀 있으면 그쪽으로는 못 쳐요.'),
  ), { wide: true });
}

/** 설정: 퀘스트 안내와 힌트 말풍선을 켜고 끈다 */
export function openSettings(onChange: () => void, inGame = false) {
  const root = h('div', { class: 'settings' });
  const row = (key: 'guide' | 'tips' | 'sound' | 'ambient', title: string, desc: string) => {
    const input = h('input', { type: 'checkbox', id: `pref-${key}` }) as HTMLInputElement;
    input.checked = prefs()[key];
    input.addEventListener('change', () => { setPref(key, input.checked); onChange(); });
    return h('label', { class: 'set-row', for: `pref-${key}` }, input, h('span', {}, h('b', {}, title), h('small', {}, desc)));
  };
  root.append(
    row('guide', '퀘스트 안내', '판 위의 금빛 별과 화살표, 오른쪽 위 안내 줄로 다음에 갈 곳을 알려 줘요. 끄면 길을 직접 찾아야 해요.'),
    row('tips', '처음 힌트', '처음 해 보는 일이 생기면 화면 아래에 짧은 힌트가 떠요. 안내대로 하면 저절로 사라져요.'),
    row('sound', '효과음', '걸음, 타격, 망치질, 업적 같은 짧은 소리.'),
    row('ambient', '지역 분위기', '늪의 안개, 설원의 눈, 폐허의 먼지 같은 가벼운 입자 효과.'),
  );
  // 음량
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', id: 'pref-volume' }) as HTMLInputElement;
  const volText = h('output', { class: 'range-value', for: 'pref-volume' });
  const drawVol = () => { volText.textContent = `${Math.round(Number(vol.value) * 100)}%`; };
  vol.value = String(prefs().volume);
  drawVol();
  vol.addEventListener('input', () => { setPref('volume', Number(vol.value)); drawVol(); });
  vol.addEventListener('change', () => { sfx('coin'); });
  root.append(h('label', { class: 'set-row', for: 'pref-volume' }, h('span', {}, h('b', {}, '음량'), h('small', {}, '효과음 크기')), h('div', { class: 'range-control' }, vol, volText)));
  // 배경 음악
  const mus = h('input', { type: 'checkbox', id: 'pref-music' }) as HTMLInputElement;
  mus.checked = prefs().music;
  mus.addEventListener('change', () => { setPref('music', mus.checked); musicPrefsChanged(); });
  root.append(h('label', { class: 'set-row', for: 'pref-music' }, mus, h('span', {}, h('b', {}, '배경 음악'), h('small', {}, '장소마다 다른 잔잔한 곡. 전투와 보스전에서는 빨라져요.'))));
  const mvol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', id: 'pref-musicvol' }) as HTMLInputElement;
  const mvolText = h('output', { class: 'range-value', for: 'pref-musicvol' });
  const drawMusicVol = () => { mvolText.textContent = `${Math.round(Number(mvol.value) * 100)}%`; };
  mvol.value = String(prefs().musicVol);
  drawMusicVol();
  mvol.addEventListener('input', () => { setPref('musicVol', Number(mvol.value)); drawMusicVol(); musicPrefsChanged(); });
  root.append(h('label', { class: 'set-row', for: 'pref-musicvol' }, h('span', {}, h('b', {}, '음악 음량'), h('small', {}, '배경 음악 크기')), h('div', { class: 'range-control' }, mvol, mvolText)));
  // 연출 속도
  // 글자 크기
  const sizes: [number, string][] = [[0.9, '작게'], [1, '보통'], [1.15, '크게'], [1.3, '아주 크게']];
  const sizeBox = h('div', { class: 'seg' });
  const drawSizes = () => {
    sizeBox.innerHTML = '';
    for (const [v, label] of sizes) {
      const b = h('button', { class: `seg-btn ${prefs().textScale === v ? 'on' : ''}` }, label);
      b.addEventListener('click', () => { setPref('textScale', v); drawSizes(); });
      sizeBox.append(b);
    }
  };
  drawSizes();
  root.append(h('div', { class: 'set-row col' }, h('span', {}, h('b', {}, '글자 크기'), h('small', {}, '패널·창·대화·안내의 글자 크기. 게임 판은 그대로예요.')), sizeBox));
  // 대화 자동 넘김 속도
  const talks: [ReturnType<typeof prefs>['talk'], string][] = [['fast', '빠르게'], ['normal', '보통'], ['slow', '느리게'], ['manual', '누를 때만']];
  const talkBox = h('div', { class: 'seg' });
  const drawTalk = () => {
    talkBox.innerHTML = '';
    for (const [v, label] of talks) {
      const b = h('button', { class: `seg-btn ${(prefs().talk ?? 'normal') === v ? 'on' : ''}` }, label);
      b.addEventListener('click', () => { setPref('talk', v); drawTalk(); });
      talkBox.append(b);
    }
  };
  drawTalk();
  root.append(h('div', { class: 'set-row col' }, h('span', {}, h('b', {}, '대화 넘김'), h('small', {}, '대사가 다음 줄로 저절로 넘어가는 속도. 상자를 누르거나 ▶·→ 키로 넘기고, ◀·← 키로 앞 줄을 다시 볼 수 있어요.')), talkBox));
  const fast = h('input', { type: 'checkbox', id: 'pref-speed' }) as HTMLInputElement;
  fast.checked = prefs().speed === 'fast';
  fast.addEventListener('change', () => { setPref('speed', fast.checked ? 'fast' : 'normal'); fx.speed = fast.checked ? 0.55 : 1; });
  root.append(h('label', { class: 'set-row', for: 'pref-speed' }, fast, h('span', {}, h('b', {}, '빠른 연출'), h('small', {}, '전투와 이동 애니메이션을 약 두 배 빠르게.'))));
  const skip = h('input', { type: 'checkbox', id: 'pref-skip' }) as HTMLInputElement;
  skip.checked = !!prefs().skipAnim;
  skip.addEventListener('change', () => { setPref('skipAnim', skip.checked); fx.skip = skip.checked; });
  root.append(h('label', { class: 'set-row', for: 'pref-skip' }, skip, h('span', {}, h('b', {}, '연출 생략'), h('small', {}, '말이 움직이고 치는 애니메이션을 건너뛰고 결과만 바로 보여 줘요. 대화와 장면 전환은 그대로예요.'))));
  if (inGame && G) {
    const cur = DIFFS[G.diff];
    const box = h('div', { class: 'set-row diff-row' }, h('span', {}, h('b', {}, `난이도: ${cur.name}`), h('small', {}, '낮출 수는 있지만 다시 올릴 수는 없어요.')));
    for (const id of DIFF_ORDER.slice(0, Math.max(0, DIFF_ORDER.indexOf(G.diff)))) {
      const b = h('button', { class: 'btn small' }, `${DIFFS[id].name}(으)로 낮추기`);
      b.addEventListener('click', () => {
        if (!confirm(`난이도를 ${DIFFS[id].name}(으)로 낮출까요? 다시 올릴 수 없어요.`)) return;
        G.diff = id;
        G.flags.diffLowered = true;
        onChange();
        box.replaceWith(h('p', { class: 'hint' }, `난이도를 ${DIFFS[id].name}(으)로 낮췄어요.`));
      });
      box.append(b);
    }
    root.append(box);
  }
  // 세이브 코드: 다른 기기로 옮길 때
  if (inGame && G) {
    const area = h('textarea', { class: 'save-code', rows: '3', placeholder: '세이브 코드를 붙여 넣거나, 내보내기를 누르세요.' }) as HTMLTextAreaElement;
    const ex = h('button', { class: 'btn small' }, '내보내기');
    ex.addEventListener('click', async () => {
      area.value = await exportCode();
      area.select();
      try { await navigator.clipboard.writeText(area.value); ex.textContent = '복사됨!'; } catch { ex.textContent = '아래 코드를 복사하세요'; }
    });
    const im = h('button', { class: 'btn small' }, '불러오기');
    im.addEventListener('click', async () => {
      if (!area.value.trim()) return;
      if (!confirm('지금 슬롯의 진행을 이 코드로 덮어씁니다. 계속할까요?')) return;
      if (await importCode(area.value)) location.reload();
      else im.textContent = '코드가 올바르지 않아요';
    });
    root.append(h('div', { class: 'set-row col' }, h('span', {}, h('b', {}, '세이브 코드'), h('small', {}, '저장을 문자열로 내보내 다른 기기나 브라우저에서 이어 할 수 있어요.')), area, h('div', { class: 'row gap' }, ex, im)));
  }
  const reset = h('button', { class: 'btn small' }, '힌트 다시 보기');
  reset.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('cf-reset-tips'));
    reset.textContent = '다음에 다시 나타나요';
    reset.setAttribute('disabled', '');
  });
  const pn = h('button', { class: 'btn small' }, '패치 노트');
  pn.addEventListener('click', openPatchNotes);
  const cr = h('button', { class: 'btn small' }, '크레딧');
  cr.addEventListener('click', openCredits);
  root.append(h('div', { class: 'row gap' }, reset, pn, cr), h('p', { class: 'hint' }, `설정은 이 브라우저에 저장되며 새 게임을 시작해도 유지됩니다. · ${versionLabel()}`));
  modal('설정', root, { onClose: onChange });
}
