"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import Home from "./page-legacy";

type MoneySummary = { fines: number; expenses: number };
type ExpenseSplitSummary = { name: string; amount: number; entries: number };

const parseAmount = (value: string) => {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMoneyPage() {
  const moneyHeading = Array.from(document.querySelectorAll<HTMLElement>(".page-heading h1, h1")).find(
    (heading) => heading.textContent?.trim() === "Money"
  );
  return moneyHeading?.closest<HTMLElement>(".content") ?? null;
}

function readMoneySummary(): MoneySummary {
  const page = getMoneyPage();
  if (!page) return { fines: 0, expenses: 0 };

  const fines = Array.from(page.querySelectorAll<HTMLElement>(".fine-player-row strong"))
    .reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);
  const expenses = Array.from(page.querySelectorAll<HTMLElement>(".money-expense-card .money-expense-copy small:first-of-type"))
    .reduce((sum, element) => sum + parseAmount(element.textContent || ""), 0);

  return { fines, expenses };
}

function readSelectedReportMonth() {
  const page = getMoneyPage();
  const label = page?.querySelector<HTMLElement>(".month-picker b")?.textContent?.trim() || "";
  const match = label.match(/^([A-Za-z]+)\s+(\d{4})$/);
  const monthIndex = match ? monthNames.indexOf(match[1]) : -1;
  if (monthIndex >= 0 && match) return `${match[2]}-${String(monthIndex + 1).padStart(2, "0")}`;
  return new Date().toISOString().slice(0, 7);
}

function formatReportMonth(reportMonth: string) {
  const [year, month] = reportMonth.split("-").map(Number);
  if (!year || !month) return reportMonth;
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function getNextMonthStart(reportMonth: string) {
  const [year, month] = reportMonth.split("-").map(Number);
  const next = new Date(year, month, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

function MoneySummaryCards({
  summary,
  onExpensesClick,
}: {
  summary: MoneySummary;
  onExpensesClick: () => void;
}) {
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
    height: 78,
    minHeight: 78,
    boxSizing: "border-box",
  };

  return (
    <div
      aria-label="Money summary"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 9,
        width: "100%",
        margin: "24px 0 18px",
        boxSizing: "border-box",
      }}
    >
      <div className="money-summary-card" style={cardStyle}>
        <strong style={{ fontSize: 25, lineHeight: 1.1, color: "#33254f", fontWeight: 600 }}>
          ₹{Math.round(summary.fines).toLocaleString("en-IN")}
        </strong>
        <small style={{ fontSize: 12, color: "#82938b" }}>Fines</small>
      </div>
      <button
        type="button"
        className="money-summary-card"
        aria-label="View selected month expense split summary"
        onClick={onExpensesClick}
        style={{
          ...cardStyle,
          textAlign: "left",
          cursor: "pointer",
          border: "1px solid #ddd3f4",
        }}
      >
        <strong style={{ fontSize: 25, lineHeight: 1.1, color: "#33254f", fontWeight: 600 }}>
          ₹{Math.round(summary.expenses).toLocaleString("en-IN")}
        </strong>
        <small style={{ fontSize: 12, color: "#82938b" }}>Expenses</small>
      </button>
    </div>
  );
}

