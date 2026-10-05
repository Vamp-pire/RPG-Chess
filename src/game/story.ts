// 이야기 뼈대 (묶음 1 「기보의 비밀」): 장 카드, 보스와의 대화, 기보 파편 회상, 장 끝 요약.
// 중심 줄기: 주인공은 저자가 끝내 적지 못한 한 수다. 보스를 쓰러뜨릴 때마다 그 기억이 한 조각씩 돌아온다.
// 보스 셋은 모두 '정해진 수가 주는 고통'의 다른 얼굴이다 — 지워짐(밀짚왕), 실수(퀸), 끝에 대한 두려움(킹).
import { G, align, log } from '../core/state';
import { PIECES } from '../data/pieces';
import { cutin, dialog, h, lockStory, modal } from '../ui/dom';
import { fx } from '../render/fx';
import { seenEnding } from '../core/meta';

/** 주인공 말 이름 (폰·나이트·비숍) — 이야기 문장의 {P} */
export const pw = () => (G?.piece === 'pawn' || !G ? '폰' : PIECES[G.piece].name.split(' ')[0]);
/** 받침에 맞춰 은(는)·이(가)·을(를)·와(과)·으로(로) 고르기 */
export function jo(t: string): string {
  const pick = (ch: string, a: string, b: string) => {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) return a + '(' + b + ')';
    return c % 28 ? a : b;
  };
  return t.replace(/([가-힣])(은\(는\)|이\(가\)|을\(를\)|와\(과\))/g, (_, ch: string, p: string) => ch + (p[0] === '와' ? pick(ch, p[2], p[0]) : pick(ch, p[0], p[2])));
}
/** {P} 채우고 조사 맞추기 */
export const pfill = (t: string) => jo(t.replaceAll('{P}', pw()));

/** [상대의 말, 주인공의 대답(선택지)] — 대답을 고르면 주인공이 그 말을 하고 다음 줄로 */
type Line = [string, string];

interface BossTalk { name: string; sprite: string; lines: Line[] }

export type StoryBoss = 'boss' | 'queen' | 'king' | 'author';

export const BOSS_TALK: Record<StoryBoss, BossTalk> = {
  boss: {
    name: '밀짚왕',
    sprite: 'm:strawking',
    lines: [
      ['"또 왔네. 이번엔 어디서 떨려 났지? …아니, 넌 냄새가 달라. 한 번도 적힌 적 없는 놈이로군."', '넌 누구야?'],
      ['"지워진 수들이 모여서 된 게 나다. 누가 뒀다가 지운 수들. 이 옥좌 밀짚 한 올 한 올이 다 그런 놈들이야. 버려지기 싫어서 여기 모였지."', '그래서 판을 태우는 거야?'],
      ['"아무도 기억 안 해 줄 판이면 차라리 태우는 게 낫지. 너도 곧 알게 될 거다. 아무 데도 안 적힌 게 어떤 건지."', '그래도 난 내 수를 둘 거야.'],
    ],
  },
  queen: {
    name: '잘못 둔 퀸',
    sprite: 'm:misqueen',
    lines: [
      ['"멈춰! 거기 아니야. 거기도 아니고… 다시. 다시 둬야 돼."', '뭘 그렇게 무르는 건데?'],
      ['"딱 한 수였어. 한 수 잘못 뒀다고 판이 통째로 무너졌다고. 무르면 돼. 처음부터 다시 두면 다 괜찮아져."', '무른다고 없던 일이 되진 않아.'],
      ['"시끄러워! 그럼 너부터 물러 줄게. 어디서 굴러왔는지도 모르는 너부터!"', '실수라도 상관없어. 이건 내 수야.'],
    ],
  },
  king: {
    name: '얼어붙은 킹',
    sprite: 'm:frozenking',
    lines: [
      ['"…거기 서라. 한 칸만 더 오면 끝난다."', '뭐가 끝나는데?'],
      ['"외통. 난 그걸 봤다. 그래서 판을 얼렸지. 아무도 안 두면 아무도 안 진다."', '아무도 못 이기기도 하겠지.'],
      ['"그래도 끝나진 않잖나. …넌 안 무섭나? 끝나는 게."', '무서워. 그래도 다음 수는 둘 거야.'],
    ],
  },
  author: {
    name: '저자',
    sprite: 'm:author',
    lines: [
      ['"왔구나. 여기까지 오는 길도 다 내가 적은 잉크 위였다는 건 알고 있겠지."', '그럼 이번엔 내가 적을게.'],
      ['"…좋다. 그 펜을 쥘 만한지 보자."', '보여 줄게.'],
    ],
  },
};

