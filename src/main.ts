import './style.css';
import { inject } from '@vercel/analytics';
import { applyTextScale } from './core/prefs';
import { App } from './game/app';
import { fx } from './render/fx';
import { loadPieceImages } from './render/sprites';
import { loadArt, loadArtHD } from './render/art';
import * as state from './core/state';
import * as areas from './data/areas';
import { backupState, checkSaveGen, markClosedTesters, restoreBackup, unseenNote } from './core/release';
import { askRestore, showResetNotice, showRestoredNotice, showWhatsNew } from './ui/release';
import { slotInfo, SLOTS_N } from './core/state';

applyTextScale();

// Vercel Web Analytics: 방문자·페이지뷰 집계 (Vercel에 배포된 주소에서만 동작, 개발 서버에서는 콘솔에만 찍힘)
inject();

// 베타 → 정식: 저장 세대가 바뀌었으면 (백업 후) 초기화. 앱이 저장을 읽기 전에 해야 한다
const wiped = checkSaveGen();
// 초기화됐다가 되돌려진 경우: 백업이 있는 사람만 되살린다 (지금 저장이 비었으면 바로, 아니면 제목 화면에서 묻는다)
const backup = wiped ? 'none' : backupState();
const restored = backup === 'empty' && restoreBackup();
markClosedTesters();

Promise.all([loadPieceImages(), loadArt()]).then(() => {
  const app = new App();
  app.title();
  // 시작 화면 걷어내기
  const boot = document.getElementById('boot');
  if (boot) { boot.style.opacity = '0'; setTimeout(() => boot.remove(), 320); }
  // 첫 화면이 뜬 뒤 고화질 몬스터 그림을 뒤에서 불러온다
  setTimeout(() => void loadArtHD(), 300);
  // 초기화 안내, 아니면 새 버전 패치 노트 (처음 온 사람에겐 안 띄움)
  if (wiped) showResetNotice();
  else if (restored) showRestoredNotice();
  else if (backup === 'conflict') askRestore();
  else {
    const isNew = !Array.from({ length: SLOTS_N }, (_, i) => slotInfo(i + 1)).some(Boolean);
    const n = unseenNote(isNew);
    if (n) showWhatsNew(n);
  }
  if (import.meta.env.DEV) {
    import('./dev/sim').then((sim) => Object.assign(window, { sim }));
    import('./core/balance').then((b) => Object.assign(window, { BAL: b.BAL }));
    import('./dev/play').then((m) => Object.assign(window, { P: m.makePlayer(app) }));
    // 개발 전용 비밀키 (admingoooo → 모두 해금). 배포판에는 들어가지 않는다
    import('./dev/cheat').then((m) => m.installCheat(app));
    import('./dev/experiments').then((m) => Object.assign(window, { exp: m }));
    // 개발용: 화면이 숨겨져 rAF가 멈춘 환경에서도 애니메이션을 진행시킨다
    Object.assign(window, {
      app,
      fx,
      state,
      areas,
      async pump(ms = 2000) {
        for (let t = 0; t < ms; t += 16) {
          fx.update(16);
          for (let i = 0; i < 8; i++) await Promise.resolve();
        }
        const s = app.scene;
        if (s) app.renderer.draw(s);
      },
    });
  }
});
