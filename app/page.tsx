"use client";

import { useEffect } from "react";
import Home from "./page-legacy";

function applyMoneyExpenseInfoView() {
  const moneyHeading = Array.from(document.querySelectorAll<HTMLElement>(".page-heading h1, h1")).find(
    (heading) => heading.textContent?.trim() === "Money"
  );
  const pageHeading = moneyHeading?.closest<HTMLElement>(".page-heading");
  const page = pageHeading?.closest<HTMLElement>(".content");
  if (!pageHeading || !page) return;

  // Keep the legacy Money layout: Fines / Expenses summary cards,
  // Admin Actions, Monthly Fine Report, Shared Expenses and Fines by Player.
  // The extra settlement/balance dashboard is intentionally hidden.
  let summary = page.querySelector<HTMLElement>("#money-legacy-summary-cards");
  if (!summary) {
    summary = document.createElement("div");
    summary.id = "money-legacy-summary-cards";
    summary.setAttribute("aria-label", "Money summary");
    summary.style.cssText = [
      "display:grid",
      "grid-template-columns:repeat(2,minmax(0,1fr))",
      "gap:12px",
      "margin:0 0 18px",
      "width:100%",
      "box-sizing:border-box",
      "position:relative",
      "z-index:1",
    ].join(";");

    const createCard = (label: string, valueId: string) => {
      const card = document.createElement("div");
      card.style.cssText = [
        "border:1px solid #dfe8e2",
        "border-radius:20px",
        "padding:18px",
        "background:#fff",
        "display:flex",
        "flex-direction:column",
        "gap:5px",
        "min-width:0",
        "box-sizing:border-box",
      ].join(";");

      const value = document.createElement("strong");
      value.id = valueId;
      value.style.cssText = "font-size:28px;line-height:1.1;color:#10251d;font-weight:800;";

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

    pageHeading.insertAdjacentElement("afterend", summary);
  }

  const parseAmount = (value: string) => {
    const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  };

  // Fine totals are represented by the existing Fines by Player rows.
  const totalFines = Array.from(
    page.querySelectorAll<HTMLElement>(".fine-player-row strong")
  ).reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);

  // Expense totals are represented by the existing Shared Expenses cards.
  const totalExpenses = Array.from(
    page.querySelectorAll<HTMLElement>(".money-expense-card .money-expense-copy small:first-of-type")
  ).reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);

  const finesValue = summary.querySelector<HTMLElement>("#money-legacy-fines-total");
  const expensesValue = summary.querySelector<HTMLElement>("#money-legacy-expenses-total");
  if (finesValue) finesValue.textContent = `₹${Math.round(totalFines).toLocaleString("en-IN")}`;
  if (expensesValue) expensesValue.textContent = `₹${Math.round(totalExpenses).toLocaleString("en-IN")}`;

  const hide = (selector: string) => {
    page.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.style.display = "none";
    });
  };

  hide(".money-balance-grid");
  hide(".money-ledger-warning");
  hide(".money-settlement-panel");
  hide(".money-balance-list");

  // Keep Monthly Fine Report and Fines by Player visible.
}

export default function HomeWithExpenseInfoView() {
  useEffect(() => {
    const run = () => applyMoneyExpenseInfoView();

    // Home is React-rendered asynchronously, so run after the first paint too.
    const frame = requestAnimationFrame(run);
    const delayed = window.setTimeout(run, 150);

    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      observer.disconnect();
    };
  }, []);

  return <Home />;
}
