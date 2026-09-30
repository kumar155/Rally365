"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Home, Plus, Trophy } from "lucide-react";
import { supabase } from "../../lib/supabase";
import s from "./tournament.module.css";

type Tournament = {
  id: string;
  name: string;
  start_date: string | null;
  venue: string | null;
  format: string;
  status: string;
};

type MatchStatus = { tournament_id: string; status: string };

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
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date TBD";

const stateLabel = (value: string) =>
  value === "COMPLETED" || value === "FINISHED"
    ? "COMPLETED"
    : value === "LIVE" || value === "IN_PROGRESS"
      ? "LIVE"
      : "UPCOMING";

const deriveState = (matches: MatchStatus[]) => {
  if (!matches.length) return "UPCOMING";
  if (
    matches.every((match) =>
      ["COMPLETED", "WALKOVER", "CANCELLED"].includes(match.status),
    )
  )
    return "COMPLETED";
  if (
    matches.some((match) =>
      ["LIVE", "IN_PROGRESS", "COMPLETED", "WALKOVER"].includes(
        match.status,
      ),
    )
  )
    return "LIVE";
  return "UPCOMING";
};

const statusStyle = (status: string) => {
  if (status === "LIVE") {
    return { background: "#e8f7f0", color: "#078b5c" };
  }
  if (status === "COMPLETED") {
    return { background: "#f0f4f2", color: "#65776f" };
  }
  return { background: "#eef5ff", color: "#3b6fa8" };
};

export default function TournamentsPage() {
  const [items, setItems] = useState<Tournament[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error: tournamentError } = await supabase
        .from("tournaments")
        .select("id,name,start_date,venue,format,status")
        .order("created_at", { ascending: false });

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
          .filter((tournament, index) =>
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
  }, []);

  const visible = items.filter(
    (tournament) =>
      filter === "ALL" || filter === stateLabel(tournament.status),
  );

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.mobileTournamentHeader}>
          <Link
            href="/"
            aria-label="Go to Rally365 home"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#09251c",
              textDecoration: "none",
            }}
          >
            <Home size={20} strokeWidth={1.8} />
          </Link>
          <strong>RALLY365</strong>
          <Link
            href="/tournaments/create"
            aria-label="Create tournament"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#078b5c",
            }}
          >
            <Plus size={21} strokeWidth={2} />
          </Link>
        </div>

        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            margin: "18px 0 16px",
          }}
        >
          <div>
            <div className={s.eyebrow}>COMPETITIONS</div>
            <h1 className={s.title}>Tournaments</h1>
            <p className={s.sub}>All Rally365 competitions in one place.</p>
          </div>
          <Link className={s.button} href="/tournaments/create">
            <Plus size={16} /> Create
          </Link>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
            background: "#eef3f1",
            padding: 4,
            borderRadius: 12,
            marginBottom: 14,
          }}
        >
          {[
            ["ALL", "All"],
            ["UPCOMING", "Upcoming"],
            ["LIVE", "Live"],
            ["COMPLETED", "Completed"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              style={{
                border: 0,
                borderRadius: 9,
                padding: "9px 5px",
                background: filter === value ? "#078b5c" : "transparent",
                color: filter === value ? "#fff" : "#65776f",
                fontSize: 10,
                fontWeight: 850,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className={s.error}>{error}</div>}

        {loading ? (
          <div className={s.card}>Loading tournaments…</div>
        ) : !visible.length ? (
          <section className={s.card} style={{ padding: 22, textAlign: "center" }}>
            <Trophy
              size={32}
              strokeWidth={1.7}
              style={{ color: "#078b5c", marginBottom: 8 }}
            />
            <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>
              No tournaments here yet
            </h2>
            <p style={{ color: "#71857d", fontSize: 12, margin: 0 }}>
              Create a tournament to start managing players, draws and matches.
            </p>
            <Link
              className={s.button}
              href="/tournaments/create"
              style={{ marginTop: 14 }}
            >
              Create tournament
            </Link>
          </section>
        ) : (
          <section
            style={{
              border: "1px solid #e1ebe7",
              borderRadius: 18,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "34px minmax(0, 1fr) 145px 118px 24px",
                gap: 8,
                alignItems: "center",
                padding: "10px 14px",
                background: "#f2f7f4",
                color: "#72867e",
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: ".12em",
                textTransform: "uppercase",
              }}
            >
              <span>#</span>
              <span>Tournament</span>
              <span>Date</span>
              <span>Status</span>
              <span />
            </div>

            {visible.map((tournament, index) => {
              const state = stateLabel(tournament.status);
              return (
                <Link
                  key={tournament.id}
                  href={`/tournaments/manage?id=${encodeURIComponent(tournament.id)}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "34px minmax(0, 1fr) 145px 118px 24px",
                    gap: 8,
                    alignItems: "center",
                    minHeight: 68,
                    padding: "10px 14px",
                    borderTop: "1px solid #e7efec",
                    background: index % 2 ? "#fbfcfc" : "#fff",
                    color: "#09251c",
                    textDecoration: "none",
                  }}
                >
                  <strong style={{ color: "#078b5c", fontSize: 13 }}>
                    {index + 1}
                  </strong>
                  <div style={{ minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {tournament.name}
                    </strong>
                    <span
                      style={{
                        display: "block",
                        marginTop: 3,
                        color: "#7a8b84",
                        fontSize: 9,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatLabel(tournament.format)}
                      {tournament.venue ? ` · ${tournament.venue}` : ""}
                    </span>
                  </div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      color: "#52675f",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    <CalendarDays size={14} strokeWidth={1.8} />
                    {dateLabel(tournament.start_date)}
                  </span>
                  <span
                    style={{
                      ...statusStyle(state),
                      justifySelf: "start",
                      borderRadius: 999,
                      padding: "6px 9px",
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: ".04em",
                    }}
                  >
                    {state}
                  </span>
                  <ChevronRight
                    size={17}
                    strokeWidth={2}
                    style={{ color: "#789087" }}
                  />
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
