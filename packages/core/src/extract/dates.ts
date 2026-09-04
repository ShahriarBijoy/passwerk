const MONTHS: Record<string, number> = {
  januar: 1,
  jan: 1,
  january: 1,
  februar: 2,
  feb: 2,
  february: 2,
  märz: 3,
  maerz: 3,
  mär: 3,
  mrz: 3,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mai: 5,
  may: 5,
  juni: 6,
  jun: 6,
  june: 6,
  juli: 7,
  jul: 7,
  july: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  dez: 12,
  december: 12,
  dec: 12,
};

function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return date.toISOString().slice(0, 10);
}

/** dd.mm.yyyy, yyyy-mm-dd(THH..), "1. März 2026", "3 March 2026", "March 3, 2026". Slash forms are ambiguous and rejected. */
export function parseDate(raw: string): string | undefined {
  const s = raw.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜ]+)\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[(m[2] as string).toLowerCase()];
    return month ? iso(Number(m[3]), month, Number(m[1])) : undefined;
  }
  m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[(m[1] as string).toLowerCase()];
    return month ? iso(Number(m[3]), month, Number(m[2])) : undefined;
  }
  return undefined;
}
