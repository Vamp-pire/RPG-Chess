import { SETS, SET_NEED, SetId, setCounts } from '../core/sets';
import { sfx } from '../core/sfx';
import { DAILY_MODS, dailyEnemyNames, todayDaily } from '../game/daily';
import { AREAS } from '../data/areas';
import { perk } from '../game/rewards';
import { Q_TIERS, SLOTS, SLOT_INFO, itemStats } from '../core/items';
import { BASES, FAM_NAME } from '../data/gear';
import { PITY_FAM, PITY_Q, shopGear } from '../game/loot';
import { G, addBag, addItem, align, emit, equipped, hasJob, matHave, maxHp, save, spendMats, usable } from '../core/state';
import { MATS, MAT_ORDER, MatId } from '../data/materials';
import { ALIGN_NAMES, Align, JOBS, JobId } from '../data/pieces';
import { BOARD_REWARDS, QUESTS, progressText, q, qComplete, qStart } from '../game/quests';
import { pieceSrc } from '../render/sprites';
import { clearCoach, dialog, h, modal, toast } from './dom';
import { DIFFS } from '../core/difficulty';
import { invGrid, itemHead, matIcon, statsView } from './forge';
import { loreText } from './lore';
import { eggShopBought } from '../game/eggs';

const BASIC: MatId[] = ['gel', 'tooth', 'wing', 'moss', 'thorn', 'fiber'];

export const buyPrice = (id: MatId) => Math.ceil(MATS[id].price * 1.5 * (G.flags.discount ? 0.8 : 1));
export const sellPrice = (id: MatId) => Math.floor(MATS[id].price * (hasJob('contractor') ? 1.25 : 1) * (perk('trade') ? 1.2 : 1));

/**
 * 오늘의 특가 (마을 상점): 날짜마다 바뀌는 희귀 재료 둘을 골드로만 판다. 하루 하나씩.
 * 사냥만으로 충분하고 골드가 남아돈다는 베타 의견 → 골드 쓸 곳. 진행할수록 더 귀한 재료가 나온다
 */
function todayDeals(): { id: MatId; price: number; key: string }[] {
  const t = G.flags.promoted3 ? 3 : G.promoted2 ? 2 : G.promoted ? 1 : 0;
  const pool: MatId[] = ['pearl', 'silver', 'crack', ...(t >= 1 ? (['fang', 'mirror'] as MatId[]) : []), ...(t >= 2 ? (['tusk', 'shard'] as MatId[]) : []), ...(t >= 3 ? (['quill', 'blunder'] as MatId[]) : [])];
  const d = new Date();
  const day = `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`;
  let seed = Number(day) % 9973;
  const pickN = () => { seed = (seed * 37 + 11) % 9973; return pool[seed % pool.length]; };
  const a = pickN();
  let b = pickN();
  for (let i = 0; i < 5 && b === a; i++) b = pickN();
  return [a, b].map((id) => ({ id, price: Math.round(MATS[id].price * 2.5 * (G.flags.discount ? 0.8 : 1)), key: `deal_${day}_${id}` }));
}

/** 행상(야영지): 2지역 재료를 비싸게 팔고, 싸게 산다 */
const PEDDLER: MatId[] = ['skin', 'silk', 'bone', 'ecto', 'fiber'];

