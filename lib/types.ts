export type Player = { id: string; name: string };

export type MatchPlayer = { player_id: string; team: Team };

export type Match = {
  id: string;
  group_id: string;
  team_a_score: number;
  team_b_score: number;
  played_at: string;
  status: string;
  edit_count: number;
  last_edited_at: string | null;
  match_players: MatchPlayer[];
};

export type Expense = { id: string; expense_date: string; category: string; amount: number; description: string | null };

export type Attendance = { id: string; player_id: string; attendance_date: string; status: string; late_minutes: number; fine_amount: number };

export type ScheduledMatchStatus = "PLANNED" | "RECORDED";

export type ScheduledMatch = {
  id: string;
  matchNo: number;
  teamA: string[];
  teamB: string[];
  status: ScheduledMatchStatus;
  recordedMatchId: string | null;
};

export type ScheduledMatchRow = {
  id: string;
  match_no: number;
  team_a_player_1: string;
  team_a_player_2: string;
  team_b_player_1: string;
  team_b_player_2: string;
  status: ScheduledMatchStatus;
  recorded_match_id: string | null;
};

export type Team = "A" | "B";

export type StatsRange = "DAILY" | "WEEKLY" | "MONTHLY";
