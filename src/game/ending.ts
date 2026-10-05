// 엔딩과 환생: 저자 앞에서 마지막 수를 고른다. 엔딩은 8개 — 기본 둘, 판 중의 선택으로 열리는 넷, 환생한 판의 숨은 단서로 열리는 「다음 보스」, 모두를 본 뒤의 진엔딩 하나.
// 엔딩을 본 뒤 환생하면 일부를 이어받아 처음부터.
import { G, align, emit, maxHp, newGame, save, wipeSave } from '../core/state';
import { Diff } from '../core/difficulty';
import { MatId } from '../data/materials';
import { PIECES } from '../data/pieces';
import { pieceSrc } from '../render/sprites';
import { cutin, dialog, h, modal, toast } from '../ui/dom';
import { openDifficulty } from '../ui/extra';
import type { App } from './app';
import { RunRule, pickRunRule } from './runrules';
import { authorTruth, epilogueCards, jo, pw, talkChain } from './story';
import { qst } from './quests';
import { throneOpen } from './throne';

export type EndingId = 'return' | 'stay' | 'rewrite' | 'together' | 'pen' | 'stalemate' | 'throne' | 'closed';
export const ENDING_ORDER: EndingId[] = ['return', 'stay', 'rewrite', 'together', 'pen', 'stalemate', 'throne', 'closed'];

