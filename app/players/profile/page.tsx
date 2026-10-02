import { Suspense } from "react";
import PlayerProfileClient from "./player-profile-client";

export default function PlayerProfilePage() {
  return (
    <Suspense fallback={<main className="r365-profile-page"><div className="r365-profile-loading r365-loading">Loading player profile…</div></main>}>
      <PlayerProfileClient />
    </Suspense>
  );
}