function ExpenseSplitModal({
  rows,
  total,
  reportMonth,
  loading,
  error,
  onClose,
}: {
  rows: ExpenseSplitSummary[];
  total: number;
  reportMonth: string;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  const monthLabel = formatReportMonth(reportMonth);

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(13, 31, 24, 0.34)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-split-summary-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(100%, 520px)",
          maxHeight: "78vh",
          overflow: "auto",
          background: "#ffffff",
          borderRadius: "24px 24px 18px 18px",
          boxShadow: "0 18px 50px rgba(0,0,0,.18)",
          padding: "22px 20px 18px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: "#16885d", textTransform: "uppercase" }}>
              Expense split summary
            </div>
            <h2 id="expense-split-summary-title" style={{ margin: "5px 0 3px", fontSize: 26, lineHeight: 1.15, color: "#102a21" }}>
              {monthLabel}
            </h2>
            <p style={{ margin: 0, color: "#7b8e86", fontSize: 14 }}>
              Each player’s share across all expenses in this month.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close expense split summary"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              border: "1px solid #dfe9e4",
              background: "#f5f8f6",
              color: "#60756c",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 18, border: "1px solid #e1ebe6", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", background: "#f5f8f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#71857d", fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase" }}>Player</span>
            <span style={{ color: "#71857d", fontSize: 12, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase" }}>Split</span>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7b8e86" }}>Loading expense splits…</div>
          ) : error ? (
            <div style={{ padding: 20, color: "#b64242", fontSize: 14 }}>{error}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#7b8e86" }}>
              No expense splits recorded for {monthLabel}.
            </div>
          ) : (
            rows.map((row, index) => (
              <div
                key={row.name}
                style={{
                  padding: "14px 15px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  borderTop: index === 0 ? "none" : "1px solid #e5ece8",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#132c23", fontSize: 16, fontWeight: 700 }}>{row.name}</div>
                  <div style={{ color: "#8a9b94", fontSize: 12, marginTop: 3 }}>
                    {row.entries} {row.entries === 1 ? "expense split" : "expense splits"}
                  </div>
                </div>
                <strong style={{ color: "#14845a", fontSize: 18, whiteSpace: "nowrap" }}>
                  ₹{Math.round(row.amount).toLocaleString("en-IN")}
                </strong>
              </div>
            ))
          )}

          {!loading && !error && rows.length > 0 && (
            <div style={{ padding: "14px 15px", borderTop: "1px solid #dfe9e4", background: "#f8fbf9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: "#526960", fontSize: 14 }}>Total split</strong>
              <strong style={{ color: "#102a21", fontSize: 18 }}>₹{Math.round(total).toLocaleString("en-IN")}</strong>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function applyMoneyVisibility() {
  const page = getMoneyPage();
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
  const [expenseSummaryOpen, setExpenseSummaryOpen] = useState(false);
  const [expenseSplitSummary, setExpenseSplitSummary] = useState<ExpenseSplitSummary[]>([]);
  const [expenseSplitSummaryLoading, setExpenseSplitSummaryLoading] = useState(false);
  const [expenseSplitSummaryError, setExpenseSplitSummaryError] = useState("");
  const [expenseSummaryMonth, setExpenseSummaryMonth] = useState("");

  const openExpenseSummary = async () => {
    const reportMonth = readSelectedReportMonth();
    setExpenseSummaryMonth(reportMonth);
    setExpenseSummaryOpen(true);
    setExpenseSplitSummaryLoading(true);
    setExpenseSplitSummaryError("");

    try {
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("id")
        .eq("join_code", "RALLY365")
        .single();

      if (groupError || !group) throw new Error(groupError?.message || "Group not found");

      const nextMonthStart = getNextMonthStart(reportMonth);
      const monthStart = `${reportMonth}-01`;
      const { data: expenseRows, error: expenseError } = await supabase
        .from("expenses")
        .select("id,expense_date")
        .eq("group_id", group.id)
        .gte("expense_date", monthStart)
        .lt("expense_date", nextMonthStart);

      if (expenseError) throw new Error(expenseError.message);

      const expenseIds = (expenseRows || []).map((expense) => expense.id);
      if (expenseIds.length === 0) {
        setExpenseSplitSummary([]);
        return;
      }

      const { data: splitRows, error: splitError } = await supabase
        .from("expense_splits")
        .select("expense_id,player_id,share_amount")
        .in("expense_id", expenseIds);

      if (splitError) throw new Error(splitError.message);

      const playerIds = Array.from(new Set((splitRows || []).map((split) => split.player_id)));
      if (playerIds.length === 0) {
        setExpenseSplitSummary([]);
        return;
      }

      const { data: playerRows, error: playerError } = await supabase
        .from("players")
        .select("id,name")
        .in("id", playerIds);

      if (playerError) throw new Error(playerError.message);

      const names = new Map((playerRows || []).map((player) => [player.id, player.name]));
      const totals = new Map<string, { name: string; amount: number; entries: number }>();

      (splitRows || []).forEach((split) => {
        const playerName = names.get(split.player_id);
        if (!playerName) return;

        const current = totals.get(split.player_id) || { name: playerName, amount: 0, entries: 0 };
        current.amount += Number(split.share_amount || 0);
        current.entries += 1;
        totals.set(split.player_id, current);
      });

      setExpenseSplitSummary(
        Array.from(totals.values()).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
      );
    } catch (error) {
      setExpenseSplitSummary([]);
      setExpenseSplitSummaryError(error instanceof Error ? error.message : "Could not load expense split summary");
    } finally {
      setExpenseSplitSummaryLoading(false);
    }
  };

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
      {moneyTarget && (
        <>
          {createPortal(
            <MoneySummaryCards summary={summary} onExpensesClick={openExpenseSummary} />,
            moneyTarget
          )}
          {expenseSummaryOpen && (
            <ExpenseSplitModal
              rows={expenseSplitSummary}
              total={expenseSplitSummary.reduce((sum, row) => sum + row.amount, 0)}
              reportMonth={expenseSummaryMonth || readSelectedReportMonth()}
              loading={expenseSplitSummaryLoading}
              error={expenseSplitSummaryError}
              onClose={() => setExpenseSummaryOpen(false)}
            />
          )}
        </>
      )}
    </>
  );
}