/** 엔딩 문장의 {P}는 고른 말 이름(폰·나이트·비숍)으로 바뀐다 */
export const ENDINGS: Record<EndingId, { name: string; text: string; bonus: string; hint: string; stayLine: string }> = {
  return: {
    name: '돌아온 수',
    text: '{P}은(는) 마지막 줄에 자기 이름을 적었다. 펜을 떼자 오래 멈춰 있던 대국이 끝났다. 밀짚은 바닥에 내려앉고, 깨진 왕관과 얼음도 제자리로 돌아갔다. 판 위의 말들은 그제야 다리를 뻗고 쉬었다. 누군가 이 기보를 다시 펼친다면 마지막 줄에서 낯선 이름 하나를 보게 될 것이다.',
    bonus: '환생 보너스: 최대 체력 +1',
    hint: '저자 앞에서 언제든 고를 수 있다.',
    stayLine: '끝난 판 위를 천천히 걷는다. 이제 서두를 일은 없다.',
  },
  stay: {
    name: '기보 밖의 한 수',
    text: '{P}은(는) 마지막 줄을 비워 두지 않았다. 열어 뒀다. 펜은 손에 쥔 채로. 얼어 있던 판이 다시 움직이기 시작했다. 말들은 여전히 기보대로 걷지만, 가끔은 한 칸쯤 옆으로 새 보기도 한다. 대국은 아직 안 끝났다. 다음 수는 누가 둬도 된다.',
    bonus: '환생 보너스: 100G와 희귀 재료 2개를 들고 시작',
    hint: '저자 앞에서 언제든 고를 수 있다.',
    stayLine: '기보는 계속된다. 다음 수를 두러 간다.',
  },
  rewrite: {
    name: '다시 쓰인 기보',
    text: '{P}은(는) 마지막 줄 대신 첫 장으로 돌아갔다. {WHY} 실수도, 지워진 칸도, 잘못 둔 퀸과 얼어붙은 킹도 다 이 대국에서 있었던 일이다. {P}은(는) 처음부터 다시 적기 시작했다. 이번엔 버려지는 수가 하나도 없게. 새 기보의 첫 줄은 이랬다. 1. {P}, 기보 밖으로.',
    bonus: '환생 보너스: 최대 체력 +1, 기보 파편·거울 파편을 들고 시작',
    hint: '지워진 칸의 실수를 바로잡고, 옛 명국이나 기보 밖의 무기를 아는 자만이…',
    stayLine: '새로 적힌 판 위를 걷는다. 모든 칸에 이름이 있다.',
  },
  together: {
    name: '함께 적힌 이름',
    text: '마지막 줄은 한 줄로 끝나지 않았다. {P}이(가) 펜을 들자 {A}이(가) 펜 끝에 손을 얹었고, {B}도 그 위에 손을 포갰다. 기보 맨 끝에 이름 {N}이 나란히 적혔다. 아무 데도 안 적혀 있던 것들끼리 서로를 적어 준 셈이다. 밀짚왕이 말하던 외로움 같은 건 이제 이 판에 없다.',
    bonus: '환생 보너스: 최대 체력 +1, 동료가 시험 전투 없이 바로 합류',
    hint: '동료 둘 이상과 끝까지 함께 걷고, 그들의 꿈을 이루어 주고, 마지막 이야기까지 들어 준다면…',
    stayLine: '셋이서 여백을 걷는다. 발자국이 세 줄로 남는다.',
  },
  pen: {
    name: '펜을 쥔 수',
    text: '{P}은(는) 저자의 손에서 펜을 빼앗았다. 이제 판의 수는 {P}이(가) 정한다. 광장의 말들이 다시 줄을 맞춰 걷는다. 이번엔 {P}이(가) 정한 순서대로. 그런데 마지막 줄 앞에서 펜이 움직이지 않았다. 이걸 적으면 자기 이야기도 끝난다. 한참을 그러고 있다가 {P}은(는) 펜을 내려놓았다. 언젠가 또 누군가가 적히지 못한 채로 눈을 뜰 것이다.',
    bonus: '환생 보너스: 기보 파편 2개와 블런더 조각 1개를 들고 시작',
    hint: '어둠의 길을 걸으며, 거래하고 훔치고 봉인을 뜯고 영혼을 묶어 온 자라면…',
    stayLine: '펜은 내려놓았지만, 판은 여전히 네 눈치를 본다.',
  },
  stalemate: {
    name: '스테일메이트',
    text: '{P}은(는) 끝까지 저자를 치지 않았다. 필기를 피하고 지우개를 버티면서 그냥 판 위에 서 있었다. 더 둘 수가 없게 되자 저자가 펜을 내려놓았다. "아무도 못 이겼는데… 끝났네." 둘은 마지막 줄에 같이 적었다. ½–½. 진 사람이 없는 끝이었다. 얼어붙은 킹이 그렇게 찾던 게 이거였는지도 모른다. 판 위의 말들이 하나둘 주저앉아 숨을 돌렸다.',
    bonus: '환생 보너스: 최대 체력 +2',
    hint: '빛의 길을 걸으며, 설득하고 정화하고 넋을 기려 온 자라면… 저자와 싸우지 않는 끝도 있다.',
    stayLine: '비긴 판 위에는 서두르는 말이 없다.',
  },
  throne: {
    name: '다음 보스',
    text: '{P}은(는) 마지막 줄을 적지 않고 펜을 내려놓았다. 그리고 왔던 길을 거꾸로 걸었다. 여백을 지나, 얼어붙은 봉우리와 늪을 지나, 언덕 위 빈 옥좌까지. 밀짚왕이 앉아 있던 자리는 아직 따뜻했다. {P}은(는) 그 자리에 앉았다. 끝까지 간 폰은 판을 떠날 수 없다. 대신 다음 폰을 기다릴 수는 있다. 언젠가 기록의 벽 앞에서 눈을 뜰, 기보에 없는 누군가를.',
    bonus: '환생 보너스: 다음 판의 밀짚왕이 당신을 기억한다',
    hint: '왕들은 모두 처음에 무엇이었나. 그들을 그들답게 끝낸 자라면, 마을의 가장 늙은 말이 무언가 털어놓을지도…',
    stayLine: '옥좌에서 내려와 다시 걷는다. 그 자리는 아직 비워 둔다.',
  },
  closed: {
    name: '덮인 기보',
    text: '{P}은(는) 펜을 저자에게 돌려줬다. "이번엔 당신이 적어. 끝나는 게 지는 건 아니잖아. 다음 판 첫 수일 뿐이지." 저자는 손을 떨면서도 마지막 수를 직접 적었다. 몇 번이고 다시 펼쳤던 판이 드디어 끝났다. 잉크가 마르자 기보가 천천히 덮였다. 표지 너머로, 이 책을 처음부터 끝까지 넘겨 온 누군가의 손이 보였다. "끝까지 읽어 줘서 고마워."',
    bonus: '환생 보너스: 최대 체력 +1, 200G',
    hint: '여러 끝을 보고, 여러 번 다시 태어난 뒤에야…',
    stayLine: '덮인 책 속에서도, 말들은 가끔 몰래 한 칸씩 걷는다.',
  },
};

// ---------- 메타 기록 (저장과 별개, 환생해도 남는다) ----------
export interface Meta { endings: EndingId[]; rebirths: number }
const META = 'cf_meta';
export function meta(): Meta {
  try {
    return { endings: [], rebirths: 0, ...JSON.parse(localStorage.getItem(META) ?? '{}') };
  } catch {
    return { endings: [], rebirths: 0 };
  }
}
function setMeta(m: Meta) {
  try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* */ }
}

