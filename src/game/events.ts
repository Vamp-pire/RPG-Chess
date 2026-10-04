// 떠도는 사건 칸: 야생 지역에 가끔 '?' 칸이 생긴다. 밟으면 작은 사건이 하나 벌어진다.
import { G, addBag, emit, maxHp, save } from '../core/state';
import { pick, rand } from '../core/geom';
import { DIFFS } from '../core/difficulty';
import { AREAS, ObjDef, randomEnc, pickParty } from '../data/areas';
import { MATS, MatId } from '../data/materials';
import { Choice, dialog, toast } from '../ui/dom';
import type { App } from './app';

export const EVENT_CHANCE = 0.4;

/** 이 지역에 사건 칸을 둘지 정한다 (지역에 들어올 때마다 새로) */
export function rollEvent(): boolean {
  return !!AREAS[G.area].random && Math.random() < EVENT_CHANCE;
}

export const eventDef = (x: number, y: number): ObjDef => ({ id: 'evt', kind: 'event', x, y, label: '?', sprite: 'o:event', walk: true });

const region = () => AREAS[G.area].region;
const basicPool = (): MatId[] => (region() >= 4 ? ['ink', 'page'] : region() >= 3 ? ['fur', 'frost', 'ice'] : region() === 2 ? ['skin', 'silk', 'bone', 'ecto'] : ['gel', 'tooth', 'wing', 'moss', 'thorn']) as MatId[];
const rarePool = (): MatId[] => (region() >= 3 ? ['mirror', 'tusk', 'fang', 'pearl'] : region() >= 2 ? ['pearl', 'silver', 'crack', 'fang', 'mirror'] : ['pearl', 'silver', 'crack', 'fang']) as MatId[];
const gold = (n: number) => Math.round(n * DIFFS[G.diff].gold * (1 + (region() - 1) * 0.5));

type Ev = (app: App, done: (msg?: string) => void) => void;

