import { BAL } from '../core/balance';
// 대장간: 조합 / 강화 (강조 등급 연출)
import { SETS, SET_NEED, familiesOf, setCounts } from '../core/sets';
import { sfx } from '../core/sfx';
import { perk } from '../game/rewards';
import { ARMOR_TRAIT_MIN, FRAG_MIN, ITEM_MAX_LEVEL, Item, ItemStats, MIN_CORE, Mats, SLOTS, SLOT_INFO, Shape, Slot, TRAIT_MIN, compressBonus, computeItem, shapePicks, slideRangeFor, itemStats, mergeMats, slotByTotal, totalOf } from '../core/items';
import { MoveRule, describeRule, dirName, previewPattern } from '../core/rules';
import { G, baseRules, emit, equipped, hasJob, loadout, log, matHave, save, spendMats } from '../core/state';
import { ABILITIES, MATS, MAT_ORDER, MatId, TRAITS } from '../data/materials';
import { PIECES } from '../data/pieces';
import { pieceSrc } from '../render/sprites';
import { artUrl } from '../render/art';
import { applyCoachFocus, clearCoach, coachNow, setCoachFocus, h, modal, patternGrid, toast } from './dom';
import { useMats } from './lore';

const MAX_MATS = 8;

/** base 행마에 extra를 더했을 때 새로 생기는 (칸, 이동/공격) 수 */
export function newSquares(base: MoveRule[], extra: MoveRule[]) {
  const expand = (rules: MoveRule[]) => {
    const s = new Set<string>();
    for (const [k, m] of previewPattern(rules, 3)) {
      if (m !== 'attack') s.add(`${k}|m`);
      if (m !== 'move') s.add(`${k}|a`);
    }
    return s;
  };
  const before = expand(base);
  let n = 0;
  for (const k of expand([...base, ...extra])) if (!before.has(k)) n++;
  return n;
}

/** 추천 조합: 가진 재료로 이 부위에 가장 좋은 조합 몇 개 (숙련 모드면 개수가 그 부위에 맞는 것만) */
export function recommend(slot: Slot, mastery: boolean, n = 2): { mats: Mats; name: string; score: number; gain: number }[] {
  const cur = equipped(slot);
  const others = loadout().rules.filter((r) => !(cur ? itemStats(cur).rules : []).some((x) => JSON.stringify(x) === JSON.stringify(r)));
  // 많이 가진 재료 8가지까지만 (조합 수가 너무 많아지지 않게)
  const pool = MAT_ORDER.filter((m) => !MATS[m].key && !MATS[m].binder && matHave(m) > 0).sort((x, y) => matHave(y) - matHave(x)).slice(0, 8);
  const fiberHave = matHave('fiber');
  const out: { mats: Mats; name: string; score: number; gain: number }[] = [];
  const consider = (core: Mats) => {
    const coreN = totalOf(core, false);
    if (coreN < MIN_CORE[slot]) return;
    for (const fb of [Math.min(2, fiberHave), 0, 1, 2, 3, 4].filter((f, i, a) => f <= fiberHave && a.indexOf(f) === i)) {
      const m: Mats = fb ? { ...core, fiber: fb } : { ...core };
      const tot = totalOf(m);
      if (tot > MAX_MATS || tot < 2) continue;
      if (mastery && slotByTotal(tot) !== slot) continue;
      const s = computeItem(slot, m, 0);
      if (s.rules.some((r) => r.gun)) continue; // 숨은 무기는 추천하지 않는다
      const gain = newSquares(others, s.rules);
      const traits = Object.values(s.traits).reduce((a, b) => a + (b ?? 0), 0);
      out.push({ mats: m, name: s.name, score: gain + traits * 3 + (s.ability ? 5 : 0) + s.quality, gain });
      break;
    }
  };
  for (const a of pool) {
    for (let na = 1; na <= Math.min(6, matHave(a)); na++) {
      consider({ [a]: na });
      for (const b of pool) {
        if (b <= a) continue;
        for (let nb = 1; nb <= Math.min(4, matHave(b)); nb++) {
          consider({ [a]: na, [b]: nb });
          if (na + nb < MIN_CORE[slot] + 1) for (const c of pool) if (c > b) consider({ [a]: na, [b]: nb, [c]: 1 });
        }
      }
    }
  }
  out.sort((x, y) => y.score - x.score);
  const res: typeof out = [];
  for (const o of out) if (!res.some((r) => r.name === o.name) && res.length < n) res.push(o);
  return res;
}

/** 목적별 추천 셋: 고르게 좋은 것 · 멀리 닿는 것(새 행마 칸) · 특성·능력이 붙는 것 — 겹치면 다음 후보로 */
export function recommendByGoal(slot: Slot): { mats: Mats; name: string; score: number; gain: number; goal: string }[] {
  const all = recommend(slot, false, 40);
  const out: { mats: Mats; name: string; score: number; gain: number; goal: string }[] = [];
  const take = (goal: string, key: (r: (typeof all)[number]) => number) => {
    const r = [...all].sort((a, b) => key(b) - key(a)).find((x) => !out.some((o) => o.name === x.name));
    if (r && key(r) > 0) out.push({ ...r, goal });
  };
  take('균형', (r) => r.score);
  take('멀리', (r) => r.gain * 10 + r.score * 0.01);
  take('특성', (r) => (r.score - r.gain) * 10 + r.score * 0.01);
  return out;
}

export function matIcon(id: MatId, size = 28) {
  const d = MATS[id];
  const url = artUrl(`mat:${id}`);
  if (url) return h('img', { class: `mat-img ${d.rare ? 'rare' : ''} ${d.key ? 'key' : ''}`, src: url, alt: d.name, title: d.name, style: { width: `${size}px`, height: `${size}px` } });
  return h('span', { class: `mat-ico ${d.rare ? 'rare' : ''} ${d.key ? 'key' : ''}`, style: { background: d.color, width: `${size}px`, height: `${size}px` }, title: d.name }, d.short.slice(0, 1));
}

