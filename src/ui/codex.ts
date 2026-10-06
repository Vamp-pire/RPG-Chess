// 도감: 몹(이동·위협 범위) / 재료 / 장비 비교 / 레시피 노트
import { ALIAS } from '../render/art';
import { MOB_LORE, loreKills } from '../data/moblore';
import { loreView } from './lore';
import { SLOTS, SLOT_INFO, Slot, itemStats } from '../core/items';
import { MoveRule, describeRule, previewPattern } from '../core/rules';
import { G, emit, equipped, loadout, matHave } from '../core/state';
import { ABILITIES, MATS, MAT_ORDER, TRAITS } from '../data/materials';
import { MOBS, MobId } from '../data/mobs';
import { PIECES } from '../data/pieces';
import { artUrl } from '../render/art';
import { pieceSrc } from '../render/sprites';
import { clearCoach, h, modal, patternGrid } from './dom';
import { matIcon, statsView } from './forge';
import { BASE_LIST, FAM_NAME } from '../data/gear';

const MOB_ORDER: MobId[] = ['slime', 'rat', 'bat', 'golem', 'thorn', 'hound', 'strawking', 'toad', 'spider', 'skeleton', 'wraith', 'bonelord', 'misqueen', 'blunder'];

/** 몹 그림: Canva 그림이 있으면 그것, 없으면 이름 첫 글자 */
function mobPic(m: MobId, known: boolean) {
  const url = artUrl(`m:${m}`);
  if (url) return h('img', { class: `cx-mob ${known ? '' : 'unknown'}`, src: url, alt: '' });
  return h('div', { class: `cx-mob ph ${known ? '' : 'unknown'}` }, known ? MOBS[m].name[0] : '?');
}

/** 이동(초록)·공격(빨강) 범위를 한 격자에 */
function mobGrid(m: MobId) {
  const d = MOBS[m];
  const mv: MoveRule[] = d.move.map((r) => ({ ...r, mode: 'move' }));
  const at: MoveRule[] = d.attack.map((r) => ({ ...r, mode: 'attack' }));
  return patternGrid([], [...mv, ...at], artUrl(`m:${m}`) ?? pieceSrc('bp'));
}

export function openCodex(tab: 'mob' | 'mat' | 'gear' | 'recipe' | 'replay' = 'mob') {
  clearCoach('drop');
  const root = h('div', { class: 'codex' });
  modal('도감', root, { wide: true });
  let cur = tab;
  let gearSlot: Slot = 'weapon';
  const render = () => {
    root.innerHTML = '';
    const tabs = h('div', { class: 'tabs' });
    for (const [k, label] of [['mob', '몹'], ['mat', '재료'], ['gear', '장비 비교'], ['recipe', '장비 도감'], ['replay', '보스전 기보']] as const) {
      const b = h('button', { class: `tab ${cur === k ? 'on' : ''}` }, label);
      b.addEventListener('click', () => { cur = k; render(); });
      tabs.append(b);
    }
    root.append(tabs);
    if (cur === 'mob') renderMobs(root);
    if (cur === 'mat') renderMats(root);
    if (cur === 'gear') renderGear(root, gearSlot, (s) => { gearSlot = s; render(); });
    if (cur === 'recipe') renderRecipes(root);
    if (cur === 'replay') renderReplays(root);
  };
  render();
}

