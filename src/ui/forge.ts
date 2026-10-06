// 대장간: 개조 / 강화 (장비 개편 — 장비는 몹이 떨어뜨리고, 여기서는 다듬는다)
import { termify } from './glossary';
import { sfx } from '../core/sfx';
import { perk } from '../game/rewards';
import { HAMMER_Q_MAX, ITEM_MAX_LEVEL, Item, ItemStats, ModEff, Q_TIERS, SLOTS, SLOT_INFO, affixLabel, arrowOf, itemStats, modLabel, modOptions, qTier, rollAffix } from '../core/items';
import { MoveRule, describeRule, dirName, previewPattern } from '../core/rules';
import { G, addItem, baseRules, emit, equipped, log, matHave, save, spendMats } from '../core/state';
import { ABILITIES, MATS, MAT_ORDER, MatId, TRAITS } from '../data/materials';
import { BASES, FAM_NAME, FAM_STYLE, UNIQ } from '../data/gear';
import { AREAS } from '../data/areas';
import { PIECES } from '../data/pieces';
import { Vec } from '../core/geom';
import { pieceSrc } from '../render/sprites';
import { artUrl } from '../render/art';
import { applyCoachFocus, clearCoach, coachNow, setCoachFocus, dialog, h, modal, patternGrid, toast } from './dom';
import { useMats } from './lore';

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
  for (const r of s.rules) ul.append(h('li', { class: `r-${r.mode}` }, ...termify(describeRule(r))));
  for (const [t, lv] of Object.entries(s.traits)) ul.append(h('li', { class: 'r-trait' }, ...termify(`${TRAITS[t as keyof typeof TRAITS].name} Lv${lv} — ${TRAITS[t as keyof typeof TRAITS].desc(lv!)}`)));
  if (s.ability) ul.append(h('li', { class: 'r-ability' }, ...termify(`능력 ${ABILITIES[s.ability.id].name} Lv${s.ability.lv} — ${ABILITIES[s.ability.id].desc(s.ability.lv)}`)));
  if (s.uniq) ul.append(h('li', { class: 'r-uniq' }, `고유 ${UNIQ[s.uniq].name} — ${UNIQ[s.uniq].desc}`));
  for (const a of s.affix) ul.append(h('li', { class: 'r-affix' }, ...termify(`덤: ${affixLabel(a)}`)));
  if (!ul.children.length) ul.append(h('li', { class: 'muted' }, '효과 없음'));
  box.append(ul);
  return box;
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


/**
 * 대장간 (장비 개편): 장비는 몹이 떨어뜨리고, 여기서는 다듬는다.
 *  - 개조: 개조 칸 하나에 재료 하나. 재료가 가진 효과 중 하나를 고른다 (행마 재료는 방향 하나)
 *  - 강화: +1~+3. 골드와 그 장비의 재료. 망치질하면 품질 %도 오른다 (99%까지 — 걸작은 드랍으로만)
 *  - 의식: 녹슨 방아쇠를 가졌을 때만 보이는 숨은 장비
 * craftOnly(야영지 떠돌이 대장장이 등)는 개조만 된다.
 */
