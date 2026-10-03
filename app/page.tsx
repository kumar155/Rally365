"use client";

import { useEffect } from "react";
import Home from "./page-legacy";

function removeMoneyExtras() {
  const moneyHeading = Array.from(document.querySelectorAll<HTMLElement>("h1")).find(
    (heading) => heading.textContent?.trim() === "Money"
  );
  if (!moneyHeading) return;

  const page = moneyHeading.closest<HTMLElement>(".content");
  if (!page) return;

  // Money is intentionally focused on shared-expense information.
  // Keep the shared-expense list/detail and admin actions, but remove
  // settlement/balance summaries and the unrelated fine-report views.
  page.querySelector(".money-balance-grid")?.remove();
  page.querySelector(".money-ledger-warning")?.remove();
  page.querySelector(".money-settlement-panel")?.remove();
  page.querySelector(".money-balance-list")?.remove();
  page.querySelector(".month-picker")?.remove();
  page.querySelector(".stats-table.monthly-fines")?.remove();
  page.querySelector(".fine-player-row")?.closest<HTMLElement>(".stats-table")?.remove();

  Array.from(page.querySelectorAll<HTMLElement>(".section-title")).forEach((section) => {
    const label = section.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
    if (label.startsWith("monthly fine report") || label.startsWith("fines by player") || label.startsWith("settlements") || label.startsWith("player balances")) {
      section.remove();
    }
  });

  // The fine-report summary grid is directly associated with the removed
  // monthly report and should not remain as an orphaned block.
  page.querySelectorAll<HTMLElement>(".money-grid.four").forEach((grid) => grid.remove());
}

function applyMoneyExpenseInfoView() {
  const cards = document.querySelectorAll<HTMLElement>(".money-expense-card");
  cards.forEach((card) => {
    const copy = card.querySelector<HTMLElement>(".money-expense-copy");
    if (copy) {
      const details = copy.querySelectorAll<HTMLElement>("small");
      if (details[0]) {
        const amount = details[0].textContent?.split(" · ")[0]?.trim() || "";
        if (details[0].textContent !== amount) details[0].textContent = amount;
      }
      if (details[1]) {
        const date = details[1].textContent?.split(" · ")[0]?.trim() || "";
        if (details[1].textContent !== date) details[1].textContent = date;
      }
    }
    card.querySelectorAll<HTMLElement>(".money-expense-actions").forEach((actions) => actions.remove());
  });

  removeMoneyExtras();
}

export default function HomeWithExpenseInfoView() {
  useEffect(() => {
    applyMoneyExpenseInfoView();
    const observer = new MutationObserver(() => applyMoneyExpenseInfoView());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <Home />;
}
