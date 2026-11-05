// Shape of Character.cyberpunk, the Cyberpunk 2020 sheet data.

export type CyberpunkSheet = {
  stats: {
    INT: number;
    REF: number;
    TECH: number;
    COOL: number;
    ATTR: number;
    LUCK: number;
    MA: number;
    BODY: number;
    EMP: number;
  };
  role: string;
  skills: { name: string; stat: string; value: number }[];
};

export function defaultCyberpunkSheet(): CyberpunkSheet {
  return {
    stats: { INT: 5, REF: 5, TECH: 5, COOL: 5, ATTR: 5, LUCK: 5, MA: 5, BODY: 5, EMP: 5 },
    role: '',
    skills: [],
  };
}