// ---------- 엔딩 조건 ----------
type Comp = 'soldier' | 'ghostknight' | 'priest';
const CQ: Record<Comp, string> = { soldier: 'cq_soldier', ghostknight: 'cq_ghost', priest: 'cq_priest' };

/** 다시 쓰인 기보: 블런더를 바로잡고, 기보사의 명국을 모두 풀었거나 기보 밖의 무기를 벼렸다 */
export const rewriteOpen = () => !!G.flags.blunder_dead && (Number(G.flags.kibo_n ?? 0) >= 8 || !!G.flags.gun_known);
/** 판 중에 고른 빛·어둠 선택의 수 (룩·성소·마녀·망령 기사·은자) */
export const lightDeeds = () => [G.flags.rook_how === 'persuade', G.flags.shrine === 'purify', G.flags.witch === 'honest', !!G.flags.ghost_rest, G.flags.hermit_how === 'light'].filter(Boolean).length;
export const darkDeeds = () => [G.flags.rook_how === 'contract', G.flags.shrine === 'seal', G.flags.witch === 'stole', G.flags.ghost_how === 'bind', G.flags.hermit_how === 'dark'].filter(Boolean).length;
/** 함께 적힌 이름: 동료 둘과 도착 + 둘의 동료 퀘스트 완료 + 4장 속마음 대화를 둘 다 들음 */
export const togetherOpen = () => G.party.length >= 2 && (G.party as Comp[]).every((c) => qst(CQ[c]) === 'done' && !!G.flags[`arc_${c}_4`]);
export const penOpen = () => align() === 'dark' && darkDeeds() >= 2;
export const peaceOpen = () => align() === 'light' && lightDeeds() >= 2;
/** 덮인 기보: 다른 엔딩 셋 이상 + 환생 두 번 이상 */
export const closedOpen = () => meta().endings.filter((e) => e !== 'closed').length >= 3 && Number(G.flags.rebirth ?? 0) >= 2;

const COMP_SHORT: Record<Comp, string> = { soldier: '폰 병사', ghostknight: '망령 기사', priest: '사제 비숍' };

/** 엔딩 문장 채우기: 말 이름·동료 이름·숨은 엔딩의 이유 */
function fill(e: EndingId) {
  const names = (G.party as Comp[]).map((c) => COMP_SHORT[c]);
  const [a] = names;
  const b = names.slice(1).join('와(과) ');
  const why = [Number(G.flags.kibo_n ?? 0) >= 8 ? '떠돌이 기보사와 함께 푼 옛 명국들' : '', G.flags.gun_known ? '기보에 없던 무기' : '', '지워진 칸에서 바로잡은 실수'].filter(Boolean);
  return jo(ENDINGS[e].text
    .replaceAll('{WHY}', `${why.join(', ')}가 떠올랐다.`)
    .replaceAll('{A}', a ?? '동료')
    .replaceAll('{B}', b || '또 다른 동료')
    .replaceAll('{N}', ['', '', '둘', '셋', '넷'][names.length + 1] ?? '여럿')
    .replaceAll('{P}', pw()));
}

/** 저자를 쓰러뜨린 뒤: 진실을 듣고 마지막 수를 고른다 (스테일메이트는 싸우지 않고 버텨서 바로 끝으로) */
export async function playEnding(app: App, forced?: EndingId) {
  if (forced) return finish(app, forced);
  await cutin('마지막 장', '저자의 펜이 멈췄다. 기보의 마지막 줄이 비어 있다.', 'win');
  await talkChain('저자', 'm:author', authorTruth());
  const choose = (e: EndingId) => void finish(app, e);
  const choices = [
    { label: '기보 안에 나를 적고, 대국을 끝맺는다', note: '돌아온 수', onPick: () => choose('return') },
    { label: '마지막 줄을 열어 둔다', note: '기보 밖의 한 수', onPick: () => void stayTalk().then(() => choose('stay')) },
  ] as { label: string; note?: string; tag?: string; onPick: () => void }[];
  if (rewriteOpen()) choices.push({ label: '처음부터 다시 쓴다', note: '???', tag: 'neutral', onPick: () => choose('rewrite') });
  if (togetherOpen()) choices.push({ label: '우리의 이름을 함께 적는다', note: '???', onPick: () => void togetherTalk().then(() => choose('together')) });
  if (penOpen()) choices.push({ label: '펜을 빼앗는다', note: '???', tag: 'dark', onPick: () => void penTalk().then(() => choose('pen')) });
  if (throneOpen()) choices.push({ label: '끝을 적지 않고 옥좌로 돌아간다', note: '???', tag: 'dark', onPick: () => void throneTalk().then(() => choose('throne')) });
  if (closedOpen()) choices.push({ label: '펜을 저자에게 돌려준다', note: '???', onPick: () => choose('closed') });
  dialog('저자', '"이 대국을 어떻게 끝낼 텐가?"', choices, { sprite: 'm:author', speaker: '저자', noClose: true });
}

