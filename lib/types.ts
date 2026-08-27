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

export type Team = "A" | "B";

export type StatsRange = "DAILY" | "WEEKLY" | "MONTHLY";