/** 보스전 다시 보기: 이긴 보스전의 턴별 판을 넘겨 본다 */
interface Replay { name: string; w: number; h: number; t: number; frames: { note: string; tiles: string; units: [string, number, number, number][] }[] }
function renderReplays(root: HTMLElement) {
  const reps = Object.keys(G.flags).filter((k) => k.startsWith('replay_')).map((k) => JSON.parse(String(G.flags[k])) as Replay);
  if (!reps.length) {
    root.append(h('p', { class: 'muted' }, '보스를 이기면 그 전투의 수순이 여기에 기보로 남는다.'));
    return;
  }
  const list = h('div', { class: 'row gap wrap' });
  const view = h('div', { class: 'replay' });
  const show = (r: Replay) => {
    let i = 0;
    let timer = 0;
    const board = h('div', { class: 'rp-board', style: { gridTemplateColumns: `repeat(${r.w}, 1fr)` } });
    const note = h('p', { class: 'rp-note' });
    const draw = () => {
      const f = r.frames[i];
      board.innerHTML = '';
      const rows = f.tiles.split('/');
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const c = rows[y]?.[x] ?? '.';
        const cell = h('div', { class: `rp-cell ${(x + y) % 2 ? 'd' : 'l'} t-${c === ' ' ? 'void' : c === '#' ? 'wall' : c === '~' ? 'water' : c === 'i' ? 'ice' : c === 'b' ? 'bush' : c === 'h' ? 'high' : 'floor'}` });
        const u = f.units.find(([, ux, uy]) => ux === x && uy === y);
        if (u) {
          const [spr, , , hp] = u;
          const [kind, id] = spr.split(':');
          const src = kind === 'p' ? pieceSrc(id) : artUrl(`m:${ALIAS[id] ?? id}`);
          if (src) cell.append(h('img', { src, alt: '' }));
          cell.append(h('span', { class: 'rp-hp' }, String(hp)));
        }
        board.append(cell);
      }
      note.textContent = `${i + 1}/${r.frames.length} · ${f.note}`;
    };
    const prev = h('button', { class: 'btn small' }, '◀');
    const next = h('button', { class: 'btn small' }, '▶');
    const play = h('button', { class: 'btn small primary' }, '자동 재생');
    prev.addEventListener('click', () => { i = Math.max(0, i - 1); draw(); });
    next.addEventListener('click', () => { i = Math.min(r.frames.length - 1, i + 1); draw(); });
    play.addEventListener('click', () => {
      if (timer) { clearInterval(timer); timer = 0; play.textContent = '자동 재생'; return; }
      play.textContent = '멈춤';
      timer = window.setInterval(() => { if (i >= r.frames.length - 1 || !board.isConnected) { clearInterval(timer); timer = 0; play.textContent = '자동 재생'; return; } i++; draw(); }, 700);
    });
    view.innerHTML = '';
    view.append(h('b', {}, `${r.name} · ${r.frames.length - 1}수 · ${new Date(r.t).toLocaleDateString()}`), board, note, h('div', { class: 'row gap' }, prev, play, next));
    draw();
  };
  for (const r of reps) {
    const b = h('button', { class: 'btn small' }, r.name);
    b.addEventListener('click', () => show(r));
    list.append(b);
  }
  root.append(h('p', { class: 'muted small' }, '이긴 보스전의 수순. 한 수씩 넘기거나 자동으로 재생할 수 있다. 숫자는 남은 체력.'), list, view);
  show(reps[0]);
}

/** 몹 이야기: 충분히 쓰러뜨리면 열린다 */
function loreBox(m: MobId, kills: number) {
  const text = MOB_LORE[m];
  if (!text) return null;
  const d = MOBS[m];
  const need = loreKills(m, d.ai === 'boss' || d.ai === 'queen', ['hound', 'bonelord', 'giant', 'double', 'blunder'].includes(m));
  if (kills >= need) {
    if (!G.flags[`mlore_${m}`]) { G.flags[`mlore_${m}`] = true; emit('mobLore', m); }
    return h('details', { class: 'mob-lore' }, h('summary', {}, '📖 이야기'), h('p', { class: 'small' }, text));
  }
  return h('p', { class: 'small muted' }, `📖 이야기: ${kills}/${need}번 쓰러뜨리면 열린다`);
}

