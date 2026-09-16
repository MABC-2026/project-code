const KEYS = {
  company: "ws_company",
  candidates: "ws_candidates",
  candidatePick: "ws_candidate_pick",
  compareList: "ws_compareList",
  result: "ws_result",
  resultMeta: "ws_resultMeta",
  report: "ws_report",
} as const;

export const storage = {
  company: {
    save: (name: string) => sessionStorage.setItem(KEYS.company, name),
    get: () => sessionStorage.getItem(KEYS.company) ?? null,
    clear: () => sessionStorage.removeItem(KEYS.company),
  },
  candidates: {
    save: (data: unknown[]) =>
      sessionStorage.setItem(KEYS.candidates, JSON.stringify(data)),
    get: () => {
      const raw = sessionStorage.getItem(KEYS.candidates);
      return raw ? (JSON.parse(raw) as unknown[]) : [];
    },
    clear: () => sessionStorage.removeItem(KEYS.candidates),
  },
  candidatePick: {
    save: (c: unknown) =>
      sessionStorage.setItem(KEYS.candidatePick, JSON.stringify(c)),
    get: () => {
      const raw = sessionStorage.getItem(KEYS.candidatePick);
      return raw ? (JSON.parse(raw) as unknown) : null;
    },
    clear: () => sessionStorage.removeItem(KEYS.candidatePick),
  },
  compareList: {
    save: (list: unknown[]) =>
      sessionStorage.setItem(KEYS.compareList, JSON.stringify(list)),
    get: () => {
      const raw = sessionStorage.getItem(KEYS.compareList);
      return raw ? (JSON.parse(raw) as unknown[]) : [];
    },
    clear: () => sessionStorage.removeItem(KEYS.compareList),
  },
};