export function statsView(s: ItemStats, withGrid = true, img = pieceSrc(PIECES[G.piece].img)) {
  const box = h('div', { class: 'stats' });
  if (withGrid) box.append(patternGrid(baseRules(), s.rules, img));
  const ul = h('ul', { class: 'stat-list' });
  for (const r of s.rules) ul.append(h('li', { class: `r-${r.mode}` }, describeRule(r)));
  for (const [t, lv] of Object.entries(s.traits)) ul.append(h('li', { class: 'r-trait' }, `${TRAITS[t as keyof typeof TRAITS].name} Lv${lv} — ${TRAITS[t as keyof typeof TRAITS].desc(lv!)}`));
  if (s.ability) ul.append(h('li', { class: 'r-ability' }, `능력 ${ABILITIES[s.ability.id].name} Lv${s.ability.lv} — ${ABILITIES[s.ability.id].desc(s.ability.lv)}`));
  if (!ul.children.length) ul.append(h('li', { class: 'muted' }, '효과 없음'));
  box.append(ul);
  return box;
}

function shareBar(mats: Mats) {
  const core = totalOf(mats, false);
  const bar = h('div', { class: 'share' });
  if (!core) {
    bar.append(h('span', { class: 'share-empty' }, '재료를 넣으면 비율이 여기에 표시됩니다'));
    return bar;
  }
  for (const [id, n] of Object.entries(mats) as [MatId, number][]) {
    if (!n || MATS[id].binder) continue;
    const pct = (n / core) * 100;
    bar.append(h('i', { style: { width: `${pct}%`, background: MATS[id].color }, title: `${MATS[id].name} ${Math.round(pct)}%` }, pct >= 14 ? `${Math.round(pct)}%` : ''));
  }
  bar.append(h('b', { class: 'tick', style: { left: `${FRAG_MIN * 100}%` } }), h('b', { class: 'tick t2', style: { left: `${TRAIT_MIN * 100}%` } }));
  return bar;
}

/** craftOnly: 야영지의 떠돌이 대장장이 (제작만, 강화는 마을에서) */
/**
 * 마인크래프트풍 인벤토리 칸 (대장간과 같은 모양). 가진 재료만 앞에서부터 칸을 차지하고,
 * 나머지는 9의 배수까지 빈칸. 마우스를 올리면(폰은 꾹) 칸 위 말풍선.
 */
export function invGrid(items: { id: MatId; n: number; sel?: number }[], opts: { onClick?: (id: MatId) => void; minSlots?: number; desc?: (id: MatId) => string } = {}) {
  const grid = h('div', { class: `inv-grid ${opts.onClick ? '' : 'readonly'}` });
  for (const it of items) {
    const d = MATS[it.id];
    const lines = [d.name, opts.desc ? opts.desc(it.id) : '', `${it.n}개`].filter(Boolean);
    const cell = h('button', { class: `inv-cell ${it.sel ? 'sel' : ''} ${d.rare || d.key ? 'rare' : ''}`, tabindex: opts.onClick ? 0 : -1 },
      matIcon(it.id, 30), it.n > 0 ? h('span', { class: 'inv-have' }, String(it.n)) : null, it.sel ? h('span', { class: 'inv-sel' }, `${it.sel}`) : null);
    let pressT = 0;
    let longPressed = false;
    cell.addEventListener('mouseenter', () => showTip(cell, lines));
    cell.addEventListener('mouseleave', hideTip);
    cell.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; longPressed = false; pressT = window.setTimeout(() => { longPressed = true; showTip(cell, lines); }, 380); });
    cell.addEventListener('pointerup', () => { clearTimeout(pressT); if (longPressed) setTimeout(hideTip, 1400); });
    cell.addEventListener('pointercancel', () => clearTimeout(pressT));
    cell.addEventListener('contextmenu', (e) => { if (longPressed) e.preventDefault(); });
    cell.addEventListener('click', () => { if (longPressed) { longPressed = false; return; } hideTip(); opts.onClick?.(it.id); });
    grid.append(cell);
  }
  const slots = Math.max(opts.minSlots ?? 9, Math.ceil(items.length / 9) * 9);
  for (let i = items.length; i < slots; i++) grid.append(h('div', { class: 'inv-cell empty', 'aria-hidden': 'true' }));
  return grid;
}