export function openShop(onChange: () => void, peddler = false) {
  const root = h('div', { class: 'shop' });
  modal(peddler ? '행상' : '재료 상점', root, { wide: true, onClose: onChange });
  const buyOf = (id: MatId) => (peddler ? Math.ceil(buyPrice(id) * 1.3) : buyPrice(id));
  const sellOf = (id: MatId) => (peddler ? Math.floor(sellPrice(id) * 0.7) : sellPrice(id));
  let basket: Partial<Record<MatId, number>> = {};
  const render = () => {
    root.innerHTML = '';
    root.append(h('div', { class: 'row between' }, h('span', {}, peddler ? '행상 폰: "마을까지 가기 멀지? 대신 값은 좀 쳐 줘야 해."' : '나이트 상인 부인: "필요한 건 골라 봐요."'), h('b', { class: 'gold' }, `${G.gold}G`)));
    const buy = h('div', { class: 'shop-col' }, h('div', { class: 'sub' }, peddler ? '사기 (행상 값: 마을보다 30% 비쌈)' : `사기${G.flags.discount ? ' (상인 할인 20%)' : ''}`));
    for (const id of peddler ? PEDDLER : BASIC) {
      const p = buyOf(id);
      const b = h('button', { class: 'btn small', disabled: G.gold < p }, `${p}G`);
      b.addEventListener('click', () => { G.gold -= p; addBag(id, 1); emit('buy'); eggShopBought(); sfx('coin'); save(); render(); });
      buy.append(h('div', { class: 'shop-row' }, matIcon(id, 24), h('span', {}, MATS[id].name), h('span', { class: 'muted' }, `보유 ${matHave(id)}`), b));
    }
    if (!peddler) {
      buy.append(h('div', { class: 'sub deal-sub' }, '🌟 오늘의 특가 (날마다 바뀜 · 하루 하나씩)'));
      for (const d of todayDeals()) {
        const sold = !!G.flags[d.key];
        const b = h('button', { class: 'btn small primary', disabled: sold || G.gold < d.price }, sold ? '샀음' : `${d.price}G`);
        b.addEventListener('click', () => { if (G.gold < d.price || G.flags[d.key]) return; G.gold -= d.price; G.flags[d.key] = true; addBag(d.id, 1); emit('buy'); sfx('coin'); save(); render(); });
        buy.append(h('div', { class: 'shop-row deal' }, matIcon(d.id, 24), h('span', {}, MATS[d.id].name), h('span', { class: 'muted' }, `보유 ${matHave(d.id)}`), b));
      }
    }
    if (!peddler) {
      buy.append(h('div', { class: 'sub deal-sub' }, '🛡️ 장비 (날마다 바뀜 · 평범한 품질)'));
      for (const g of shopGear()) {
        const sold = !!G.flags[g.key];
        const b = h('button', { class: 'btn small', disabled: sold || G.gold < g.price }, sold ? '샀음' : `${g.price}G`);
        b.addEventListener('click', () => { if (G.gold < g.price || G.flags[g.key]) return; G.gold -= g.price; G.flags[g.key] = true; const it = addItem(g.base.id, g.q); emit('buy'); sfx('coin'); save(); toast(`${itemStats(it).name}을(를) 샀다.${G.equip[it.slot] === it.id ? ' 바로 장착했어요.' : ''}`, 'good'); render(); });
        const fam = g.base.fam ? ` · ${FAM_NAME[g.base.fam]}` : '';
        buy.append(h('div', { class: 'shop-row deal' }, h('span', { class: 'gear-ico' }, '⚔'), h('span', {}, g.base.name), h('span', { class: 'muted' }, `${SLOT_INFO[g.base.slot].name}${fam}`), b));
      }
    }
    const sell = h('div', { class: 'shop-col' }, h('div', { class: 'sub' }, peddler ? '팔기 (마을보다 30% 쌈)' : `팔기${hasJob('contractor') ? ' (계약자 +25%)' : ''}`));
    // 칸을 누르면 판매 바구니에 1개씩 담는다. 바구니 칩을 누르면 1개 빼기, [모두 팔기]로 한 번에
    const owned = MAT_ORDER.filter((id) => !MATS[id].key && matHave(id) > 0);
    const left = (id: MatId) => matHave(id) - (basket[id] ?? 0);
    sell.append(invGrid(owned.map((id) => ({ id, n: left(id), sel: basket[id] ?? 0 })), {
      desc: (id) => `한 개 ${sellOf(id)}G`,
      onClick: (id) => { if (left(id) > 0) { basket[id] = (basket[id] ?? 0) + 1; render(); } },
    }));
    const ids = (Object.keys(basket) as MatId[]).filter((id) => (basket[id] ?? 0) > 0);
    const total = ids.reduce((s, id) => s + sellOf(id) * (basket[id] ?? 0), 0);
    const bk = h('div', { class: 'put-list' }, h('span', { class: 'put-title' }, '팔 것'));
    if (!ids.length) bk.append(h('small', { class: 'muted' }, owned.length ? '위 칸을 눌러 담으세요.' : '팔 재료가 없다.'));
    for (const id of ids) {
      const c = h('button', { class: 'put-chip', title: `${MATS[id].name} 1개 빼기` }, matIcon(id, 20), h('span', {}, `×${basket[id]}`));
      c.addEventListener('click', () => { basket[id] = (basket[id] ?? 0) - 1; render(); });
      bk.append(c);
    }
    const all = h('button', { class: 'btn small ghost', disabled: !owned.length }, '전부 담기');
    all.addEventListener('click', () => { for (const id of owned) if (!MATS[id].rare) basket[id] = matHave(id); render(); });
    const go = h('button', { class: 'btn small primary', disabled: !ids.length }, `모두 팔기 +${total}G`);
    go.addEventListener('click', () => {
      let n = 0;
      for (const id of ids) {
        const k = basket[id] ?? 0;
        if (k && spendMats({ [id]: k })) { G.gold += sellOf(id) * k; n += k; }
      }
      basket = {};
      G.flags.sold = Number(G.flags.sold ?? 0) + n;
      sfx('coin');
      emit('sell', G.flags.sold);
      save();
      toast(`재료 ${n}개를 팔았다.`, 'good');
      render();
    });
    sell.append(bk, h('div', { class: 'row gap' }, all, go), h('p', { class: 'hint small' }, '[전부 담기]는 희귀 재료는 빼고 담아요.'));
    root.append(h('div', { class: 'f-cols' }, buy, sell));
  };
  render();
}