/** 저자가 밝히는 진실 (저자를 쓰러뜨린 뒤, 엔딩 선택 직전) */
export function authorTruth(): Line[] {
  const again = Number(G.flags.rebirth ?? 0) >= 2;
  return [
    again
      ? ['"…또 왔네. 몇 번째더라. 나도 이 판을 몇 번이나 다시 펼쳤는지 모르겠다."', '나도 기억해. 매번 여기까지 왔어.']
      : ['"하… 졌군. 펜이 이렇게 무거운 줄 몰랐다. 네가 그거구나. 내가 끝내 못 적은 한 수."', '날 알아?'],
    ['"알지. 널 적으면 이 대국이 끝났어. 끝나면 판 위의 말들은 다 책 속에서 잠들고. 그게 싫었다. 걔들이 그냥 거기서 멈춰 버리는 게."', '그래서 펜을 놓은 거야?'],
    ['"놓기만 했으면 다행이지. 널 판 밖으로 밀어냈다. 다시는 안 돌아오길 바라면서. 그러는 동안 지워진 수들은 왕 노릇을 하고, 퀸은 무르기만 하고, 킹은 판을 얼려 버렸지."', '그래도 난 돌아왔어.'],
    ['"그래, 돌아왔지. …마지막 줄은 네가 정해. 원래 네 자리였으니까."', '…알았어.'],
  ];
}

/** 기보 파편: 보스 셋을 쓰러뜨릴 때마다 하나씩 돌아오는 기억 */
export const MEMORIES: { title: string; text: string; line: string }[] = [
  {
    title: '기보 파편 1/3',
    text: '밀짚이 흩어지면서 어떤 장면이 떠오른다. 큰 손이 펜을 들고 판 위의 {P} 하나를 한참 내려다본다. 그런데 아무것도 적지 않는다. 펜 끝에서 잉크가 한 방울 떨어져 번진다.',
    line: '누군가 나를 내려다보고 있었다.',
  },
  {
    title: '기보 파편 2/3',
    text: '깨진 왕관에 다른 판이 비친다. 그 손이 수를 적다가 한 줄을 통째로 그어 버린다. 그어진 줄 끝에 작은 {P} 하나가 남는다. 손가락이 그 {P}을(를) 판 밖으로 슬쩍 밀어낸다.',
    line: '지워진 게 아니었다. 밀려난 거였다.',
  },
  {
    title: '기보 파편 3/3',
    text: '얼음이 갈라지고 마지막 장면이 보인다. 펜을 쥔 손이 떨리고 있다. "이걸 적으면 끝나 버리잖아." 손은 펜을 내려놓는다. 판이 멈춘다. 그 위에서 {P} 하나만 눈을 뜬다.',
    line: '그 손은 끝을 적는 게 무서웠다.',
  },
];

