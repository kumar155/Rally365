"use client";

/**
 * Match History status is rendered directly by page-legacy.tsx from the
 * Supabase `matches` row. This component intentionally does not mutate the
 * rendered cards anymore.
 *
 * The previous DOM bridge queried the database independently and tried to
 * associate cards with matches using the displayed M-number. That association
 * was fragile after refresh/date changes and could incorrectly add the
 * VOIDED class to a valid edited match. The page already has the correct
 * conditional:
 *   edited => EDITED
 *   genuinely voided => VOIDED
 *   otherwise => no status tag
 *
 * Keeping this component as a no-op preserves the existing layout mount while
 * making the React/Supabase match state the single source of truth.
 */
export default function MatchHistoryStatusBridge() {
  return null;
}