/** 인벤토리 칸 위 말풍선 (하나만 띄운다) */
let tipEl: HTMLElement | null = null;
function showTip(cell: HTMLElement, lines: string[]) {
  hideTip();
  const r = cell.getBoundingClientRect();
  tipEl = h('div', { class: 'inv-tip', role: 'tooltip' }, h('b', {}, lines[0]), h('small', {}, lines.slice(1).join(' · ')));
  document.body.append(tipEl);
  const tw = tipEl.offsetWidth;
  const left = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left + r.width / 2 - tw / 2));
  const above = r.top - tipEl.offsetHeight - 6;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${above < 6 ? r.bottom + 6 : above}px`;
  // 화면이 다시 그려져 칸이 사라지면 말풍선도 치운다 (창을 닫았을 때 남지 않게)
  const el = tipEl;
  const iv = window.setInterval(() => { if (tipEl !== el || !cell.isConnected) { window.clearInterval(iv); if (tipEl === el) hideTip(); } }, 250);
}
export function hideTip() {
  tipEl?.remove();
  tipEl = null;
}

const ARROW = (dx: number, dy: number) => (Math.abs(dx) + Math.abs(dy) === 3 ? `${dx > 0 ? '→' : '←'}${dy > 0 ? '↓' : '↑'}` : ({ '0,-1': '↑', '0,1': '↓', '-1,0': '←', '1,0': '→', '-1,-1': '↖', '1,-1': '↗', '-1,1': '↙', '1,1': '↘' } as Record<string, string>)[`${Math.sign(dx)},${Math.sign(dy)}`] ?? '•');

export function openForge(onChange: () => void, opts: { craftOnly?: boolean } = {}) {
  let tab: 'craft' | 'enhance' = 'craft';
  let slot: Slot = SLOTS.find((s) => !G.equip[s]) ?? 'weapon';
  let sel: Mats = {};
  let enhId: number | null = null;
  let shape: Shape = {}; // 무기 행마의 방향 고르기·압축 (재료별)
  // 숙련 제작(개수로 부위가 정해짐)은 없앴다 — '선택을 막는 규칙'으로만 느껴진다는 베타 의견. 부위는 늘 직접 고른다
  const useMastery = false;
  let focus: MatId | null = null; // 인벤토리에서 마지막으로 가리킨 재료 (아래 설명 줄)
  const root = h('div', { class: 'forge' });
  const m = modal(opts.craftOnly ? '떠돌이 대장장이' : '대장간', root, { wide: true, onClose: () => { hideTip(); onChange(); } });

  const avail = (id: MatId) => matHave(id) - (sel[id] ?? 0);
  const alch = () => (hasJob('alchemist') ? 1 : 0);
  const curSlot = (): Slot | null => {
    if (tab === 'enhance') return G.items.find((i) => i.id === enhId)?.slot ?? null;
    return useMastery ? slotByTotal(totalOf(sel)) : slot;
  };

  function render() {
    hideTip();
    // 첫 안내: 재료를 넣기 전엔 [넣기], 넣은 뒤엔 [바로 제작]을 짚는다
    if (coachNow() === 'forge') setCoachFocus(totalOf(sel) ? '.f-actions .btn' : '.recs .rec .btn');
    queueMicrotask(applyCoachFocus); // 첫 안내가 짚는 버튼에 금빛 테두리 다시 붙이기
    root.innerHTML = '';
    const tabs = h('div', { class: 'tabs' });
    if (opts.craftOnly) tabs.append(h('span', { class: 'muted small' }, '떠돌이 대장장이: "모루가 작아서 새로 만드는 것만 돼. 강화는 마을 대장간에서 하게."'));
    else for (const [k, label] of [['craft', '제작'], ['enhance', '강화']] as const) {
      const b = h('button', { class: `tab ${tab === k ? 'on' : ''}` }, label);
      b.addEventListener('click', () => { tab = k; sel = {}; render(); });
      tabs.append(b);
    }
    root.append(tabs);

    const left = h('div', { class: 'f-left' });
    const right = h('div', { class: 'f-right' });
    root.append(h('div', { class: 'f-cols' }, left, right));

    if (tab === 'craft') {
      if (!useMastery) {
        const sl = h('div', { class: 'slots' });
        for (const s of SLOTS) {
          const b = h('button', { class: `slot-btn ${slot === s ? 'on' : ''}` }, h('b', {}, SLOT_INFO[s].name), h('small', {}, SLOT_INFO[s].role));
          b.addEventListener('click', () => { slot = s; render(); });
          sl.append(b);
        }
        left.append(sl);
      }
    } else {
      const list = h('div', { class: 'enh-list' });
      const items = G.items.filter((i) => i.level < ITEM_MAX_LEVEL);
      if (!items.length) list.append(h('p', { class: 'muted' }, '강화할 장비가 없다. 먼저 제작하자.'));
      for (const it of items) {
        const s = itemStats(it);
        const b = h('button', { class: `enh-item ${enhId === it.id ? 'on' : ''}` }, h('b', {}, s.name), h('small', {}, SLOT_INFO[it.slot].name));
        b.addEventListener('click', () => { enhId = it.id; sel = {}; shape = { ...(it.shape ?? {}) }; render(); });
        list.append(b);
      }
      left.append(h('div', { class: 'sub' }, '강화할 장비'), h('p', { class: 'hint enh-how' }, '💡 재료를 1개만 더 넣어도 강화돼요. 넣은 재료까지 합쳐 비율을 다시 계산하고, 처음 8개 한도를 넘어 더 넣을 수 있어요. 망치질하면 품질도 한 번 더 붙어요.'), list);
    }

    // 추천 조합은 부위 선택 바로 아래(재료 칸 위)에: 재료 칸이 길어도 스크롤 없이 보이게. 내용은 아래에서 채운다
    const recHolder = h('div');
    if (tab === 'craft') left.append(recHolder);
    // 재료 선택: 인벤토리 칸. 누르면 1개 넣기, 왼쪽 위 −(또는 우클릭)로 1개 빼기
    const grid = h('div', { class: 'inv-grid' });
    const total = totalOf(sel);
    const tagsOf = (d: (typeof MATS)[MatId]) => {
      const tags: string[] = [];
      if (d.frag) tags.push(`${dirName(d.frag.dirs)}${d.frag.kind === 'slide' ? ` ${d.frag.range}칸` : d.frag.kind === 'step' ? ' 1칸' : ''}`);
      if (d.trait) tags.push(TRAITS[d.trait].name);
      if (d.ability) tags.push(`능력:${ABILITIES[d.ability].name}`);
      if (d.binder) tags.push('결합제');
      return tags;
    };
    // 칸 수 = 전체 재료 종류 수. 가진 재료만 앞에서부터 칸을 차지하고 나머지는 빈칸 (마인크래프트 인벤토리처럼)
    const allMats = MAT_ORDER.filter((id) => !MATS[id].key);
    const owned = allMats.filter((id) => matHave(id) > 0 || (sel[id] ?? 0) > 0);
    for (const id of owned) {
      const d = MATS[id];
      const have = matHave(id);
      const n = sel[id] ?? 0;
      const left0 = avail(id);
      const canAdd = left0 > 0 && total < MAX_MATS;
      const cell = h('button', { class: `inv-cell ${n ? 'sel' : ''} ${d.rare ? 'rare' : ''} ${focus === id ? 'focus' : ''}`, title: `${d.name}${tagsOf(d).length ? ` — ${tagsOf(d).join(' · ')}` : ''}` },
        matIcon(id, 30),
        left0 > 0 ? h('span', { class: 'inv-have' }, String(left0)) : null,
        n ? h('span', { class: 'inv-sel' }, `+${n}`) : null);
      const add = () => { focus = id; if (canAdd) { sel[id] = n + 1; clearCoach('mastery'); } render(); };
      // 칸 위 말풍선: 마우스를 올리면, 폰에서는 꾹 누르면 (꾹 누른 건 넣기로 치지 않는다)
      const tipText = [d.name, ...tagsOf(d), `가진 ${have}개`];
      let pressT = 0;
      let longPressed = false;
      cell.addEventListener('mouseenter', () => showTip(cell, tipText));
      cell.addEventListener('mouseleave', hideTip);
      cell.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        longPressed = false;
        pressT = window.setTimeout(() => { longPressed = true; showTip(cell, tipText); }, 380);
      });
      cell.addEventListener('pointerup', () => { clearTimeout(pressT); if (longPressed) setTimeout(hideTip, 1400); });
      cell.addEventListener('pointercancel', () => clearTimeout(pressT));
      cell.addEventListener('contextmenu', (e) => { if (longPressed) e.preventDefault(); });
      cell.addEventListener('click', () => { if (longPressed) { longPressed = false; return; } hideTip(); add(); });
      grid.append(cell);
    }
    // 마인크래프트 가방처럼 한 줄 9칸: 재료 종류 수를 9의 배수로 채운다 (25종 → 27칸, 3줄)
    const slotsN = Math.ceil(allMats.length / 9) * 9;
    for (let i = owned.length; i < slotsN; i++) grid.append(h('div', { class: 'inv-cell empty', 'aria-hidden': 'true' }));
    const invWrap = h('div', { class: 'inv-wrap' }, grid);
    left.append(h('div', { class: 'sub' }, `재료 (${total}/${MAX_MATS})`, h('span', { class: 'inv-how' }, ' — 눌러서 넣기 · 올려 두면 설명')), invWrap);
    // 💡 추천 조합 (제작 탭에서만)
    if (tab === 'craft') {
      const target: Slot = useMastery ? (curSlot() ?? slot) : slot;
      const recs = recommendByGoal(target);
      const box = h('div', { class: 'recs' }, h('div', { class: 'sub' }, `💡 추천 조합 — ${SLOT_INFO[target].name}${useMastery ? ' (숙련: 개수로 부위가 정해져요)' : ''}`));
      if (!recs.length) box.append(h('p', { class: 'muted small' }, `재료가 모자라요. ${SLOT_INFO[target].name}에는 섬유 말고 재료가 ${MIN_CORE[target]}개 이상 필요해요.`));
      for (const r of recs) {
        const b = h('button', { class: 'btn small' }, '넣기');
        b.addEventListener('click', () => { sel = { ...r.mats }; if (!useMastery) slot = target; clearCoach('mastery'); render(); });
        box.append(h('div', { class: 'rec', title: r.gain ? `새 행마 +${r.gain}칸` : '특성·능력 위주' }, h('span', { class: 'rec-goal' }, r.goal), h('b', {}, r.name), h('span', { class: 'chips' }, ...Object.entries(r.mats).filter(([, n]) => n).map(([id, n]) => h('span', { class: 'chip mat-chip' }, matIcon(id as MatId, 16), ` ×${n}`))), h('small', { class: 'rec-gain' }, r.gain ? `+${r.gain}칸` : '특성'), b));
      }
      recHolder.append(box);
    }
    left.append(h('p', { class: 'hint' }, '한 재료가 30% 이상이면 그 움직임이 붙어요 (최대 두 가지). 40% 이상이면 특성도 붙어요 (방어구는 20%). 들풀 섬유는 비율에 끼지 않고, 2개 이상 넣으면 품질이 1 올라가요.'));

    // 미리보기
    const cs = curSlot();
    right.append(h('div', { class: 'sub' }, '미리보기'));
    right.append(shareBar(tab === 'enhance' && enhId ? mergeMats(G.items.find((i) => i.id === enhId)!.mats, sel) : sel));
    const putIds = (Object.keys(sel) as MatId[]).filter((id) => (sel[id] ?? 0) > 0);
    const put = h('div', { class: 'put-list' }, h('span', { class: 'put-title' }, `넣은 재료 ${totalOf(sel)}/${MAX_MATS}`));
    if (!putIds.length) put.append(h('small', { class: 'muted' }, '왼쪽 인벤토리에서 재료를 눌러 넣으세요.'));
    for (const id of putIds) {
      const b = h('button', { class: 'put-chip', title: `${MATS[id].name} 1개 빼기` }, matIcon(id, 22), h('span', {}, `×${sel[id]}`));
      b.addEventListener('click', () => { focus = id; sel[id] = (sel[id] ?? 0) - 1; if (!sel[id]) delete sel[id]; render(); });
      put.append(b);
    }
    if (putIds.length > 1) {
      const clear = h('button', { class: 'put-clear' }, '모두 빼기');
      clear.addEventListener('click', () => { sel = {}; render(); });
      put.append(clear);
    }
    right.append(put);
    if (!cs) {
      right.append(h('p', { class: 'muted' }, tab === 'enhance' ? '장비를 고르자.' : '재료를 2개 이상 넣자.'));
      return;
    }
    let stats: ItemStats;
    let cost = 0;
    if (tab === 'enhance') {
      const it = G.items.find((i) => i.id === enhId)!;
      const before = itemStats(it);
      stats = computeItem(it.slot, mergeMats(it.mats, sel), it.quality, it.slot === 'weapon' ? shape : undefined);
      stats.name = `${stats.name} +${it.level + 1}`;
      cost = 15 * (it.level + 1);
      const gain = newSquares(before.rules, stats.rules);
      if (totalOf(sel)) right.append(h('p', { class: 'enh-gain' }, gain ? `이번 강화로 새로 닿는 칸 +${gain}` : '이번 강화로 새로 닿는 칸은 없어요 (특성·비율만 바뀌어요)'));
      right.append(h('div', { class: 'cmp' }, h('div', {}, h('div', { class: 'muted small' }, '지금'), h('b', {}, before.name), statsView(before, false)), h('div', { class: 'arrow' }, '→'), h('div', {}, h('div', { class: 'muted small' }, '강화 후'), h('b', {}, stats.name), statsView(stats, true))));
    } else {
      stats = computeItem(cs, sel, alch(), cs === 'weapon' ? shape : undefined);
      const cur = equipped(cs);
      // 숨은 무기(총)는 처음 만들기 전까지 정체를 보여 주지 않는다
      const secret = stats.rules.some((r) => r.gun) && !G.flags.gun_known;
      right.append(h('div', { class: 'preview-head' }, h('b', { class: 'iname' }, secret ? '???' : stats.name), h('span', { class: 'chip' }, SLOT_INFO[cs].name), alch() && !secret ? h('span', { class: 'chip' }, '연금술사 +1') : null));
      if (secret) {
        right.append(h('p', { class: 'secret-preview' }, '재료들이 서로 맞물리며 낯선 모양을 이룬다. 체스판에서 한 번도 본 적 없는 무언가가 만들어질 것 같다…'));
        stats.notes = [];
      } else if (cur) {
        // 지금 장착한 장비와 나란히 비교
        const before = itemStats(cur);
        right.append(h('div', { class: 'cmp' },
          h('div', {}, h('div', { class: 'muted small' }, '지금 장착'), h('b', {}, before.name), statsView(before, false)),
          h('div', { class: 'arrow' }, '→'),
          h('div', {}, h('div', { class: 'muted small' }, '새 장비'), h('b', {}, stats.name), statsView(stats, true))));
        // 바꾸면 늘어나는 칸 / 줄어드는 칸
        const up = newSquares(before.rules, stats.rules);
        const down = newSquares(stats.rules, before.rules);
        right.append(h('p', { class: 'cmp-diff' }, h('span', { class: 'up' }, `바꾸면 닿는 칸 +${up}`), ' · ', h('span', { class: down ? 'down' : 'muted' }, `잃는 칸 −${down}`)));
      } else right.append(statsView(stats));
      // 지금 가진 행마와 비교해 새로 생기는 칸 수 (겹치기만 하면 경고)
      if (stats.rules.length && !secret) {
        const others = loadout().rules.filter((r) => !(cur ? itemStats(cur).rules : []).some((x) => JSON.stringify(x) === JSON.stringify(r)));
        const gain = newSquares(others, stats.rules);
        right.append(gain > 0
          ? h('p', { class: 'gain' }, `새 행마 +${gain}칸 (3칸 범위 기준)`)
          : h('p', { class: 'gain none' }, '지금 가진 행마와 전부 겹친다. 다른 재료를 섞어 보자.'));
      }
      if (!cur) right.append(h('p', { class: 'muted small' }, '이 부위에 장착한 장비가 없어요. 만들면 바로 장착돼요.'));
      // 세트: 이 장비의 주 재료 계열과, 바꿔 끼우면 몇 개가 되는지
      if (!secret) {
        const fake = { id: -1, slot: cs, mats: sel, quality: 0, level: 0 };
        const fam = familiesOf(fake);
        const worn = SLOTS.filter((s) => s !== cs).map((s) => equipped(s)).filter((x): x is NonNullable<typeof x> => !!x);
        const after = setCounts([...worn, fake]);
        for (const f of fam) right.append(h('p', { class: `small set-hint ${(after[f] ?? 0) >= SET_NEED ? 'on' : ''}` }, `세트: ${SETS[f].name} — 장착하면 ${Math.min(after[f] ?? 0, SET_NEED)}/${SET_NEED}${(after[f] ?? 0) >= SET_NEED ? ` ✓ ${SETS[f].desc}` : ''}`));
      }
    }
    // 한 방향 집중: 무기 행마 재료마다 방향을 꼭 하나 고른다 (+ 원하면 칸 수를 줄여 압축) → 그 행마로 칠 때 피해 +
    let needDir = false;
    if (cs === 'weapon' && BAL.compress) {
      const src = tab === 'enhance' ? mergeMats(G.items.find((i) => i.id === enhId)!.mats, sel) : sel;
      const full = computeItem('weapon', src, 0); // 압축 전 모양 (방향 목록·칸 수 기준)
      const frags = full.shares.filter((x) => MATS[x.id].frag && x.share >= FRAG_MIN).slice(0, 2);
      if (frags.length) {
        const box = h('div', { class: 'shape-box' }, h('div', { class: 'sub' }, '한 방향 집중 — 행마 재료 한 개마다 방향을 하나씩 골라요. 같은 방향을 여러 번 고르면 그쪽이 길어져요'));
        for (const fr of frags) {
          const f = MATS[fr.id].frag!;
          const fullRule = full.rules.find((r) => r.kind === f.kind && r.dirs === f.dirs) ?? full.rules.find((r) => r.kind === f.kind);
          const fullRange = f.kind === 'slide' ? fullRule?.range ?? f.range : 1;
          const cur = shape[fr.id] ?? {};
          const picks = shapePicks(cur, fr.n).filter((d) => f.dirs[d]);
          const left = fr.n - picks.length;
          if (left > 0) needDir = true;
          const cnt = new Map<number, number>();
          for (const d of picks) cnt.set(d, (cnt.get(d) ?? 0) + 1);
          const caps = { ...(cur.caps ?? {}) };
          const setPicks = (p: number[], c = caps) => { shape = { ...shape, [fr.id]: { picks: p, caps: c } }; render(); };
          const groups = [...cnt].map(([d, c]) => {
            const max = f.kind === 'slide' ? slideRangeFor(f.range, c) : 1;
            return { d, c, max, r: f.kind === 'slide' && caps[d] ? Math.max(1, Math.min(max, caps[d])) : max };
          });
          const bonus = picks.length ? compressBonus(f.dirs.length * fullRange, groups.reduce((t, g) => t + g.r, 0)) : 0;
          // 작은 판: 가운데가 내 말. 방향 칸을 누를 때마다 재료 한 개를 그쪽에 (다 고른 뒤 누르면 그 방향에서 하나 빼기)
          const rad = Math.max(...f.dirs.map(([dx, dy]) => Math.max(Math.abs(dx), Math.abs(dy))));
          const n = rad * 2 + 1;
          const pad = h('div', { class: 'shape-pad', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
          for (let y = -rad; y <= rad; y++) {
            for (let x = -rad; x <= rad; x++) {
              const di = f.dirs.findIndex(([dx, dy]) => dx === x && dy === y);
              if (x === 0 && y === 0) { pad.append(h('span', { class: 'shape-me' }, '♙')); continue; }
              if (di < 0) { pad.append(h('span', { class: 'shape-off' })); continue; }
              const c = cnt.get(di) ?? 0;
              const b = h('button', { class: `shape-dir ${left > 0 ? 'on' : ''} ${c ? 'picked' : ''}`, title: left > 0 ? '이 방향에 재료 하나' : c ? '이 방향에서 하나 빼기' : '' }, c > 1 ? String(c) : '');
              b.addEventListener('click', () => {
                if (left > 0) setPicks([...picks, di]);
                else if (c) { const i = picks.lastIndexOf(di); const p = picks.filter((_, j) => j !== i); const nc = { ...caps }; if (c === 1) delete nc[di]; setPicks(p, nc); }
              });
              pad.append(b);
            }
          }
          const reset = h('button', { class: 'btn small', disabled: !picks.length }, '다시 고르기');
          reset.addEventListener('click', () => setPicks([], {}));
          const ctl = h('div', { class: 'shape-ctl' },
            h('span', { class: left > 0 ? 'shape-need' : 'muted small' }, left > 0 ? `방향 ${left}개 더 골라 주세요 (${picks.length}/${fr.n})` : `${fr.n}개 모두 골랐어요`), reset);
          // 미끄러지는 행마: 방향마다 칸 수를 원하면 더 줄이기 (압축, 선택)
          if (f.kind === 'slide') {
            for (const g of groups) {
              const [dx, dy] = f.dirs[g.d];
              const minus = h('button', { class: 'btn small', disabled: g.r <= 1 }, '−');
              const plus = h('button', { class: 'btn small', disabled: g.r >= g.max }, '+');
              minus.addEventListener('click', () => setPicks(picks, { ...caps, [g.d]: g.r - 1 }));
              plus.addEventListener('click', () => { const nc = { ...caps }; if (g.r + 1 >= g.max) delete nc[g.d]; else nc[g.d] = g.r + 1; setPicks(picks, nc); });
              ctl.append(h('span', { class: 'shape-range' }, h('span', { class: 'shape-arrow' }, ARROW(dx, dy)), minus, h('b', {}, `${g.r}칸`), plus));
            }
          }
          box.append(h('div', { class: 'shape-row' },
            h('div', { class: 'shape-name' }, matIcon(fr.id, 20), h('b', {}, `${MATS[fr.id].name} ×${fr.n}`)),
            pad, ctl,
            h('span', { class: `shape-bonus ${bonus ? 'on' : ''}` }, !picks.length ? '—' : bonus ? `피해 +${bonus}` : '추가 피해 없음')));
        }
        box.append(h('p', { class: 'hint small' }, '피해: 이 재료가 원래 닿던 칸 수와 비교해 남은 칸이 1칸이면 +2, 3분의 1 이하면 +1. 미끄러지는 행마는 같은 방향에 1개 더할 때마다 1칸 길어지고, −로 더 줄여 압축할 수 있어요. 고른 방향은 장비에 기억되고, 강화로 재료를 더 넣으면 그만큼 더 골라요.'));
        right.append(box);
      }
    }
    // 비율이 모자라 효과가 안 붙는 재료: 빨간 경고 대신 '몇 개 더 넣으면 붙는지' 알려 준다 (베타 의견: 빨간 글씨만 4줄)
    if (cs) {
      const src = tab === 'enhance' && enhId ? mergeMats(G.items.find((i) => i.id === enhId)!.mats, sel) : sel;
      const core = totalOf(src, false);
      const room = MAX_MATS - totalOf(src);
      const tmin = cs === 'armor' ? ARMOR_TRAIT_MIN : TRAIT_MIN;
      const tips: HTMLElement[] = [];
      const need = (n: number, min: number) => Math.max(1, Math.ceil((min * core - n) / (1 - min)));
      for (const [id, n] of Object.entries(src) as [MatId, number][]) {
        if (!n || MATS[id].binder || !core) continue;
        const share = n / core;
        const wants: string[] = [];
        const m = MATS[id];
        if ((cs === 'weapon' || cs === 'boots') && m.frag && share < FRAG_MIN) wants.push(`${need(n, FRAG_MIN)}개 더 넣으면 행마`);
        if (m.trait && share < tmin) wants.push(`${need(n, tmin)}개 더 넣으면 특성`);
        if (!wants.length) continue;
        const k = Math.min(...wants.map((w) => Number(w.split('개')[0])));
        tips.push(h('li', {}, matIcon(id, 16), ' ', h('b', {}, m.name), k <= room ? ` — ${wants.join(', ')}이(가) 붙어요` : ' — 비율이 낮아 지금은 효과가 없어요. 빼도 괜찮아요'));
      }
      if (tips.length) right.append(h('ul', { class: 'notes tips' }, ...tips));
    }
    const notes = stats.notes.filter((n) => !n.includes('미만)'));
    if (notes.length) right.append(h('ul', { class: 'notes' }, ...notes.map((n) => h('li', {}, n))));

    const coreN = totalOf(sel, false);
    const ok = !needDir && (tab === 'enhance' ? totalOf(sel) >= 1 && G.gold >= cost : coreN >= MIN_CORE[cs] && totalOf(sel) >= 2);
    const row = h('div', { class: 'row gap f-actions' });
    const quick = h('button', { class: 'btn', disabled: !ok }, tab === 'enhance' ? `강화 (${cost}G)` : '바로 제작');
    const hammer = h('button', { class: 'btn primary', disabled: !ok }, '망치질하며 ', tab === 'enhance' ? '강화' : '제작', h('small', {}, ' 품질 ±1'));
    quick.addEventListener('click', () => finish(0));
    hammer.addEventListener('click', () => hammerGame().then((q) => finish(q, true)));
    row.append(quick, hammer);
    if (tab === 'enhance' && G.gold < cost) row.append(h('span', { class: 'muted small' }, '골드가 부족하다'));
    if (tab === 'craft' && G.equip[cs]) right.append(h('p', { class: 'warn-swap' }, `지금 낀 ${SLOT_INFO[cs].name}와(과) 바꿔 껴요. 전에 끼던 건 장비 창에 남아요.`));
    if (tab === 'craft' && coreN < MIN_CORE[cs]) row.append(h('span', { class: 'muted small' }, `${SLOT_INFO[cs].name}에는 섬유 말고 재료가 ${MIN_CORE[cs]}개 이상 필요해요 (지금 ${coreN}개)`));
    if (needDir) row.append(h('span', { class: 'muted small' }, '행마 재료마다 방향을 하나 골라야 만들 수 있어요 (한 방향 집중)'));
    // 제작 버튼 줄은 창 맨 아래에 붙어 있다 (재료를 넣고 스크롤하지 않아도 바로 누를 수 있게)
    row.prepend(h('span', { class: 'f-count' }, tab === 'enhance' ? `더 넣을 재료 ${totalOf(sel)}개` : `넣은 재료 ${totalOf(sel)}/${MAX_MATS}`));
    root.append(row);

    function finish(q: number, hammered = false) {
      clearCoach('forge'); // 첫 안내는 실제로 만들었을 때 끝난다
      let replaced: string | null = null;
      const colors = (Object.keys(sel) as MatId[]).flatMap((id) => Array(sel[id] ?? 0).fill(MATS[id].color));
      if (!spendMats(sel)) {
        toast('재료가 부족하다', 'bad');
        return;
      }
      const grew = useMats(sel);
      let it: Item;
      if (tab === 'enhance') {
        it = G.items.find((i) => i.id === enhId)!;
        it.mats = mergeMats(it.mats, sel);
        if (it.slot === 'weapon') it.shape = { ...shape };
        it.quality += q;
        it.level++;
        G.gold -= cost;
      } else {
        it = { id: G.nextId++, slot: cs!, mats: { ...sel }, quality: alch() + q, level: 0, ...(cs === 'weapon' && Object.keys(shape).length ? { shape: { ...shape } } : {}) };
        G.items.push(it);
        // 새로 만든 장비는 바로 장착한다 (전에 끼던 장비는 장비 창에 남는다)
        replaced = G.equip[it.slot] ? itemStats(G.items.find((i) => i.id === G.equip[it.slot])!).name : null;
        G.equip[it.slot] = it.id;
        // 레시피 노트에 기록 (같은 조합은 한 번만)
        const sig = `${it.slot}|${JSON.stringify(Object.entries(it.mats).sort())}`;
        if (!G.recipes.some((r) => `${r.slot}|${JSON.stringify(Object.entries(r.mats).sort())}` === sig)) {
          G.recipes.push({ slot: it.slot, mats: { ...it.mats }, name: computeItem(it.slot, it.mats, it.quality).name });
        }
        emit('craft', it);
        if (itemStats(it).rules.some((r) => r.gun)) G.flags.gun_life = true; // 이번 생에 만들었다 (기록하는 자 대사용)
        if (itemStats(it).rules.some((r) => r.gun) && !G.flags.gun_known) {
          G.flags.gun_known = true;
          emit('gun');
          toast('…기보 밖의 무기가 모습을 드러냈다.', 'rare');
        }
      }
      if (tab === 'enhance') emit('enhance', it.level);
      if (q !== 0) emit('hammer', q);
      if (hammered) {
        G.flags.hstreak = q > 0 ? Number(G.flags.hstreak ?? 0) + 1 : 0;
        emit('hstreak', G.flags.hstreak);
      }
      const s = itemStats(it);
      log(`🔨 ${s.name} ${tab === 'enhance' ? '강화' : '제작'}${q > 0 ? ' (완벽한 망치질!)' : q < 0 ? ' (망치질 실패)' : ''}`);
      sel = {};
      save();
      if (grew.length) setTimeout(() => toast(`📜 ${grew.join(', ')}의 설명이 조금 더 드러났다 (도감)`, 'info'), 1300);
      celebrate(root, s, colors, q, G.equip[it.slot] === it.id, replaced).then(() => { render(); onChange(); });
    }
  }
  render();
  return m;
}

/** 망치질 미니게임: 움직이는 바늘을 멈춘다. 가운데 +1, 초록 0, 밖 -1 */
/**
 * 망치질 (베타 의견: 감을 잡으면 너무 쉬웠다 → 단계를 늘린 미니게임)
 *  1) 달구기: 누르고 있으면 쇠가 달아오른다. 금빛 구간에서 손을 떼라 (너무 달구면 실패)
 *  2) 두드리기 ×3: 바늘이 오갈 때 금빛 칸에서 친다. 칠 때마다 금빛 칸 자리가 바뀌고 바늘이 빨라진다
 * 판정마다 완벽 +1 · 좋음 0 · 실패 -1. 합이 3 이상이면 품질 +1, -1 이하면 -1, 그 사이면 0
 */
function hammerGame(): Promise<number> {
  return new Promise((res) => {
    const wide = perk('hammer'); // 장인의 손목: 판정 칸이 넓다
    const pz = wide ? 0.07 : 0.05;
    const gz = wide ? 0.17 : 0.13;
    const title = h('p', { class: 'hm-step' });
    const marks = h('div', { class: 'hm-marks' });
    const zoneGood = h('b', { class: 'zone good' });
    const zonePerf = h('b', { class: 'zone perfect' });
    const needle = h('i', { class: 'needle' });
    const fill = h('i', { class: 'heat-fill' });
    const bar = h('div', { class: 'hbar' }, zoneGood, zonePerf, fill, needle);
    const btn = h('button', { class: 'btn primary big' }, '');
    const body = h('div', { class: 'hammer' }, title, marks, bar, btn, h('p', { class: 'muted small' }, '스페이스 키로도 할 수 있어요'));
    const m = modal('망치질', body, { closable: false });
    let score = 0;
    const results: number[] = [];
    const place = (center: number) => {
      zoneGood.style.left = `${(center - gz) * 100}%`;
      zoneGood.style.width = `${gz * 200}%`;
      zonePerf.style.left = `${(center - pz) * 100}%`;
      zonePerf.style.width = `${pz * 200}%`;
    };
    const judge = (p: number, center: number) => {
      const d = Math.abs(p - center);
      return d < pz ? 1 : d < gz ? 0 : -1;
    };
    const showResult = (q: number) => {
      results.push(q);
      score += q;
      marks.append(h('span', { class: `hm-mark ${q > 0 ? 'p' : q < 0 ? 'm' : 'g'}` }, q > 0 ? '★' : q < 0 ? '✕' : '●'));
      body.classList.remove('hit-perfect', 'hit-good', 'hit-miss');
      void body.offsetWidth;
      body.classList.add(q > 0 ? 'hit-perfect' : q < 0 ? 'hit-miss' : 'hit-good');
      sfx(q > 0 ? 'perfect' : 'hammer');
    };
    let cleanup = () => {};
    const finishAll = () => {
      cleanup();
      const q = score >= 3 ? 1 : score <= -1 ? -1 : 0;
      title.textContent = q > 0 ? '완벽하게 벼려졌다!' : q < 0 ? '쇠가 상했다…' : '그럭저럭 벼려졌다';
      btn.textContent = q > 0 ? '품질 +1' : q < 0 ? '품질 -1' : '품질 그대로';
      btn.disabled = true;
      setTimeout(() => { m.close(); res(q); }, 900);
    };
    // 1) 달구기
    const heat = () => {
      const center = 0.6 + Math.random() * 0.22;
      place(center);
      needle.style.display = 'none';
      fill.style.display = 'block';
      title.textContent = '1. 달구기 — 꾹 누르고 있다가, 금빛 구간에서 손을 떼세요';
      btn.textContent = '꾹 눌러 달구기';
      let v = 0;
      let holding = false;
      let raf = 0;
      let last = 0;
      let over = false;
      const tick = (now: number) => {
        if (!holding) return;
        const dt = last ? (now - last) / 1000 : 0;
        last = now;
        v += dt * (0.32 + v * 0.55); // 갈수록 빨리 달아오른다
        fill.style.width = `${Math.min(1, v) * 100}%`;
        if (v >= 1) { release(); return; }
        raf = requestAnimationFrame(tick);
      };
      const press = (e?: Event) => { e?.preventDefault(); if (holding || over) return; holding = true; last = 0; raf = requestAnimationFrame(tick); };
      const release = () => {
        if (!holding || over) return;
        holding = false;
        over = true;
        cancelAnimationFrame(raf);
        showResult(judge(Math.min(1, v), center));
        unbind();
        setTimeout(() => strike(0), 550);
      };
      const kd = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); } };
      const ku = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); release(); } };
      btn.addEventListener('pointerdown', press);
      window.addEventListener('pointerup', release);
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup', ku);
      const unbind = () => {
        btn.removeEventListener('pointerdown', press);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('keydown', kd);
        window.removeEventListener('keyup', ku);
      };
      cleanup = unbind;
    };
    // 2) 두드리기 ×3: 칠 때마다 금빛 칸이 옮겨 가고 바늘이 빨라진다
    const strike = (i: number) => {
      if (i >= 3) { finishAll(); return; }
      const center = 0.2 + Math.random() * 0.6;
      place(center);
      fill.style.display = 'none';
      needle.style.display = 'block';
      title.textContent = `2. 두드리기 (${i + 1}/3) — 바늘이 금빛 칸에 올 때 쾅!`;
      btn.textContent = '쾅!';
      const speed = 3.2 + i * 0.9;
      const phase = Math.random() * Math.PI * 2;
      let t = 0;
      let last = performance.now();
      let raf = 0;
      let done = false;
      const pos = () => (Math.sin(t * speed + phase) + 1) / 2;
      const loop = (now: number) => {
        t += (now - last) / 1000;
        last = now;
        needle.style.left = `${pos() * 100}%`;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      const hit = (e?: Event) => {
        e?.preventDefault();
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        unbind();
        showResult(judge(pos(), center));
        setTimeout(() => strike(i + 1), 500);
      };
      const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) hit(e); };
      btn.addEventListener('pointerdown', hit);
      window.addEventListener('keydown', kd);
      const unbind = () => { btn.removeEventListener('pointerdown', hit); window.removeEventListener('keydown', kd); };
      cleanup = unbind;
    };
    heat();
  });
}

/** 강조 연출: 재료가 모루로 빨려 들어가고 불꽃 뒤 완성품이 떠오른다 */
function celebrate(root: HTMLElement, s: ItemStats, colors: string[], q: number, equippedNow: boolean, replaced: string | null = null): Promise<void> {
  // 완성 연출: 모루를 땅·땅·땅 세 번 두드리고 → 화면 테두리가 반짝 → 완성품 (예전의 날아드는 점·불꽃 점은 뺐다)
  void colors;
  return new Promise((res) => {
    const stage = h('div', { class: 'celebrate' });
    const hammer = h('div', { class: 'cele-hammer' }, '🔨');
    const anvil = h('div', { class: 'anvil' });
    const bang = h('div', { class: 'cele-bang' });
    stage.append(anvil, hammer, bang);
    root.append(stage);
    const replay = (el: HTMLElement, cls: string) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const hit = (i: number) => {
      replay(hammer, 'strike');
      setTimeout(() => {
        sfx(i === 2 && q > 0 ? 'perfect' : 'hammer');
        bang.textContent = '땅!';
        replay(bang, 'pop');
        replay(anvil, 'jolt');
      }, 140);
    };
    const gap = 360;
    [0, 1, 2].forEach((i) => setTimeout(() => hit(i), 120 + i * gap));
    // 세 번째 뒤: 화면 테두리가 반짝
    setTimeout(() => {
      const glow = h('div', { class: q > 0 ? 'screen-glow perfect' : 'screen-glow' });
      document.body.append(glow);
      setTimeout(() => glow.remove(), 900);
      hammer.remove();
      bang.remove();
    }, 120 + 3 * gap);
    setTimeout(() => {
      const note = equippedNow ? `✓ 바로 장착했어요.${replaced ? ` (전에 끼던 ${replaced}은(는) 장비 창에 있어요)` : ''}` : '장비 창에서 장착할 수 있어요.';
      const card = h('div', { class: q > 0 ? 'result-card perfect' : 'result-card' }, h('div', { class: 'rc-title' }, s.name), statsView(s), h('div', { class: 'equipped-note' }, note), h('button', { class: 'btn primary' }, '확인'));
      stage.append(card);
      card.querySelector('button')!.addEventListener('click', () => { stage.classList.add('out'); setTimeout(() => { stage.remove(); res(); }, 200); });
    }, 120 + 3 * gap + 420);
  });
}
