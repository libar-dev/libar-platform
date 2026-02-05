import { Link, useLocation } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Navigation type for the app
 */
export type NavItem = "dashboard" | "products" | "orders" | "admin" | "agents";

/**
 * Props for the AppLayout component
 */
export interface AppLayoutProps {
  /** Page content */
  children: React.ReactNode;
  /** Currently active navigation item (auto-detected from pathname if not provided) */
  activeNav?: NavItem;
}

/**
 * Home icon for dashboard
 */
function HomeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/**
 * Package icon for products
 */
function PackageIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

/**
 * Shopping cart icon for orders
 */
function ShoppingCartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

/**
 * Settings icon for admin
 */
function SettingsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Bot icon for agents
 */
function BotIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

/**
 * Navigation items configuration
 */
const navItems = [
  { href: "/", label: "Dashboard", icon: HomeIcon, nav: "dashboard" as NavItem },
  { href: "/products", label: "Products", icon: PackageIcon, nav: "products" as NavItem },
  { href: "/orders", label: "Orders", icon: ShoppingCartIcon, nav: "orders" as NavItem },
  { href: "/admin/products", label: "Inventory", icon: SettingsIcon, nav: "admin" as NavItem },
  { href: "/admin/agents", label: "Agents", icon: BotIcon, nav: "agents" as NavItem },
];

/**
 * Detect active nav from pathname
 */
function getActiveNavFromPathname(pathname: string): NavItem {
  if (pathname.startsWith("/admin/agents")) return "agents";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/orders")) return "orders";
  if (pathname.startsWith("/products")) return "products";
  return "dashboard";
}

/**
 * AppLayout provides the main application shell with header navigation.
 * Used as the wrapper for all application pages.
 *
 * @example
 * ```tsx
 * // In a page component
 * export default function ProductsPage() {
 *   return (
 *     <AppLayout>
 *       <h1>Products</h1>
 *       <ProductList products={products} />
 *     </AppLayout>
 *   );
 * }
 * ```
 */
export function AppLayout({ children, activeNav }: AppLayoutProps) {
  const location = useLocation();
  const currentNav = activeNav ?? getActiveNavFromPathname(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          {/* Logo */}
          <Link to="/" className="mr-6 flex items-center space-x-2">
            <div className="h-6 w-6 rounded-md bg-primary" />
            <span className="hidden font-bold sm:inline-block">Order Management</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1" data-testid="main-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentNav === item.nav;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    buttonVariants({
                      variant: isActive ? "secondary" : "ghost",
                      size: "sm",
                    })
                  )}
                  data-testid={`nav-${item.nav}`}
                  data-active={isActive}
                >
                  <Icon />
                  <span className="hidden sm:inline-block">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Optional: Could add user menu, theme toggle, etc. here */}
        </div>
      </header>

      {/* Main content */}
      <main className="container py-6" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
