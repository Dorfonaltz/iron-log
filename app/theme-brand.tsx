"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "reptriq-theme";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export default function ThemeBrand() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [topbar, setTopbar] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const savedTheme = readTheme();
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;

    const brandName = document.querySelector<HTMLElement>(".brand-copy > span");
    const brandTagline = document.querySelector<HTMLElement>(".brand-copy > small");
    if (brandName) brandName.textContent = "REPTRIQ";
    if (brandTagline) brandTagline.textContent = "TRAIN. TRACK. EVOLVE.";

    setTopbar(document.querySelector<HTMLElement>(".topbar"));
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  if (!topbar) return null;

  return createPortal(
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Mudar para tema ${theme === "dark" ? "claro" : "escuro"}`}
      title={theme === "dark" ? "Usar tema Light" : "Usar tema Dark"}
    >
      <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
      <small>{theme === "dark" ? "DARK" : "LIGHT"}</small>
    </button>,
    topbar,
  );
}
