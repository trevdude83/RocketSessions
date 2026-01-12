import { useEffect, useState } from "react";
import { applyTheme, getInitialTheme, toggleTheme, ThemeMode } from "../theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial, false);
  }, []);

  function handleToggle() {
    const next = toggleTheme(theme);
    setTheme(next);
    applyTheme(next, true);
  }

  return (
    <button
      className="ghost theme-toggle"
      type="button"
      aria-pressed={theme === "dark"}
      onClick={handleToggle}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
