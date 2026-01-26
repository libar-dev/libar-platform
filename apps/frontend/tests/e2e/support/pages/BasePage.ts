import { Page, Locator } from "@playwright/test";

/**
 * Base Page Object Model providing common functionality for all page objects.
 * All page objects should extend this class.
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a path relative to the base URL
   */
  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  /**
   * Get an element by its data-testid attribute
   */
  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /**
   * Wait for the page DOM to be ready.
   * Note: Avoid networkidle with Convex - WebSocket connections never become idle.
   */
  async waitForLoadingToComplete(): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Click a navigation link by its nav name
   * Uses the main-nav data-testid structure from AppLayout
   */
  async clickNavLink(name: "dashboard" | "products" | "orders" | "admin"): Promise<void> {
    await this.getByTestId(`nav-${name}`).click();
  }

  /**
   * Get the main navigation element
   */
  getMainNav(): Locator {
    return this.getByTestId("main-nav");
  }

  /**
   * Get the main content area
   */
  getMainContent(): Locator {
    return this.getByTestId("main-content");
  }

  /**
   * Check if a navigation item is currently active
   */
  async isNavActive(name: "dashboard" | "products" | "orders" | "admin"): Promise<boolean> {
    const navLink = this.getByTestId(`nav-${name}`);
    const isActive = await navLink.getAttribute("data-active");
    return isActive === "true";
  }
}