export function openForge(onChange: () => void, opts: { craftOnly?: boolean } = {}) {
  let tab: 'mod' | 'enhance' = 'mod';
  const firstPick = () => (SLOTS.map((s) => equipped(s)).find((it) => it && !itemStats(it).legacy) ?? G.items.find((it) => !itemStats(it).legacy))?.id ?? null;
  let selId: number | null = firstPick();
  let pickMat: MatId | null = null;
  const root = h('div', { class: 'forge' });
  const m = modal(opts.craftOnly ? '떠돌이 대장장이' : '대장간', root, { wide: true, onClose: () => { hideTip(); onChange(); } });
  const sel = () => G.items.find((i) => i.id === selId) ?? null;
  const region = () => Math.max(1, Math.min(4, AREAS[G.area]?.region || 1));

  function render() {
    hideTip();
    if (coachNow() === 'forge') setCoachFocus('.f-items .enh-item');
    queueMicrotask(applyCoachFocus);
    root.innerHTML = '';
    const tabs = h('div', { class: 'tabs' });
    if (opts.craftOnly) tabs.append(h('span', { class: 'muted small' }, '떠돌이 대장장이: "모루가 작아서 개조만 돼. 강화는 마을 대장간에서 하게."'));
    else for (const [k, label] of [['mod', '개조'], ['enhance', '강화']] as const) {
      const b = h('button', { class: `tab ${tab === k ? 'on' : ''}` }, label);
      b.addEventListener('click', () => { tab = k; pickMat = null; render(); });
      tabs.append(b);
    }
    root.append(tabs);
    const left = h('div', { class: 'f-left' });
    const right = h('div', { class: 'f-right' });
    root.append(h('div', { class: 'f-cols' }, left, right));

    // 왼쪽: 장비 목록 (장착한 것 먼저). 옛 방식 장비는 손댈 수 없다
    const list = h('div', { class: 'enh-list f-items' });
    const items = [...G.items].sort((a, b) => Number(G.equip[b.slot] === b.id) - Number(G.equip[a.slot] === a.id));
    if (!items.length) list.append(h('p', { class: 'muted' }, '아직 장비가 없다. 몹을 쓰러뜨리면 가끔 장비를 떨어뜨린다.'));
    for (const it of items) {
      const s = itemStats(it);
      const on = G.equip[it.slot] === it.id;
      const t = Q_TIERS[s.tier ?? 0];
      const b = h('button', { class: `enh-item ${selId === it.id ? 'on' : ''} ${s.legacy ? 'legacy' : ''}`, disabled: s.legacy, title: s.legacy ? '옛 방식 장비는 개조·강화할 수 없어요' : '' },
        h('b', { style: s.legacy ? {} : { color: t.color } }, s.name),
        h('small', {}, `${SLOT_INFO[it.slot].name}${on ? ' · 장착' : ''}${s.legacy ? ' · 옛 장비' : ` · ${s.mods.length}/${s.slotsN}칸`}`));
      b.addEventListener('click', () => { selId = it.id; pickMat = null; clearCoach('forge'); render(); });
      list.append(b);
    }
    left.append(h('div', { class: 'sub' }, tab === 'mod' ? '개조할 장비' : '강화할 장비'), list);
    ritual(left);

    const it = sel();
    if (!it || itemStats(it).legacy) {
      right.append(h('p', { class: 'muted' }, '왼쪽에서 장비를 고르세요.'));
      return;
    }
    const s = itemStats(it);
    right.append(itemHead(s), statsView(s));
    if (tab === 'mod') modPanel(it, s, right);
    else enhancePanel(it, s, right);
  }

  /** 개조: 칸 보기 → 재료 고르기 → 효과 고르기 */
  function modPanel(it: Item, s: ItemStats, right: HTMLElement) {
    const slots = h('div', { class: 'mod-slots' });
    for (let i = 0; i < s.slotsN; i++) {
      const md = s.mods[i];
      if (md) {
        const cost = 10 * region();
        const x = h('button', { class: 'btn small ghost', title: `개조를 지운다 (${cost}G, 넣은 재료는 사라져요)`, disabled: G.gold < cost }, `지우기 ${cost}G`);
        x.addEventListener('click', () => {
          dialog('개조 지우기', `${modLabel(md)} 개조를 지울까요? ${cost}G가 들고, 넣은 재료는 돌아오지 않아요.`, [
            { label: '지운다', onPick: () => { G.gold -= cost; it.mods = (it.mods ?? []).filter((_, j) => j !== i); save(); render(); onChange(); } },
            { label: '그만둔다', onPick: () => {} },
          ]);
        });
        slots.append(h('div', { class: 'mod-slot full' }, matIcon(md.mat, 20), h('span', {}, modLabel(md)), x));
      } else slots.append(h('div', { class: 'mod-slot empty' }, h('span', { class: 'muted' }, '빈 개조 칸')));
    }
    right.append(h('div', { class: 'sub' }, `개조 칸 ${s.mods.length}/${s.slotsN}`, h('span', { class: 'inv-how' }, ' — 품질이 높을수록 칸이 많아요')), slots);
    if (s.mods.length >= s.slotsN) {
      right.append(h('p', { class: 'hint' }, '개조 칸이 다 찼어요. 지우고 다시 넣거나, 품질이 더 높은 장비를 찾아보세요.'));
      return;
    }
    // 재료 고르기: 이 장비에 쓸 수 있는 효과가 있는 재료만
    const usableMats = MAT_ORDER.filter((id) => !MATS[id].key && matHave(id) > 0 && modOptions(it, id).length);
    right.append(h('div', { class: 'sub' }, '넣을 재료', h('span', { class: 'inv-how' }, ' — 눌러서 고르기 · 올려 두면 설명')));
    if (!usableMats.length) {
      right.append(h('p', { class: 'muted small' }, '이 장비에 넣을 수 있는 재료가 없어요. 행마 재료(무기·신발)나 특성 재료를 모아 오세요.'));
      return;
    }
    right.append(invGrid(usableMats.map((id) => ({ id, n: matHave(id), sel: pickMat === id ? 1 : 0 })), {
      desc: (id) => matTags(id).join(' · '),
      onClick: (id) => { pickMat = pickMat === id ? null : id; render(); },
    }));
    if (!pickMat) return;
    const opts2 = modOptions(it, pickMat);
    const box = h('div', { class: 'mod-opts' }, h('div', { class: 'sub' }, `${MATS[pickMat].name}로 무엇을 할까요?`));
    const dirs = opts2.filter((o) => o.e.t === 'dir');
    if (dirs.length) {
      // 방향 고르기: 작은 판 위에 화살표 (가운데가 내 말)
      const R = Math.max(...dirs.map((o) => Math.max(Math.abs((o.e as { d: Vec }).d[0]), Math.abs((o.e as { d: Vec }).d[1]))));
      const size = R * 2 + 1;
      const grid = h('div', { class: 'dir-pick', style: { gridTemplateColumns: `repeat(${size}, 30px)` } });
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        const o = dirs.find((d) => (d.e as { d: Vec }).d[0] === x && (d.e as { d: Vec }).d[1] === y);
        if (x === 0 && y === 0) { grid.append(h('span', { class: 'dir-me' }, '♟')); continue; }
        if (!o) { grid.append(h('span', { class: 'dir-off' })); continue; }
        const b = h('button', { class: `dir-btn ${o.ok ? '' : 'no'}`, disabled: !o.ok, title: o.ok ? `${o.label} (${arrowOf([x, y])})` : o.why ?? '' }, arrowOf([x, y]).replace('(L)', ''));
        b.addEventListener('click', () => apply(it, pickMat!, o.e));
        grid.append(b);
      }
      const kind = MATS[pickMat].frag!.kind;
      box.append(h('p', { class: 'small muted' }, `방향 하나 추가 (${kind === 'slide' ? '그 방향으로 2칸까지 미끄러지기' : kind === 'hop' ? '그 줄에서 말 하나를 넘어' : kind === 'leap' ? '그 칸으로 뛰어' : '그 방향 1칸'}${s.base?.slot === 'weapon' ? ' 공격' : ' 이동'}). 같은 방향을 또 넣으면 길어져요.`), grid);
    }
    for (const o of opts2.filter((x) => x.e.t !== 'dir')) {
      const b = h('button', { class: 'btn small', disabled: !o.ok, title: o.why ?? '' }, o.label);
      b.addEventListener('click', () => apply(it, pickMat!, o.e));
      box.append(h('div', { class: 'row gap' }, b, o.ok ? null : h('span', { class: 'muted small' }, o.why ?? '')));
    }
    right.append(box);
  }

  function apply(it: Item, mat: MatId, e: ModEff) {
    if (!spendMats({ [mat]: 1 })) { toast('재료가 부족하다', 'bad'); return; }
    const before = itemStats(it);
    it.mods = [...(it.mods ?? []), { mat, e }];
    useMats({ [mat]: 1 });
    emit('craft', it);
    const after = itemStats(it);
    log(`🔨 ${after.name} 개조: ${modLabel({ mat, e })}`);
    pickMat = null;
    save();
    celebrate(root, after, [], 0, G.equip[it.slot] === it.id, null, newSquares(before.rules, after.rules)).then(() => { render(); onChange(); });
  }

  /** 강화: 골드 + 그 장비의 재료, 망치질하면 품질도 오른다 */
  function enhancePanel(it: Item, s: ItemStats, right: HTMLElement) {
    if (it.level >= ITEM_MAX_LEVEL) {
      right.append(h('p', { class: 'hint' }, `+${ITEM_MAX_LEVEL}까지 강화했어요. 더 강하게 하려면 개조 칸을 쓰세요.`));
      return;
    }
    const b = s.base!;
    const gold = 15 * (it.level + 1) * Math.max(1, b.region);
    const need = it.level + 1;
    const have = matHave(b.mat);
    const ok = G.gold >= gold && have >= need;
    const fake: Item = { ...it, level: it.level + 1 };
    const next = itemStats(fake);
    right.append(h('div', { class: 'sub' }, `+${it.level + 1} 강화`),
      h('div', { class: 'cmp' }, h('div', {}, h('div', { class: 'muted small' }, '지금'), h('b', {}, s.name), statsView(s, false)), h('div', { class: 'arrow' }, '→'), h('div', {}, h('div', { class: 'muted small' }, '강화 후'), h('b', {}, next.name), statsView(next, false))),
      h('p', { class: 'small' }, '필요: ', h('b', {}, `${gold}G`), ' · ', matIcon(b.mat, 16), ` ${MATS[b.mat].name} ×${need} (가진 ${have})`),
      h('p', { class: 'hint' }, it.level + 1 === 2 ? '+2는 계열 특성이 붙어요.' : '+1·+3은 가장 긴 줄이 1칸 길어져요 (줄이 없으면 특성).', ' 망치질하면 품질도 +1~5% 올라요 (99%까지).'));
    const row = h('div', { class: 'row gap f-actions' });
    const quick = h('button', { class: 'btn', disabled: !ok }, `바로 강화 (품질 +1%)`);
    const hammer = h('button', { class: 'btn primary', disabled: !ok }, '망치질하며 강화', h('small', {}, ' 품질 +1~5%'));
    quick.addEventListener('click', () => finish(1));
    hammer.addEventListener('click', () => hammerGame().then((q) => finish(q > 0 ? 5 : q === 0 ? 3 : 1, q)));
    row.append(quick, hammer);
    if (!ok) row.append(h('span', { class: 'muted small' }, G.gold < gold ? '골드가 부족하다' : '재료가 부족하다'));
    right.append(row);

    function finish(dq: number, hq?: number) {
      if (G.gold < gold || !spendMats({ [b.mat]: need })) { toast('재료가 부족하다', 'bad'); return; }
      G.gold -= gold;
      it.level++;
      const q0 = it.q ?? 0;
      if (q0 < 100) it.q = Math.min(HAMMER_Q_MAX, q0 + dq);
      emit('enhance', it.level);
      if (hq !== undefined) {
        if (hq !== 0) emit('hammer', hq);
        G.flags.hstreak = hq > 0 ? Number(G.flags.hstreak ?? 0) + 1 : 0;
        emit('hstreak', G.flags.hstreak);
      }
      const ns = itemStats(it);
      log(`🔨 ${ns.name} 강화 (품질 ${q0}% → ${it.q}%)`);
      if (qTier(it.q ?? 0) > qTier(q0)) toast(`품질이 「${Q_TIERS[qTier(it.q ?? 0)].name}」이 되었다! 개조 칸·덤 효과가 늘어날 수 있어요.`, 'rare', 3500);
      if (qTier(it.q ?? 0) > qTier(q0)) growAffix(it, q0);
      save();
      celebrate(root, ns, [], hq ?? 0, G.equip[it.slot] === it.id, null).then(() => { render(); onChange(); });
    }
  }

  /** 의식: 녹슨 방아쇠가 있을 때만 보인다 (거울 파편·기보 파편과 함께 숨은 무기) */
  function ritual(el: HTMLElement) {
    if (opts.craftOnly || matHave('trigger') < 1) return;
    const ok = matHave('mirror') >= 1 && matHave('shard') >= 1;
    const known = !!G.flags.gun_known;
    const b = h('button', { class: 'btn small', disabled: !ok }, known ? '기보 밖의 총 벼리기' : '???');
    b.addEventListener('click', () => {
      if (!spendMats({ trigger: 1, mirror: 1, shard: 1 })) return;
      const it = addItem('gun', 50 + Math.floor(Math.random() * 30));
      G.flags.gun_life = true;
      if (!G.flags.gun_known) { G.flags.gun_known = true; emit('gun'); toast('…기보 밖의 무기가 모습을 드러냈다.', 'rare'); }
      save();
      celebrate(root, itemStats(it), [], 1, G.equip.weapon === it.id, null).then(() => { selId = it.id; render(); onChange(); });
    });
    el.append(h('div', { class: 'ritual' }, h('div', { class: 'sub' }, '모루 구석'), h('p', { class: 'small muted' }, known ? '방아쇠·거울 파편·기보 파편' : MATS.trigger.hint ?? ''), b));
  }

  render();
  return m;
}

