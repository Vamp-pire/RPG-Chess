// 숨은 엔딩 「다음 보스」의 단서: '폰의 흔적'. 보스들은 원래 기보 밖으로 나가려던 폰이었다.
// 엔딩을 하나 이상 본 뒤(환생한 판)에만 셀 수 있다. 조건을 대놓고 적지는 않지만, 단서 없이 보스를 쓰러뜨리면
// 보스가 쓰러지며 무엇을 바랐는지 알아들을 수 있게 말해 준다(알림 + 로그, 판마다 보스당 한 번).
//   밀짚왕: 옥좌 칸에 선 채로 마지막 일격 (왕좌에 앉아 왕을 끝낸다)
//   잘못 둔 퀸: 판 맨 윗줄(폰이 승급하는 끝 줄)에서 쓰러뜨린다
//   얼어붙은 킹: 바로 아래 대각선 칸에 선 아군(주인공·동료)의 일격으로 끝낸다 (폰이 잡는 방식)
// 셋을 모은 뒤 촌장 킹에게 말을 걸면 고백을 듣고, 저자 앞에 선택지가 열린다.
import { G, emit, log, save } from '../core/state';
import { toast } from '../ui/dom';

export type TraceId = 'straw' | 'queen' | 'king';
const TRACES: Record<TraceId, { found: string; hint: string }> = {
  straw: {
    found: '밀짚 더미 속에서 낡은 폰 머리 하나가 굴러 나왔다. 왕관 자국이 패어 있다.',
    hint: '밀짚왕이 쓰러지며 빈 옥좌를 돌아본다. "…누가 저 옥좌 위에 서서 날 끝내 줬다면, 나도 처음엔 폰이었다는 걸 기억했을 텐데."',
  },
  queen: {
    found: '퀸의 깨진 받침 아래에 작은 폰의 받침이 겹쳐 있다. 끝 줄에서 퀸이 되기 전의 것이다.',
    hint: '퀸이 무너지며 판 맨 위를 올려다본다. "…맨 윗줄. 내가 퀸이 된 그 끝 줄에서 쓰러지고 싶었어."',
  },
  king: {
    found: '얼음이 갈라지며 킹의 발밑에 폰 한 개 크기의 자국이 드러났다. 처음엔 이만했던 것이다.',
    hint: '킹이 갈라지며 웃는다. "…폰이었다면 내 대각선 아래 칸에서 붙어 잡았겠지. 나도 그렇게 잡혔어야 했는데."',
  },
};

/** 이 엔딩을 본 적이 있는가 (환생해도 남는 기록) */
export function seenEnding(id: string): boolean {
  try {
    return ((JSON.parse(localStorage.getItem('cf_meta') ?? '{}').endings ?? []) as string[]).includes(id);
  } catch {
    return false;
  }
}

/** 엔딩을 하나라도 본 적이 있는가 (환생해도 남는 기록) */
export function seenAnyEnding(): boolean {
  try {
    return ((JSON.parse(localStorage.getItem('cf_meta') ?? '{}').endings ?? []) as string[]).length > 0;
  } catch {
    return false;
  }
}

export const traceFound = (id: TraceId) => !!G?.flags[`trace_${id}`];
export const traceCount = () => (Object.keys(TRACES) as TraceId[]).filter(traceFound).length;
export const throneOpen = () => seenAnyEnding() && traceCount() === 3 && !!G.flags.elder_confess;

/** 보스를 쓰러뜨린 순간: 폰다운 방식이었으면 흔적, 아니면 (환생한 판에서만) 로그에 희미한 한 줄 */
export function bossFell(id: TraceId, pawnlike: boolean) {
  if (!G || !seenAnyEnding() || traceFound(id)) return;
  if (!pawnlike) {
    if (!G.flags[`traceHint_${id}`]) {
      G.flags[`traceHint_${id}`] = true;
      toast(TRACES[id].hint, 'info', 7000);
      log(TRACES[id].hint);
    }
    return;
  }
  G.flags[`trace_${id}`] = true;
  const n = traceCount();
  const next = n < 3 ? ' 다른 왕들도 처음엔 폰이었을까? 그들도 폰답게 끝내 주자.' : ' 셋 모두 폰이었다. 마을의 가장 늙은 말이라면 무언가 알고 있을지도.';
  toast(`♟ 폰의 흔적 (${n}/3) — ${TRACES[id].found}${next}`, 'rare', 7000);
  log(`♟ 폰의 흔적 (${n}/3)`);
  emit('trace', traceCount());
  save();
}

/** 촌장 킹의 고백 (흔적 셋을 모은 뒤 처음 말을 걸 때) */
export const elderConfessReady = () => seenAnyEnding() && traceCount() === 3 && !G.flags.elder_confess;
export const ELDER_CONFESSION: [string, string][] = [
  ['"…그 폰 머리, 그 받침, 그 자국. 다 보고 왔구먼."', '촌장님도 알고 계셨어요?'],
  ['"나는 이 마을의 첫 번째 폰이었네. 끝 줄까지 걸어가 킹이 됐지. 그다음엔 어디로도 갈 수 없었어. 킹은 판을 떠날 수 없으니까."', '밀짚왕도, 퀸도, 얼어붙은 킹도…'],
  ['"모두 자네처럼 기보 밖으로 나가려던 폰들이야. 끝까지 간 폰은 판에 묶여 다음 폰을 기다리는 왕이 되지. 자네가 몇 번이고 다시 태어나 걷는 그 길이, 그들이 걸었던 길일세."', '그럼 저도 언젠가는…'],
  ['"저자를 만나거든 물어보게. 끝을 적지 않고 옥좌로 돌아가는 수도 있느냐고. …나라면 권하지 않겠네. 하지만 누군가는 다음 폰을 기다려 줘야 하니까."', '(낡은 폰 머리를 쥔다)'],
];
