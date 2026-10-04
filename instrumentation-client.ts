"use client";

const REFRESH_BUTTON_ID = "rally365-match-refresh";

function addMatchRefreshButton() {
  const matchList = document.querySelector<HTMLElement>(".home-match-history");
  if (!matchList) return;

  const sectionTitle = matchList.previousElementSibling;
  if (!(sectionTitle instanceof HTMLElement) || !sectionTitle.classList.contains("section-title")) return;
  if (sectionTitle.querySelector(`#${REFRESH_BUTTON_ID}`)) return;

  const button = document.createElement("button");
  button.id = REFRESH_BUTTON_ID;
  button.type = "button";
  button.setAttribute("aria-label", "Refresh matches");
  button.setAttribute("title", "Refresh matches");
  button.innerHTML = "<span aria-hidden=\"true\">↻</span><span>Refresh</span>";
  button.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "gap:6px",
    "margin-left:10px",
    "padding:6px 10px",
    "border:1px solid #d8e5df",
    "border-radius:10px",
    "background:#ffffff",
    "color:#177e52",
    "font:600 12px/1 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
    "cursor:pointer",
    "vertical-align:middle",
  ].join(";");

  button.addEventListener("click", () => {
    if (button.dataset.refreshing === "true") return;
    button.dataset.refreshing = "true";
    button.disabled = true;
    button.style.opacity = "0.6";
    button.style.cursor = "wait";
    button.innerHTML = "<span aria-hidden=\"true\">↻</span><span>Refreshing…</span>";
    window.location.reload();
  });

  sectionTitle.appendChild(button);
}

function watchForMatchList() {
  addMatchRefreshButton();

  const observer = new MutationObserver(() => addMatchRefreshButton());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", watchForMatchList, { once: true });
} else {
  watchForMatchList();
}