const CHAPTERS: { title: string; sub: string; recap: string[]; next: string }[] = [
  {
    title: '제1장 — 첫 수',
    sub: '기보에 없는 {P} 하나가 처음으로 발을 뗀다.',
    recap: ['기록의 벽에 이름을 새기고 마을 사람들의 부탁을 들어줬다.', '밀짚왕을 쓰러뜨리고 처음으로 승급했다.'],
    next: '마을 남쪽, 늪이 있는 쪽으로.',
  },
  {
    title: '제2장 — 혼전의 늪',
    sub: '수가 이리저리 엉켜 버린 기보의 중반.',
    recap: ['늪과 무너진 성채에서 저마다 사연 있는 말들을 만났다.', '같은 수만 무르던 퀸을 멈추고 두 번째로 승급했다.'],
    next: '야영지 남쪽, 눈 덮인 곳으로.',
  },
  {
    title: '제3장 — 얼어붙은 종반',
    sub: '끝이 무서워 얼어붙어 버린 판.',
    recap: ['미쳐 버린 파수꾼들을 재우고 길 잃은 폰을 도와줬다.', '판을 얼린 킹을 깨고 세 번째 왕관을 손에 넣었다.'],
    next: '왕의 봉우리 동쪽, 펜을 놓은 누군가가 있는 곳으로.',
  },
  {
    title: '제4장 — 여백',
    sub: '기보에 미처 못 적은 것들이 쌓이는 곳.',
    recap: [],
    next: '',
  },
];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 상대와 주인공이 주고받는 대화 (대답은 선택지 하나: 고르면 주인공이 말하는 연출 뒤 다음 줄) */
export function talkChain(name: string, sprite: string, lines: Line[]): Promise<void> {
  if (fx.instant) return Promise.resolve();
  lockStory(1);
  return new Promise((res) => {
    const step = (i: number) => {
      if (i >= lines.length) { lockStory(-1); return res(); }
      const [said, reply] = lines[i];
      // ✕나 Esc로 닫으면 남은 대화를 건너뛴다 (멈춰 버리지 않게)
      dialog(name, said, [{ label: reply, onPick: () => void wait(220).then(() => step(i + 1)) }], { sprite, speaker: name, onDismiss: () => step(lines.length) });
    };
    step(0);
  });
}

/** 해설 (인물 없이 대화 상자만) */
function narrate(title: string, text: string, button: string): Promise<void> {
  if (fx.instant) return Promise.resolve();
  return new Promise((res) => dialog(title, text, [{ label: button, onPick: () => void wait(150).then(res) }]));
}

/** 어둠 직업일 때 보스에게 하는 마지막 대답 — 조금씩 '정하는 쪽'이 되어 간다 */
const DARK_LAST: Record<StoryBoss, string> = {
  boss: '외롭든 말든 네 사정이야. 비켜.',
  queen: '실수한 건 너잖아. 무를지 말지는 내가 정해.',
  king: '무서우면 비켜. 끝은 내가 낼 테니까.',
  author: '쥘 만한지는 내가 정해.',
};
/** 「다음 보스」 엔딩을 본 뒤의 밀짚왕: 옥좌에 남았던 '나'가 다음 폰에게 하는 말 */
const THRONE_STRAW: BossTalk = {
  name: '밀짚왕',
  sprite: 'm:strawking',
  lines: [
    ['"…왔구나. 기다렸다. 이번엔 네가 걸어올 차례였지."', '날 알아?'],
    ['"알다마다. 나도 그 길로 왔어. 기록의 벽에 이름을 새기고, 들판을 지나, 이 언덕까지. 끝 줄까지 가 봤고, 그다음엔 여기 앉았지."', '그럼 넌…'],
    ['"쓰러뜨려. 왕관을 가져가. 그리고 끝까지 가 봐. 그게 다음 폰을 기다리는 왕이 바라는 전부다."', '…고마워. 그래도 봐주진 않을 거야.'],
  ],
};

/** 보스전 직전 대화 (각성한 보스·재도전에는 생략: 처음 한 번만) */
export async function bossIntro(id: StoryBoss) {
  if (G.flags[`talk_${id}`]) return;
  G.flags[`talk_${id}`] = true;
  const t = id === 'boss' && seenEnding('throne') ? THRONE_STRAW : BOSS_TALK[id];
  const lines = t.lines.map((l) => [...l] as Line);
  if (align() === 'dark') lines[lines.length - 1][1] = DARK_LAST[id];
  await talkChain(t.name, t.sprite, lines);
}

