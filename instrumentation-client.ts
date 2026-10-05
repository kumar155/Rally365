"use client";

import { supabase } from "./lib/supabase";

const REFRESH_BUTTON_ID = "rally365-match-refresh";
const REFRESHING_TEXT = "Refreshing…";

const localDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatTime = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};

const matchDayLabel = (value: string) => `Today, ${formatTime(value)}`;

const playerTeamLabel = (
  match: { match_players: { player_id: string; team: "A" | "B" }[] },
  team: "A" | "B",
  players: Map<string, string>
) => {
  const names = match.match_players
    .filter(row => row.team === team)
    .map(row => players.get(row.player_id) || "?")
    .join(" & ");

  return names
    .replace(/^(?:vs\s+)+/i, "")
    .trim()
    .replace(/\s*(?:\/|&)\s*/g, " - ");
};

function getSelectedDate() {
  const dateInput = document.querySelector<HTMLInputElement>(
    ".home-date-calendar input[type=\"date\"]"
  );
  if (dateInput?.value) return dateInput.value;

  const activeTile = document.querySelector<HTMLElement>(".home-date-tile.active");
  const dayText = activeTile?.querySelector("strong")?.textContent?.trim();
  const weekdayText = activeTile?.querySelector("span")?.textContent?.trim();
  const day = Number(dayText);

  if (Number.isInteger(day) && weekdayText) {
    const today = new Date();
    for (let offset = -370; offset <= 370; offset += 1) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + offset);
      if (
        candidate.getDate() === day &&
        candidate.toLocaleDateString("en-IN", { weekday: "short" }) === weekdayText
      ) {
        return localDateKey(candidate);
      }
    }
  }

  return localDateKey(new Date());
}

async function refreshMatchRows() {
  const matchList = document.querySelector<HTMLElement>(".home-match-history");
  if (!matchList) return;

  const selectedDate = getSelectedDate();

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id")
    .eq("join_code", "RALLY365")
    .single();

  if (groupError || !group) throw new Error(groupError?.message || "Group not found");

  const [{ data: matchRows, error: matchError }, { data: playerRows, error: playerError }] =
    await Promise.all([
      supabase
        .from("matches")
        .select(
          "id,group_id,team_a_score,team_b_score,played_at,status,edit_count,last_edited_at,match_players(player_id,team)"
        )
        .eq("group_id", group.id)
        .order("played_at", { ascending: false }),
      supabase.from("players").select("id,name").eq("group_id", group.id),
    ]);

  if (matchError) throw new Error(matchError.message);
  if (playerError) throw new Error(playerError.message);

  const players = new Map((playerRows || []).map(player => [player.id, player.name]));
  const matches = (matchRows || []).filter(
    match => localDateKey(new Date(match.played_at)) === selectedDate
  );

  const sectionTitle = matchList.previousElementSibling;
  if (sectionTitle instanceof HTMLElement) {
    const count = sectionTitle.querySelector<HTMLElement>(":scope > span:last-child");
    if (count) count.textContent = `(${matches.length})`;
  }

  const rows = Array.from(
    matchList.querySelectorAll<HTMLElement>(".home-history-score-card")
  );

  rows.forEach((row, index) => {
    const match = matches[index];
    if (!match) {
      row.style.display = "none";
      return;
    }

    row.style.display = "grid";

    const edited = Number(match.edit_count || 0) > 0 || Boolean(match.last_edited_at);
    const status = String(match.status || "").toUpperCase();
    const voided = status === "VOIDED" && !edited;

    // Never let the manual refresh create a false voided state for an edited match.
    row.classList.toggle("voided", voided);

    const number = row.querySelector<HTMLElement>(".match-number b");
    if (number) number.textContent = `M${matches.length - index}`;

    const timestamp = row.querySelector<HTMLElement>(".match-timestamp");
    if (timestamp) timestamp.textContent = matchDayLabel(match.played_at);

    const teamElements = row.querySelectorAll<HTMLElement>(".teams > div > strong");
    if (teamElements[0]) {
      teamElements[0].textContent = playerTeamLabel(match, "A", players);
      teamElements[0].className =
        match.team_a_score > match.team_b_score ? "home-team-win" : "home-team-loss";
    }
    if (teamElements[1]) {
      // Deliberately no "vs" prefix. The match card already represents both teams.
      teamElements[1].textContent = playerTeamLabel(match, "B", players);
      teamElements[1].className =
        match.team_b_score > match.team_a_score ? "home-team-win" : "home-team-loss";
    }

    const scoreBox = row.children[2] as HTMLElement | undefined;
    const scoreValues = scoreBox?.querySelectorAll<HTMLElement>("b, span");
    if (scoreValues?.[0]) scoreValues[0].textContent = String(match.team_a_score);
    if (scoreValues?.[1]) scoreValues[1].textContent = String(match.team_b_score);

    const teams = row.querySelector<HTMLElement>(".teams");
    if (!teams) return;

    // Remove every status <small> produced by either React or an older refresh implementation.
    teams.querySelectorAll<HTMLElement>(":scope > small").forEach(element => element.remove());

    if (edited) {
      const badge = document.createElement("small");
      badge.className = "match-history-edit-meta";
      badge.textContent = "EDITED";
      teams.appendChild(badge);
    } else if (voided) {
      const badge = document.createElement("small");
      badge.className = "match-history-voided";
      badge.textContent = "VOIDED";
      teams.appendChild(badge);
    }
  });
}

function addMatchRefreshButton() {
  const matchList = document.querySelector<HTMLElement>(".home-match-history");
  if (!matchList) return;

  const sectionTitle = matchList.previousElementSibling;
  if (!(sectionTitle instanceof HTMLElement) || !sectionTitle.classList.contains("section-title")) return;
  if (sectionTitle.querySelector(`#${REFRESH_BUTTON_ID}`)) return;

  const button = document.createElement("button");
  button.id = REFRESH_BUTTON_ID;
  button.type = "button";
  button.setAttribute("aria-label", "Refresh matches");
  button.setAttribute("title", "Refresh matches");
  button.innerHTML = "<span aria-hidden=\"true\">↻</span><span>Refresh</span>";
  button.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "gap:6px",
    "margin-left:10px",
    "padding:6px 10px",
    "border:1px solid #d8e5df",
    "border-radius:10px",
    "background:#ffffff",
    "color:#177e52",
    "font:600 12px/1 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "cursor:pointer",
    "vertical-align:middle",
  ].join(";");

  button.addEventListener("click", async () => {
    if (button.dataset.refreshing === "true") return;
    button.dataset.refreshing = "true";
    button.disabled = true;
    button.style.opacity = "0.6";
    button.style.cursor = "wait";
    button.innerHTML = `<span aria-hidden=\"true\">↻</span><span>${REFRESHING_TEXT}</span>`;

    try {
      await refreshMatchRows();
    } catch (error) {
      console.error("Rally365 match refresh failed", error);
    } finally {
      button.dataset.refreshing = "false";
      button.disabled = false;
      button.style.opacity = "1";
      button.style.cursor = "pointer";
      button.innerHTML = "<span aria-hidden=\"true\">↻</span><span>Refresh</span>";
    }
  });

  sectionTitle.appendChild(button);
}

function watchForMatchList() {
  addMatchRefreshButton();
  const observer = new MutationObserver(() => addMatchRefreshButton());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", watchForMatchList, { once: true });
} else {
  watchForMatchList();
}
