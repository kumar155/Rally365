"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Plus, Radio, Trophy } from "lucide-react";
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
    <div className="app-shell tournament-list-page">
      <main className="content">
        <section className="tournament-list-hero" aria-label="Tournament overview">
          <div className="hero-copy">
            <div className="eyebrow">COMPETITIONS</div>
            <h1>Tournaments</h1>
            <p>Manage Rally365 tournaments, draws, matches and standings.</p>
            <div className="hero-stats">
              <span className="hero-pill">{counts.all} tournaments</span>
              <span className="hero-pill live">● {counts.live} live</span>
              <span className="hero-pill upcoming">{counts.upcoming} upcoming</span>
            </div>
          </div>
        </section>

        <section className="tournament-summary" aria-label="Tournament counts">
          <div className="tournament-summary-card">
            <div className="summary-icon"><Trophy size={17} /></div>
            <b>{counts.all}</b>
            <small>Tournaments</small>
          </div>
          <div className="tournament-summary-card">
            <div className="summary-icon"><Radio size={17} /></div>
            <b>{counts.live}</b>
            <small>Live</small>
          </div>
          <div className="tournament-summary-card">
            <div className="summary-icon"><CalendarDays size={17} /></div>
            <b>{counts.upcoming}</b>
            <small>Upcoming</small>
          </div>
        </section>

        <div className="tournament-list-heading">
          <h2>Tournament List</h2>
          <Link href="/tournaments/create" className="tournament-list-create">
            <Plus size={18} /> Create
          </Link>
        </div>

        <div className="tournament-status-toggle" role="tablist" aria-label="Tournament status">
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
              role="tab"
              aria-selected={filter === value}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty-card tournament-list-empty">Loading tournaments…</div>
        ) : !visible.length ? (
          <div className="empty-card tournament-list-empty">
            <Trophy size={30} style={{ color: "#15985c", marginBottom: 8 }} />
            <div style={{ fontWeight: 800, color: "#10231a" }}>No tournaments here yet</div>
            <div style={{ marginTop: 5, fontSize: 12 }}>
              Create a tournament to start managing players, draws and matches.
            </div>
            <Link href="/tournaments/create" className="primary-button" style={{ width: "auto", display: "inline-flex", marginTop: 14 }}>
              Create tournament
            </Link>
          </div>
        ) : (
          <div className="tournament-list-table">
            <div className="tournament-list-table-head">
              <span>#</span>
              <span>TOURNAMENT</span>
              <span>DATE</span>
              <span>STATUS</span>
              <span />
            </div>

            {visible.map((tournament, index) => {
              const state = stateLabel(tournament.status);
              const stateClass = state.toLowerCase();

              return (
                <Link
                  key={tournament.id}
                  href={`/tournaments/manage?id=${encodeURIComponent(tournament.id)}`}
                  className="tournament-list-row"
                >
                  <span className="tournament-list-rank">{index + 1}</span>
                  <span className="tournament-list-name">
                    <strong>{tournament.name}</strong>
                    <small>
                      {formatLabel(tournament.format)}
                      {tournament.venue ? ` · ${tournament.venue}` : ""}
                    </small>
                  </span>
                  <span className="tournament-list-date">
                    <CalendarDays size={12} />
                    {dateLabel(tournament.start_date)}
                  </span>
                  <span className={`tournament-list-status ${stateClass}`}>
                    {state === "COMPLETED" ? "COMPLETED" : state}
                  </span>
                  <ChevronRight className="tournament-list-chevron" size={17} />
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
