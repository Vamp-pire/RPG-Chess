// 패치 노트·크레딧·저장 초기화 안내 창
import { AUTHOR, CHANNEL, CREDITS, PATCH_NOTES, PatchNote, betaName, keepCurrentSave, restoreBackup, versionLabel } from '../core/release';
import { h, modal } from './dom';

const noteEl = (n: PatchNote) =>
  h('section', { class: 'patch' },
    h('h3', {}, `v${n.ver} — ${n.title}`, h('small', { class: 'muted' }, ` ${n.date}`)),
    h('ul', {}, ...n.items.map((t) => h('li', {}, t))));

/** 새 버전을 처음 켰을 때: 이번 버전 것만 */
export function showWhatsNew(n: PatchNote) {
  modal('새로워진 점', h('div', { class: 'patch-notes' }, noteEl(n), h('p', { class: 'hint' }, '지난 패치 노트는 설정 → 패치 노트에서 다시 볼 수 있어요.')), { wide: true });
}

export function openPatchNotes() {
  modal('패치 노트', h('div', { class: 'patch-notes' }, ...PATCH_NOTES.map(noteEl)), { wide: true });
}

export function openCredits() {
  const rows = CREDITS.map((c) => h('div', { class: 'credit-row' }, h('small', { class: 'muted' }, c.role), h('b', {}, c.name), c.note ? h('small', {}, c.note) : null));
  modal('크레딧', h('div', { class: 'credits' },
    h('h3', {}, '기보 밖의 한 수'),
    AUTHOR ? h('p', {}, `만든 사람 — ${AUTHOR}`) : null,
    ...rows,
    h('p', { class: 'hint' }, versionLabel())), {});
}

/** 베타가 끝나 저장이 초기화되었을 때 */
export function showResetNotice() {
  modal('정식 출시를 환영해요!', h('div', { class: 'patch-notes' },
    h('p', {}, '베타가 끝나고 정식 버전이 시작됐어요. 안내드린 대로 베타 기간의 저장과 엔딩 기록은 초기화됐어요.'),
    h('p', {}, '베타에 함께해 주셔서 고마워요. 새 게임을 시작하면 칭호 「첫 수를 둔 자」와 환생 선물(100G, 희귀 재료 2개)을 받아요.'),
    h('p', {}, '이제 처음부터, 더 단단해진 판 위에서 다시 시작해 보세요.')), { wide: true });
}

/** 예전 저장 백업을 바로 되살렸을 때 */
export function showRestoredNotice() {
  modal('예전 저장을 되찾았어요', h('div', { class: 'patch-notes' },
    h('p', {}, '한때 저장이 초기화되면서 이 브라우저에 백업해 두었던 진행을 되살렸어요.'),
    h('p', {}, '이어하기에서 예전 슬롯을 그대로 고를 수 있어요.')), { wide: true });
}

/** 백업과 지금 진행이 둘 다 있을 때: 어느 쪽을 쓸지 묻는다 */
export function askRestore() {
  const restore = h('button', { class: 'btn primary' }, '예전 저장으로 되돌리기');
  const keep = h('button', { class: 'btn' }, '지금 진행 유지');
  const m = modal('예전 저장이 남아 있어요', h('div', { class: 'patch-notes' },
    h('p', {}, '한때 저장이 초기화되면서 이 브라우저에 백업해 둔 예전 진행이 있어요.'),
    h('p', {}, '예전 저장으로 되돌리면 지금 진행은 사라져요. (만약을 위해 따로 보관은 해 둬요)'),
    h('div', { class: 'row' }, restore, keep)), { wide: true, closable: false });
  restore.addEventListener('click', () => { restoreBackup(); m.close(); location.reload(); });
  keep.addEventListener('click', () => { keepCurrentSave(); m.close(); });
}

/** 제목 화면 아래 줄: 버전 · 베타 안내 · 패치 노트 · 크레딧 */
export function titleFooter(): HTMLElement {
  const pn = h('button', { class: 'linkish' }, '패치 노트');
  pn.addEventListener('click', openPatchNotes);
  const cr = h('button', { class: 'linkish' }, '크레딧');
  cr.addEventListener('click', openCredits);
  return h('div', { class: 'title-foot' },
    CHANNEL === 'beta' ? h('p', { class: 'beta-note' }, `${betaName()} — 베타 기간의 저장은 정식 출시 때 초기화돼요.`) : null,
    h('p', { class: 'muted small' }, versionLabel(), ' · ', pn, ' · ', cr));
}
