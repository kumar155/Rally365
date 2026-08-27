export const money = (n: number) => `₹${Number(n || 0).toFixed(0)}`;

export const sumBy = <T,>(rows: T[], pick: (row: T) => number | string | null | undefined) =>
  rows.reduce((sum, row) => sum + Number(pick(row) || 0), 0);