function renderMobs(root: HTMLElement) {
  const known = MOB_ORDER.filter((m) => (G.dex[m] ?? 0) > 0).length;
  const total = MOB_ORDER.filter((m) => ((MOBS[m].region ?? 1) < 3 && m !== 'blunder') || G.flags[`seen_${m}`] || (G.dex[m] ?? 0) > 0).length;
  root.append(h('p', { class: 'muted small' }, `쓰러뜨린 몹 ${known} / ${total}. 초록 점 = 이동할 수 있는 칸, 빨강 = 공격이 닿는 칸(위협 범위).`));
  const list = h('div', { class: 'cx-list' });
  for (const m of MOB_ORDER) {
    const d = MOBS[m];
    const kills = G.dex[m] ?? 0;
    const seen = kills > 0 || !!G.flags[`seen_${m}`];
    if (!seen && (m === 'blunder' || (d.region ?? 1) >= 3)) continue; // 비밀 몹·뒤 지역 몹은 만나기 전까지 목록에도 없다
    const card = h('div', { class: `cx-card ${kills ? '' : 'dim'}` }, mobPic(m, seen));
    if (!seen) {
      card.append(h('div', {}, h('b', {}, '???'), h('p', { class: 'small muted' }, '아직 만나지 못했다.')));
    } else {
      const drops = d.drops.map(([id, n]) => `${MATS[id].name}×${n}`).join(', ');
      card.append(h('div', { class: 'cx-body' },
        h('b', {}, d.name, h('span', { class: 'muted small' }, `  HP ${d.hp} · 공격 ${d.atk} · 처치 ${kills}`)),
        h('p', { class: 'small' }, d.desc),
        kills ? h('p', { class: 'small muted' }, `드롭: ${drops || '없음'}${d.rare ? ` · 드물게 ${MATS[d.rare[0]].name}` : ''}`) : h('p', { class: 'small muted' }, '쓰러뜨리면 드롭 정보를 알 수 있다.'),
        loreBox(m, kills),
      ), mobGrid(m));
    }
    list.append(card);
  }
  root.append(list);
}

function renderMats(root: HTMLElement) {
  root.append(h('p', { class: 'muted small' }, '한 번이라도 얻은 재료는 행마 조각·특성·능력을 볼 수 있다. 격자는 이 재료로 만든 무기의 공격(빨강)/신발의 이동(초록) 조각.'));
  const list = h('div', { class: 'cx-list' });
  for (const id of MAT_ORDER) {
    const d = MATS[id];
    const got = !!G.flags[`got_${id}`] || matHave(id) > 0;
    if (!got && (d.key || id === 'blunder' || id === 'trigger')) continue;
    const card = h('div', { class: `cx-card ${got ? '' : 'dim'}` }, got ? matIcon(id, 56) : h('div', { class: 'cx-mob ph unknown' }, '?'));
    if (!got) {
      card.append(h('div', {}, h('b', {}, '???'), h('p', { class: 'small muted' }, '아직 얻지 못했다.')));
    } else {
      const bits: string[] = [];
      if (d.frag) bits.push(`행마 조각: ${describeRule({ ...d.frag, mode: 'both' }).replace(' 이동·공격', '')}`);
      if (d.trait) bits.push(`특성: ${TRAITS[d.trait].name} — ${TRAITS[d.trait].desc(1)}`);
      if (d.ability) bits.push(`능력(${ABILITIES[d.ability].slot === 'engrave' ? '각인' : '유물'}): ${ABILITIES[d.ability].name} — ${ABILITIES[d.ability].desc(1)}`);
      if (d.phase) bits.push('비율 30% 이상이면 슬라이드가 관통 이동이 된다');
      if (d.binder) bits.push('결합제: 비율에서 빠지고 2개 이상이면 품질 +1');
      card.append(h('div', { class: 'cx-body' },
        h('b', {}, d.name, h('span', { class: 'muted small' }, `  보유 ${matHave(id)} · ${d.price}G`)),
        loreView(id),
        d.hint ? h('p', { class: 'small hint-line' }, `💭 ${d.hint}`) : null,
        ...bits.map((b) => h('p', { class: 'small muted' }, b)),
      ));
      if (d.frag) card.append(patternGrid([], [{ ...d.frag, mode: 'attack' }], pieceSrc(PIECES[G.piece].img)));
    }
    list.append(card);
  }
  root.append(list);
}

/** 장착하면 전체 행마 칸이 어떻게 바뀌는지 (+칸 / -칸) */
function coverage(rules: MoveRule[]) {
  return new Set(previewPattern(rules, 3).keys());
}

