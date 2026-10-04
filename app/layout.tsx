import type { Metadata } from "next";
import "./globals.css";
import "./loading-splash.css";
import "./tournaments/manage/manage-fixes.css";
import "./tournaments/tournament-list.css";
import "./match-history-reference.css";
import TournamentNavBridge from "./tournament-nav-bridge";
import PlayerProfileNavigator from "./player-profile-navigator";

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
        `}</style>
      </body>
    </html>
  );
}
