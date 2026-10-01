"use client";

import Link from "next/link";
import { Home, Share2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function TournamentHomeButton() {
  const pathname = usePathname();
  const [tournamentId, setTournamentId] = useState("");

  useEffect(() => {
    setTournamentId(new URLSearchParams(window.location.search).get("id") || "");
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/tournaments/manage") return;

    const applyLockCard = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));
      const lockCard = sections.find((element) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
        return text.includes("Tournament is locked") && text.includes("Admin unlock");
      });
      const configurationCard = sections.find((element) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
        return text.includes("Tournament configuration") && text.includes("PARTNER MODE");
      });

      if (!lockCard || !configurationCard || lockCard.dataset.rallyLockStyled === "true") return;

      const overviewContainer = configurationCard.parentElement;
      if (overviewContainer) overviewContainer.appendChild(lockCard);

      lockCard.dataset.rallyLockStyled = "true";
      lockCard.style.marginTop = "0";
      lockCard.style.padding = "18px 16px";
      lockCard.style.background = "#fff8f8";
      lockCard.style.border = "1px solid #ead3d3";
      lockCard.style.borderRadius = "24px";
      lockCard.style.boxShadow = "none";

      const content = lockCard.firstElementChild as HTMLElement | null;
      if (content) {
        content.style.display = "grid";
        content.style.gridTemplateColumns = "1fr auto";
        content.style.alignItems = "center";
        content.style.gap = "14px";
      }

      const icon = content?.firstElementChild as HTMLElement | null;
      if (icon) icon.style.display = "none";

      const textBlock = content?.children[1] as HTMLElement | null;
      if (textBlock) {
        textBlock.style.minWidth = "0";
        const title = textBlock.querySelector("strong") as HTMLElement | null;
        const description = textBlock.querySelector("span") as HTMLElement | null;
        if (title) {
          title.textContent = "Tournament is locked";
          title.style.display = "block";
          title.style.fontSize = "18px";
          title.style.lineHeight = "1.2";
          title.style.fontWeight = "850";
          title.style.color = "#a03f3f";
        }
        if (description) {
          description.textContent = "No one can change tournament configuration, players, draw or scores while the tournament is locked.";
          description.style.display = "block";
          description.style.marginTop = "6px";
          description.style.fontSize = "12px";
          description.style.lineHeight = "1.45";
          description.style.color = "#7f8581";
        }
      }

      const button = content?.querySelector("button") as HTMLButtonElement | null;
      if (button) {
        button.style.minHeight = "48px";
        button.style.padding = "0 15px";
        button.style.borderRadius = "15px";
        button.style.background = "#fff";
        button.style.border = "1px solid #e5cccc";
        button.style.color = "#a03f3f";
        button.style.fontSize = "12px";
        button.style.fontWeight = "850";
        button.style.boxShadow = "0 1px 2px rgba(80,30,30,.04)";
        button.style.whiteSpace = "nowrap";
      }
    };

    applyLockCard();
    const observer = new MutationObserver(applyLockCard);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  const isTournamentDashboard = pathname === "/tournaments/manage";
  const href = isTournamentDashboard ? "/" : tournamentId ? `/tournaments/manage?id=${encodeURIComponent(tournamentId)}` : "/tournaments";

  if (pathname === "/tournaments" || pathname === "/") return null;

  if (isTournamentDashboard) {
    const shareTournament = async () => {
      const url = window.location.href;
      const title = document.title || "Rally365 Tournament";
      const text = "View this Rally365 tournament";

      try {
        if (navigator.share) {
          await navigator.share({ title, text, url });
          return;
        }
        await navigator.clipboard.writeText(url);
      } catch {
        // Share sheets can be dismissed; do not surface a false error.
      }
    };

    return (
      <button
        type="button"
        onClick={shareTournament}
        aria-label="Share tournament"
        title="Share tournament"
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          right: 60,
          width: 40,
          height: 40,
          borderRadius: 50,
          background: "rgba(255,255,255,.96)",
          border: "1px solid #dfe8e3",
          color: "#17352a",
          display: "grid",
          placeItems: "center",
          zIndex: 80,
          boxShadow: "0 4px 14px rgba(20,53,42,.08)",
          WebkitTapHighlightColor: "transparent",
          cursor: "pointer",
        }}
      >
        <Share2 size={18} strokeWidth={2.1} />
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-label="Tournament dashboard"
      title="Tournament dashboard"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: 12,
        width: 40,
        height: 40,
        borderRadius: 14,
        background: "rgba(255,255,255,.96)",
        border: "1px solid #dfe8e3",
        color: "#17352a",
        display: "grid",
        placeItems: "center",
        zIndex: 80,
        boxShadow: "0 4px 14px rgba(20,53,42,.08)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Home size={20} strokeWidth={2.2} />
    </Link>
  );
}
