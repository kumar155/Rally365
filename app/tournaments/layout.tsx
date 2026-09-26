import type { ReactNode } from "react";
import typography from "./tournamentTypography.module.css";

export default function TournamentLayout({ children }: { children: ReactNode }) {
  return <div className={typography.typography}>{children}</div>;
}