export function openBoard(onChange: () => void, onDaily?: () => void) {
  const root = h('div', { class: 'qboard' });
  const md = modal('의뢰 게시판', root, { onClose: onChange });
  const render = () => {
    root.innerHTML = '';
    // 오늘의 기보: 날짜로 정해지는 특별 전투
    const d = todayDaily();
    if (d && onDaily) {
      const go = h('button', { class: 'btn small primary', disabled: d.done }, d.done ? '오늘은 완료' : '도전');
      go.addEventListener('click', () => { md.close(); onDaily(); });
      root.append(h('div', { class: 'quest daily' },
        h('div', {}, h('b', {}, `📅 오늘의 기보 — ${DAILY_MODS[d.mod].name}`), h('p', { class: 'small' }, `${AREAS[d.area].name} · ${dailyEnemyNames(d)}. ${DAILY_MODS[d.mod].desc}`), G.flags.dailyStreak ? h('p', { class: 'small muted' }, `연속 ${G.flags.dailyStreak}일`) : null),
        go));
    }
    for (const [id, d] of Object.entries(QUESTS)) {
      if (!d.board) continue;
      if (id === 'sq_dex2' && !G.promoted) continue;
      const s = q(id);
      const row = h('div', { class: `quest ${s.st}` }, h('div', {}, h('b', {}, d.name), h('p', { class: 'small' }, d.desc)));
      if (s.st === 'locked' || s.st === 'avail') {
        const b = h('button', { class: 'btn small' }, '받기');
        b.addEventListener('click', () => {
          qStart(id);
          if (id === 'sq_dex') emit('kill');
          if (id === 'sq_smith' && G.items.length) emit('craft');
          save();
          render();
        });
        row.append(b);
      } else if (s.st === 'active') row.append(h('span', { class: 'muted' }, progressText(id) || '진행 중'));
      else if (s.st === 'ready') {
        const b = h('button', { class: 'btn small primary' }, '보고');
        b.addEventListener('click', () => { qComplete(id, BOARD_REWARDS[id] ?? {}); save(); render(); });
        row.append(b);
      } else row.append(h('span', { class: 'done-mark' }, '완료'));
      root.append(row);
    }
  };
  render();
}

/** 변성: 기본 재료 → 같은 계열의 희귀 재료 */
const TRANSMUTE: Partial<Record<MatId, MatId>> = {
  gel: 'pearl', wing: 'silver', moss: 'crack', tooth: 'fang', thorn: 'crack',
  skin: 'silver', silk: 'pearl', bone: 'fang', ecto: 'mirror',
  fur: 'tusk', frost: 'mirror', ice: 'crack', ink: 'quill', page: 'shard',
};
const transRate = (to: MatId) => (MATS[to].price <= 30 ? 0.7 : MATS[to].price <= 60 ? 0.45 : 0.3);

