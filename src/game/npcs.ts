// NPC 대화와 분기. 직업 계열에 따라 선택지가 달라진다.
import { G, addBag, align, emit, hasJob, matHave, maxHp, spendMats } from '../core/state';
import { FIXED_ENCS } from '../data/areas';
import { MatId } from '../data/materials';
import { JobId } from '../data/pieces';
import { fx } from '../render/fx';
import { Choice, dialog, toast } from '../ui/dom';
import type { App } from './app';
import { q, qComplete, qStart, qst } from './quests';
import { ELDER_CONFESSION, elderConfessReady } from './throne';
import { talkChain } from './story';

const bye: Choice = { label: '그럼 이만', onPick: () => {} };

/** 중립 전용 선택지 */
function neutralChoice(label: string, fn: () => void, note?: string): Choice {
  const ok = align() === 'neutral';
  return { label, tag: 'neutral', disabled: !ok, note: ok ? note : '중립 직업 필요', onPick: fn };
}

export function talk(app: App, id: string) {
  const say = (speaker: string, img: string, text: string, choices: Choice[]) =>
    // 물건(일지·우물)은 인물 없이 내레이션, 나머지는 소품을 쓴 초상화로
    dialog(speaker, text, choices.map((c) => ({ ...c, onPick: () => { c.onPick(); app.refreshAll(); } })), id === 'logbook' || id === 'well' ? { speaker } : { sprite: `p:${img}`, npc: id, speaker });

  switch (id) {
    case 'elder': {
      G.flags.elderPoke = Number(G.flags.elderPoke ?? 0) + 1;
      if (G.flags.elderPoke === 10) {
        emit('elderPoke');
        return say('촌장 킹', 'wk', '"자네! 이걸로 열 번째일세! 난 한 번에 한 칸밖에 못 움직인다고. 도망도 못 가!"', [{ label: '…죄송합니다', onPick: () => {} }]);
      }
      // 폰의 흔적 셋을 모은 뒤 (숨은 엔딩 「다음 보스」)
      if (elderConfessReady()) {
        G.flags.elder_confess = true;
        void talkChain('촌장 킹', 'p:wk', ELDER_CONFESSION).then(() => app.refreshAll());
        return;
      }
      if (!G.job) return say('촌장 킹', 'wk', '"자넨… 기보에 없는 말이로군. 요즘 이 판이 이상하다네. 다음 수가 안 오고, 가장자리부터 칸이 하나씩 지워지고 있어. 이대로면 마을도 언젠간 사라지겠지. …우선 기록의 벽부터 가 보게. 자네가 뭘 할지 거기서 정해야 하네."', [bye]);
      if (qst('main_promo') === 'active' && matHave('crown') > 0) {
        return say('촌장 킹', 'wk', '"밀짚 왕관 아닌가! 이걸 바치면 자네가 움직일 수 있는 틀이 넓어질 걸세. 승급하겠나?"', [
          { label: '승급한다', onPick: () => { if (spendMats({ crown: 1 })) app.promote(false); } },
          { label: '아직은', onPick: () => {} },
        ]);
      }
      if (qst('main_promo2') === 'active' && matHave('qcrown') > 0) {
        return say('촌장 킹', 'wk', '"뒤집힌 왕관… 그 퀸 거로군. 이거면 한 번 더 넓힐 수 있겠어."', [
          { label: '두 번째 승급을 한다', onPick: () => { if (spendMats({ qcrown: 1 })) app.promote(true); } },
          { label: '아직은', onPick: () => {} },
        ]);
      }
      if (qst('main_boss') !== 'active' && qst('main_boss') !== 'done') {
        return say('촌장 킹', 'wk', '"들판 너머 언덕 위 옥좌에 밀짚으로 된 왕이 앉아 있네. 판 가장자리를 지우고 있는 게 그놈이야. 기보대로라면 아무도 못 막지. 하지만 기보에 없는 자네라면…" (서두를 필요는 없다. 대장간에서 장비를 갖추고 가자)', [
          { label: '맡겠습니다', onPick: () => {
            qStart('main_boss');
            // 첫 조합을 바로 해 볼 수 있게: 재료를 쥐여 주고 대장간부터 안내한다
            if (qst('sq_smith') === 'locked' || qst('sq_smith') === 'avail') {
              addBag('moss', 2);
              addBag('tooth', 1);
              qStart('sq_smith');
              G.flags.track = 'sq_smith';
              toast('촌장이 이끼 돌 2개와 쥐 이빨 1개를 건넸다. 대장간에서 첫 장비를 만들어 보자.', 'good');
            }
          } },
          { label: '나중에', onPick: () => {} },
        ]);
      }
      if (G.promoted2) return say('촌장 킹', 'wk', '"벌써 기보 중반을 넘었구먼. 끝이 어떻게 될지는 나도 모르겠네. 자네가 정하겠지."', [bye]);
      if (G.promoted) return say('촌장 킹', 'wk', '"마을 남쪽 담장 너머 길이 열렸네. 야영지의 정찰병 나이트를 찾아가 보게."', [bye]);
      return say('촌장 킹', 'wk', '"옥좌는 언덕 동쪽 너머에 있네. 언덕은 들판 북쪽으로 나가면 나오고."', [bye]);
    }

    case 'priest': {
      const s = qst('sq_shrine');
      const rc = qst('rc_priest');
      if (s === 'done' && G.flags.shrine === 'purify' && G.promoted && rc !== 'done') {
        if (rc === 'active') {
          return say('사제 비숍', 'wb', '"준비됐어요? 늪에 있는 것들, 같이 상대해 봐요."', [
            { label: '시험 전투를 치른다', tag: 'fight', onPick: () => trial(app, 'priest') },
            { label: '나중에', onPick: () => {} },
          ]);
        }
        return say('사제 비숍', 'wb', '"성소를 정화해 주셨죠. 저도 이제 대각선 말고 다른 길로 가 보고 싶어요. 같이 가도 될까요?"', [
          app.alignChoice('함께 순례를 떠나자', 'light', () => { qStart('rc_priest'); toast('사제와 함께 시험 전투를 치르면 동료가 된다.', 'info'); }),
          bye,
        ]);
      }
      if (s === 'done') return say('사제 비숍', 'wb', '"성소 일은 다 끝났어요. 조심히 다니세요."', [bye]);
      if (s === 'active') return say('사제 비숍', 'wb', '"성소는 숲 북서쪽 구석에 있어요. 숲은 마을 서쪽으로 나가면 돼요."', [bye]);
      return say('사제 비숍', 'wb', '"숲에 제가 돌보던 성소가 있어요. 그런데 전 대각선으로만 다닐 수 있어서 나무 사이로는 못 가요. 대신 한번 들러 주실래요?"', [
        { label: '가 보겠습니다', onPick: () => qStart('sq_shrine') }, bye,
      ]);
    }

    case 'shepherd': {
      const s = q('sq_sheep');
      if (s.st === 'done') return say('양치기 폰', 'wp', '"양들이 전부 풀을 잘 뜯고 있어요."', [bye]);
      if (s.st === 'locked' || s.st === 'avail') {
        return say('양치기 폰', 'wp', '"양이 세 마리나 도망갔어요! 들판이나 숲, 언덕 어디쯤 있을 텐데… 전 앞으로 한 칸씩밖에 못 가서 찾으러 갈 수가 없어요."', [
          { label: '찾아 드릴게요', onPick: () => { qStart('sq_sheep'); app.explore.enter(G.area); } }, bye,
        ]);
      }
      if (s.st === 'active') return say('양치기 폰', 'wp', `"아직 ${3 - s.n}마리가 남았어요…"`, [bye]);
      return say('양치기 폰', 'wp', '양 세 마리가 양치기 곁으로 돌아왔다. 양치기는 연신 고개를 숙인다. 그런데 문득, 이 양들을 노리는 상인의 이야기가 떠오른다.', [
        app.alignChoice('양치기에게 모두 돌려준다', 'light', (w) => qComplete('sq_sheep', { gold: w ? 8 : 15, mats: [['fiber', w ? 2 : 4]] })),
        app.alignChoice('몰래 한 마리를 팔아넘긴다', 'dark', (w) => qComplete('sq_sheep', { gold: w ? 22 : 45 })),
        neutralChoice('수고비로 양털을 조금 받는다', () => qComplete('sq_sheep', { gold: 10, mats: [['pearl', 1]] })),
      ]);
    }

    case 'soldier': {
      const s = q('sq_pawn');
      const rc = qst('rc_soldier');
      if (s.st === 'done' && G.promoted && rc !== 'done') {
        if (rc === 'active') {
          return say('폰 병사', 'wp', '"…준비됐어. 내 첫 수, 같이 두자."', [
            { label: '시험 전투를 치른다', tag: 'fight', onPick: () => trial(app, 'soldier') },
            { label: '나중에', onPick: () => {} },
          ]);
        }
        return say('폰 병사', 'wp', '폰 병사가 처음으로 먼저 말을 걸어 온다. "기보는… 더 이상 오지 않아. 나도 너처럼 움직이고 싶어."', [
          app.alignChoice('손을 내민다: 함께 가자', 'light', () => startRc('rc_soldier'), '무료'),
          app.alignChoice('계약으로 묶는다 (쥐 이빨 3)', 'dark', () => { if (spendMats({ tooth: 3 })) startRc('rc_soldier'); else toast('쥐 이빨이 부족하다', 'bad'); }, matHave('tooth') < 3 ? '쥐 이빨 부족' : undefined),
          neutralChoice('첫 수를 가르쳐 준다 (들풀 섬유 3)', () => { if (spendMats({ fiber: 3 })) startRc('rc_soldier'); else toast('들풀 섬유가 부족하다', 'bad'); }),
          bye,
        ]);
      }
      const lines = [
        '"……." 폰 병사는 앞만 보고 서 있다. 기보에 적힌 다음 수를 기다리는 것 같다.',
        '"…다음 수가… 오지 않아." 병사가 아주 작게 중얼거렸다.',
        '"너는… 기보에 없지? 그럼… 나도… 언젠가…" 병사의 눈에 처음으로 빛이 돈다.',
      ];
      if (s.st === 'done') return say('폰 병사', 'wp', `"…언젠가 나도, 너처럼."${G.promoted ? '' : ' (승급하고 나서 다시 와 보자)'}`, [bye]);
      if (s.st !== 'active') qStart('sq_pawn');
      const last = Number(G.flags.pawnTalkAt ?? -1);
      if (last === G.battles && s.n > 0) return say('폰 병사', 'wp', '"……." (전투를 한 번 치르고 다시 말을 걸어 보자)', [bye]);
      const line = lines[Math.min(s.n, 2)];
      s.n++;
      G.flags.pawnTalkAt = G.battles;
      if (s.n >= 3) qComplete('sq_pawn', { text: '폰 병사의 마음이 움직였다' });
      return say('폰 병사', 'wp', line, [bye]);
    }

    case 'rook': {
      qStart('sq_rook', true);
      const done = (how: 'persuade' | 'contract' | 'read', weak = false) => {
        G.flags.rook_gone = true;
        G.flags.rook_how = how;
        const texts = {
          persuade: '"…기보보다 네 말이 옳을지도 모르겠군." 룩이 한 칸 옆으로 물러났다.',
          contract: '"좋다, 계약이다." 룩이 이빨을 챙기고 비켜서며, 은밀히 무언가를 건넨다.',
          read: '"내 다음 수가… 옆 칸이라고?" 룩은 스스로 한 칸 비켜섰다.',
        };
        const mats: [MatId, number][] = how === 'contract' ? [['shard', 1]] : weak ? [] : [['pearl', 1]];
        qComplete('sq_rook', { gold: how === 'contract' ? (weak ? 15 : 30) : 10, mats });
        app.explore.removeObj('rook');
        dialog('고집쟁이 룩', texts[how], [{ label: '지나간다', onPick: () => app.refreshAll() }], { sprite: 'p:br', npc: 'rook', speaker: '고집쟁이 룩' });
      };
      return say('고집쟁이 룩', 'br', '"여기는 내 칸이다. 기보에 그렇게 적혀 있다. 다음 수가 올 때까지 절대 안 비킨다." 룩이 북쪽 길목을 막고 서 있다. 그 너머가 언덕으로 가는 길이다.', [
        app.alignChoice('설득한다', 'light', (w) => {
          if (w && !hasJob('paladin') && Math.random() < 0.5) {
            dialog('고집쟁이 룩', '"말로는 안 비킨다." 룩은 꿈쩍도 하지 않는다. (다시 시도할 수 있다)', [{ label: '물러난다', onPick: () => {} }]);
            return;
          }
          done('persuade', w);
        }, hasJob('paladin') ? '성기사: 반드시 성공' : undefined),
        app.alignChoice('계약한다 (쥐 이빨 2)', 'dark', (w) => {
          if (!spendMats({ tooth: 2 })) { toast('쥐 이빨이 부족하다', 'bad'); return; }
          done('contract', w);
        }, matHave('tooth') < 2 ? '쥐 이빨 부족' : undefined),
        neutralChoice('기보를 읽어 룩의 다음 수를 알려 준다', () => done('read')),
        { label: '힘으로 비키게 한다', tag: 'fight', note: '전투', onPick: () => app.startEncounter(FIXED_ENCS.rook) },
        { label: '그냥 둔다', onPick: () => {} },
      ]);
    }

    case 'shrine': {
      const s = qst('sq_shrine');
      if (s === 'done') return dialog('비숍의 성소', G.flags.shrine === 'seal' ? '봉인이 뜯긴 성소. 서늘한 기운만 남았다.' : '고요한 성소. 대각선 무늬가 은은하게 빛난다.', [{ label: '떠난다', onPick: () => {} }]);
      qStart('sq_shrine', true);
      const pil = hasJob('pilgrim');
      return dialog('비숍의 성소', '대각선 무늬가 새겨진 낡은 성소. 가운데 봉인 아래에서 무언가가 기록을 갉아먹는 소리가 난다.', [
        app.alignChoice('정화한다 (슬라임 젤 1)', 'light', (w) => {
          if (!spendMats({ gel: 1 })) { toast('슬라임 젤이 필요하다', 'bad'); return; }
          G.flags.shrine = 'purify';
          if (w) {
            G.hp = maxHp();
            qComplete('sq_shrine', { gold: 15, text: '체력 회복' });
          } else {
            G.bonusHp++;
            G.hp = Math.min(maxHp(), G.hp + 1);
            qComplete('sq_shrine', { gold: pil ? 25 : 0, text: '최대 체력 +1' });
            fx.burst(app.explore.pEnt.x + 0.5, app.explore.pEnt.y + 0.5, '#fff6c0', 20, { speed: 2.5 });
          }
        }, pil ? '순례자: 보상 증가' : undefined),
        app.alignChoice('봉인을 뜯는다', 'dark', (w) => {
          G.flags.shrine = 'seal';
          qComplete('sq_shrine', { mats: w ? [['shard', 1]] : [['shard', 1], ['crack', 1]] });
        }),
        neutralChoice('보고 기록만 해 둔다', () => { G.flags.shrine = 'watch'; qComplete('sq_shrine', { gold: hasJob('scholar') ? 45 : 30 }); }),
        { label: '지금은 둔다', onPick: () => {} },
      ].map((c) => ({ ...c, onPick: () => { c.onPick(); app.refreshAll(); } })));
    }

    // ---------- 2지역 ----------
    case 'scout': {
      const s = qst('sq_scout');
      const choices: Choice[] = [];
      if (qst('main_r2') === 'locked') choices.push({ label: '탑의 퀸에 대해 묻는다', onPick: () => { qStart('main_r2'); say('정찰병 나이트', 'wn', '"늪을 지나 남쪽 끝에 거꾸로 선 탑이 있어. 퀸은 그 꼭대기에 있고. 한 번에 세 칸까지 날아오니까 멀찍이서 기회를 봐. 보라색 줄이 그어지면 무조건 비켜서고. 그 줄에 서 있으면 판 끝에서 끝까지 다 맞아."', [{ label: '알았어', onPick: () => {} }]); } });
      if (s === 'locked') choices.push({ label: '지도를 채워 주겠다', onPick: () => qStart('sq_scout') });
      if (s === 'ready') choices.push({ label: '지도를 건넨다', onPick: () => qComplete('sq_scout', { gold: 40, mats: [['mirror', 1], ['skin', 2]], text: '정찰병이 거울 파편을 건넸다' }) });
      choices.push(bye);
      return say('정찰병 나이트', 'wn', s === 'done'
        ? '"지도 다 됐다. 이제 늪에서 헤맬 일은 없겠어."'
        : '"여기부턴 수가 엉망으로 엉켜 있어. 늪 남쪽 탑에 퀸이 하나 있는데, 있으면 안 될 자리에 놓였대. 판을 가로질러서 체크를 걸어 오니까 줄에서 비켜서기만 하면 돼. 아, 그리고 부탁 하나만. 늪이랑 성채, 탑 앞에 표식이 있는데 그거 밟아서 지도 좀 채워 줄래?"', choices);
    }

    case 'witch': {
      const s = qst('sq_witch');
      if (s === 'done') return say('늪의 마녀', 'wq', G.flags.witch === 'stole' ? '"…도둑놈. 다음엔 솥에 넣어 버릴 테다."' : '"솥 잘 끓고 있다. 고마웠어, 굴러온 말아."', [bye]);
      if (s === 'locked') {
        return say('늪의 마녀', 'wq', '"퀸이라고 다 판 위에서 설치는 줄 알아? 난 솥이나 젓는다. 안개 거미줄 셋, 망령 정수 둘 가져와. 그럼 거울 조각을 주지. 순간이동할 때 쓰는 거야."', [
          { label: '가져오겠다', onPick: () => { qStart('sq_witch'); if (matHave('silk') >= 3 && matHave('ecto') >= 2) q('sq_witch').st = 'ready'; } }, bye,
        ]);
      }
      if (s === 'active') return say('늪의 마녀', 'wq', `"거미줄 ${Math.min(3, matHave('silk'))}/3, 정수 ${Math.min(2, matHave('ecto'))}/2. 늪엔 거미가, 성채엔 망령이 있지."`, [bye]);
      return say('늪의 마녀', 'wq', '마녀가 솥을 젓는다. 재료는 다 모였다. 솥 옆에는 거울 파편이 여러 개 쌓여 있다.', [
        app.alignChoice('재료를 그대로 건넨다', 'light', (w) => { if (spendMats({ silk: 3, ecto: 2 })) { G.flags.witch = 'honest'; } else return; qComplete('sq_witch', { gold: w ? 10 : 25, mats: [['mirror', 1]] }); }),
        app.alignChoice('마녀가 한눈판 사이 거울을 훔친다', 'dark', (w) => { G.flags.witch = 'stole'; qComplete('sq_witch', { mats: [['mirror', w ? 1 : 2]] }); }),
        neutralChoice('반만 주고 반은 거래한다', () => { if (spendMats({ silk: 2, ecto: 1 })) { G.flags.witch = 'trade'; } else return; qComplete('sq_witch', { mats: [['mirror', 1], ['skin', 2]] }); }),
        { label: '나중에', onPick: () => {} },
      ]);
    }

    case 'ghostknight': {
      const s = qst('sq_ghost');
      const rc = qst('rc_ghost');
      if (s === 'done' && G.flags.ghost_bound && rc !== 'done') {
        if (rc === 'active') {
          return say('망령 기사', 'wn', '"맹세를 증명하지. 칼을 들어라."', [
            { label: '시험 전투를 치른다', tag: 'fight', onPick: () => trial(app, 'ghostknight') },
            { label: '나중에', onPick: () => {} },
          ]);
        }
        return say('망령 기사', 'wn', '"내 기록은 끝났다. 그래도 칼은 남았지. 네 수에 맹세하마."', [
          { label: '맹세를 받는다', onPick: () => startRc('rc_ghost') }, bye,
        ]);
      }
      if (s === 'done') return say('망령 기사', 'wn', '"…고맙다."', [bye]);
      if (s === 'locked') {
        return say('망령 기사', 'wn', '"이 성채는 뼈 군주한테 빼앗겼다. 내 몸이랑 기록까지 같이. 놈을 쓰러뜨려 다오. 그러면 나도… 좀 쉴 수 있겠지."', [
          { label: '해 보겠다', onPick: () => qStart('sq_ghost') }, bye,
        ]);
      }
      if (s === 'active') return say('망령 기사', 'wn', '"뼈 군주는 성채 위쪽이다. 반쯤 깎이면 부하를 부르니 조심해."', [bye]);
      return say('망령 기사', 'wn', '"놈이 쓰러졌군. …그래서, 나는 어떻게 할 거지?"', [
        app.alignChoice('안식을 빈다', 'light', (w) => { G.flags.ghost_rest = true; if (!w) G.bonusHp++; qComplete('sq_ghost', { gold: w ? 20 : 30, text: w ? '' : '최대 체력 +1' }); app.explore.removeObj('ghostknight'); }),
        app.alignChoice('영혼을 묶어 곁에 둔다', 'dark', (w) => { G.flags.ghost_bound = true; G.flags.ghost_how = 'bind'; qComplete('sq_ghost', { mats: w ? [['bone', 2]] : [['bone', 3], ['shard', 1]], text: '망령 기사를 동료로 들일 수 있다' }); }),
        neutralChoice('그의 이야기를 끝까지 기록한다', () => { G.flags.ghost_bound = true; G.flags.ghost_how = 'record'; qComplete('sq_ghost', { gold: 40, text: '망령 기사를 동료로 들일 수 있다' }); }),
      ]);
    }

    case 'scribe': {
      G.flags.scribeTalked = true;
      const lines = !G.flags.blunder_dead
        ? '"여긴 지워진 칸이다. 두면 안 되는 수들을 갖다 버리는 곳이지. 저기 저 블런더가 자꾸 기보로 기어 나가려고 해. 좀 치워 주겠나?"'
        : G.flags.gun_life
          ? '"결국 그걸 만들었군. 체스판에 있으면 안 되는 물건을. …뭐, 네가 쓰는 거라면 괜찮겠지."'
          : '"치웠군. 고맙다. 그런데 그놈이 떨어뜨린 방아쇠 말이다, 그건 체스판 물건이 아니야. 거울 파편이랑 기보 파편을 같이 넣어서 무기로 벼려 봐라. 뭔가 깨어날 거다."';
      return say('기록하는 자', 'wq', lines, [bye]);
    }
    case 'hermit': {
      // 세 번째 승급
      if (qst('main_promo3') === 'active' && matHave('kcrown') > 0) {
        return say('늙은 룩 은자', 'wr', '"얼어붙은 왕관이군. 녹이면 한 번 더 넓어진다. 대신 그다음은 글자가 끊기는 곳이야. 갈 수 있겠나?"', [
          { label: '왕관을 녹인다 (세 번째 승급)', onPick: () => { if (spendMats({ kcrown: 1 })) void app.promote3(); } },
          { label: '아직은', onPick: () => {} },
        ]);
      }
      // 은자의 부탁 → 직업 계열에 따라 다른 보답
      if (qst('sq_hermit') === 'ready') {
        const done = (text: string) => { qComplete('sq_hermit', { text }); };
        return say('늙은 룩 은자', 'wr', '"파수꾼들이 조용해졌군. 저놈들도 원래는 나처럼 곧게만 걷던 룩이었지. …고맙다. 뭘로 갚으면 되겠나?"', [
          app.alignChoice('그들의 넋을 기린다', 'light', (w) => { G.flags.hermit_how = 'light'; G.bonusHp += w ? 0 : 1; G.hp = Math.min(maxHp(), G.hp + 1); done(w ? '마음이 따뜻해졌다' : '최대 체력 +1'); }, '빛: 최대 체력 +1'),
          app.alignChoice('남은 힘을 거둔다', 'dark', (w) => { G.flags.hermit_how = 'dark'; addBag('tusk', w ? 1 : 2); done(`거인의 엄니 ×${w ? 1 : 2}`); }, '어둠: 거인의 엄니'),
          neutralChoice('은자와 거래한다', () => { G.flags.hermit_how = 'neutral'; G.gold += 150; addBag('shard', 1); done('150G, 기보 파편 ×1'); }, '중립: 골드와 기보 파편'),
          { label: '됐습니다', onPick: () => done('은자의 고마움') },
        ]);
      }
      if (qst('sq_hermit') === 'locked') {
        return say('늙은 룩 은자', 'wr', '"기보 밖의 말이 여기까지 왔군. 남쪽 요새 파수꾼들이 미쳐서 아무나 쏘고 있다. 좀 재워 주겠나? 어차피 킹한테 가려면 지나야 하는 길이야."', [
          { label: '맡겠습니다', onPick: () => qStart('sq_hermit') },
          { label: '다음에', onPick: () => {} },
        ]);
      }
      const tip = !G.flags.king_dead
        ? '"킹은 한 칸씩밖에 못 움직이지만 판을 통째로 얼린다. 푸른 눈송이 칸에서는 비켜서. 반쯤 깎이면 캐슬링하듯 뒤로 빠지면서 파수꾼을 세울 거다."'
        : '"킹이 쓰러졌다고? …그럼 이제 봉우리 너머로 가겠군."';
      return say('늙은 룩 은자', 'wr', tip, [bye]);
    }
    case 'lostpawn': {
      const st = qst('sq_wolves');
      if (st === 'ready') {
        return say('길 잃은 폰', 'wp', '"늑대 소리가 안 들려요! 저도 원래는 누구 기보에 있던 폰이었는데요, 이제 어디로 갈지는 제가 정하려고요. 이거 받으세요. 제가 모은 거예요."', [
          { label: '받는다', onPick: () => qComplete('sq_wolves', { gold: 60, mats: [['fur', 3], ['ice', 2]] }) },
        ]);
      }
      if (st === 'locked') {
        return say('길 잃은 폰', 'wp', '"기보에서 떨어져서 여기까지 흘러왔어요. 근데 늑대들이 자꾸 쫓아와요… 네 마리만 쫓아 주시면 여기서 버틸 수 있을 것 같아요."', [
          { label: '늑대를 쫓아 준다', onPick: () => qStart('sq_wolves') },
          { label: '다음에', onPick: () => {} },
        ]);
      }
      return say('길 잃은 폰', 'wp', st === 'done' ? '"아직 한 칸씩이지만 이제 제 발로 걸어요. 고마워요."' : '"늑대는 둘이 붙어 있으면 더 세게 물어요. 하나씩 떼어 놓고 싸우세요."', [bye]);
    }
    case 'logbook': {
      const first = !G.flags.logbook;
      G.flags.logbook = true;
      if (first) { G.gold += 30; toast('일지 사이에 끼워 둔 30G를 찾았다.', 'good'); }
      return say('파수꾼의 일지', 'wr', '누렇게 바랜 일지: "…킹께서 스스로를 얼리신 지 오래. 우리는 곧은 줄만 지킨다. 줄 밖의 것은 쏘지 않는다. 줄 위에 서지 않는 자만이 봉우리에 닿으리라." 마지막 장에는 서툰 글씨로: "비켜서라. 그게 전부다."', [bye]);
    }
    case 'well': {
      const cost = 20;
      return say('잉크 우물', 'wq', '끝없이 깊은 잉크 우물. 동전을 던지면 무언가가 떠오른다는 낙서가 우물 턱에 적혀 있다.', [
        { label: `동전을 던진다 (${cost}G)`, disabled: G.gold < cost, onPick: () => {
          G.gold -= cost;
          const r = Math.random();
          const [m, n]: [MatId, number] = r < 0.1 ? ['quill', 1] : r < 0.5 ? ['page', 2] : ['ink', 2];
          addBag(m, n);
          toast(m === 'quill' ? '우물에서 깃펜이 떠올랐다!' : `잉크 우물에서 무언가가 떠올랐다. (${m === 'page' ? '찢긴 페이지' : '잉크 방울'} ×${n})`, m === 'quill' ? 'rare' : 'good');
        } },
        bye,
      ]);
    }
    case 'scribe2': {
      // 직업마다 한 번씩 주는 선물
      const gift = JOB_GIFTS[G.job ?? 'wanderer'];
      if (G.job && !G.flags.jobGift) {
        return say('여백의 기록자', 'wq', `"여기는 여백. 기보에 다 적지 못한 것들이 모이는 곳이다. 너는… ${gift.who}로군. 네 길에 맞는 걸 하나 적어 주지."`, [
          { label: '받는다', onPick: () => {
            G.flags.jobGift = true;
            for (const [m, n] of gift.mats) addBag(m, n);
            if (gift.gold) G.gold += gift.gold;
            emit('jobGift', G.job);
            toast(`기록자의 선물: ${gift.text}`, 'rare');
          } },
        ]);
      }
      const lines = !G.flags.author_dead
        ? rewriteHint()
        : '"마지막 줄은 적혔다. 다시 써 보고 싶으면 기록의 벽에서 처음으로 돌아가는 방법도 있지. 다른 길로 걸으면 다른 끝이 나온다는 얘기도 있고."';
      return say('여백의 기록자', 'wq', lines, [bye]);
    }
  }

  function startRc(id: string) {
    qStart(id);
    toast('함께 시험 전투를 치르면 동료가 된다. 다시 말을 걸자.', 'info');
  }
}