/** 보스를 쓰러뜨린 뒤 돌아오는 기억 (처음 한 번만) */
export async function bossMemory(i: 0 | 1 | 2) {
  if (G.flags[`memory_${i}`]) return;
  G.flags[`memory_${i}`] = true;
  const m = { ...MEMORIES[i], text: pfill(MEMORIES[i].text), line: pfill(MEMORIES[i].line) };
  log(`🕯 ${m.title}: ${m.line}`);
  await narrate(m.title, `${m.text}\n\n— ${m.line}`, '기억을 간직한다');
}

/** 장 시작 카드 (처음 한 번만) */
export function chapterStart(n: 1 | 2 | 3 | 4) {
  if (G.flags[`ch_${n}`]) return Promise.resolve();
  G.flags[`ch_${n}`] = true;
  const c = CHAPTERS[n - 1];
  return cutin(c.title, pfill(c.sub), 'win');
}

/** 장 끝 요약 (처음 한 번만): 지나온 일 + 돌아온 기억 + 다음 갈 곳 */
export function chapterEnd(n: 1 | 2 | 3): Promise<void> {
  if (G.flags[`chEnd_${n}`] || fx.instant) return Promise.resolve();
  G.flags[`chEnd_${n}`] = true;
  const c = CHAPTERS[n - 1];
  const mem = MEMORIES[n - 1];
  return new Promise((res) => {
    const go = h('button', { class: 'btn primary' }, '다음 장으로');
    const body = h('div', { class: 'chapter-end' },
      h('ul', {}, ...c.recap.map((t) => h('li', {}, t))),
      G.flags[`memory_${n - 1}`] ? h('p', { class: 'chapter-mem' }, `🕯 ${mem.title} — ${pfill(mem.line)}`) : null,
      h('p', { class: 'chapter-next' }, `다음: ${c.next}`),
      go,
    );
    const md = modal(`${c.title.split(' — ')[0]} 끝 — ${c.title.split(' — ')[1]}`, body, { onClose: () => res() });
    go.addEventListener('click', () => md.close());
  });
}

// ======================================================================
// 묶음 2 「함께 걷는 말들」: 동료의 속마음(쉴 때), 변하는 마을(돌아올 때), 에필로그 카드(엔딩 뒤)
// ======================================================================

/** 지금 몇 장인가 (승급 단계로 판단) */
export const chapterNow = () => (G.flags.promoted3 ? 4 : G.promoted2 ? 3 : G.promoted ? 2 : 1);

type Companion = 'soldier' | 'ghostknight' | 'priest';
const COMP_NAME: Record<Companion, [string, string]> = { soldier: ['폰 병사', 'p:bp'], ghostknight: ['망령 기사', 'p:bn'], priest: ['사제 비숍', 'p:bb'] };

/** 동료가 장마다 한 번씩 꺼내는 속마음 [동료의 말, 주인공의 대답] */
const COMP_TALK: Record<Companion, Partial<Record<2 | 3 | 4, Line[]>>> = {
  soldier: {
    2: [['"늪은 처음이야. 난 한 칸씩밖에 못 가니까 네 발자국만 보고 따라갈게."', '천천히 와.'], ['"광장에 서 있을 땐 몰랐어. 걷는 게 이렇게 무섭고 재밌는 건 줄."', '나도 그래.']],
    3: [['"눈이 무릎까지 와. 근데 이상하지, 가만히 서 있을 때보다 안 추워."', '계속 움직이니까 그런가 봐.']],
    4: [['"저기 판 끝이 보여. 폰이 끝까지 가면 뭐든 될 수 있다던데… 난 아직 뭐가 되고 싶은지 모르겠어."', '도착하고 나서 정해도 돼.'], ['"있잖아, 마지막 줄에 내 이름도 한 칸만 남겨 줄래?"', '응, 꼭.']],
  },
  ghostknight: {
    2: [['"성채는 아직도 춥군. 칼은 내가 쥐겠다. 넌 앞만 봐라."', '든든하네.']],
    3: [['"얼음에 얼굴이 비치는데, 누군지 모르겠다. 기록이 없으면 난 뭐였던 거지."', '지금은 나랑 같이 걷는 기사잖아.'], ['"…그거면 됐다."', '(고개를 끄덕인다)']],
    4: [['"여백은 이상하게 편하다. 안 적힌 것들끼리는 서로 알아보는 모양이야."', '그래서 우리가 만났나 봐.'], ['"이번엔 내 이름을 내가 정하고 싶다. 마지막 줄 어디쯤에."', '같이 적자.']],
  },
  priest: {
    2: [['"대각선으로만 다니던 저한테 늪은 온통 막힌 길이에요. 그래도 당신 뒤로는 길이 보이네요."', '같이 가요.']],
    3: [['"요즘은 기도할 때마다 다른 말이 나와요. 전엔 늘 같은 말만 했는데."', '좋은 일 같은데요.']],
    4: [['"마지막 장에 뭐가 적히든, 여기까지 온 건 후회 안 할 거예요."', '저도요.'], ['"…그 마지막 장에, 당신 이름 옆에 제 이름도 있으면 좋겠어요."', '그렇게 할게요.']],
  },
};