export function openInn(onChange: () => void, campfire = false) {
  const root = h('div', { class: 'inn' });
  modal(campfire ? '모닥불' : '여관', root, { onClose: onChange });
  const render = () => {
    root.innerHTML = '';
    const rest = h('button', { class: 'btn primary' }, G.hp >= maxHp() ? '쉬기 (몹이 다시 나타난다)' : `쉬기 (HP ${G.hp} → ${maxHp()})`);
    rest.addEventListener('click', () => {
      G.hp = maxHp();
      delete G.flags.will_used; // 용사의 의지도 다시 차오른다
      G.flags.rests = Number(G.flags.rests ?? 0) + 1;
      // 단골의 특권: 가방 재료를 저절로 창고로
      if (perk('rest') && Object.values(G.bag).some((n) => n)) {
        for (const [id, n] of Object.entries(G.bag)) G.store[id as MatId] = (G.store[id as MatId] ?? 0) + (n ?? 0);
        G.bag = {};
        toast('단골의 특권: 가방 재료를 창고에 맡겼다.', 'good');
      }
      emit('rest', G.flags.rests);
      // 쉬는 동안 쓰러뜨린 고정 몹들이 제자리로 돌아온다
      for (const k of Object.keys(G.flags)) if (k.startsWith('cleared_')) delete G.flags[k];
      save();
      toast(`푹 쉬었다. 체력이 모두 회복됐다.${G.piece === 'pawn' ? ' 용사의 의지도 다시 차올랐다.' : ''} (쓰러뜨린 강한 몹들도 다시 나타난다)`, 'good');
      render();
    });
    const bagN = Object.values(G.bag).reduce((a, b) => a + (b ?? 0), 0);
    const dep = h('button', { class: 'btn', disabled: !bagN }, `가방 재료 모두 맡기기 (${bagN}개)`);
    dep.addEventListener('click', () => {
      clearCoach('drop');
      for (const [id, n] of Object.entries(G.bag)) G.store[id as MatId] = (G.store[id as MatId] ?? 0) + (n ?? 0);
      G.bag = {};
      save();
      toast('창고에 맡겼다. 창고 재료는 쓰러져도 잃지 않는다.', 'good');
      render();
    });
    // 재료 변성: 같은 기본 재료 4개 + 10G → 계열의 희귀 재료 1개 (확률)
    const trans = h('div', { class: 'trans' });
    for (const [from, to] of Object.entries(TRANSMUTE) as [MatId, MatId][]) {
      if (matHave(from) < 4) continue;
      const rate = transRate(to);
      const b = h('button', { class: 'btn small', disabled: G.gold < 10 }, `${MATS[from].name} ×4 → ${MATS[to].name} (${Math.round(rate * 100)}%)`);
      b.addEventListener('click', () => {
        if (!spendMats({ [from]: 4 })) return;
        G.gold -= 10;
        if (Math.random() < rate) {
          addBag(to, 1);
          sfx('perfect');
          toast(`변성 성공! ${MATS[to].name} ×1`, 'rare');
          emit('transmute', true);
        } else {
          addBag(from, 1);
          sfx('hurt');
          toast(`변성 실패… ${MATS[from].name} 1개만 남았다.`, 'bad');
          emit('transmute', false);
        }
        save();
        render();
      });
      trans.append(b);
    }
    const storeItems = MAT_ORDER.filter((id) => G.store[id]).map((id) => ({ id, n: G.store[id] ?? 0 }));
    const bagItems = MAT_ORDER.filter((id) => G.bag[id]).map((id) => ({ id, n: G.bag[id] ?? 0 }));
    const store = invGrid(storeItems);
    root.append(
      h('p', {}, campfire ? '모닥불이 타닥거린다. 쉬어 가고, 짐은 마을 창고로 보낼 수 있다.' : '여관 주인 룩: "쉬어 가요. 짐은 맡겨 두면 안전하고."'),
      h('div', { class: 'row gap' }, rest, dep),
      h('div', { class: 'sub' }, '재료 변성 (같은 재료 4개 + 10G → 희귀 재료 1개, 실패하면 1개만 돌려받음)'),
      trans.children.length ? trans : h('p', { class: 'muted small' }, '같은 기본 재료가 4개 이상 있으면 변성할 수 있다.'),
      h('div', { class: 'sub' }, `가방 (${bagN}개, 쓰러지면 일부 잃음)`),
      invGrid(bagItems),
      h('div', { class: 'sub' }, `창고 (${storeItems.reduce((a, b) => a + b.n, 0)}개, 안전)`),
      store,
      h('p', { class: 'hint' }, '모험 중 쓰러지면 가방 재료를 잃는다. 대장간은 가방과 창고 재료를 모두 쓸 수 있다. 게임은 자동 저장된다.'),
    );
  };
  render();
}