/** 품질 구간이 올라가 덤 효과 수가 늘었으면 하나 더 붙인다 */
function growAffix(it: Item, q0: number) {
  const want = Q_TIERS[qTier(it.q ?? 0)].affix;
  const have = it.affix?.length ?? 0;
  if (want > have && qTier(it.q ?? 0) > qTier(q0)) {
    const more = rollAffix(want, BASES[it.base!]?.fam).filter((a) => !(it.affix ?? []).some((x) => JSON.stringify(x) === JSON.stringify(a)));
    it.affix = [...(it.affix ?? []), ...more.slice(0, want - have)];
  }
}

/** 재료 설명 꼬리표: 행마 · 특성 · 희귀 효과 */
function matTags(id: MatId): string[] {
  const d = MATS[id];
  const tags: string[] = [];
  if (d.frag) tags.push(`${dirName(d.frag.dirs)}${d.frag.kind === 'slide' ? ' 줄' : d.frag.kind === 'hop' ? ' 넘기' : d.frag.kind === 'leap' ? ' 뛰기' : ' 1칸'}`);
  if (d.trait) tags.push(TRAITS[d.trait].name);
  if (id === 'silver') tags.push('멱 없애기');
  if (id === 'ecto') tags.push('관통');
  if (d.rare && !d.key) tags.push('사거리 +1');
  tags.push(`가진 ${matHave(id)}개`);
  return tags;
}

