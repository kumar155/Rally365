"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, Share2 } from "lucide-react";
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
  const dashboardHref = tournamentId
    ? `/tournaments/manage?id=${encodeURIComponent(tournamentId)}`
    : "/tournaments/manage";

  if (pathname === "/tournaments" || pathname === "/") return null;

  const actionHref = isTournamentDashboard ? "/" : dashboardHref;
  const actionLabel = isTournamentDashboard ? "Back to Rally365 home" : "Back to tournament dashboard";

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
    <header
      className="rallyTournamentGlobalHeader"
      aria-label="Rally365 tournament navigation"
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 0,
        right: 0,
        height: 82,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "rgba(255,255,255,.97)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid #e2eae5",
        zIndex: 100,
      }}
    >
      <Link
        href="/"
        aria-label="Rally365 home"
        title="Rally365"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          minWidth: 0,
          textDecoration: "none",
          color: "#10231a",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-1.4px", whiteSpace: "nowrap" }}>
            Rally<span style={{ color: "#19a463" }}>365</span>
          </span>
          <span style={{ marginTop: 5, fontSize: 11, color: "#789085", whiteSpace: "nowrap" }}>
            Everyday badminton
          </span>
        </span>
        <img
          src="/rally365-circle-logo.png"
          alt=""
          style={{ width: 42, height: 42, objectFit: "contain", display: "block", flex: "0 0 auto" }}
        />
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
        <Link
          href={actionHref}
          aria-label={actionLabel}
          title={actionLabel}
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            background: "#fff",
            border: "1px solid #dfe8e3",
            color: "#17352a",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 4px 14px rgba(20,53,42,.07)",
            textDecoration: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <ArrowLeft size={17} strokeWidth={2.2} />
        </Link>

        {isTournamentDashboard ? (
          <button
            type="button"
            onClick={shareTournament}
            aria-label="Share tournament"
            title="Share tournament"
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              background: "#fff",
              border: "1px solid #dfe8e3",
              color: "#17352a",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 4px 14px rgba(20,53,42,.07)",
              WebkitTapHighlightColor: "transparent",
              cursor: "pointer",
            }}
          >
            <Share2 size={17} strokeWidth={2.1} />
          </button>
        ) : null}

        <div
          className="rallyTournamentVenuePill"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #dce7df",
            borderRadius: 999,
            padding: "9px 12px",
            fontSize: 11,
            color: "#476154",
            background: "#f7faf8",
            whiteSpace: "nowrap",
          }}
        >
          <MapPin size={15} color="#19a463" />
          <span>Vega Badminton</span>
        </div>
      </div>
    </header>
  );
}