export function openInventory(onChange: () => void) {
  const root = h('div', { class: 'inv' });
  modal('장비', root, { wide: true, onClose: onChange });
  // 탭 둘: 장비 / 가방 (한 화면에 다 몰아넣지 않게)
  let tab: 'gear' | 'bag' = 'gear';
  let filter: 'all' | (typeof SLOTS)[number] = 'all';
  const render = () => {
    root.innerHTML = '';
    const tabs = h('div', { class: 'tabs' });
    for (const [id, name] of [['gear', '장비'], ['bag', '가방']] as const) {
      const b = h('button', { class: `tab ${tab === id ? 'on' : ''}` }, name);
      b.addEventListener('click', () => { tab = id; render(); });
      tabs.append(b);
    }
    root.append(tabs);
    if (tab === 'bag') {
      const bagItems = MAT_ORDER.filter((id) => G.bag[id]).map((id) => ({ id, n: G.bag[id] ?? 0 }));
      const storeItems = MAT_ORDER.filter((id) => G.store[id]).map((id) => ({ id, n: G.store[id] ?? 0 }));
      root.append(h('div', { class: 'sub' }, `가방 ${bagItems.reduce((a, b) => a + b.n, 0)}개`), invGrid(bagItems, { desc: (id) => loreText(id) }));
      root.append(h('div', { class: 'sub' }, `여관 창고 ${storeItems.reduce((a, b) => a + b.n, 0)}개`), invGrid(storeItems, { desc: (id) => loreText(id) }));
      root.append(h('p', { class: 'hint' }, '쓰러지면 가방 재료 일부를 잃어요. 창고에 맡긴 재료는 안전해요.'));
      // 드랍 천장: 구석에 작게
      if (align()) root.append(h('p', { class: 'pity muted small', title: `내 계열 무기가 안 나온 전투 ${PITY_FAM}번이면 다음엔 꼭 나와요 · 훌륭한(80%) 이상이 안 나온 장비 ${PITY_Q}개면 다음은 꼭 훌륭한 이상` }, `천장 — 계열 무기 ${G.flags.pityFam ?? 0}/${PITY_FAM} · 훌륭한 장비 ${G.flags.pityQ ?? 0}/${PITY_Q}`));
      return;
    }
    const slots = h('div', { class: 'eq-slots' });
    for (const s of SLOTS) {
      const it = equipped(s);
      const st = it ? itemStats(it) : null;
      slots.append(h('div', { class: `eq-slot ${it ? 'has' : ''} ${it && !usable(it) ? 'off' : ''}` }, h('small', {}, SLOT_INFO[s].name), h('b', { style: st && !st.legacy ? { color: Q_TIERS[st.tier ?? 0].color } : {} }, st ? st.name : '—')));
    }
    root.append(slots);
    // 장비 프리셋: 지금 장착을 저장해 두고 한 번에 갈아 끼운다
    const pre = h('div', { class: 'row gap presets' }, h('span', { class: 'muted small' }, '프리셋'));
    for (let i = 1; i <= 3; i++) {
      const k = `preset_${i}`;
      const has = !!G.flags[k];
      const load = h('button', { class: `btn small ${has ? '' : 'ghost'}`, disabled: !has, title: has ? '이 조합으로 갈아 끼운다' : '비어 있음' }, `${i}번 불러오기`);
      load.addEventListener('click', () => {
        const saved = JSON.parse(String(G.flags[k])) as Record<string, number | null>;
        for (const s of SLOTS) G.equip[s] = saved[s] && G.items.some((it) => it.id === saved[s]) ? saved[s] : null;
        save();
        toast(`프리셋 ${i}번으로 갈아 끼웠다.`, 'good');
        render();
        onChange();
      });
      const store = h('button', { class: 'btn small ghost', title: '지금 장착을 저장' }, `${i}번에 저장`);
      store.addEventListener('click', () => { G.flags[k] = JSON.stringify(G.equip); save(); toast(`지금 장착을 프리셋 ${i}번에 저장했다.`, 'good'); render(); });
      pre.append(h('span', { class: 'preset' }, load, store));
    }
    root.append(pre);
    // 세트 효과: 주 재료 계열이 같은 장비 3개
    const worn = SLOTS.map((s) => equipped(s)).filter((x): x is NonNullable<typeof x> => !!x);
    const counts = setCounts(worn);
    const setRow = h('div', { class: 'chips set-row-chips' });
    for (const [s, n] of Object.entries(counts) as [SetId, number][]) setRow.append(h('span', { class: `chip set ${n >= SET_NEED ? 'on' : ''}`, title: SETS[s].desc }, `${SETS[s].name} ${Math.min(n, SET_NEED)}/${SET_NEED}${n >= SET_NEED ? ' ✓' : ''}`));
    root.append(h('div', { class: 'sub' }, '세트 효과 (같은 세트 장비 3개)'), setRow.children.length ? setRow : h('p', { class: 'muted small' }, '장착한 장비가 없다.'));
    for (const [s, n] of Object.entries(counts) as [SetId, number][]) if (n >= SET_NEED) root.append(h('p', { class: 'small set-desc' }, `✓ ${SETS[s].name}: ${SETS[s].desc}`));
    if (!G.items.length) root.append(h('p', { class: 'muted' }, '아직 장비가 없다. 몹을 쓰러뜨리면 가끔 장비를 떨어뜨린다.'));
    // 부위별로 걸러 보기 (장비가 쌓이면 길어진다)
    const fl = h('div', { class: 'tabs small-tabs' });
    for (const k of ['all', ...SLOTS] as const) {
      const b = h('button', { class: `tab ${filter === k ? 'on' : ''}` }, k === 'all' ? '전부' : SLOT_INFO[k].name);
      b.addEventListener('click', () => { filter = k; render(); });
      fl.append(b);
    }
    if (G.items.length > 3) root.append(fl);
    const list = h('div', { class: 'inv-list' });
    const refund = DIFFS[G.diff].refund;
    const shown = G.items.filter((it) => filter === 'all' || it.slot === filter).sort((a, b) => Number(G.equip[b.slot] === b.id) - Number(G.equip[a.slot] === a.id));
    for (const it of shown) {
      const s = itemStats(it);
      const on = G.equip[it.slot] === it.id;
      const ok = usable(it);
      const b = h('button', { class: `btn small ${on ? '' : 'primary'}`, disabled: !on && !ok, title: ok ? '' : `${FAM_NAME[s.fam!]} 계열 직업만 쓸 수 있어요` }, on ? '해제' : ok ? '장착' : '못 씀');
      b.addEventListener('click', () => { G.equip[it.slot] = on ? null : it.id; save(); render(); onChange(); });
      // 분해: 새 장비는 그 장비의 재료로, 옛 장비는 예전 재련 규칙으로
      const canBreak = !on && (!s.legacy || refund > 0);
      const rf = canBreak ? h('button', { class: 'btn small ghost' }, '분해') : null;
      rf?.addEventListener('click', () => (s.legacy ? reforge(it.id) : breakDown(it.id)));
      list.append(h('div', { class: `inv-item ${on ? 'on' : ''} ${ok ? '' : 'off'}` }, h('div', { class: 'row between' }, itemHead(s), h('span', { class: 'chip' }, SLOT_INFO[it.slot].name), rf, b), statsView(s)));
    }
    root.append(list);
    if (G.items.length) root.append(h('p', { class: 'hint' }, '분해: 끼지 않은 장비를 녹여 그 장비의 재료를 돌려받아요 (창고로). 품질이 높을수록 많이 나와요.'));
  };
  /** 분해(새 장비): 그 장비의 재료를 1 + 품질 구간 + 강화 수만큼, 개조에 넣은 재료는 절반 */
  const breakDown = (id: number) => {
    const it = G.items.find((i) => i.id === id);
    if (!it || !it.base) return;
    const b = BASES[it.base];
    const s = itemStats(it);
    const back = new Map<MatId, number>();
    back.set(b.mat, 1 + (s.tier ?? 0) + it.level);
    (it.mods ?? []).forEach((md, i) => { if (i % 2 === 0) back.set(md.mat, (back.get(md.mat) ?? 0) + 1); });
    const text = [...back].map(([m, n]) => `${MATS[m].name} ×${n}`).join(', ');
    dialog('분해', `${s.name}을(를) 녹일까요? 돌려받는 재료: ${text}`, [
      { label: '녹인다', onPick: () => {
        for (const [m, n] of back) G.store[m] = (G.store[m] ?? 0) + n;
        G.items = G.items.filter((i) => i.id !== id);
        if (G.equip[it.slot] === id) G.equip[it.slot] = null;
        emit('reforge');
        save();
        toast(`분해했다. ${text}`, 'good');
        render();
        onChange();
      } },
      { label: '그만둔다', onPick: () => {} },
    ]);
  };
  /** 재련: 장비를 녹여 재료 일부를 창고로 돌려받는다 */
  const reforge = (id: number) => {
    const it = G.items.find((i) => i.id === id);
    if (!it) return;
    const back: [MatId, number][] = [];
    for (const [m, n] of Object.entries(it.mats) as [MatId, number][]) {
      const k = Math.floor((n ?? 0) * DIFFS[G.diff].refund);
      if (k > 0) back.push([m, k]);
    }
    const list = back.length ? back.map(([m, n]) => `${MATS[m].name} ×${n}`).join(', ') : '돌려받는 재료 없음';
    dialog('재련', `${itemStats(it).name}을(를) 녹일까요? 강화에 쓴 골드는 돌아오지 않아요. 돌려받는 재료: ${list}`, [
      { label: '녹인다', onPick: () => {
        for (const [m, n] of back) G.store[m] = (G.store[m] ?? 0) + n;
        G.items = G.items.filter((i) => i.id !== id);
        if (G.equip[it.slot] === id) G.equip[it.slot] = null;
        emit('reforge');
        save();
        toast(`재련했다. ${list}`, 'good');
        render();
        onChange();
      } },
      { label: '그만둔다', onPick: () => {} },
    ]);
  };
  render();
}

