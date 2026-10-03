"use client";

import { useEffect } from "react";
import Home from "./page-legacy";

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
    card.querySelectorAll<HTMLElement>(".money-expense-actions").forEach((actions) => {
      actions.style.display = "none";
    });
  });

  // Keep the existing Money functionality and React tree intact. Only hide
  // the extra expense-settlement summary UI; fine reports remain available.
  const moneyHeading = Array.from(document.querySelectorAll<HTMLElement>("h1")).find(
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

  // Keep Monthly Fine Report, its summary metrics, month selector,
  // and Fines by Player visible.
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