/** 직업별 전용 선물 (여백의 기록자) */
const JOB_GIFTS: Record<JobId, { who: string; text: string; mats: [MatId, number][]; gold?: number }> = {
  paladin: { who: '방패를 든 성기사', text: '얼음 비늘 ×3, 서리 결정 ×1', mats: [['ice', 3], ['frost', 1]] },
  healer: { who: '손이 따뜻한 치유사', text: '찢긴 페이지 ×2, 진주빛 젤 ×1', mats: [['page', 2], ['pearl', 1]] },
  pilgrim: { who: '먼 길을 걸어온 순례자', text: '기보 파편 ×1, 늑대 털 ×2', mats: [['shard', 1], ['fur', 2]] },
  judge: { who: '저울을 든 심판자', text: '120G', mats: [], gold: 120 },
  thief: { who: '손버릇 나쁜 도적', text: '깃펜 ×1 (…언제 가져갔지?)', mats: [['quill', 1]] },
  contractor: { who: '계약서를 품은 계약자', text: '잉크 방울 ×4, 60G', mats: [['ink', 4]], gold: 60 },
  necro: { who: '죽은 수를 부리는 강령술사', text: '해골 조각 ×4, 찢긴 페이지 ×2', mats: [['bone', 4], ['page', 2]] },
  assassin: { who: '그림자 속의 암살자', text: '거인의 엄니 ×1', mats: [['tusk', 1]] },
  wanderer: { who: '어디에도 속하지 않은 방랑자', text: '늑대 털 ×3, 서리 결정 ×2', mats: [['fur', 3], ['frost', 2]] },
  alchemist: { who: '무엇이든 섞는 연금술사', text: '진주빛 젤 ×2, 잉크 방울 ×2', mats: [['pearl', 2], ['ink', 2]] },
  hunter: { who: '발자국을 읽는 사냥꾼', text: '거인의 엄니 ×1, 늑대 털 ×2', mats: [['tusk', 1], ['fur', 2]] },
  scholar: { who: '기보를 외우는 학자', text: '깃펜 ×1', mats: [['quill', 1]] },
};