export function openJobSelect(onPick: (j: JobId) => void) {
  const root = h('div', { class: 'jobs' });
  const m = modal('기록의 벽 — 나의 길', root, { wide: true });
  root.append(h('p', {}, '벽에는 모든 말의 이름과 다음 수가 빼곡히 새겨져 있다. 그런데 내 이름만 없다. 빈자리에 무엇을 새길까?'));
  const cols = h('div', { class: 'job-cols' });
  for (const a of ['light', 'neutral', 'dark'] as Align[]) {
    const col = h('div', { class: `job-col ${a}` }, h('h3', {}, ALIGN_NAMES[a]));
    for (const j of JOBS.filter((x) => x.align === a)) {
      const b = h('button', { class: `job ${G.job === j.id ? 'on' : ''}` }, h('b', {}, j.name), h('small', {}, j.desc));
      b.addEventListener('click', () => { m.close(); onPick(j.id); });
      col.append(b);
    }
    cols.append(col);
  }
  root.append(cols, h('p', { class: 'hint' }, '직업은 전투보다 모험을 바꾼다: 대화·퀘스트 선택지, 상호작용, 보상. 중립 직업만 나중에 다시 고를 수 있다.'));
}

/**
 * line: 여러 수 퍼즐의 수순 ('c4g8' 같은 출발·도착 칸, 내 수·상대 응수 번갈아). 없으면 from→to 한 수.
 * 내 수 칸에는 '|'로 다른 정답을 더 적을 수 있다 ('e1d2|e1c1'). 끝에 '*'가 붙은 수는 '이기는 수지만 기보와 다른 수'
 * — 틀린 것으로 치지 않고 다시 생각해 보게만 한다.
 */
