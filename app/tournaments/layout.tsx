import type { ReactNode } from "react";
import typography from "./tournamentTypography.module.css";
import "./manage/manage-fixes.css";
import "./manage/tournament-header-fix.css";
import "./tournament-nav-fix.css";
import "./overview-nav-fix.css";
import "./home-tabs-fix.css";
import TournamentHomeButton from "./tournament-home-button";
import TournamentTableRoute from "./tournament-table-route";

export default function TournamentLayout({ children }: { children: ReactNode }) {
  return (
    <div className={typography.typography}>
      <TournamentHomeButton />
      <TournamentTableRoute />
      {children}
    </div>
  );
}