function rewriteHint() {
  if (G.flags.blunder_dead && (Number(G.flags.kibo_n ?? 0) >= 8 || G.flags.gun_known)) return '"지워진 칸의 실수도 치웠고, 옛 명국이나 그 무기도 아는군. 저자 앞에 가면 남들은 못 고르는 끝이 하나 더 보일 거다."';
  return '"저자는 마지막 장에 있다. 어떻게 끝낼지는 네가 정하는 거고. …듣기로는 지워진 칸의 실수를 치우고 떠돌이 기보사의 명국을 아는 자는 다른 끝도 적을 수 있다더군. 데리고 다니는 동료나, 걸어온 길에 따라서도 달라진다고 하고."';
}

function trial(app: App, c: 'soldier' | 'ghostknight' | 'priest') {
  if (G.party.length >= 3) {
    toast('동료는 셋까지다.', 'bad');
    return;
  }
  const enc = c === 'soldier' ? FIXED_ENCS.trial_soldier : c === 'ghostknight' ? FIXED_ENCS.trial_ghost : FIXED_ENCS.trial_priest;
  const rc = c === 'soldier' ? 'rc_soldier' : c === 'ghostknight' ? 'rc_ghost' : 'rc_priest';
  const join = () => {
    qComplete(rc, { text: '동료 합류' });
    app.recruit(c);
    if (c === 'soldier' || c === 'priest') app.explore.removeObj(c);
    if (c === 'ghostknight') app.explore.removeObj('ghostknight');
  };
  // 「함께 적힌 이름」으로 환생했다면: 어디선가 본 얼굴이라며 시험 없이 따라온다
  if (G.flags.rb_together) {
    toast('"…이상하지. 너와는 전에도 함께 걸었던 것 같아." 시험 없이 동료가 되었다.', 'rare');
    join();
    app.refreshAll();
    return;
  }
  app.startEncounter(enc, { onWin: join });
}
