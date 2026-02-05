/**
 * Vitest globalSetup that verifies the Convex backend is running before tests start.
 *
 * This prevents long timeout waits when Docker isn't running:
 * - Without this: Each test waits 60s for WebSocket connection → 30+ minute runs
 * - With this: Fails fast (< 10s) with actionable error message
 *
 * @see TESTING.md for Docker environment setup
 */
export async function setup(): Promise<void> {
  const backendUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
  const maxRetries = 5;
  const retryDelayMs = 1000;

  console.log(`\nChecking backend health at ${backendUrl}...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(backendUrl, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        console.log(`✓ Backend is healthy at ${backendUrl}\n`);
        return;
      }
    } catch {
      if (attempt === maxRetries) {
        const port = new URL(backendUrl).port;
        const isInfraPort = port === "3215";
        const startCommand = isInfraPort ? "just start-infra" : "just start";

        throw new Error(
          `\n\n` +
            `═══════════════════════════════════════════════════════════════════\n` +
            `  BACKEND NOT RUNNING\n` +
            `═══════════════════════════════════════════════════════════════════\n` +
            `  Tests require a Convex backend at: ${backendUrl}\n` +
            `\n` +
            `  To fix, run one of these commands:\n` +
            `\n` +
            `    ${startCommand}                        # Start Docker backend only\n` +
            `    just test-all-parallel              # Full test cycle (recommended)\n` +
            `\n` +
            `  Port reference:\n` +
            `    3210 = App integration tests (order-management)\n` +
            `    3215 = Infrastructure tests (platform-*)\n` +
            `═══════════════════════════════════════════════════════════════════\n`
        );
      }

      console.log(
        `  Attempt ${attempt}/${maxRetries}: Backend not ready, retrying in ${retryDelayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