/** 쉴 때(여관·모닥불): 함께 다니는 동료 중 이번 장의 이야기를 아직 안 한 한 명이 말을 건다 */
export async function companionTalk() {
  if (fx.instant || !G) return;
  const ch = chapterNow() as 2 | 3 | 4;
  if (ch < 2) return;
  for (const c of G.party as Companion[]) {
    const lines = COMP_TALK[c]?.[ch];
    const key = `arc_${c}_${ch}`;
    if (!lines || G.flags[key]) continue;
    G.flags[key] = true;
    const [name, sprite] = COMP_NAME[c];
    log(`💬 ${name}와(과) 이야기를 나눴다`);
    await talkChain(name, sprite, lines);
    return; // 한 번 쉴 때 한 명만
  }
}

/** 장이 바뀐 뒤 첫수 마을에 돌아오면 들리는 수군거림 (장마다 한 번) */
const RUMORS: Record<2 | 3 | 4, string> = {
  2: '마을이 시끌시끌하다. "밀짚 옥좌가 조용해졌대. 그 폰이 해냈다나 봐." 양치기 폰이 두 칸 걸어 보려다가 엉덩방아를 찧었다.',
  3: '"늪 너머 탑에 있던 퀸도 멈췄대!" 양치기가 신나서 떠든다. 촌장 킹은 대꾸 없이 창밖만 오래 내다본다.',
  4: '광장의 말들이 오늘따라 순서를 조금씩 틀린다. 기록의 벽 아래에 누가 작게 적어 놨다. "다음 수는 우리가 둔다."',
};
export function townRumor() {
  if (fx.instant || !G) return;
  // 승급 단계가 아니라 '쓰러뜨린 보스'로 정한다: 퀸을 잡고 승급 전에 마을에 오면 밀짚왕 소문이 뒤늦게 나오던 것 (베타 제보)
  const ch = (G.flags.king_dead ? 4 : G.flags.queen_dead ? 3 : G.flags.boss_dead ? 2 : 0) as 0 | 2 | 3 | 4;
  if (ch === 0 || G.flags[`rumor_${ch}`]) return;
  for (let k = 2; k <= ch; k++) G.flags[`rumor_${k}`] = true; // 지나간 소문은 건너뛴다
  log(`🏘 ${RUMORS[ch]}`);
  dialog('첫수 마을', RUMORS[ch], [{ label: '마을을 둘러본다', onPick: () => {} }]);
}

