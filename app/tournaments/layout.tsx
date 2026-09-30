import type { ReactNode } from "react";
import typography from "./tournamentTypography.module.css";
import TournamentHomeButton from "./tournament-home-button";

export default function TournamentLayout({ children }: { children: ReactNode }) {
  return (
    <div className={typography.typography}>
      <TournamentHomeButton />
      {children}
    </div>
  );
}