const EVENTS: { w: number; run: Ev }[] = [
  // 보물
  { w: 3, run: (_a, done) => {
    const m = pick(basicPool());
    const n = 2 + rand(2);
    addBag(m, n);
    const g = gold(8 + rand(8));
    G.gold += g;
    done(`흙 속에 묻힌 주머니를 찾았다. ${MATS[m].name} ×${n}, ${g}G`);
  } },
  // 떠돌이 행상: 희귀 재료 하나를 싸게
  { w: 2, run: (_a, done) => {
    const m = pick(rarePool());
    const price = Math.round(MATS[m].price * 0.8);
    dialog('떠돌이 행상', `"딱 하나 남았는데… ${MATS[m].name}, ${price}G에 가져가."`, [
      { label: `산다 (${price}G)`, disabled: G.gold < price, onPick: () => { G.gold -= price; addBag(m, 1); done(`${MATS[m].name}을(를) 샀다.`); } },
      { label: '지나간다', onPick: () => done() },
    ]);
  } },
  // 도박 좌판
  { w: 2, run: (_a, done) => {
    const bet = gold(10);
    dialog('수상한 좌판', `나이트 모양 주사위를 굴리는 좌판. "${bet}G를 걸면, 반반 확률로 2.5배!"`, [
      { label: `건다 (${bet}G)`, disabled: G.gold < bet, onPick: () => {
        G.gold -= bet;
        // 20G를 걸면 50G를 받는다. 높은 보상은 50% 확률로 상쇄해 작은 사건의 선택지로만 남긴다.
        if (Math.random() < 0.5) { const win = Math.round(bet * 2.5); G.gold += win; done(`이겼다! ${win}G를 받았다 (순이익 +${win - bet}G)`); } else done(`졌다… 주사위가 L자로 굴러갔다. (-${bet}G)`);
      } },
      { label: '지나간다', onPick: () => done() },
    ]);
  } },
  // 기도 제단
  { w: 2, run: (_a, done) => {
    const heal = Math.min(maxHp() - G.hp, 6); // 체력 2배 규칙에 맞춰 3 → 6
    G.hp += heal;
    done(heal > 0 ? `오래된 제단에 손을 얹자 따뜻해진다. 체력 +${heal}` : '오래된 제단. 이미 기운이 가득하다. (다음을 위해 +5G)');
    if (heal <= 0) G.gold += 5;
  } },
  // 함정
  { w: 1, run: (_a, done) => {
    if (G.hp > 2) { G.hp -= 1; done('밟은 칸이 꺼졌다! 체력 -1. 그 아래에 뭔가 반짝인다… 균열 이끼 ×1'); addBag('crack', 1); } else done('꺼질 듯한 칸이다. 조심해서 건넜다.');
  } },
  // 체스 수수께끼
  { w: 2, run: (_a, done) => {
    const qs: [string, string[], number][] = [
      ['"나이트가 한 번에 갈 수 있는 칸은 최대 몇 개일까?"', ['4개', '6개', '8개'], 2],
      ['"폰이 판 끝에 닿으면 무엇이 될 수 있을까?"', ['킹을 뺀 아무 말', '퀸만', '아무것도 안 된다'], 0],
      ['"비숍이 절대 갈 수 없는 칸은?"', ['자기와 다른 색 칸', '판 가장자리', '구석 칸'], 0],
      ['"캐슬링할 때 킹은 몇 칸 움직일까?"', ['1칸', '2칸', '3칸'], 1],
      ['"한 판에서 처음 움직일 수 있는 말은?"', ['폰과 나이트', '폰만', '아무 말이나'], 0],
    ];
    const [q, opts, ans] = pick(qs);
    dialog('길가의 돌판', `돌판에 새겨진 물음: ${q}`, opts.map((o, i): Choice => ({ label: o, onPick: () => {
      if (i === ans) { const g = gold(15); G.gold += g; addBag('shard', Math.random() < 0.15 ? 1 : 0); done(`정답! 돌판이 빛나며 ${g}G가 떨어진다.`); } else done('돌판이 조용해졌다. 틀린 모양이다.');
    } })));
  } },
  // 매복: 싸우면 보상 두 배
  { w: 2, run: (app, done) => {
    const r = AREAS[G.area].random;
    if (!r) return done();
    const party = pickParty(pick(r.table));
    dialog('매복!', '풀숲에서 몹들이 튀어나왔다! 이기면 떨어뜨린 재료가 두 배다.', [
      { label: '맞서 싸운다', onPick: () => { done(); G.flags.ambushBonus = true; app.startEncounter(randomEnc([...party, pick(party)], AREAS[G.area].biome)); } },
      { label: '도망친다 (체력 -1)', onPick: () => { G.hp = Math.max(1, G.hp - 1); done('간신히 빠져나왔다.'); } },
    ], { noClose: true }); // ✕로 닫아 공짜로 빠져나가던 것 (베타 제보)
  } },
  // 떠도는 기록
  { w: 1, run: (_a, done) => {
    const lines = [
      '바람에 날린 기보 한 장. "…그리고 그 폰은 끝내 돌아오지 않았다." 뒷면에 동전이 붙어 있다.',
      '누군가 판 위에 남긴 낙서: "e4는 언제나 옳다." 옆에 동전이 떨어져 있다.',
      '찢어진 기보: "17수, 백의 실수. 그 뒤로 이 칸은 지워졌다." 사이에 끼인 동전.',
    ];
    const g = gold(6);
    G.gold += g;
    done(`${pick(lines)} +${g}G`);
  } },
];

export function runEvent(app: App, onFinish: () => void) {
  const total = EVENTS.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  const ev = EVENTS.find((e) => (r -= e.w) < 0) ?? EVENTS[0];
  ev.run(app, (msg) => {
    G.flags.events = Number(G.flags.events ?? 0) + 1;
    emit('event', G.flags.events);
    if (msg) toast(msg, 'good');
    save();
    onFinish();
  });
}
