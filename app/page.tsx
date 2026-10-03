"use client";

import { useEffect } from "react";
import Home from "./page-legacy";

function applyMoneyExpenseInfoView() {
  const cards = document.querySelectorAll<HTMLElement>(".money-expense-card");

  cards.forEach((card) => {
    const copy = card.querySelector<HTMLElement>(".money-expense-copy");
    if (copy) {
      const details = copy.querySelectorAll<HTMLElement>("small");

      // Keep the legacy expense card, but simplify the visible metadata:
      // amount on the first line, date + description on the second line.
      if (details[0]) {
        const amount = details[0].textContent?.split(" · ")[0]?.trim() || "";
        if (details[0].textContent !== amount) details[0].textContent = amount;
      }

      if (details[1]) {
        const parts = details[1].textContent?.split(" · ") || [];
        const date = parts[0]?.trim() || "";
        const description = parts.slice(1).join(" · ").trim();
        const value = description ? `${date} · ${description}` : date;
        if (details[1].textContent !== value) details[1].textContent = value;
      }
    }

    // Shared Expenses is an information view: keep the expandable split,
    // but do not expose payer/settlement actions from this view.
    card.querySelectorAll<HTMLElement>(".money-expense-actions").forEach((actions) => {
      actions.style.display = "none";
    });
  });
}

export default function HomeWithExpenseInfoView() {
  useEffect(() => {
    applyMoneyExpenseInfoView();
    const observer = new MutationObserver(() => applyMoneyExpenseInfoView());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Keep the legacy Money tab completely intact. The only enhancement is
  // the Shared Expenses information view above.
  return <Home />;
}
