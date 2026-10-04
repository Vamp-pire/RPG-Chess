import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 개발용: 트레일러 페이지가 렌더링한 영상을 프로젝트의 trailer-out/ 에 저장한다 */
function saveTrailer(): Plugin {
  return {
    name: 'save-trailer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save_trailer', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'trailer.mp4').replace(/[^\w.-]/g, '');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = resolve(__dirname, 'trailer-out');
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, name), Buffer.concat(chunks));
          res.end(`saved ${name} ${chunks.reduce((s, c) => s + c.length, 0)} bytes`);
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5188 },
  plugins: [saveTrailer()],
});
