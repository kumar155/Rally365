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

  // Restore the legacy Fines / Expenses summary cards above Admin Actions.
  // The underlying Money tab remains React-owned; these cards are only a
  // presentation layer so none of the existing money functionality changes.
  const moneyHeading = Array.from(document.querySelectorAll<HTMLElement>("h1")).find(
    (heading) => heading.textContent?.trim() === "Money"
  );
  const page = moneyHeading?.closest<HTMLElement>(".content");
  if (!page) return;

  const pageHeading = moneyHeading.closest<HTMLElement>(".page-heading");
  if (pageHeading) {
    let summary = page.querySelector<HTMLElement>("#money-legacy-summary-cards");
    if (!summary) {
      summary = document.createElement("div");
      summary.id = "money-legacy-summary-cards";
      summary.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 18px;";
      pageHeading.insertAdjacentElement("afterend", summary);

      const createCard = (label: string, id: string) => {
        const card = document.createElement("div");
        card.style.cssText = "border:1px solid #dfe8e2;border-radius:20px;padding:18px;background:#fff;display:flex;flex-direction:column;gap:5px;min-width:0;";
        const value = document.createElement("strong");
        value.id = id;
        value.style.cssText = "font-size:28px;line-height:1.1;color:#10251d;";
        const caption = document.createElement("small");
        caption.textContent = label;
        caption.style.cssText = "font-size:13px;color:#82938b;";
        card.append(value, caption);
        return card;
      };

      summary.append(
        createCard("Fines", "money-legacy-fines-total"),
        createCard("Expenses", "money-legacy-expenses-total")
      );
    }

    const parseAmount = (value: string) => {
      const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : 0;
    };

    const totalExpenses = Array.from(page.querySelectorAll<HTMLElement>(".money-expense-card .money-expense-copy small:first-of-type"))
      .reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);
    const totalFines = Array.from(page.querySelectorAll<HTMLElement>(".fine-player-row .fine-total"))
      .reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);

    const finesValue = summary.querySelector<HTMLElement>("#money-legacy-fines-total");
    const expensesValue = summary.querySelector<HTMLElement>("#money-legacy-expenses-total");
    if (finesValue) finesValue.textContent = `₹${Math.round(totalFines).toLocaleString("en-IN")}`;
    if (expensesValue) expensesValue.textContent = `₹${Math.round(totalExpenses).toLocaleString("en-IN")}`;
  }

  // Keep the existing Money functionality and React tree intact. Only hide
  // the extra expense-settlement summary UI; fine reports remain available.
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