export interface PuzzleDef { title: string; text: string; pos: Record<string, string>; from: string; to: string; kind?: 'mate' | 'open'; line?: string[] }

/** 메이트까지 내가 둘 수 (한 수 퍼즐이면 1) */
export const puzzleMoves = (pz: PuzzleDef) => Math.ceil((pz.line?.length ?? 1) / 2);
const KN = ['한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟'];
export const puzzleMovesLabel = (pz: PuzzleDef) => `${KN[puzzleMoves(pz) - 1] ?? puzzleMoves(pz)} 수`;

export const PUZZLES: Record<string, PuzzleDef> = {
  // 백 Kg1 Rd1 Nc3 / 흑 Kh8 g7 h7 → Rd8#
  town: { title: '광장의 수수께끼', text: '돌판에 새겨진 글: "백이 둔다. 한 수 만에 끝내라."', pos: { g1: 'wk', d1: 'wr', c3: 'wn', h8: 'bk', g7: 'bp', h7: 'bp' }, from: 'd1', to: 'd8' },
  // 필리도르의 질식 메이트 (두 수): Qg8+! Rxg8 Nf7# — chess.js로 수순·유일해 확인
  ruins: { title: '금 간 돌판', text: '금 간 돌판: "가장 귀한 말을 먼저 내주어라. 그러면 왕은 제 병사에 갇혀 말 하나에 쓰러진다. 백이 둔다, 두 수."', pos: { a8: 'br', f8: 'br', h8: 'bk', a7: 'bp', b7: 'bp', g7: 'bp', h7: 'bp', h6: 'wn', c4: 'wq', a2: 'wp', b2: 'wp', f2: 'wp', g2: 'wp', h2: 'wp', g1: 'wk' }, from: 'c4', to: 'g8', line: ['c4g8', 'f8g8', 'h6f7'] },
  // 아라비안 메이트: 백 Kh1 Rg1 Nf6 / 흑 Kh8 → Rg8# (chess.js로 유일해 확인)
  glacier: { title: '얼음 속 돌판', text: '얼음 밑에 새겨진 글: "사막에서 온 오래된 수. 룩과 나이트가 함께. 한 수 만에."', pos: { h1: 'wk', g1: 'wr', f6: 'wn', h8: 'bk' }, from: 'g1', to: 'g8' },
};

