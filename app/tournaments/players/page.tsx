"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Player = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  seed: number | null;
  status: string;
};

export default function Players() {
  const [id, setId] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  async function load() {
    if (!id) return;
    const { data, error } = await supabase
      .from("tournament_players")
      .select("id,display_name,avatar_url,seed,status")
      .eq("tournament_id", id)
      .order("created_at");

    if (error) setError(error.message);
    setPlayers((data as Player[]) || []);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !name.trim()) return;

    setBusy(true);
    setError("");

    const { error } = await supabase.from("tournament_players").insert({
      tournament_id: id,
      display_name: name.trim(),
    });

    if (error) {
      setError(error.message);
    } else {
      setName("");
      await load();
    }

    setBusy(false);
  }

  async function remove(playerId: string) {
    const { error } = await supabase
      .from("tournament_players")
      .delete()
      .eq("id", playerId)
      .eq("tournament_id", id);

    if (error) setError(error.message);
    else await load();
  }

  const path = (page: string) =>
    `/tournaments/${page}?id=${encodeURIComponent(id)}`;

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
        <div className={s.brand}>TOURNAMENT SETUP</div>
        <h1 className={s.title}>Add individual players</h1>
        <p className={s.sub}>
          Players are tournament-specific. Existing Rally365 player records are
          not required.
        </p>

        <div className={s.grid2}>
          <form className={s.card} onSubmit={add}>
            <h2>Add player</h2>
            <div className={s.field}>
              <label>Name</label>
              <input
                className={s.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Player name"
                autoComplete="off"
              />
            </div>
            <button className={s.button} disabled={busy || !name.trim()}>
              {busy ? "Adding…" : "Add player"}
            </button>
            {error && <p className={s.error}>{error}</p>}
          </form>

          <div className={s.card}>
            <div className={s.row}>
              <h2>Players</h2>
              <span className={s.pill}>{players.length}</span>
            </div>

            <div className={s.list}>
              {players.map((player, index) => (
                <div className={s.item} key={player.id}>
                  <span>
                    <strong>
                      {index + 1}. {player.display_name}
                    </strong>
                  </span>
                  <button
                    type="button"
                    className={`${s.button} ${s.danger}`}
                    onClick={() => remove(player.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}

              {players.length === 0 && (
                <p className={s.muted}>Add the individual participants first.</p>
              )}
            </div>
          </div>
        </div>

        <div className={s.footerActions}>
          <Link href={path("manage")} className={`${s.button} ${s.secondary}`}>
            Back
          </Link>
          <Link href={path("partners")} className={s.button}>
            Continue to partners →
          </Link>
        </div>
      </div>
    </main>
  );
}
