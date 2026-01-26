# Frontend

Next.js 16 + React 19 frontend for the Convex Event Sourcing platform.

## Quick Start

1. Copy environment file:

   ```bash
   cp .env.example .env.local
   ```

2. Set your Convex URL in `.env.local`:

   ```bash
   NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
   ```

3. Start development:
   ```bash
   pnpm dev:frontend      # Next.js on port 3000
   pnpm ladle             # Component explorer on port 61000
   ```

## Scripts

| Command                            | Description                                         |
| ---------------------------------- | --------------------------------------------------- |
| `pnpm dev:frontend`                | Start Next.js dev server with Turbopack (port 3000) |
| `pnpm ladle`                       | Start Ladle component explorer (port 61000)         |
| `pnpm --filter frontend build`     | Production build                                    |
| `pnpm --filter frontend typecheck` | TypeScript check                                    |
| `pnpm --filter frontend lint`      | ESLint check                                        |

## Tech Stack

- **Next.js 16** with Turbopack and App Router
- **React 19** with Server Components
- **Tailwind CSS v4** with OKLCH colors and CSS variables
- **shadcn/ui base-nova** components using @base-ui/react primitives
- **Ladle 5.1.1** for component stories (Storybook alternative)
- **Hugeicons** for icons
- **Convex** for real-time backend

## Component Architecture

```
components/
├── ui/           # Atomic UI primitives (Button, Input, Card, etc.)
├── molecules/    # Simple compositions of UI primitives
├── organisms/    # Complex, self-contained UI sections
└── templates/    # Page-level layout templates
```

### Current Components

**UI Primitives (14):**

- AlertDialog, Badge, Button, Card
- Combobox, DropdownMenu, Field
- Input, InputGroup, Label
- Select, Separator, Textarea

**Organisms (2):**

- NotificationCard - Card with optional dialog action
- UserInfoForm - Form with validation fields

## Styling

- **Theming**: CSS variables with light/dark mode support
- **Colors**: OKLCH color space for perceptual uniformity
- **Variants**: `class-variance-authority` (cva) for type-safe variants
- **Utilities**: `cn()` helper combines `clsx` + `tailwind-merge`

## Convex Integration

The `convex/` folder is symlinked to `../../examples/order-management/convex`:

```
apps/frontend/convex → ../../examples/order-management/convex
```

This approach:

- Shares types with the backend without duplication
- Keeps frontend and backend code separate
- Requires the backend to be present for type resolution

**Note:** The symlink is excluded from TypeScript compilation (`tsconfig.json`) and ESLint (`eslint.config.mjs`) since the source is linted in `order-management`.

## Ladle (Component Explorer)

Ladle is a lightweight alternative to Storybook, optimized for Vite:

```bash
pnpm ladle        # Start dev server
pnpm ladle build  # Build static site
```

Stories are located next to components: `*.stories.tsx`

### Theme Toggle

Ladle includes a built-in dark mode toggle that integrates with the app's theme system. The Provider in `.ladle/components.tsx` handles theme class application.
