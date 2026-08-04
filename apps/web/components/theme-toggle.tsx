"use client";

import { useEffect, useState } from "react";

import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";

/**
 * Switches between light and dark, and remembers the choice. Before hydration the inline
 * script in the layout has already applied any stored theme, so there is no flash; this
 * component only needs to reflect and update it.
 *
 * It writes `data-theme` on `<html>`, which globals.css declares *after* the
 * `prefers-color-scheme` block — so a stored choice wins over the operating system in both
 * directions, not just when it happens to agree with it.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem("pa-theme") as Theme | null) ?? null;
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(stored ?? system);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pa-theme", next);
    } catch {
      /* private mode — the toggle still works for the session */
    }
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      /* A switch, so its state is announced rather than only its next action. The label is
         static; `aria-pressed` carries the change. */
      aria-pressed={isDark}
      aria-label="Dark theme"
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
    >
      <span className={styles.track} data-dark={isDark || undefined}>
        <span className={styles.thumb}>
          <svg className={styles.icon} data-on={isDark || undefined} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <svg className={styles.icon} data-on={!isDark || undefined} viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </span>
      </span>
    </button>
  );
}
