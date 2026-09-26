export type TournamentFormat = "KNOCKOUT" | "ROUND_ROBIN" | "GROUPS_KNOCKOUT" | "RANDOM_ROUNDS";
export type PartnerMode = "RANDOM" | "FIXED";

export type Tournament = {
  id: string;
  name: string;
  venue: string | null;
  tournament_date: string | null;
  partner_mode: PartnerMode;
  format: TournamentFormat;
  rounds: number | null;
  group_count: number | null;
  qualifiers_per_group: number | null;
  games_per_match: number;
  points_win: number;
  points_draw: number;
  points_loss: number;
  status: string;
};

export type TournamentPlayer = { id: string; name: string; phone?: string | null; seed?: number | null };
export type TournamentDuo = { id: string; name: string; seed?: number | null; source: PartnerMode; locked: boolean };

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function randomPairs(players: TournamentPlayer[]) {
  const shuffled = shuffle(players);
  const pairs: TournamentPlayer[][] = [];
  for (let i = 0; i < shuffled.length; i += 2) pairs.push(shuffled.slice(i, i + 2));
  return pairs;
}

export function knockoutSize(count: number) {
  let size = 1;
  while (size < count) size *= 2;
  return size;
}

export function knockoutRoundName(size: number) {
  if (size <= 2) return "Final";
  if (size === 4) return "Semi Finals";
  if (size === 8) return "Quarter Finals";
  return `Round of ${size}`;
}
