"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabase";

type MatchRow = {
  id: string;
  status: string;
  edit_count: number | null;
  last_edited_at: string | null;
  played_at: string;
};

const localDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function resolveSelectedDate(): string | null {
  const active = document.querySelector<HTMLElement>(".home-date-tile.active");
  const dayText = active?.querySelector("strong")?.textContent?.trim();
  const weekdayText = active?.querySelector("span")?.textContent?.trim();
  if (!dayText || !weekdayText) return null;

  const targetDay = Number(dayText);
  if (!Number.isInteger(targetDay)) return null;

  const today = new Date();
  for (let offset = -370; offset <= 370; offset++) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    if (
      candidate.getDate() === targetDay &&
      candidate.toLocaleDateString("en-IN", { weekday: "short" }) === weekdayText
    ) {
      return localDateKey(candidate);
    }
  }
  return null;
}

function stripVsPrefix() {
  document.querySelectorAll<HTMLElement>(
    ".home-match-history .home-history-score-card .teams > div > strong"
  ).forEach((element) => {
    const text = element.textContent?.trim() || "";
    if (/^vs\s+/i.test(text)) {
      element.textContent = text.replace(/^vs\s+/i, "").trim();
    }
  });
}

function applyMatchStatuses(matches: MatchRow[]) {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".home-match-history .home-history-score-card"
    )
  );
  if (!cards.length) return;

  const selectedDate = resolveSelectedDate();
  if (!selectedDate) return;

  const selectedMatches = matches
    .filter((match) => localDateKey(new Date(match.played_at)) === selectedDate)
    .sort(
      (a, b) =>
        new Date(b.played_at).getTime() - new Date(a.played_at).getTime()
    );

  cards.forEach((card, index) => {
    const matchNumberText = card.querySelector(".match-number b")?.textContent || "";
    const matchNumber = Number(matchNumberText.replace(/\D/g, ""));
    const row = Number.isInteger(matchNumber) && matchNumber > 0
      ? selectedMatches[selectedMatches.length - matchNumber]
      : selectedMatches[index];

    if (!row) return;

    const edited = Number(row.edit_count || 0) > 0 || Boolean(row.last_edited_at);
    const voided = row.status === "VOIDED" && !edited;
    const teams = card.querySelector<HTMLElement>(".teams");
    if (!teams) return;

    const oldBadge = teams.querySelector<HTMLElement>(".match-history-status-bridge-badge");
    oldBadge?.remove();

    card.classList.toggle("voided", voided);

    const legacyStatus = Array.from(teams.children).find(
      (child) => child.tagName.toLowerCase() === "small" &&
        !child.classList.contains("match-history-status-bridge-badge")
    ) as HTMLElement | undefined;

    if (legacyStatus) legacyStatus.style.display = "none";

    if (edited || voided) {
      const badge = document.createElement("small");
      badge.className = "match-history-status-bridge-badge";
      badge.textContent = edited ? "EDITED" : "VOIDED";
      teams.appendChild(badge);
    }
  });
}

export default function MatchHistoryStatusBridge() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      if (disposed) return;
      const history = document.querySelector(".home-match-history");
      if (!history) return;

      stripVsPrefix();

      const { data: group } = await supabase
        .from("groups")
        .select("id")
        .eq("join_code", "RALLY365")
        .single();
      if (!group || disposed) return;

      const { data: matches } = await supabase
        .from("matches")
        .select("id,status,edit_count,last_edited_at,played_at")
        .eq("group_id", group.id)
        .order("played_at", { ascending: false });

      if (disposed) return;
      applyMatchStatuses((matches || []) as MatchRow[]);
    };

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void refresh();
      }, 40);
    };

    scheduleRefresh();
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      observer?.disconnect();
    };
  }, []);

  return null;
}