function renderGear(root: HTMLElement, slot: Slot, pick: (s: Slot) => void) {
  const bar = h('div', { class: 'slots' });
  for (const s of SLOTS) {
    const b = h('button', { class: `slot-btn ${s === slot ? 'on' : ''}` }, h('b', {}, SLOT_INFO[s].name), h('small', {}, `${G.items.filter((i) => i.slot === s).length}개`));
    b.addEventListener('click', () => pick(s));
    bar.append(b);
  }
  root.append(bar);
  const cur = equipped(slot);
  const lo = loadout();
  const curRules = cur ? itemStats(cur).rules : [];
  const others = lo.rules.filter((r) => !curRules.includes(r));
  const before = coverage(lo.rules);
  const items = G.items.filter((i) => i.slot === slot);
  if (!items.length) {
    root.append(h('p', { class: 'muted' }, `${SLOT_INFO[slot].name} 장비가 없다.`));
    return;
  }
  root.append(h('p', { class: 'muted small' }, '격자: 회색 = 이 장비 없이도 가진 행마, 색 = 이 장비가 더해 주는 행마. 숫자는 지금 장착한 것과 비교한 칸 수 변화 (3칸 범위 기준).'));
  const list = h('div', { class: 'cx-list' });
  for (const it of items) {
    const s = itemStats(it);
    const after = coverage([...others, ...s.rules]);
    let plus = 0;
    let minus = 0;
    for (const k of after) if (!before.has(k)) plus++;
    for (const k of before) if (!after.has(k)) minus++;
    const on = G.equip[slot] === it.id;
    list.append(h('div', { class: `cx-card ${on ? 'on' : ''}` },
      patternGrid(others, s.rules, pieceSrc(PIECES[G.piece].img)),
      h('div', { class: 'cx-body' },
        h('b', {}, s.name, on ? h('span', { class: 'chip' }, '장착 중') : null),
        on ? h('p', { class: 'small muted' }, '지금 장착한 장비') : h('p', { class: 'small' }, h('span', { class: 'plus' }, `+${plus}칸`), ' ', h('span', { class: 'minus' }, `-${minus}칸`)),
        statsView(s, false),
      )));
  }
  root.append(list);
}

/** 장비 도감: 지역별 밑판. 손에 넣어 본 것만 이름이 보인다 */
function renderRecipes(root: HTMLElement) {
  const seen = (id: string) => !!G.flags[`seen_${id}`];
  const n = BASE_LIST.filter((b) => !b.from.includes('ritual') && seen(b.id)).length;
  root.append(h('p', { class: 'muted small' }, `손에 넣어 본 장비 ${n}/${BASE_LIST.filter((b) => !b.from.includes('ritual')).length}종. 몹마다 떨어뜨리는 장비가 정해져 있다.`));
  for (const r of [1, 2, 3, 4]) {
    const list = BASE_LIST.filter((b) => b.region === r && !b.from.includes('ritual'));
    const box = h('div', { class: 'recipe-list' });
    for (const b of list) {
      const ok = seen(b.id);
      const from = b.from.map((f) => (f === 'shop' ? '상점' : f === 'starter' ? '시작 무기' : f === 'boss' ? '보스 첫 처치' : MOBS[f as MobId]?.name ?? f)).filter((x, i, a) => a.indexOf(x) === i).join(' · ');
      box.append(h('div', { class: `recipe ${ok ? '' : 'unseen'}` },
        h('span', { class: 'chip' }, SLOT_INFO[b.slot].name),
        b.fam ? h('span', { class: `chip fam-${b.fam}` }, FAM_NAME[b.fam]) : null,
        h('b', {}, ok ? b.name : '???'),
        h('span', { class: 'muted small' }, ok || b.from.includes('shop') || b.from.includes('starter') ? from : `${from.split(' · ')[0]}에게서`),
        b.unique ? h('span', { class: 'chip uniq' }, '고유') : b.elite ? h('span', { class: 'chip' }, '엘리트') : null));
    }
    root.append(h('div', { class: 'sub' }, `${r}지역${list.some((b) => b.draft) ? ' (임시안)' : ''}`), box);
  }
}

function renderOldRecipes(root: HTMLElement) {
  root.append(h('p', { class: 'muted small' }, '한 번 만든 조합이 기록된다. 재료는 대장간에서 직접 다시 넣어야 한다.'));
  if (!G.recipes.length) {
    root.append(h('p', { class: 'muted' }, '아직 기록된 조합이 없다.'));
    return;
  }
  const list = h('div', { class: 'recipe-list' });
  for (const r of G.recipes.slice().reverse()) {
    list.append(h('div', { class: 'recipe' },
      h('span', { class: 'chip' }, SLOT_INFO[r.slot].name),
      h('b', {}, r.name),
      h('span', { class: 'chips' }, ...Object.entries(r.mats).filter(([, n]) => n).map(([id, n]) => h('span', { class: 'chip mat-chip' }, matIcon(id as keyof typeof MATS, 18), ` ×${n}`))),
    ));
  }
  root.append(list);
}
