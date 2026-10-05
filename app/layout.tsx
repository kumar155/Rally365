import type { Metadata } from "next";
import "./globals.css";
import "./loading-splash.css";
import "./tournaments/manage/manage-fixes.css";
import "./tournaments/tournament-list.css";
import "./match-history-reference.css";
import "./match-history-final-fixes.css";
import TournamentNavBridge from "./tournament-nav-bridge";
import PlayerProfileNavigator from "./player-profile-navigator";
import MatchHistoryStatusBridge from "./match-history-status-bridge";
import SmartInsightsHome from "./smart-insights-home";

export const metadata: Metadata = {
  title: "Rally365",
  description: "Everyday badminton match tracker",
  applicationName: "Rally365",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Rally365" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <TournamentNavBridge />
        <PlayerProfileNavigator />
        <MatchHistoryStatusBridge />
        <SmartInsightsHome />
        <style>{`
          /* Temporarily hide Fines by player without removing its implementation. */
          .section-title:has(+ .stats-table .fine-player-header),
          .stats-table:has(.fine-player-header) {
            display: none !important;
          }

          /* Shared expense details are informational only. The split is the
             useful information for players, so keep edit/delete actions out
             of the expanded expense view. */
          .money-expense-actions {
            display: none !important;
          }

          /* A voided match remains in Match History, but its status must be
             unmistakable even when the legacy small status element is clipped
             by the compact match-history layout. */
          .home-match-history .home-history-score-card.voided .teams::after {
            content: "VOIDED";
            display: inline-flex;
            align-items: center;
            justify-content: center;
            align-self: flex-start;
            margin-top: 3px;
            padding: 3px 7px;
            border-radius: 6px;
            background: #fff0f0;
            border: 1px solid #efcaca;
            color: #b64242;
            font-size: 9px;
            line-height: 1;
            font-weight: 850;
            letter-spacing: .3px;
          }

          .home-match-history .home-history-score-card.voided .teams > small {
            display: none !important;
          }

          .home-match-history .home-history-score-card.voided .teams > div:has(.home-team-win)::after {
            content: none !important;
          }

          /* Match history: stable two-row layout for every entry. */
          .home-match-history .home-history-score-card {
            grid-template-columns: minmax(0, 1fr) 82px 36px !important;
            grid-template-rows: auto auto !important;
            column-gap: 14px !important;
            row-gap: 8px !important;
            align-items: center !important;
          }

          /* M7 + timestamp stay together at the top-left instead of being centered. */
          .home-match-history .home-history-score-card > .match-number {
            grid-column: 1 / -1 !important;
            grid-row: 1 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            text-align: left !important;
            gap: 10px !important;
          }

          .home-match-history .home-history-score-card > .match-number > b,
          .home-match-history .home-history-score-card > .match-number > .match-timestamp {
            margin: 0 !important;
            flex: 0 0 auto !important;
          }

          /* Teams, score and pencil occupy the same second row on every match. */
          .home-match-history .home-history-score-card > .teams {
            grid-column: 1 !important;
            grid-row: 2 !important;
            align-self: center !important;
            min-width: 0 !important;
          }

          .home-match-history .home-history-score-card > div:nth-child(3) {
            grid-column: 2 !important;
            grid-row: 2 !important;
            align-self: center !important;
          }

          .home-match-history .home-history-score-card > .edit-link {
            grid-column: 3 !important;
            grid-row: 2 !important;
            align-self: center !important;
          }

          /* Compact typography: reduce visual weight without changing hierarchy. */
          .home-match-history .home-history-score-card .home-team-win {
            font-weight: 600 !important;
          }
          .home-match-history .home-history-score-card .home-team-loss,
          .home-match-history .home-history-score-card > .teams > div > strong:not(.home-team-win):not(.home-team-loss) {
            font-weight: 450 !important;
          }
          .home-match-history .home-history-score-card > div:nth-child(3) > b {
            font-weight: 650 !important;
          }
          .home-match-history .home-history-score-card > div:nth-child(3) > span {
            font-weight: 450 !important;
          }

          .home-match-history .match-history-status-bridge-badge {
            display: inline-flex !important;
            align-items: center !important;
            width: fit-content !important;
            margin-top: 6px !important;
            padding: 3px 8px !important;
            border-radius: 999px !important;
            border: 1px solid #d7e8df !important;
            background: #eef8f3 !important;
            color: #16885d !important;
            font-size: 11px !important;
            font-weight: 800 !important;
            letter-spacing: .5px !important;
            line-height: 1.2 !important;
          }

          .home-match-history .home-history-score-card.voided .match-history-status-bridge-badge {
            border-color: #efcaca !important;
            background: #fff0f0 !important;
            color: #b64242 !important;
          }

          /* Only the dynamically mounted Smart Insights card is visible.
             The older inline card remains in page-legacy but is hidden so the
             Home page never shows two Smart Insights sections. */
          .smart-insights-card {
            display: none !important;
          }
          .smart-insights-home-mount .smart-insights-card {
            display: block !important;
          }

          /* Match the surviving Smart Insights header to the richer expandable
             treatment: larger intelligence icon, clear chevron and rotation
             when collapsed. */
          .smart-insights-home-mount .smart-insights-toggle {
            gap: 10px !important;
            min-width: 48px;
            justify-content: flex-end;
          }
          .smart-insights-home-mount .smart-insights-toggle span:first-child {
            font-size: 25px !important;
            line-height: 1 !important;
            font-weight: 700 !important;
          }
          .smart-insights-home-mount .smart-insights-toggle span:last-child {
            display: inline-block;
            font-size: 24px !important;
            line-height: 1 !important;
            font-weight: 700 !important;
            transition: transform .2s ease;
          }
          .smart-insights-home-mount .smart-insights-card.collapsed .smart-insights-toggle span:last-child {
            transform: rotate(-90deg);
          }

          @media (max-width: 420px) {
            .home-match-history .home-history-score-card {
              grid-template-columns: minmax(0, 1fr) 82px 36px !important;
              column-gap: 12px !important;
              row-gap: 7px !important;
            }

            .home-match-history .home-history-score-card > .match-number {
              gap: 8px !important;
            }
          }
        `}</style>
      </body>
    </html>
  );
}
