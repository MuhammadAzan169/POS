import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/** Kept in sync with the inline theme script in __root.tsx. */
const THEME_KEY = "apos.theme";

/**
 * The stylesheet ships a full `.dark` palette but nothing ever put the class on
 * <html>, so dark mode was unreachable. This toggle owns that class.
 *
 * Reading localStorage happens in an effect, never during render, so the server
 * and the first client render agree. `__aposTheme` (inlined in the root shell)
 * has already applied the class by then, which is what prevents a light flash.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial = false;
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      initial = saved
        ? saved === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      initial = false;
    }
    setDark(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    try {
      window.localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* private mode — the class is still applied for this session */
    }
  }, [dark, ready]);

  return (
    <button
      type="button"
      onClick={() => setDark((v) => !v)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light mode" : "Dark mode"}
      className={cn(
        "h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-muted-foreground",
        "hover:bg-muted hover:text-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
