"use client";

import { useEffect } from "react";

/**
 * Hardens the fixed bottom navigation for touch devices. React owns the tab
 * state; this component only recovers a navigation tap when another fixed
 * element has intercepted the pointer event before the nav button receives it.
 */
export default function BottomNavInteractionFix() {
  useEffect(() => {
    const getNav = () => document.querySelector<HTMLElement>(".bottom-nav");

    const onPointerUp = (event: PointerEvent) => {
      const nav = getNav();
      if (!nav) return;

      const target = event.target as Node | null;
      if (target && nav.contains(target)) return;

      const rect = nav.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;

      const links = Array.from(nav.querySelectorAll<HTMLElement>("button, a")).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      if (!links.length) return;

      const index = Math.min(
        links.length - 1,
        Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * links.length))
      );
      const item = links[index];
      if (!item) return;

      event.preventDefault();
      item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    };

    document.addEventListener("pointerup", onPointerUp, true);
    return () => document.removeEventListener("pointerup", onPointerUp, true);
  }, []);

  return null;
}
