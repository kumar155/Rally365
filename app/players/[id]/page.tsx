import PlayerProfileClient from "./player-profile-client";
import { supabase } from "../../../lib/supabase";

/**
 * The app is deployed with `output: "export"`, so every dynamic player URL
 * must be known at build time. The interactive profile itself stays in a
 * Client Component; this Server Component only supplies the static route list.
 */
export async function generateStaticParams() {
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("join_code", "RALLY365")
    .single();

  if (!group) return [];

  const { data: players } = await supabase
    .from("players")
    .select("id")
    .eq("group_id", group.id);

  return (players ?? []).map((player) => ({
    id: player.id,
  }));
}

export default function PlayerProfilePage() {
  return <PlayerProfileClient />;
}