/** 체스 퍼즐: 한 수 메이트, 또는 상대가 정해진 수로 받아 주는 여러 수 메이트 */
export function openPuzzle(pz: PuzzleDef, onSolved: () => void) {
  let pos: Record<string, string> = { ...pz.pos };
  let selSq: string | null = null;
  const line = pz.line ?? [pz.from + pz.to];
  let step = 0;
  let busy = false;
  const root = h('div', { class: 'puzzle' });
  const m = modal(pz.title, root);
  const multi = line.length > 1;
  const progress = () => (multi ? ` (${puzzleMovesLabel(pz)} 메이트 · ${Math.floor(step / 2) + 1}/${puzzleMoves(pz)}번째 수)` : '');
  const msg = h('p', {}, pz.text + progress());
  const play = (mv: string) => {
    const f = mv.slice(0, 2);
    const t = mv.slice(2, 4);
    // 캐슬링: 킹이 두 칸 옆으로 가면 룩도 옮긴다
    if (pos[f]?.[1] === 'k' && Math.abs(f.charCodeAt(0) - t.charCodeAt(0)) === 2) {
      const r = f[1];
      const [rf, rt] = t[0] === 'c' ? ['a', 'd'] : ['h', 'f'];
      pos[rt + r] = pos[rf + r];
      delete pos[rf + r];
    }
    pos[t] = pos[f];
    delete pos[f];
  };
  const opts = (i: number) => line[i].split('|');
  const board = h('div', { class: 'pz-board' });
  root.append(msg, board);
  const files = 'abcdefgh';
  const render = () => {
    board.innerHTML = '';
    for (let r = 8; r >= 1; r--) {
      for (let f = 0; f < 8; f++) {
        const sq = files[f] + r;
        const cell = h('div', { class: `pz ${(f + r) % 2 ? 'l' : 'd'} ${selSq === sq ? 'sel' : ''}` });
        if (pos[sq]) cell.append(h('img', { src: pieceSrc(pos[sq]), alt: '' }));
        cell.addEventListener('click', () => {
          if (busy) return;
          if (selSq && selSq !== sq && !(pos[sq] && pos[sq][0] === 'w')) {
            const mv = selSq + sq;
            const ok = opts(step).includes(mv);
            if (opts(step).includes(mv + '*')) {
              // 이기는 수지만 기보 속 명인의 수가 아니다: 틀린 것으로 치지 않는다
              msg.textContent = '"그 수로도 이길 수는 있지. 하지만 그날의 명인은 다른 수를 두었네. 다시 생각해 보게."';
              selSq = null;
              render();
              return;
            }
            if (ok && step + 1 < line.length) {
              // 맞는 수: 두고, 잠시 뒤 상대가 정해진 수로 받는다
              play(mv);
              step++;
              selSq = null;
              busy = true;
              msg.textContent = '좋은 수다! 상대가 받는다…';
              render();
              setTimeout(() => {
                play(line[step]);
                step++;
                busy = false;
                msg.textContent = `상대가 받았다. 다음 수는?${progress()}`;
                render();
              }, 650);
              return;
            }
            if (ok) {
              play(mv);
              selSq = null;
              render();
              msg.textContent = pz.kind === 'open' ? '정답! 옛 기보 그대로의 수다.' : pz.kind === 'mate' ? '체크메이트! 기보사가 손뼉을 친다.' : '체크메이트! 돌판이 스르륵 열리며 무언가가 굴러 나온다.';
              board.classList.add('solved');
              setTimeout(() => { m.close(); onSolved(); }, 1200);
            } else {
              msg.textContent = pz.kind ? '기보사가 고개를 젓는다. "다시 생각해 보게."' : '돌판이 꿈쩍도 하지 않는다. 다른 수를 찾아보자.';
              board.classList.add('shake');
              G.flags.pzWrong = Number(G.flags.pzWrong ?? 0) + 1;
              emit('pzWrong', G.flags.pzWrong);
              setTimeout(() => board.classList.remove('shake'), 400);
              selSq = null;
              // 여러 수 퍼즐은 처음 배치로 되돌린다
              if (step) {
                pos = { ...pz.pos };
                step = 0;
                msg.textContent += ` 판이 처음으로 돌아갔다.${progress()}`;
              }
              render();
            }
            return;
          }
          selSq = pos[sq] && pos[sq][0] === 'w' ? sq : null;
          render();
        });
        board.append(cell);
      }
    }
  };
  render();
}