/** 장비 이름 줄: 품질 %, 계열, 고유 */
export function itemHead(s: ItemStats) {
  const t = Q_TIERS[s.tier ?? 0];
  return h('div', { class: 'preview-head' },
    h('b', { class: 'iname', style: s.legacy ? {} : { color: t.color } }, s.name),
    s.legacy ? h('span', { class: 'chip' }, '옛 장비') : h('span', { class: 'chip q-chip', style: { borderColor: t.color, color: t.color } }, `품질 ${s.q}%`),
    s.fam ? h('span', { class: `chip fam-${s.fam}` }, `${FAM_NAME[s.fam]} · ${FAM_STYLE[s.fam]}`) : null,
    s.uniq ? h('span', { class: 'chip uniq' }, `고유 ${UNIQ[s.uniq].name}`) : null);
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
function celebrate(root: HTMLElement, s: ItemStats, colors: string[], q: number, equippedNow: boolean, replaced: string | null = null, gain?: number): Promise<void> {
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
      const note = gain !== undefined ? (gain ? `새로 닿는 칸 +${gain}` : '다듬었어요.') : equippedNow ? `✓ 장착 중이에요.${replaced ? ` (전에 끼던 ${replaced}은(는) 장비 창에 있어요)` : ''}` : '장비 창에서 장착할 수 있어요.';
      const card = h('div', { class: q > 0 ? 'result-card perfect' : 'result-card' }, h('div', { class: 'rc-title' }, s.name), statsView(s), h('div', { class: 'equipped-note' }, note), h('button', { class: 'btn primary' }, '확인'));
      stage.append(card);
      card.querySelector('button')!.addEventListener('click', () => { stage.classList.add('out'); setTimeout(() => { stage.remove(); res(); }, 200); });
    }, 120 + 3 * gap + 420);
  });
}
