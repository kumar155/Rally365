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
    card.querySelectorAll<HTMLElement>(".money-expense-actions").forEach((actions) => actions.remove());
  });
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