/** 엔딩 뒤 에필로그 카드: 고른 엔딩과 그동안의 선택에 따라 사람들의 뒷이야기 */
export function epilogueCards(ending: 'return' | 'stay' | 'rewrite' | 'together' | 'pen' | 'stalemate' | 'throne' | 'closed', qDone: (id: string) => boolean): Promise<void> {
  if (fx.instant) return Promise.resolve();
  const cards: [string, string][] = [];
  const TOWN: Record<typeof ending, string> = {
    return: '대국이 끝난 마을은 조용하다. 말들은 기보대로 걷는데, 가끔 아무도 안 볼 때 한 칸 더 걷는 녀석이 있다.',
    stay: '광장의 말들이 처음으로 순서를 어기고 춤을 췄다. 다들 박자는 하나도 안 맞았다.',
    rewrite: '새 기보 첫 장에 첫수 마을이 다시 그려졌다. 이번엔 광장에 서 있는 말마다 이름이 붙어 있다.',
    together: '광장의 말들이 둘씩 셋씩 몰려다닌다. 혼자 걷는 말을 찾기가 더 어렵다.',
    pen: '광장의 말들이 줄을 딱 맞춰 걷는다. 너무 반듯해서, 웃는 말이 하나도 없다.',
    stalemate: '광장의 말들이 다 제자리에 앉아 볕을 쬔다. 서두르는 말이 없다.',
    closed: '덮인 책 속에서도 첫수 마을엔 아침이 온다. 말들이 서로 이름을 부르면서 하루를 시작한다.',
    throne: '얼마 뒤, 기록의 벽 앞에 처음 보는 폰 하나가 서 있었다. 기보에 없는 말이었다. 언덕 위 옥좌 쪽에서 밀짚 타는 냄새가 희미하게 났다.',
  };
  const ELDER: Record<typeof ending, string> = {
    return: '촌장 킹은 다시 한 칸씩 걷는다. 그런데 표정이 전보다 훨씬 편하다.',
    stay: '평생 한 칸씩만 걷던 촌장 킹이 광장 끝까지 걸어갔다 왔다. 돌아와서는 별일 아니라는 듯 헛기침만 했다.',
    rewrite: '새 기보에 촌장 킹은 "첫 수를 맞이한 자"라고 적혔다. 본인은 이름이 너무 거창하다고 투덜거린다.',
    together: '촌장 킹은 기록의 벽에 새겨진 이름 셋을 한참 보더니, 그 밑에 자기 이름도 작게 적었다.',
    pen: '촌장 킹은 새로 정해진 순서를 말없이 따른다. 밤이 되면 기록의 벽 앞에 혼자 서 있곤 한다.',
    stalemate: '"비긴 대국이라니. 기보에 이런 끝도 있었구먼." 촌장 킹은 이제 열 번째로 말을 걸어도 화를 안 낸다.',
    closed: '촌장 킹이 덮인 표지를 쓰다듬으며 말했다. "좋은 판이었네. 참말로."',
    throne: '촌장 킹은 새 폰에게 첫마디를 건네기 전에 언덕 쪽을 한 번 올려다봤다. "자네는… 아니, 아무것도 아닐세. 기록의 벽부터 가 보게."',
  };
  cards.push(['첫수 마을', TOWN[ending]]);
  cards.push(['촌장 킹', ELDER[ending]]);
  const party = G.party as Companion[];
  if (party.includes('soldier')) cards.push(['폰 병사', ending === 'together' ? '마지막 줄에 이름을 남긴 폰 병사는 판 끝에서 드디어 되고 싶은 걸 골랐다. 뭔지는 아직 비밀이란다.' : qDone('cq_soldier') ? '판 끝에 닿은 폰 병사는 뭐가 될지 아직 고르는 중이다. 서두를 생각은 없어 보인다.' : '폰 병사는 오늘도 한 칸씩 걷는다. 그래도 이제 멈추지는 않는다.']);
  if (G.flags.ghost_rest) cards.push(['망령 기사', '기사는 성채에서 조용히 잠들었다. 그가 쓰던 칼은 성문 위에 걸려 있다.']);
  else if (party.includes('ghostknight')) cards.push(['망령 기사', ending === 'together' ? '기사는 마지막 줄에 직접 고른 이름을 적었다. 그 이름을 소리 내 불러 준 건 당신이 처음이었다.' : '기사는 여백에 새 이름을 적었다. 이번엔 자기가 직접 고른 이름이다.']);
  else if (G.flags.ghost_bound) cards.push(['망령 기사', '성채에 남은 기사는 자꾸 여백 쪽을 돌아본다. 언젠가 또 같이 걸을 날이 올 거라고 믿는 눈치다.']);
  if (party.includes('priest')) cards.push(['사제 비숍', ending === 'together' ? '사제는 마지막 장에 적힌 자기 이름 앞에서 기도했다. 이번엔 아무것도 빌지 않았다. 고맙다는 말만 했다.' : '사제는 대각선이 아닌 길로 순례를 떠났다. 기도문은 매일 조금씩 달라진다.']);
  if (qDone('sq_witch')) cards.push(['늪의 마녀', G.flags.witch === 'stole' ? '마녀는 아직도 거울 도둑을 잡겠다며 솥을 휘젓는다. 그런데 표정이 은근히 즐거워 보인다.' : '마녀의 솥은 오늘도 잘 끓는다. 가끔 기보 밖에서 온 말 얘기를 하면서 혼자 킥킥댄다.']);
  if (qDone('sq_wolves')) cards.push(['길 잃은 폰', '설원의 길 잃은 폰은 다른 폰들한테 혼자 걷는 법을 가르치고 있다.']);
  if (qDone('sq_hermit')) cards.push(['늙은 룩 은자', '은자는 잠든 파수꾼들 옆에서 새 일지를 쓰기 시작했다. 첫 줄은 "꼭 곧게만 걸을 필요는 없다".']);
  if (G.flags.shrine === 'purify') cards.push(['비숍의 성소', '정화된 성소에는 이제 대각선이 아닌 방향으로도 빛이 든다.']);
  else if (G.flags.shrine === 'seal') cards.push(['비숍의 성소', '봉인이 뜯긴 성소는 조용하다. 가끔 그 밑에서 뭔가 사각사각 적히는 소리가 난다.']);
  if (Number(G.flags.kibo_n ?? 0) >= 8) cards.push(['떠돌이 기보사', '기보사는 당신이 푼 명국들을 새 기보 맨 앞에 옮겨 적었다.']);
  if (G.flags.blunder_dead) cards.push(['지워진 칸', '지워진 칸에서는 더 이상 실수가 기어 나오지 않는다. 하얀 바닥에 작은 발자국 하나만 남았다.']);
  if (ending === 'pen') cards.push(['저자', '펜을 빼앗긴 저자는 여백 구석에 앉아, 당신이 마지막 줄 앞에서 멈추는 걸 지켜봤다. 아무 말도 하지 않았다. 그 기분은 저자가 제일 잘 안다.']);
  if (ending === 'stalemate') cards.push(['저자', '저자는 ½–½이라고 적힌 마지막 줄을 몇 번이고 다시 읽는다. 읽을 때마다 입꼬리가 조금씩 올라간다.']);
  if (ending === 'throne') cards.push(['언덕 위의 옥좌', '옥좌에 앉은 왕은 판 가장자리를 지우지 않았다. 대신 들판 쪽을 내려다보며, 언젠가 올라올 한 칸짜리 발소리를 기다렸다.']);
  if (ending === 'closed') cards.push(['저자', '저자는 덮인 책을 끌어안고 있다가, 오래전 처음 펜을 잡던 날처럼 설레는 얼굴로 새 기보의 첫 장을 펼쳤다.']);
  return new Promise((res) => {
    const go = h('button', { class: 'btn primary' }, '끝맺기');
    const body = h('div', { class: 'epilogue' },
      h('p', { class: 'muted small' }, '그 뒤로, 판 위의 이야기들'),
      h('div', { class: 'epi-cards' }, ...cards.map(([who, text], i) => h('div', { class: 'epi-card', style: { animationDelay: `${i * 120}ms` } }, h('b', {}, who), h('p', {}, text)))),
      go);
    const md = modal('에필로그', body, { wide: true, closable: false, onClose: () => res() });
    go.addEventListener('click', () => md.close());
  });
}
