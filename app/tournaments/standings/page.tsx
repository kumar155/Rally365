"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Duo = { id: string; name: string };
type Match = {
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
  group_id?: string | null;
};
type Group = { id: string; name: string; group_number: number; qualifying_teams: number };
type GroupDuo = { group_id: string; duo_id: string };
type Row = Duo & {
  played: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
};

function initials(name: string) {
  return name
    .split("+")
    .map((part) => part.trim()[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function calculateRows(duos: Duo[], matches: Match[], allowedIds?: Set<string>) {
  const map = new Map<string, Row>();
  for (const duo of duos) {
    if (!allowedIds || allowedIds.has(duo.id)) {
      map.set(duo.id, { ...duo, played: 0, wins: 0, losses: 0, gf: 0, ga: 0, points: 0 });
    }
  }

  for (const x of matches) {
    if (x.status !== "COMPLETED" && x.status !== "WALKOVER") continue;
    const a = x.team_a_duo_id ? map.get(x.team_a_duo_id) : null;
    const b = x.team_b_duo_id ? map.get(x.team_b_duo_id) : null;
    if (!a || !b) continue;
    const sa = Number(x.team_a_score ?? 0);
    const sb = Number(x.team_b_score ?? 0);
    a.played++;
    b.played++;
    a.gf += sa;
    a.ga += sb;
    b.gf += sb;
    b.ga += sa;
    if (sa > sb) {
      a.wins++;
      a.points += 1;
      b.losses++;
    } else if (sb > sa) {
      b.wins++;
      b.points += 1;
      a.losses++;
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      (b.gf - b.ga) - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name)
  );
}

function StandingsTable({ rows }: { rows: Row[] }) {
  return (
    <div className={s.standingTable}>
      <div className={s.standingHead}>
        <span>#</span>
        <span>Team</span>
        <span>P</span>
        <span>W</span>
        <span>L</span>
        <span>Pts</span>
      </div>
      {rows.map((r, i) => (
        <div className={`${s.standingRow} ${i === 0 ? s.standingLeader : ""}`} key={r.id}>
          <span className={s.rank}>{i + 1}</span>
          <div className={s.standingTeam}>
            <div className={s.duoAvatar} aria-hidden="true">{initials(r.name)}</div>
            <div>
              <span className={s.teamName}>{r.name}</span>
              <small>{r.played} played · {r.wins} won · {r.losses} lost</small>
            </div>
          </div>
          <span>{r.played}</span>
          <span>{r.wins}</span>
          <span>{r.losses}</span>
          <span className={s.points}>{r.points}</span>
        </div>
      ))}
      {!rows.length && <p className={s.sub}>No completed matches yet.</p>}
    </div>
  );
}

export default function Standings() {
  const [id, setId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupRows, setGroupRows] = useState<Record<string, Row[]>>({});
  const [view, setView] = useState<"overall" | "groups">("overall");
  const [error, setError] = useState("");

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [duoResult, matchResult, groupResult] = await Promise.all([
        supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).order("created_at"),
        supabase.from("tournament_matches").select("team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status,group_id").eq("tournament_id", id),
        supabase.from("tournament_groups").select("id,name,group_number,qualifying_teams").eq("tournament_id", id).order("group_number"),
      ]);

      if (duoResult.error || matchResult.error || groupResult.error) {
        setError(duoResult.error?.message || matchResult.error?.message || groupResult.error?.message || "Could not load standings");
        return;
      }

      const duos = (duoResult.data || []) as Duo[];
      const matches = (matchResult.data || []) as Match[];
      const loadedGroups = (groupResult.data || []) as Group[];
      setRows(calculateRows(duos, matches));
      setGroups(loadedGroups);

      if (loadedGroups.length) {
        const { data: memberships, error: membershipError } = await supabase
          .from("tournament_group_duos")
          .select("group_id,duo_id")
          .in("group_id", loadedGroups.map((g) => g.id));
        if (membershipError) {
          setError(membershipError.message);
          return;
        }

        const next: Record<string, Row[]> = {};
        for (const group of loadedGroups) {
          const ids = new Set(
            ((memberships || []) as GroupDuo[])
              .filter((x) => x.group_id === group.id)
              .map((x) => x.duo_id)
          );
          next[group.id] = calculateRows(
            duos,
            matches.filter((m) => m.group_id === group.id),
            ids
          );
        }
        setGroupRows(next);
      }
    })();
  }, [id]);

  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;
  const hasGroups = groups.length > 0;

  if (!id) {
    return (
      <main className={s.page}>
        <div className={s.shell}>
          <div className={s.card}>Tournament ID is missing.</div>
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.mobileTournamentHeader}>
          <Link href={path("manage")} className={s.iconBack} aria-label="Back">‹</Link>
          <span>Rally365 Open</span>
          <span className={s.menuDots}>⋮</span>
        </div>

        <div className={s.top}>
          <div>
            <div className={s.brand}>RALLY365 OPEN</div>
            <h1 className={s.title}>Standings</h1>
            <p className={s.sub}>Live ranking from completed tournament matches.</p>
          </div>
          <Link href={path("manage")} className={s.secondaryButton}>← Overview</Link>
        </div>

        <nav className={s.tabs}>
          <Link className={s.tab} href={path("manage")}>Overview</Link>
          <Link className={s.tab} href={path("draw")}>Draw</Link>
          <Link className={s.tab} href={path("matches")}>Matches</Link>
          <Link className={`${s.tab} ${s.tabActive}`} href={path("standings")}>Standings</Link>
          <Link className={s.tab} href={path("players")}>Players</Link>
        </nav>

        {error && <div className={s.error}>{error}</div>}

        <section className={s.leaderboardCard}>
          <div className={s.leaderboardHeader}>
            <div>
              <div className={s.eyebrow}>STANDINGS</div>
              <h2>Tournament table</h2>
              <p>{view === "groups" ? "Group-by-group points and results" : "Live ranking from completed tournament matches"}</p>
            </div>
            <span className={s.teamCount}>{rows.length} teams</span>
          </div>

          <div className={s.standingSwitch}>
            <button
              type="button"
              onClick={() => setView("overall")}
              className={`${s.switchButton} ${view === "overall" ? s.switchActive : ""}`}
            >
              Group / Knockout
            </button>
            <button
              type="button"
              onClick={() => setView("groups")}
              className={`${s.switchButton} ${view === "groups" ? s.switchActive : ""}`}
              disabled={!hasGroups}
              title={!hasGroups ? "This tournament has no groups" : "View group points"}
            >
              Points (if group)
            </button>
          </div>

          {view === "overall" ? (
            <StandingsTable rows={rows} />
          ) : hasGroups ? (
            <div>
              {groups.map((group) => (
                <section className={s.groupStandingCard} key={group.id}>
                  <div className={s.sectionHeader}>
                    <div>
                      <div className={s.eyebrow}>GROUP {String.fromCharCode(64 + group.group_number)}</div>
                      <h3>{group.name}</h3>
                    </div>
                    <span>{group.qualifying_teams} qualifier{group.qualifying_teams === 1 ? "" : "s"}</span>
                  </div>
                  <StandingsTable rows={groupRows[group.id] || []} />
                </section>
              ))}
            </div>
          ) : (
            <p className={s.sub}>This tournament has no groups.</p>
          )}
        </section>
      </div>
    </main>
  );
}
