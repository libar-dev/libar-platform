import type { GlobalProvider } from "@ladle/react";
import { useLadleContext } from "@ladle/react";
import "./fonts.css"; // Load fonts for Ladle (before globals.css)
import "../app/globals.css";

/**
 * Global provider for all Ladle stories.
 *
 * Features:
 * - Loads Inter font via Google Fonts CDN (see fonts.css)
 * - Applies base styling (background, font, antialiasing)
 * - Supports dark mode toggle via Ladle's built-in theme controls
 */
export const Provider: GlobalProvider = ({ children }) => {
  const { globalState } = useLadleContext();
  const isDark = globalState.theme === "dark";

  return (
    <div
      className={`min-h-screen bg-background font-sans text-foreground antialiased ${isDark ? "dark" : ""}`}
    >
      {children}
    </div>
  );
};
