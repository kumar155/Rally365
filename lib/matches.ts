import type { Match, Team } from "./types";

export const isVoided = (match: Match) => match.status === "VOIDED";

export const teamOf = (match: Match, playerId: string): Team | undefined =>
  match.match_players.find(x => x.player_id === playerId)?.team;

export const scoresFor = (match: Match, team: Team) => ({
  own: team === "A" ? match.team_a_score : match.team_b_score,
  opponent: team === "A" ? match.team_b_score : match.team_a_score,
});

export const teamNames = (match: Match, team: Team, nameOf: (id: string) => string) =>
  match.match_players.filter(x => x.team === team).map(x => nameOf(x.player_id)).join(" & ");

export const winnerOf = (match: Match): Team => (match.team_a_score > match.team_b_score ? "A" : "B");

/**
 * The app records wins, not points: the score columns only hold 1/0 placeholders
 * so the existing schema and W/L comparisons keep working.
 */
export const winnerScores = (winner: Team) => ({
  team_a_score: winner === "A" ? 1 : 0,
  team_b_score: winner === "B" ? 1 : 0,
});

/** Human-facing match number: oldest match is M1. */
export const matchNumber = (matches: Match[], id: string) => matches.length - matches.findIndex(m => m.id === id);
