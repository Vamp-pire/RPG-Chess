// 메타 기록: 저장 슬롯과 별개로 남는 기록 (본 엔딩·최고 환생 횟수). 환생하거나 새 게임을 해도 지워지지 않는다.
const META = 'cf_meta';

export interface Meta { endings: string[]; rebirths: number }

export function meta(): Meta {
  try {
    return { endings: [], rebirths: 0, ...JSON.parse(localStorage.getItem(META) ?? '{}') };
  } catch {
    return { endings: [], rebirths: 0 };
  }
}

export function setMeta(m: Meta) {
  try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* */ }
}

/** 이 엔딩을 본 적이 있는가 (id 없으면: 하나라도 본 적이 있는가) */
export const seenEnding = (id?: string) => (id ? meta().endings.includes(id) : meta().endings.length > 0);
