export type Vec = [number, number];

export const ORTH: Vec[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const DIAG: Vec[] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
export const KING: Vec[] = [...ORTH, ...DIAG];
export const KNIGHT: Vec[] = [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]];

export const JUMP2: Vec[] = [[0, -2], [2, 0], [0, 2], [-2, 0]];
/** 대각선 두 칸 뛰기 (까마귀) */
export const ALFIL: Vec[] = [[2, -2], [2, 2], [-2, 2], [-2, -2]];
const ring = (r: number): Vec[] => {
  const out: Vec[] = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.max(Math.abs(x), Math.abs(y)) === r) out.push([x, y]);
  return out;
};
export const RING2 = ring(2);
export const RING3 = ring(3);

export const key =(x: number, y: number) => `${x},${y}`;
export const eq = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1];
export const cheb = (a: Vec, b: Vec) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
export const manh = (a: Vec, b: Vec) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
export const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function sameSet(a: Vec[], b: Vec[]) {
  if (a.length !== b.length) return false;
  const s = new Set(a.map((v) => key(v[0], v[1])));
  return b.every((v) => s.has(key(v[0], v[1])));
}

export const rand = (n: number) => Math.floor(Math.random() * n);
export const pick = <T>(arr: T[]): T => arr[rand(arr.length)];
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
