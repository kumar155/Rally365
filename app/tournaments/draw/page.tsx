"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { shuffle, knockoutSize, knockoutRoundName, knockoutRoundType } from "../../../lib/tournament";
import s from "../tournament.module.css";

type D = { id: string; name: string };
type T = { id: string; name: string; format: string; rounds: number | null; group_count: number | null; qualifiers_per_group: number | null };

export default function Draw() {
  const [id, setId] = useState("");
  const [t, setT] = useState<T | null>(null);
  const [duos, setDuos] = useState<D[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: tournament, error: te }, { data: teams, error: de }] = await Promise.all([
        supabase.from("tournaments").select("id,name,format,rounds,group_count,qualifiers_per_group").eq("id", id).single(),
        supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).eq("status", "ACTIVE").order("created_at"),
      ]);
      if (te || de) setError(te?.message || de?.message || "Could not load draw data.");
      setT(tournament as T);
      setDuos((teams as D[]) || []);
    })();
  }, [id]);

  async function reset() {
    const { error: me } = await supabase.from("tournament_matches").delete().eq("tournament_id", id);
    if (me) throw me;
    const { data: groups, error: ge } = await supabase.from("tournament_groups").select("id").eq("tournament_id", id);
    if (ge) throw ge;
    if (groups?.length) {
      const { error } = await supabase.from("tournament_group_duos").delete().in("group_id", groups.map((g) => g.id));
      if (error) throw error;
    }
    const { error: gde } = await supabase.from("tournament_groups").delete().eq("tournament_id", id);
    if (gde) throw gde;
    const { error: re } = await supabase.from("tournament_rounds").delete().eq("tournament_id", id);
    if (re) throw re;
  }

  async function addMatch(values: Record<string, unknown>) {
    const { error } = await supabase.from("tournament_matches").insert(values);
    if (error) throw error;
  }

  async function generate() {
    if (!t) return;
    if (duos.length < 2) return setError("Create at least two partner teams first.");
    setBusy(true); setError(""); setDone("");
    try {
      await reset();
      let matchNo = 1;

      if (t.format === "ROUND_ROBIN") {
        const { data: r, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: 1, name: "Round Robin", round_type: "GROUP" }).select("id").single();
        if (error) throw error;
        for (let i = 0; i < duos.length; i++) {
          for (let j = i + 1; j < duos.length; j++) {
            await addMatch({ tournament_id: id, round_id: r.id, match_number: matchNo++, team_a_duo_id: duos[i].id, team_b_duo_id: duos[j].id, best_of: 1, status: "SCHEDULED" });
          }
        }
      } else if (t.format === "KNOCKOUT") {
        const size = knockoutSize(duos.length);
        const roundCount = Math.log2(size);
        const roundIds: string[] = [];
        for (let r = 1; r <= roundCount; r++) {
          const roundSize = size / 2 ** (r - 1);
          const { data, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: r, name: knockoutRoundName(roundSize), round_type: knockoutRoundType(roundSize) }).select("id").single();
          if (error) throw error;
          roundIds.push(data.id);
        }
        const seeded = [...duos];
        while (seeded.length < size) seeded.push({ id: "", name: "BYE" });
        for (let i = 0; i < size; i += 2) {
          const a = seeded[i].id || null;
          const b = seeded[i + 1].id || null;
          await addMatch({
            tournament_id: id,
            round_id: roundIds[0],
            match_number: matchNo++,
            team_a_duo_id: a,
            team_b_duo_id: b,
            best_of: 3,
            status: a && b ? "SCHEDULED" : "COMPLETED",
            winner_duo_id: a && !b ? a : !a && b ? b : null,
          });
        }
        // Reserve the later bracket rounds. Winners are populated as earlier matches finish.
        for (let r = 1; r < roundCount; r++) {
          const matchCount = size / 2 ** (r + 1);
          for (let i = 0; i < matchCount; i++) {
            await addMatch({ tournament_id: id, round_id: roundIds[r], match_number: matchNo++, team_a_duo_id: null, team_b_duo_id: null, best_of: 3, status: "SCHEDULED" });
          }
        }
      } else if (t.format === "GROUPS_KNOCKOUT") {
        const groupCount = Math.max(1, t.group_count || 2);
        const { data: round, error: re } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: 1, name: "Group Stage", round_type: "GROUP" }).select("id").single();
        if (re) throw re;
        const groups: { id: string; group_number: number }[] = [];
        for (let i = 0; i < groupCount; i++) {
          const { data, error } = await supabase.from("tournament_groups").insert({ tournament_id: id, name: `Group ${String.fromCharCode(65 + i)}`, group_number: i + 1, qualifying_teams: t.qualifiers_per_group || 1 }).select("id,group_number").single();
          if (error) throw error;
          groups.push(data);
        }
        const shuffled = shuffle(duos);
        for (let i = 0; i < shuffled.length; i++) {
          await supabase.from("tournament_group_duos").insert({ group_id: groups[i % groups.length].id, duo_id: shuffled[i].id, seed: i + 1 });
        }
        for (const group of groups) {
          const members = shuffled.filter((_, i) => groups[i % groups.length].id === group.id);
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              await addMatch({ tournament_id: id, round_id: round.id, match_number: matchNo++, team_a_duo_id: members[i].id, team_b_duo_id: members[j].id, best_of: 1, status: "SCHEDULED" });
            }
          }
        }
      } else {
        const count = Math.max(1, t.rounds || 5);
        for (let roundNumber = 1; roundNumber <= count; roundNumber++) {
          const { data: round, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: roundNumber, name: `Random Round ${roundNumber}`, round_type: "RANDOM" }).select("id").single();
          if (error) throw error;
          const shuffled = shuffle(duos);
          for (let i = 0; i + 1 < shuffled.length; i += 2) {
            await addMatch({ tournament_id: id, round_id: round.id, match_number: matchNo++, team_a_duo_id: shuffled[i].id, team_b_duo_id: shuffled[i + 1].id, best_of: 1, status: "SCHEDULED" });
          }
        }
      }

      const { error: statusError } = await supabase.from("tournaments").update({ status: "READY" }).eq("id", id);
      if (statusError) throw statusError;
      setDone("Draw generated successfully. You can now schedule courts and run matches.");
    } catch (e: any) {
      setError(e?.message || "Could not generate draw.");
    } finally {
      setBusy(false);
    }
  }

  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;
  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;

  return <main className={s.page}><div className={s.shell}>
    <div className={s.brand}>DRAW & FORMAT</div>
    <h1 className={s.title}>{t?.name || "Tournament draw"}</h1>
    <p className={s.sub}>{t?.format?.replaceAll("_", " ") || ""} · {duos.length} teams</p>
    <div className={s.hero}><h2>Generate competition structure</h2><p className={s.muted}>Generate or regenerate the tournament-owned rounds, groups and matches.</p><button className={s.button} onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate draw"}</button></div>
    {error && <div className={s.error}>{error}</div>}{done && <div className={s.success}>{done}</div>}
    <div className={s.grid2}><div className={s.card}><h3>Teams</h3><div className={s.list}>{duos.map((d, i) => <div className={s.item} key={d.id}><span>{i + 1}. {d.name}</span></div>)}</div></div><div className={s.card}><h3>Next</h3><p className={s.muted}>Schedule courts and times, then record live match results and standings.</p></div></div>
    <div className={s.footerActions}><Link href={path("partners")} className={s.button + " " + s.secondary}>Back</Link><Link href={path("schedule")} className={s.button}>Continue to schedule →</Link></div>
  </div></main>;
}