const stayTalk = () => talkChain('저자', 'm:author', [
  ['"비워 둔다고? …그건 내가 했던 짓이야. 그래서 판이 멈췄고."', '당신은 펜을 놓았잖아. 난 안 놓을 거야.'],
  ['"그럼 끝이 안 나는 줄이 되는데. 그래도 괜찮나?"', '안 끝나니까 계속 둘 수 있지.'],
]);
const togetherTalk = () => {
  const [a] = (G.party as Comp[]).map((c) => COMP_SHORT[c]);
  return talkChain(a ?? '동료', G.party[0] === 'soldier' ? 'p:bp' : G.party[0] === 'ghostknight' ? 'p:bn' : 'p:bb', [
    ['"잠깐, 혼자 적으려고? 약속했잖아."', '맞다. 같이 적자.'],
  ]);
};
const throneTalk = () => talkChain('저자', 'm:author', [
  ['"…그 늙은 킹한테 들었군. 그래, 다들 너처럼 왔다. 그리고 다들 끝 줄에서 멈췄지. 내가 펜을 놓은 건 그 왕들을 더는 만들고 싶지 않아서였다."', '그래도 누군가는 기다려 줘야 해.'],
  ['"다음 폰이 너를 쓰러뜨리러 올 거다. 네가 밀짚왕을 쓰러뜨렸듯이. 그래도 가겠나?"', '그 폰이 끝까지 가게, 첫 벽이 되어 줄게.'],
]);
const penTalk = () => talkChain('저자', 'm:author', [
  ['"그 펜을 쥘 만한지 보자고 했었지."', '그건 내가 정한다고 했잖아.'],
  ['"펜을 쥐면 끝을 적어야 해. 그게 얼마나 무서운지 곧 알게 될 거다."', '(펜을 빼앗는다)'],
]);

async function finish(app: App, e: EndingId) {
  const d = ENDINGS[e];
  G.flags.ending = e;
  const m = meta();
  if (!m.endings.includes(e)) m.endings.push(e);
  setMeta(m);
  emit('ending', e);
  save();
  await cutin(`엔딩 — ${d.name}`, '', 'win');
  // 엔딩 본문 → 그 뒤의 이야기(에필로그) → 기록과 환생 선택
  await new Promise<void>((res) => {
    const go = h('button', { class: 'btn primary' }, '그 뒤로');
    const md = modal(d.name, h('div', { class: 'ending' }, h('p', { class: 'ending-text' }, fill(e)), go), { wide: true, closable: false, onClose: () => res() });
    go.addEventListener('click', () => md.close());
  });
  await epilogueCards(e, (id) => qst(id) === 'done');
  const seen = meta().endings;
  const list = h('div', { class: 'ending-list' }, ...ENDING_ORDER.map((id) => seen.includes(id)
    ? h('div', { class: `ending-item seen ${id === e ? 'now' : ''}` }, h('b', {}, ENDINGS[id].name))
    : h('div', { class: 'ending-item' }, h('b', {}, '???'), h('small', {}, ENDINGS[id].hint))));
  const body = h('div', { class: 'ending' },
    h('p', { class: 'hint' }, `본 엔딩 ${seen.length}/${ENDING_ORDER.length} · ${d.bonus}`),
    list,
    h('p', { class: 'muted small' }, '환생하면 업적·업적 능력·도감·재료 설명·레시피를 이어받고, 처음부터 다시 시작한다. 환생할수록 적이 조금씩 단단해지고 보상도 늘어난다. 판 중에 다른 선택을 하면 다른 끝이 열린다.'),
  );
  const again = h('button', { class: 'btn primary' }, '환생한다');
  const stay = h('button', { class: 'btn' }, '이 세계에 남아 계속 모험한다');
  body.append(h('div', { class: 'row gap' }, again, stay));
  const md = modal('기보의 끝', body, { wide: true, closable: false });
  again.addEventListener('click', () => { md.close(); rebirth(app, e); });
  stay.addEventListener('click', () => { md.close(); toast(`${d.stayLine} (환생은 나중에도 마을 [기록의 벽]에서 할 수 있다)`, 'info'); app.refreshAll(); });
}

