import type { Match, Team } from "./types";

export const SCORE_ERROR = "Enter two different final scores";

export const isVoided = (match: Match) => match.status === "VOIDED";

export const teamOf = (match: Match, playerId: string): Team | undefined =>
  match.match_players.find(x => x.player_id === playerId)?.team;

export const scoresFor = (match: Match, team: Team) => ({
  own: team === "A" ? match.team_a_score : match.team_b_score,
  opponent: team === "A" ? match.team_b_score : match.team_a_score,
});

export const teamNames = (match: Match, team: Team, nameOf: (id: string) => string) =>
  match.match_players.filter(x => x.team === team).map(x => nameOf(x.player_id)).join(" & ");

/** Human-facing match number: oldest match is M1. */
export const matchNumber = (matches: Match[], id: string) => matches.length - matches.findIndex(m => m.id === id);

/** Returns the parsed scores, or `null` when they are not a valid final result. */
export const parseScores = (scoreA: string, scoreB: string) => {
  const a = Number(scoreA);
  const b = Number(scoreB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) return null;
  return { a, b };
};
