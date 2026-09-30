"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Plus, Trophy } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Tournament = {
  id: string;
  name: string;
  start_date: string | null;
  venue: string | null;
  format: string;
  status: string;
};

type MatchStatus = { tournament_id: string; status: string };
type Filter = "ALL" | "UPCOMING" | "LIVE" | "COMPLETED";

const formatLabel = (value: string) =>
  ({
    KNOCKOUT: "Doubles Knockout",
    ROUND_ROBIN: "Round Robin",
    GROUPS_KNOCKOUT: "Groups + Knockout",
    RANDOM_ROUNDS: "Random Rounds",
  } as Record<string, string>)[value] || value.replaceAll("_", " ");

const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Date TBD";

const stateLabel = (value: string): Exclude<Filter, "ALL"> => {
  if (value === "COMPLETED" || value === "FINISHED") return "COMPLETED";
  if (value === "LIVE" || value === "IN_PROGRESS") return "LIVE";
  return "UPCOMING";
};

const deriveState = (matches: MatchStatus[]): Exclude<Filter, "ALL"> => {
  if (!matches.length) return "UPCOMING";
  if (
    matches.every((match) =>
      ["COMPLETED", "WALKOVER", "CANCELLED"].includes(match.status),
    )
  ) {
    return "COMPLETED";
  }
  if (
    matches.some((match) =>
      ["LIVE", "IN_PROGRESS", "COMPLETED", "WALKOVER"].includes(match.status),
    )
  ) {
    return "LIVE";
  }
  return "UPCOMING";
};

export default function TournamentsPage() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError("");

      const { data, error: tournamentError } = await supabase
        .from("tournaments")
        .select("id,name,start_date,venue,format,status")
        .order("created_at", { ascending: false });

      if (!active) return;

      if (tournamentError) {
        setError(tournamentError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const rows = (data || []) as Tournament[];
      const ids = rows.map((tournament) => tournament.id);

      const { data: matchRows } = ids.length
        ? await supabase
            .from("tournament_matches")
            .select("tournament_id,status")
            .in("tournament_id", ids)
        : { data: [] as MatchStatus[] };

      if (!active) return;

      const grouped = new Map<string, MatchStatus[]>();
      ((matchRows || []) as MatchStatus[]).forEach((match) => {
        const list = grouped.get(match.tournament_id) || [];
        list.push(match);
        grouped.set(match.tournament_id, list);
      });

      const reconciled = rows.map((tournament) => ({
        ...tournament,
        status: deriveState(grouped.get(tournament.id) || []),
      }));

      setItems(reconciled);
      setLoading(false);

      await Promise.all(
        reconciled
          .filter(
            (tournament, index) =>
              tournament.status !== stateLabel(rows[index].status),
          )
          .map((tournament) =>
            supabase
              .from("tournaments")
              .update({ status: tournament.status })
              .eq("id", tournament.id),
          ),
      );
    })();

    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(
    () => ({
      all: items.length,
      upcoming: items.filter((item) => stateLabel(item.status) === "UPCOMING").length,
      live: items.filter((item) => stateLabel(item.status) === "LIVE").length,
      completed: items.filter((item) => stateLabel(item.status) === "COMPLETED").length,
    }),
    [items],
  );

  const visible = useMemo(
    () =>
      items.filter(
        (item) => filter === "ALL" || stateLabel(item.status) === filter,
      ),
    [filter, items],
  );

  return (
    <div className="app-shell">
      <main className="content">
        <div className="page-heading">
          <div className="eyebrow">COMPETITIONS</div>
          <h1>Tournaments</h1>
          <p>Manage Rally365 tournaments, draws, matches and standings.</p>
        </div>

        <div className="money-grid">
          <div>
            <b>{counts.all}</b>
            <small>Tournaments</small>
          </div>
          <div>
            <b>{counts.live}</b>
            <small>Live</small>
          </div>
          <div>
            <b>{counts.upcoming}</b>
            <small>Upcoming</small>
          </div>
        </div>

        <div className="section-title">
          <span>Tournament list</span>
          <Link
            href="/tournaments/create"
            className="secondary-button"
            style={{ gap: 6, textDecoration: "none" }}
          >
            <Plus size={14} /> Create
          </Link>
        </div>

        <div
          className="range-toggle"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
          role="tablist"
          aria-label="Tournament status"
        >
          {(
            [
              ["ALL", "All"],
              ["UPCOMING", "Upcoming"],
              ["LIVE", "Live"],
              ["COMPLETED", "Done"],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
              style={{ fontSize: 10, padding: "9px 3px" }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty-card">Loading tournaments…</div>
        ) : !visible.length ? (
          <div className="empty-card">
            <Trophy size={30} style={{ color: "#15985c", marginBottom: 8 }} />
            <div style={{ fontWeight: 800, color: "#10231a" }}>
              No tournaments here yet
            </div>
            <div style={{ marginTop: 5, fontSize: 12 }}>
              Create a tournament to start managing players, draws and matches.
            </div>
            <Link
              href="/tournaments/create"
              className="primary-button"
              style={{ width: "auto", display: "inline-flex", marginTop: 14 }}
            >
              Create tournament
            </Link>
          </div>
        ) : (
          <div className="stats-table">
            <div
              className="table-head"
              style={{ gridTemplateColumns: "28px minmax(0,1fr) 78px 72px 18px" }}
            >
              <span>#</span>
              <span>TOURNAMENT</span>
              <span>DATE</span>
              <span>STATUS</span>
              <span />
            </div>

            {visible.map((tournament, index) => {
              const state = stateLabel(tournament.status);
              const statusColor =
                state === "LIVE"
                  ? "#15985c"
                  : state === "COMPLETED"
                    ? "#718078"
                    : "#3b6fa8";

              return (
                <Link
                  key={tournament.id}
                  href={`/tournaments/manage?id=${encodeURIComponent(tournament.id)}`}
                  className="monthly-row"
                  style={{
                    gridTemplateColumns: "28px minmax(0,1fr) 78px 72px 18px",
                    textDecoration: "none",
                    color: "#10231a",
                  }}
                >
                  <span className="rank">{index + 1}</span>
                  <span className="player-name">
                    <strong
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tournament.name}
                    </strong>
                    <small>
                      {formatLabel(tournament.format)}
                      {tournament.venue ? ` · ${tournament.venue}` : ""}
                    </small>
                  </span>
                  <span style={{ fontSize: 10, color: "#52675f", fontWeight: 700 }}>
                    <CalendarDays size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />
                    {dateLabel(tournament.start_date)}
                  </span>
                  <span
                    style={{
                      color: statusColor,
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: ".04em",
                    }}
                  >
                    {state}
                  </span>
                  <ChevronRight size={16} style={{ color: "#94a29b" }} />
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
