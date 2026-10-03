"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Home from "./page-legacy";

type MoneySummary = { fines: number; expenses: number };

const parseAmount = (value: string) => {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

function readMoneySummary(): MoneySummary {
  const moneyHeading = Array.from(document.querySelectorAll<HTMLElement>(".page-heading h1, h1")).find(
    (heading) => heading.textContent?.trim() === "Money"
  );
  const page = moneyHeading?.closest<HTMLElement>(".content");
  if (!page) return { fines: 0, expenses: 0 };

  const fines = Array.from(page.querySelectorAll<HTMLElement>(".fine-player-row strong"))
    .reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);
  const expenses = Array.from(page.querySelectorAll<HTMLElement>(".money-expense-card .money-expense-copy small:first-of-type"))
    .reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);

  return { fines, expenses };
}

function MoneySummaryCards({ summary }: { summary: MoneySummary }) {
  const cardStyle: React.CSSProperties = {
    border: "1px solid #ddd3f4",
    borderRadius: 16,
    padding: "13px 14px",
    background: "#f5f1fb",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 7,
    minWidth: 0,
    height: 160,
    minHeight: 160,
    boxSizing: "border-box",
  };

  return (
    <div
      aria-label="Money summary"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 9,
        width: "100%",
        margin: "24px 0 18px",
        boxSizing: "border-box",
      }}
    >
      <div className="money-summary-card" style={cardStyle}>
        <strong style={{ fontSize: 28, lineHeight: 1.1, color: "#33254f", fontWeight: 800 }}>
          ₹{Math.round(summary.fines).toLocaleString("en-IN")}
        </strong>
        <small style={{ fontSize: 16, color: "#82938b" }}>Fines</small>
      </div>
      <div className="money-summary-card" style={cardStyle}>
        <strong style={{ fontSize: 28, lineHeight: 1.1, color: "#33254f", fontWeight: 800 }}>
          ₹{Math.round(summary.expenses).toLocaleString("en-IN")}
        </strong>
        <small style={{ fontSize: 16, color: "#82938b" }}>Expenses</small>
      </div>
    </div>
  );
}

function applyMoneyVisibility() {
  const moneyHeading = Array.from(document.querySelectorAll<HTMLElement>(".page-heading h1, h1")).find(
    (heading) => heading.textContent?.trim() === "Money"
  );
  const page = moneyHeading?.closest<HTMLElement>(".content");
  if (!page) return;

  const hide = (selector: string) => {
    page.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.style.display = "none";
    });
  };

  hide(".money-balance-grid");
  hide(".money-ledger-warning");
  hide(".money-settlement-panel");
  hide(".money-balance-list");
}

export default function HomeWithExpenseInfoView() {
  const [moneyTarget, setMoneyTarget] = useState<HTMLElement | null>(null);
  const [summary, setSummary] = useState<MoneySummary>({ fines: 0, expenses: 0 });

  useEffect(() => {
    let frame = 0;

    const sync = () => {
      applyMoneyVisibility();
      const heading = Array.from(document.querySelectorAll<HTMLElement>(".page-heading h1, h1")).find(
        (element) => element.textContent?.trim() === "Money"
      );
      const target = heading?.closest<HTMLElement>(".page-heading") ?? null;
      setMoneyTarget((current) => (current === target ? current : target));
      if (target) {
        const next = readMoneySummary();
        setSummary((current) => current.fines === next.fines && current.expenses === next.expenses ? current : next);
      }
    };

    const run = () => {
      sync();
      frame = requestAnimationFrame(sync);
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <Home />
      {moneyTarget && createPortal(<MoneySummaryCards summary={summary} />, moneyTarget)}
    </>
  );
}