/** 환생: 이어받을 것만 챙겨 새 게임을 연다 */
export function rebirth(app: App, e: EndingId) {
  const old = G;
  const keepFlags: Record<string, number | boolean | string> = {};
  for (const [k, v] of Object.entries(old.flags)) {
    if (/^(perk_|rw_|how_|lore_seen_|tip_)/.test(k) || ['achHp', 'shiny', 'events', 'kibo_n', 'gun_known', 'sold', 'herbs', 'rests', 'pzWrong'].includes(k)) keepFlags[k] = v;
  }
  const n = Number(old.flags.rebirth ?? 0) + 1;
  // 어디서부터 다시 걸을지: 처음부터 / 1장 건너뛰기 (베타 의견: 엔딩이 늘어도 처음부터 다시 하는 노가다)
  dialog('환생', '어디서부터 다시 걸을까?', [
    { label: '첫 수부터', note: '처음부터 다시', onPick: () => go(false) },
    { label: '1장을 건너뛴다', note: '첫 승급을 마치고 기본 장비 한 벌을 든 채 마을에서', onPick: () => go(true) },
  ], { noClose: true });
  const go = (quick: boolean) => openDifficulty((diff: Diff) => {
    wipeSave();
    newGame(old.piece, diff);
    G.ach = old.ach;
    G.dex = old.dex;
    G.matUse = old.matUse;
    G.recipes = old.recipes;
    Object.assign(G.flags, keepFlags);
    G.flags.rebirth = n;
    // 업적 체력 + 환생 보너스 (환생 체력은 합쳐 최대 3)
    G.bonusHp = Number(keepFlags.achHp ?? 0);
    const hpGain: Partial<Record<EndingId, number>> = { return: 1, rewrite: 1, together: 1, stalemate: 2, closed: 1 };
    const rb = Math.min(3, Number(old.flags.rebirthHp ?? 0) + (hpGain[e] ?? 0));
    G.flags.rebirthHp = rb;
    G.bonusHp += rb;
    const add = (id: MatId, k: number) => { G.bag[id] = (G.bag[id] ?? 0) + k; };
    if (e === 'stay') {
      G.gold += 100;
      const rares: MatId[] = ['pearl', 'silver', 'crack', 'fang'];
      for (let i = 0; i < 2; i++) add(rares[Math.floor(Math.random() * rares.length)], 1);
    }
    if (e === 'rewrite') { add('shard', 1); add('mirror', 1); }
    if (e === 'pen') { add('shard', 2); add('blunder', 1); }
    if (e === 'together') G.flags.rb_together = true;
    if (e === 'closed') G.gold += 200;
    G.hp = maxHp();
    const m = meta();
    m.rebirths = Math.max(m.rebirths, n);
    setMeta(m);
    emit('rebirth', n);
    save();
    // 판 규칙 카드: 환생마다 하나 (바로 앞 판과 다른 것)
    G.flags.runRule = pickRunRule((old.flags.runRule as RunRule) || null);
    if (quick) quickStart();
    G.hp = maxHp();
    save();
    app.rebirthBegin(n);
  });
}

/** 1장 건너뛰기: 밀짚왕을 쓰러뜨리고 첫 승급까지 마친 상태 + 기본 장비 한 벌 */
function quickStart() {
  G.promoted = true;
  G.mastery = true;
  Object.assign(G.flags, { boss_dead: true, rook_gone: true, gate_hills: true, talk_boss: true, memory_0: true, ch_1: true, chEnd_1: true, quickStart: true });
  for (const id of ['main_boss', 'main_promo']) G.quests[id] = { st: 'done', n: 0 };
  G.progress += 5;
  const make = (slot: 'weapon' | 'armor', mats: Partial<Record<MatId, number>>) => {
    const id = G.nextId++;
    G.items.push({ id, slot, mats, quality: 0, level: 0 });
    G.equip[slot] = id;
  };
  make('weapon', { wing: 1, moss: 2, fiber: 2 });
  make('armor', { gel: 2, moss: 2, fiber: 1 });
}

export const rebirthStar = () => {
  const n = Number(G?.flags.rebirth ?? 0);
  return n ? `★${n}` : '';
};

export const pieceImg = () => pieceSrc(PIECES[G.piece].img);
