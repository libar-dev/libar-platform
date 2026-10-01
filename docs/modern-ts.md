# Modern TypeScript Library Engineering for a Convex Event-Driven Architecture

## Executive summary

The strongest design for this project is **not** a generic asynchronous event bus transplanted onto Convex. It is a small TypeScript domain/event kernel whose semantics fit Convex's transaction model, plus explicit Convex adapters for transactional commands, read models, durable obligations, and optional long-running workflows. That direction matches the architectural thesis in your design notes: bounded contexts own state and journals; one business operation should normally be one Convex mutation; essential read models update in that transaction; and asynchronous machinery appears only when there is a concrete need to wait, spread load, or cross an external-system boundary. \[missing source 1\] Convex's own primitives support that model: mutations are transactional and serializable under optimistic concurrency; component calls can participate transactionally with their caller; scheduled work created by a mutation is committed atomically with it; and reactive queries synchronize current state without needing an application-level WebSocket/event-delivery layer. [docs.convex.dev](https://docs.convex.dev/database/advanced/occ)

The key recommendations are:

| Area | Recommendation |
| --- | --- |
| Architectural center | Make `decide` + `evolve` + event schemas the pure kernel. Do **not** make an event dispatcher, queue, or handler registry the center. |
| Transactional path | Authorize → load authoritative state → `decide` → fold events through `evolve` → persist state + events → synchronously update essential read models → return, all in one mutation. |
| Asynchronous path | Persist an explicit **obligation** only when work must leave the transaction. Handlers execute obligations; they should not be implicit subscribers to every event. |
| Package boundaries | Keep domain/kernel code free of Convex and Node-specific APIs. Put Convex integration behind a separate package or explicit subpath. Put Node-only provider adapters behind an action-only subpath. |
| Module formats | Dual ESM/CJS for the generic/core package if that compatibility promise matters. For a packaged Convex Component, follow Convex's official **ESM-oriented** package template rather than forcing CJS onto component/config entry points. [github.com](https://github.com/get-convex/templates/blob/main/template-component/package.json) |
| Build | Use `tsc` as the declaration/type authority. For a small Convex Component, the official template's `tsc` build is the best baseline. For a generic dual-format library, use esbuild or Rollup for JavaScript and validate the resulting ESM/CJS declarations rigorously. [github.com](https://github.com/get-convex/templates/blob/main/template-component/package.json) |
| `tsup` | Do not choose it for a new 2026 library: its own repository says it is no longer actively maintained. [github.com](https://github.com/egoist/tsup/blob/main/README.md) |
| Public API | Explicit exports/subpaths, no supported deep imports, no runtime reflection/DI registry. Treat exported TypeScript types, validators, event/error codes, persisted handler keys, and migration behavior as compatibility contracts. |
| Testing | Pure domain tests → `convex-test` → package/type-resolution fixtures → real local Convex backend → a very small production-composition E2E suite. The local backend is the real open-source backend, not merely an emulator. [docs.convex.dev](https://docs.convex.dev/testing/convex-backend) |
| Idempotency | Trust Convex's retry guarantee only inside its stated boundary. Add application receipts for HTTP/webhooks/actions/workers and other callers outside that boundary. Never claim end-to-end exactly-once external effects. [docs.convex.dev](https://docs.convex.dev/client/react/overview) |
| Ordering | Guarantee order by `(tenantId, contextId, streamId, streamVersion)`. Do not invent a global sequence until a real consumer requires one. |
| Authentication | Authenticate/authorize in the parent app; pass server-established tenant/actor information into Components. Convex Components do not receive `ctx.auth`. [docs.convex.dev](https://docs.convex.dev/components/authoring) |
| Release safety | Separate npm package releases, data/event compatibility, pending background-work compatibility, and Convex application deployment. A SemVer-compatible npm change can still require a data or obligation migration. |
| Supply chain | Publish to npm via OIDC trusted publishing, not a long-lived write token; npm can automatically generate provenance for eligible public packages. [docs.npmjs.com](https://docs.npmjs.com/trusted-publishers/) |

There is an important 2026 runtime caveat. The requested baseline is Node 18+, but **Node 18 reached end of life on March 27, 2025, and Node 20 on March 24, 2026**. As of September 30, 2026, Node 22 and Node 24 are LTS lines and Node 26 is Current. [nodejs.org](https://nodejs.org/en/about/previous-releases?source=post_page---------------------------) I would preserve `>=18` only if existing consumers require it, test that promise explicitly, and announce `>=22` for the next major. npm trusted publishing itself currently requires Node 22.14.0+ and npm 11.5.1+. [docs.npmjs.com](https://docs.npmjs.com/trusted-publishers/)

Likewise, "TypeScript 5+" is now a compatibility promise rather than a choice of development compiler. TypeScript 7.0 was released July 8, 2026; Convex's current component template uses the TypeScript 6 compatibility package alongside TypeScript 7 tooling. [devblogs.microsoft.com](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) A library that promises TS 5 support should therefore test its emitted declarations with an actual TS 5 compiler rather than assuming newer TypeScript's successful build proves backward compatibility.

## Goals, contracts, and API design

A TypeScript library should have a deliberately smaller public API than its implementation. Node's `"exports"` field is particularly valuable because it both defines conditional/subpath entry points and encapsulates unlisted internal paths; Node explicitly warns that adding `"exports"` to an established package can itself be breaking if consumers previously depended on deep imports. [nodejs.org](https://nodejs.org/api/packages.html) For this project, that should become an architectural rule: **anything not reachable through an explicit package export is implementation detail**, regardless of whether a determined consumer could find a physical file in the tarball.

The library has several distinct compatibility surfaces. Treating only exported functions as "the API" would be too narrow:

| Contract | Examples | Compatibility discipline |
| --- | --- | --- |
| Source API | functions, classes, interfaces, generic parameters | SemVer |
| Runtime API | arguments, return values, error codes | SemVer + runtime tests |
| Type API | inferred unions, conditional types, overloads | SemVer + type tests |
| Package API | export names, subpaths, ESM/CJS behavior | SemVer + packed-package tests |
| Domain protocol | command/event names, payload meaning | explicit schema versions |
| Persisted protocol | historical events, baseline events | backward-readable or migrated |
| Background protocol | handler key/version, obligation payload | preserve, migrate, or drain |
| Operational API | inspection/retry/reconcile functions | SemVer if users/operators depend on it |
| Security contract | auth requirements, tenant scoping | changes require explicit review |

That distinction matters for event-driven libraries. For example, adding a member to a **closed exported union** of event types can break an exhaustive consumer even though it sounds additive. A package that wants new event kinds to be minor releases should avoid making "all possible future domain events" a closed public union that callers are expected to exhaustively switch over. Prefer per-event declarations, explicit handler registration, or a documented `UnknownEvent`/forward-compatibility policy.

A good public domain API is function-oriented and data-oriented. The core abstractions can remain very small:

ts

```ts
export type Applied<E, R> = Readonly<{
  kind: "applied";
  events: readonly E[];
  result: R;
}>;

export type Rejected<R> = Readonly<{
  kind: "rejected";
  rejection: R;
}>;

export type Decision<E, Result, Rejection> =
  | Applied<E, Result>
  | Rejected<Rejection>;

export interface Decider<State, Command, Event, Result, Rejection, Context> {
  initial(): State;

  decide(
    state: Readonly<State>,
    command: Readonly<Command>,
    context: Readonly<Context>,
  ): Decision<Event, Result, Rejection>;

  evolve(
    state: Readonly<State>,
    event: Readonly<Event>,
  ): State;
}
```

The important part is what this API **does not** return: a separate state patch. The new state should always be:

ts

```ts
const nextState = events.reduce(decider.evolve, currentState);
```

That makes the event history and saved state share one semantic authority, exactly as your design notes propose. It also gives you an unusually strong invariant test: incremental execution followed by event replay must produce equivalent business state. \[missing source 1\]

The four-outcome model in the design notes is also worth preserving in the library API:

| Outcome | Representation | Persistence |
| --- | --- | --- |
| Applied | events + result | commit |
| Business failure that is itself a fact | domain event(s), e.g. `ReservationDeclined` | commit |
| Rejection | typed rejection, translated at public boundary | no domain writes |
| Technical failure | thrown unexpected error | rollback |

At the Convex public boundary, translate a domain rejection to structured `ConvexError` data rather than relying on error-message strings. Convex differentiates application errors from unexpected errors, and client-facing application error data is the appropriate place for stable, machine-readable rejection information. [docs.convex.dev](https://docs.convex.dev/functions/error-handling/) An error code such as `ORDER_ALREADY_SUBMITTED` is therefore part of your public compatibility surface; prose such as `"Order has already been submitted"` should not be.

A practical public error shape is:

ts

```ts
export type DomainErrorData = Readonly<{
  code:
    | "NOT_AUTHORIZED"
    | "VERSION_CONFLICT"
    | "INVALID_TRANSITION"
    | "IDEMPOTENCY_CONFLICT";
  message: string;
  operationId?: string;
  details?: Readonly<Record<string, string | number | boolean>>;
}>;
```

Avoid exposing raw database IDs, stack traces, credentials, provider responses, or arbitrary event payloads as error details.

For SemVer, use the normal SemVer definition—breaking public API changes require a major release—and broaden your definition of "public API" to include types and documented protocol behavior. [semver.org](https://semver.org/) A useful policy is:

| Change | Default classification |
| --- | --- |
| New independent named export | minor |
| New documented package subpath | minor |
| New optional input property | minor |
| New required input property | major |
| Narrow accepted input type | major |
| Broaden return type with a new possible variant | major |
| Remove/rename export or subpath | major |
| Change error code meaning | major |
| Make previously synchronous operation eventually consistent | major |
| Add event field that old readers can safely ignore | usually minor protocol evolution |
| Change historical event meaning | never "just SemVer"; version/migrate explicitly |
| Add event to a public exhaustive event union | major unless documented as open/extensible |
| Add a background handler version while retaining old one | minor |
| Remove a handler version that persisted work may still reference | unsafe regardless of npm SemVer |
| Drop Node 18/20 | major |
| Raise minimum supported TypeScript compiler | major if explicitly promised |

Deprecate before removal. A good lifecycle is `introduced → stable → deprecated with replacement → removed in next major`. Deprecation notices should appear in JSDoc so editors show them, in the changelog, and in migration documentation.

Avoid several API patterns for this library:

**Do not use a mutable global event-handler registry.** It creates hidden initialization order, complicates tree-shaking, makes static Convex function discovery harder, and encourages everything to become asynchronously event-driven.

**Do not require inheritance from `AggregateRoot`, `EventHandler`, or similar base classes.** Plain data and pure functions better preserve replayability and make downstream composition easier.

**Do not use decorators or runtime reflection to discover Convex functions.** Convex's package/component model is built around statically analyzable function exports and generated component APIs. [docs.convex.dev](https://docs.convex.dev/components/authoring)

**Do not expose implementation directories.** Prefer:

ts

```ts
import {
  defineEvent,
  defineDecider,
} from "@acme/domain-events";

import {
  runCommand,
  runObligationAttempt,
} from "@acme/domain-events/convex";
```

over:

ts

```ts
import { runCommand } from "@acme/domain-events/dist/internal/runtime/foo";
```

The public surface should be designed to make the correct path easier than the incorrect path.

## Packaging, modules, and build tooling

Modern Node packages should declare `"type"` explicitly and use `"exports"` for their supported entry points. Conditional `"import"` and `"require"` branches are the standard mechanism for dual publication, and condition ordering is significant. [nodejs.org](https://nodejs.org/api/packages.html) TypeScript's `node16`, `nodenext`, and `bundler` resolution modes understand package `"exports"`; for actual Node semantics, `NodeNext` is the most revealing mode for library validation. [typescriptlang.org](https://www.typescriptlang.org/tsconfig/moduleResolution)

The module-format trade-off is:

| Format | Advantages | Costs | Recommendation here |
| --- | --- | --- | --- |
| ESM only | Native modern format; simple package graph; strongest static-analysis story | `require()` consumers need adaptation | Preferred for Convex Component/config/generated entry points |
| CJS only | Compatible with older CommonJS ecosystems | Weakest future direction and tree-shaking; poor fit for modern Convex packaging | Do not choose for a new library |
| Dual ESM/CJS | Broadest Node consumer compatibility | Two runtime graphs, conditional exports, declaration-format hazards, larger testing surface | Use only for the generic/core consumer package while the compatibility requirement exists |
| Source TypeScript | Very simple publishing in controlled toolchains | Consumers inherit compiler/runtime assumptions | Appropriate only for deliberate test/dev subpaths, not the primary runtime package |

Node documents a "dual package hazard": separate CommonJS and ESM copies can result in distinct module instances. [nodejs.org](https://nodejs.org/api/packages.html) For an event/domain kernel this is another reason to keep the package **stateless**: no singleton registries, mutable global caches, global class-instance identity requirements, or module-level correctness state.

Type declarations have module identity too. TypeScript explicitly states that declaration files are interpreted as ESM or CommonJS according to their extension/package context and that the declaration module kind needs to correspond to the JavaScript it describes. [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7) AreTheTypesWrong specifically catches dual-package mistakes such as a `.cjs` implementation being represented by an ESM declaration; its guidance is that the build producing `index.cjs` should produce the corresponding CJS declaration such as `index.d.cts`. [github.com](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/packages/cli/README.md)

For a dual core package, the shape should therefore resemble:

json

```json
{
  "name": "@acme/domain-events",
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=18"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./convex": {
      "types": "./dist/convex/index.d.ts",
      "default": "./dist/convex/index.js"
    },
    "./package.json": "./package.json"
  },
  "sideEffects": false,
  "scripts": {
    "clean": "node ./scripts/clean.mjs",
    "build": "npm run clean && npm run build:types && node ./scripts/build-js.mjs",
    "build:types": "tsc -p tsconfig.types.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:types": "vitest run --typecheck",
    "lint": "eslint . --max-warnings=0",
    "format:check": "prettier --check .",
    "package:check": "publint && attw --pack .",
    "prepack": "npm run build && npm run package:check"
  }
}
```

The CJS declaration file should be generated as part of the same build and verified; do not merely point both conditions at one declaration file and assume module interop is correct. AreTheTypesWrong exists specifically to detect those resolution mismatches. [github.com](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/packages/cli/README.md)

For a pure core package, a strong TypeScript baseline is:

jsonc

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",

    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "verbatimModuleSyntax": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    "rootDir": "src",
    "outDir": "dist",

    "isolatedModules": true,
    "skipLibCheck": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

`verbatimModuleSyntax` was introduced in TypeScript 5.0 and makes type-only versus runtime imports explicit; `isolatedModules` catches constructs that single-file transpilers cannot safely interpret. [typescriptlang.org](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html) Declaration maps improve "Go to Definition" into library source; TypeScript specifically recommends declaration maps plus source files for that developer experience. [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options)

For the declaration build, consider `isolatedDeclarations` once the exported API is mature:

jsonc

```jsonc
// tsconfig.types.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "isolatedDeclarations": true
  },
  "exclude": [
    "src/**/*.test.ts",
    "src/**/*.test-d.ts"
  ]
}
```

`isolatedDeclarations` requires exports to carry enough annotation for tools to generate declarations independently, which is valuable for a library because it pressures public types to be explicit rather than accidentally inferred from deep implementation detail. [typescriptlang.org](https://www.typescriptlang.org/tsconfig/isolatedDeclarations.html)

The bundler comparison in 2026 is:

| Tool | Strengths | Weaknesses | Best fit here |
| --- | --- | --- | --- |
| `tsc` | Canonical TypeScript declarations; lowest build magic; preserves module structure | Not primarily a bundler; dual-format JS takes more configuration | **Default for Convex Component package** |
| esbuild | Very fast; straightforward ESM/CJS output; source maps; external-package control | Declaration generation still belongs to TypeScript; advanced library packaging needs explicit scripting | **Recommended for simple dual JS builds** |
| Rollup | Excellent control over entries/chunks/output; mature tree-shaking and plugin architecture | More configuration and plugin surface | Best when you need many subpaths or customized artifact layout |
| tsup | Historically convenient TypeScript/esbuild wrapper | Project says it is no longer actively maintained | **Do not start a new 2026 library with it** |

esbuild supports ESM/CJS output, tree-shaking, source maps, external packages, and code splitting; its documentation also notes that CommonJS is much less amenable to tree-shaking and that its code splitting is ESM-oriented. [esbuild.github.io](https://esbuild.github.io/api/) Rollup emphasizes tree-shaking, native-module-oriented code splitting, and a richer plugin/configuration model. [rollupjs.org](https://rollupjs.org/) tsup's own current README now says the project is not actively maintained. [github.com](https://github.com/egoist/tsup/blob/main/README.md)

For this library, **do not code-split the core npm package by default**. Code splitting solves application delivery problems much more often than library-distribution problems. Instead, make capability boundaries explicit package subpaths:

text

```text
@acme/domain-events
@acme/domain-events/convex
@acme/domain-events/node
@acme/domain-events/test
```

That lets the consumer's bundler eliminate unused capabilities and avoids accidentally importing Node-only code into Convex's default runtime.

Mark `"sideEffects": false` only when every exported module is genuinely free of required module-load side effects. esbuild uses package side-effect metadata as part of tree-shaking. [esbuild.github.io](https://esbuild.github.io/api/) This strongly reinforces the recommendation against registration-by-import:

ts

```ts
// Bad for tree-shaking and deterministic initialization.
registry.register("OrderPlaced", handler);

// Better: value exported explicitly; caller binds it.
export const orderPlacedHandler = defineHandler({ ... });
```

Source maps should be enabled for published JavaScript and declaration maps for types. TypeScript source maps allow debuggers to map emitted JavaScript back to the original TypeScript; `inlineSources` can embed original sources if you deliberately want that trade-off. [typescriptlang.org](https://www.typescriptlang.org/tsconfig/sourceMap.html) Do not put secrets into source in the first place; a source map is not a secrecy boundary.

The **Convex Component package should be treated differently from the generic dual package**. Convex's current official component template is `"type": "module"`, builds with `tsc`, and exports its client API, optional React API, `/test`, `/_generated/component.js`, and `/convex.config.js`. Its current development setup uses ESLint, Prettier, Vitest, `convex-test`, TypeScript 6 compatibility tooling, and TypeScript 7. [github.com](https://github.com/get-convex/templates/blob/main/template-component/package.json) Convex's authoring guide explicitly describes those component entry points and recommends the build order `component codegen → package build → example app convex dev`; it also recommends one root `package.json`/`node_modules` for the component package plus example app to avoid duplicate Convex versions. [docs.convex.dev](https://docs.convex.dev/components/authoring)

A Convex-focused package should therefore look closer to:

jsonc

```jsonc
{
  "name": "@acme/convex-domain-events",
  "type": "module",
  "files": ["dist", "src"],
  "peerDependencies": {
    "convex": "^1.43.0"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "build:codegen":
      "convex codegen --component-dir ./src/component && npm run build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --typecheck",
    "lint": "eslint . --max-warnings=0",
    "format:check": "prettier --check ."
  },
  "exports": {
    ".": {
      "types": "./dist/client/index.d.ts",
      "default": "./dist/client/index.js"
    },
    "./convex.config.js": {
      "types": "./dist/component/convex.config.d.ts",
      "default": "./dist/component/convex.config.js"
    },
    "./_generated/component.js": {
      "types": "./dist/component/_generated/component.d.ts"
    },
    "./test": "./src/test.ts"
  }
}
```

The peer-dependency version shown reflects the current official template and should be refreshed when the project is bootstrapped rather than copied indefinitely. [github.com](https://github.com/get-convex/templates/blob/main/template-component/package.json)

The practical conclusion is therefore: **dual-publish the generic library if needed, but do not force dual ESM/CJS onto the actual Convex component machinery merely for symmetry.**

## Convex architecture and event semantics

Convex changes the usual event-driven architecture calculus because local state changes do not need a broker or outbox to become atomic. Mutations are transactional, use optimistic concurrency, and retry conflicts automatically; component mutation calls can compose transactionally with a caller. [docs.convex.dev](https://docs.convex.dev/database/advanced/occ) That makes your design's "one mutation per business operation" a particularly strong default.

The recommended core command path is:

text

```text
public mutation
    │
    ├─ authenticate + authorize
    ├─ establish tenant + actor + operationId
    │
    └─ application use case
         ├─ context A operation
         │    ├─ load authoritative state
         │    ├─ decide(...)
         │    ├─ evolve(...)
         │    └─ save state + journal
         │
         ├─ context B operation, if needed
         │    └─ same transactional boundary
         │
         ├─ update essential read model(s)
         │
         └─ optionally create + schedule an obligation
```

Do not insert a "command bus", "event bus", projection queue, or saga between those steps unless a real requirement creates a separate transaction boundary.

A suitable event envelope is very close to the one already proposed:

ts

```ts
export interface EventEnvelope<
  Type extends string,
  Version extends number,
  Payload,
> {
  readonly eventId: string;

  readonly tenantId: string;
  readonly contextId: string;

  readonly streamType: string;
  readonly streamId: string;
  readonly streamVersion: number;

  readonly eventType: Type;
  readonly eventSchemaVersion: Version;

  readonly operationId: string;
  readonly correlationId: string;
  readonly causedBy:
    | { readonly kind: "command"; readonly id: string }
    | { readonly kind: "event"; readonly id: string };

  readonly actor: {
    readonly kind: "user" | "service" | "agent" | "operator";
    readonly id: string;
    readonly delegationId?: string;
  };

  readonly recordedAt: number;
  readonly occurredAt?: number;

  readonly payload: Payload;
}
```

`streamVersion`, rather than wall-clock time or generated UUID ordering, should be authoritative for one stream's order. Cross-stream events should be related by causation/operation identity without pretending they have a total global order. That is also consistent with the cost-conscious design in your working document: only introduce a deployment-wide ordered feed when a concrete consumer actually requires one. \[missing source 1\]

The "event model" should distinguish four concepts that are often unfortunately all called event handling:

| Mechanism | When it runs | Purpose |
| --- | --- | --- |
| `evolve(state, event)` | pure code | derive authoritative domain state |
| synchronous projector | same mutation | essential read model |
| obligation handler | later mutation/action | deferred local work or external effect |
| ordered consumer | optional advanced capability | consume every selected event in order |

This vocabulary prevents the library from drifting into "every event gets published asynchronously."

A proposed Convex-friendly domain declaration can be straightforward:

ts

```ts
import { v } from "convex/values";

export const orderPlaced = {
  type: "orders.orderPlaced" as const,
  schemaVersion: 1 as const,

  payload: v.object({
    orderId: v.string(),
    customerId: v.string(),
    totalMinor: v.int64(),
    currency: v.string(),
  }),
};

export type OrderPlaced = EventEnvelope<
  typeof orderPlaced.type,
  typeof orderPlaced.schemaVersion,
  {
    orderId: string;
    customerId: string;
    totalMinor: bigint;
    currency: string;
  }
>;
```

A pure order decider remains unaware of Convex:

ts

```ts
export const orders: Decider<
  OrderState,
  OrderCommand,
  OrderEvent,
  OrderResult,
  OrderRejection,
  DecisionContext
> = {
  initial() {
    return { status: "absent", lines: [] };
  },

  decide(state, command, context) {
    if (command.type === "PlaceOrder") {
      if (state.status !== "absent") {
        return {
          kind: "rejected",
          rejection: {
            code: "ORDER_ALREADY_EXISTS",
          },
        };
      }

      return {
        kind: "applied",
        events: [
          {
            type: "OrderPlaced",
            orderId: command.orderId,
            lines: command.lines,
            acceptedAt: context.now,
          },
        ],
        result: { orderId: command.orderId },
      };
    }

    // Exhaustiveness helper omitted here.
    throw new Error("Unsupported command");
  },

  evolve(state, event) {
    switch (event.type) {
      case "OrderPlaced":
        return {
          status: "placed",
          lines: event.lines,
        };
    }
  },
};
```

The Convex adapter, not the decider, is responsible for I/O:

ts

```ts
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { placeOrderUseCase } from "./model/placeOrder";

export const placeOrder = mutation({
  args: {
    tenantId: v.string(),
    orderId: v.string(),
    lines: v.array(
      v.object({
        sku: v.string(),
        quantity: v.number(),
      }),
    ),
  },

  handler: async (ctx, args) => {
    const actor = await requireAuthorizedActor(ctx, {
      tenantId: args.tenantId,
      permission: "orders.place",
    });

    const result = await placeOrderUseCase(ctx, {
      ...args,
      actor,
      operationId: crypto.randomUUID(),
    });

    if (result.kind === "rejected") {
      throw new ConvexError({
        code: result.rejection.code,
      });
    }

    return result.result;
  },
});
```

The public wrapper should generally stay thin. Convex's own best-practice guidance favors extracting reusable backend logic into helpers instead of gratuitously invoking additional registered functions; component authoring guidance similarly shows app-level wrappers around a component so authentication and app-level policy remain explicit. [docs.convex.dev](https://docs.convex.dev/understanding/best-practices)

For bounded contexts implemented as Components, the parent application can authenticate and call them explicitly:

ts

```ts
export const placeOrder = mutation({
  args: placeOrderArgs,

  handler: async (ctx, args) => {
    const actor = await authorizePlaceOrder(ctx, args);

    return await ctx.runMutation(
      components.orders.application.placeOrder,
      {
        tenantId: actor.tenantId,
        actor,
        input: args,
      },
    );
  },
});
```

Convex Components do not have `ctx.auth`; official guidance is to authenticate in the containing app and pass identifiers or other established identity data to the component. [docs.convex.dev](https://docs.convex.dev/components/authoring) That aligns unusually well with your "parent establishes authority, components receive server-established actor/scope" rule.

### Semantics of retries and delivery

The architecture should document guarantees by boundary instead of using "exactly once" as a global property.

| Boundary | Convex/platform property | Library responsibility |
| --- | --- | --- |
| One mutation transaction | Atomic, serializable mutation semantics under OCC | state + events + essential projections together |
| React-client mutation call | Client retries until confirmed; backend executes that mutation call once | no extra receipt needed merely for that transport retry |
| Two UI submissions | Two calls | entity uniqueness/idempotency policy |
| Scheduled mutation | Scheduling from a mutation is transactional; scheduled mutation has automatic retry semantics | handler must still respect domain identity |
| Scheduled action | Scheduling can be transactional, but actions are not automatically retried | obligation owns retry/reconcile policy |
| Action → `runMutation` calls | Each call is its own transaction | claim/effect/settle protocol |
| HTTP/webhook | outside React-client retry guarantee | receipt/idempotency key |
| External provider | no transaction with Convex | provider idempotency or reconciliation |
| Realtime subscription | state synchronization | never treat as durable event delivery |

Convex's React client retries a mutation until it is confirmed and Convex guarantees execution of that mutation call once; that does not turn two separate user submissions into one intent. [docs.convex.dev](https://docs.convex.dev/client/react/overview) Convex actions can perform outside I/O, but their individual `runMutation` calls are independent transactions and actions are intentionally not automatically retried like deterministic mutations. [docs.convex.dev](https://docs.convex.dev/functions/actions) Scheduled mutations and scheduled actions also have materially different execution behavior, so those two concepts should not be hidden behind one generic "background job" abstraction. [docs.convex.dev](https://docs.convex.dev/scheduling/scheduled-functions)

For non-Convex-client retry boundaries, use a scoped receipt:

ts

```ts
type ReceiptKey = Readonly<{
  tenantId: string;
  callerNamespace: string;
  commandType: string;
  requestKey: string;
}>;

type CommandReceipt = Readonly<{
  key: ReceiptKey;
  inputFingerprint: string;
  operationId: string;
  affectedStreams: readonly {
    streamId: string;
    streamVersion: number;
  }[];
  outcome: "applied";
}>;
```

The receipt transaction should:

1.  authenticate before disclosing an old result;
2.  derive the namespace server-side;
3.  check `(key, fingerprint)`;
4.  reject same-key/different-input reuse explicitly;
5.  execute and record outcome in the same transaction;
6.  store a thin durable identity/result reference rather than a full serialized response unless replay of that response is genuinely required.

A retryable technical failure should leave no "business rejection receipt." That is a critical difference between idempotency and error logging.

### Durable obligations instead of a universal event bus

When work genuinely must leave the transaction, create an explicit obligation with an effect identity and scheduling in the same mutation. Convex guarantees that scheduling performed in a mutation is committed atomically with that mutation. [docs.convex.dev](https://docs.convex.dev/scheduling/scheduled-functions)

A minimal obligation record should include:

ts

```ts
interface Obligation<Payload> {
  obligationId: string;

  tenantId: string;
  effectKey: string;

  operationId: string;
  sourceEventId?: string;

  handlerKey: string;
  handlerVersion: number;
  payloadSchemaVersion: number;
  payload: Payload;

  authority: CapturedAuthority;

  status:
    | "pending"
    | "running"
    | "succeeded"
    | "needs_attention"
    | "cancelled"
    | "abandoned";

  attempt: number;
  activeAttemptId?: string;

  nextAttemptAt?: number;
  deadline?: number;

  completionEvidence?: CompletionEvidence;
  lastError?: ClassifiedFailure;
}
```

The **handler key and handler version belong in persisted data**. Never persist only a generated Convex function handle and assume it remains your long-term business compatibility contract. Function handles can be useful execution metadata—Convex explicitly allows creating and storing them—but a logical application-level handler identity gives you a stable migration and operator vocabulary. [docs.convex.dev](https://docs.convex.dev/components/authoring)

A proposed static handler surface is:

ts

```ts
export const sendOrderConfirmation = internalAction({
  args: obligationAttemptArgs,

  handler: runObligationAttempt({
    handlerKey: "orders.send-confirmation",
    handlerVersion: 2,

    perform: async ({ obligation, attemptId }) => {
      const response = await mailProvider.send({
        idempotencyKey: obligation.effectKey,
        // Exact accepted payload, not "latest order email data".
        ...obligation.payload,
      });

      return {
        evidence: {
          providerMessageId: response.id,
          attemptId,
        },
      };
    },
  }),
});
```

Here `runObligationAttempt` is a proposed library helper, not a dynamic registry. The actual handler remains a static Convex export. Its wrapper can:

text

```text
claim/fence attempt in a mutation
            ↓
perform external effect in action
            ↓
settle from evidence in a mutation
```

Because action-to-mutation calls are separate transactions, a provider may have succeeded even when your process loses the response before settlement. [docs.convex.dev](https://docs.convex.dev/functions/actions) Therefore an external effect needs one of three explicit repetition policies: provider idempotency key; provider reconciliation before a fresh irreversible call; or a documented business rule that duplicates are acceptable. Otherwise, an ambiguous outcome should stop in `needs_attention`, not blindly retry.

That is why **end-to-end exactly-once delivery should not be an advertised feature**. The defensible contract is closer to:

> One accepted local transaction records its domain facts atomically. Deferred work has stable identity, bounded retry, deduplication/fencing, and reconciliation. External effects are exactly-once only to the extent the external provider's idempotency/reconciliation semantics make that provable.

### Realtime is not an event transport

Convex's realtime mechanism re-runs/reactively synchronizes query results when the data they depend on changes. [docs.convex.dev](https://docs.convex.dev/realtime) That is excellent for UI state and is a strong reason not to build an event-to-WebSocket layer. But a reactive query is not a durable log-consumer protocol: it tells a subscriber the relevant **current query result**, not that it has consumed every intermediate domain event exactly once.

The UI pattern should therefore be:

text

```text
mutation result:
  orderId
  operationId
  affected stream version(s)

reactive query:
  current order/read-model state

optional durable-work query:
  obligation/process status
```

not:

text

```text
subscribe to OrderPlaced
subscribe to StockAllocated
subscribe to ProjectionUpdated
reconstruct current UI state client-side
```

### Local versus external ordering

Within one stream, enforce an expected version transactionally:

ts

```ts
if (stream.version !== expectedVersion) {
  throw new VersionConflict(...);
}

const nextVersion = stream.version + 1;
```

Then append an event carrying that `nextVersion` and update stream metadata in the same mutation. Do not rely on `_creationTime`, UUID lexical order, or timestamp ties to prove consumption completeness.

Cross-context relationships should use:

text

```text
operationId
correlationId
causedBy
```

unless a real downstream algorithm mathematically requires total ordering. A global sequence creates a shared write hotspot and permanent infrastructure obligation; do not pay that price speculatively.

### Server runtime compatibility

The npm library's Node 18+ compatibility target does **not** mean Node APIs should be used in code that runs in every Convex function. Convex distinguishes its normal runtime from Node-oriented action execution; external/Node-specific work belongs in actions where appropriate. [docs.convex.dev](https://docs.convex.dev/functions/runtimes) Keep these layers explicit:

text

```text
core/
  no Convex
  no Node built-ins
  deterministic

convex/
  Convex validators/contexts
  mutations/queries
  still no arbitrary external I/O

node/
  provider SDKs
  Node-only dependencies
  action-only integrations
```

That separation prevents a transitive import of `fs`, a Node-only crypto/provider package, or another unsupported dependency from accidentally entering a Convex mutation bundle.

## Testing, quality, performance, observability, and security

Convex now supports two intentionally different backend-testing strategies. `convex-test` is a fast JavaScript mock designed to integrate with Vitest, while local-backend testing runs against the real open-source Convex backend and enforces backend limits that the mock does not. [docs.convex.dev](https://docs.convex.dev/testing/convex-backend) It is more precise to call the latter the **Convex local backend**, not an emulator. Convex's local deployments remain a beta development feature and keep their state under `.convex`; they are not recommended as production deployments. [docs.convex.dev](https://docs.convex.dev/cli/local-deployments)

The testing catalogue should be:

| Layer | Tool/style | What it proves | Run frequency |
| --- | --- | --- | --- |
| Pure domain | Vitest | `decide`, `evolve`, invariants, no I/O | every PR |
| Replay/property | Vitest | incremental state = rebuilt state | every PR |
| Type API | Vitest type tests + `tsc` fixtures | inference and compile-time contracts | every PR |
| Convex mock | `convex-test` | schema/function integration, common component behavior | every PR |
| Package surface | packed tarball + Node fixture apps | ESM/CJS/exports/runtime loading | every PR |
| Package type resolution | `publint`, AreTheTypesWrong | package metadata/type-resolution correctness | every PR |
| Native integration | real local Convex backend | OCC, real runtime, actual limits, component/scheduler semantics | critical PRs + release |
| Browser/application E2E | example app against local/preview backend | published consumer experience | release/important PRs |
| Restore/rebuild acceptance | disposable native environment | operational guarantees | release/nightly |
| Contention/performance | native backend | transaction budgets and hotspots | scheduled/release |

Convex explicitly notes that `convex-test` does not reproduce many real-backend limits and some runtime semantics; its local-backend guidance says native tests exercise the actual backend and enforce argument/data/query size limits. [docs.convex.dev](https://docs.convex.dev/testing/convex-test) This distinction matters for your architecture because correctness depends on transaction behavior, component boundaries, scheduling, contention, and bounded transaction size.

The pure invariant suite should include at least:

ts

```ts
it("rebuilds to the same state", () => {
  const initial = orders.initial();

  const events = [
    orderPlacedFixture(),
    orderConfirmedFixture(),
  ];

  const rebuilt = events.reduce(orders.evolve, initial);

  expect(rebuilt).toEqual(savedStateFixture());
});

it("is deterministic", () => {
  const first = orders.decide(state, command, context);
  const second = orders.decide(state, command, context);

  expect(second).toEqual(first);
  expect(state).toEqual(originalState);
});

it("rejects without producing events", () => {
  const result = orders.decide(
    alreadySubmittedOrder,
    submitAgain,
    context,
  );

  expect(result).toEqual({
    kind: "rejected",
    rejection: { code: "ORDER_ALREADY_SUBMITTED" },
  });
});
```

Then exercise the platform-level acceptance scenarios already identified in the design notes: inject failures around state/journal writes; race stock allocation; retry a non-UI command with the same idempotency key; double-submit a UI create; verify tenant isolation; rebuild during live writes; check rollback when the second context rejects; duplicate durable work; lose provider responses; let stale workers report late; and restore while external state is ahead of the backup. \[missing source 1\]

For type tests, Vitest exposes `expectTypeOf`, and its type-checking support can treat `*.test-d.ts` files as type tests. [v2.vitest.dev](https://v2.vitest.dev/guide/testing-types) Use those for API ergonomics:

ts

```ts
import { expectTypeOf, test } from "vitest";
import { defineEvent } from "../src/index.js";

test("event type preserves literal event name", () => {
  const event = defineEvent({
    type: "orders.placed",
    schemaVersion: 1,
  });

  expectTypeOf(event.type)
    .toEqualTypeOf<"orders.placed">();
});
```

But also compile realistic **consumer fixtures**, because a type assertion inside your own build will not catch every package-resolution mistake:

text

```text
test/consumers/
  esm-nodenext/
    package.json       { "type": "module" }
    tsconfig.json      NodeNext
    index.ts

  cjs-nodenext/
    package.json       { "type": "commonjs" }
    tsconfig.json      NodeNext
    index.cts

  bundler/
    tsconfig.json      moduleResolution: bundler
    index.ts
```

Run those against the **packed package**, not against `src/`. That catches forgotten files, wrong `exports`, wrong extensions, and accidental unpublished imports.

The recommended compatibility matrix, given your stated `Node >=18 / TS >=5` promise and the current 2026 landscape, is:

| Dimension | PR matrix | Release/nightly matrix | Reason |
| --- | --- | --- | --- |
| Node | 18, 22, 24 | 18, 20, 22, 24, 26 | Verify advertised floor plus current LTS/current |
| TypeScript | advertised 5.x minimum, 7.x | exact minimum, 5.9, 6.0, 7.0 | detect declaration drift across compiler generations |
| Resolution | NodeNext ESM + NodeNext CJS | add `bundler` | package-export compatibility |
| Convex | minimum supported peer + current | minimum + current | peer-range correctness |
| Backend | `convex-test` | plus local backend | mock speed plus native semantics |

As of September 30, 2026, Node 18 and 20 are EOL, while 22/24 are LTS and 26 is Current. [nodejs.org](https://nodejs.org/en/about/previous-releases?source=post_page---------------------------) TypeScript 7 is current, while TypeScript 6 remains available via the compatibility package described by the TypeScript team. [devblogs.microsoft.com](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) I would consequently make the legacy Node jobs compatibility gates, not the runtime used for publishing or primary development.

If "TypeScript 5+" literally means **5.0**, test 5.0. If what you actually mean is "a modern TypeScript 5 consumer", explicitly choose a floor such as 5.9 and document it. Never advertise `>=5` while testing only TypeScript 7.

For linting and formatting, use current ESLint flat configuration, `typescript-eslint`, the Convex ESLint plugin for Convex code, and Prettier as an independent formatter. Convex's current component template uses ESLint 9, `@convex-dev/eslint-plugin`, Prettier, and Vitest. [github.com](https://github.com/get-convex/templates/blob/main/template-component/package.json) A simple quality script is:

json

```json
{
  "scripts": {
    "check": "npm run typecheck && npm run lint && npm run format:check && npm run test && npm run package:check",
    "lint": "eslint . --max-warnings=0",
    "format:check": "prettier --check ."
  }
}
```

Performance work should focus first on **Convex transaction shape**, not micro-optimizing the TypeScript library. Convex transactions have platform limits, and optimistic concurrency means broad/high-contention reads can create retries. [docs.convex.dev](https://docs.convex.dev/database/advanced/occ) For the Orders/Inventory experiment proposed in your notes, measure:

| Metric | Why it matters |
| --- | --- |
| top-level commits per command | should normally be one |
| component calls | catches accidental O(N) orchestration |
| documents read | transaction cost/contention surface |
| documents written | write amplification |
| events appended | history cost |
| projection rows written | read-model cost |
| transaction latency | user-visible cost |
| OCC retries | contention signal |
| 1 / 10 / max order lines | scaling shape |
| simultaneous stock contenders | hotspot behavior |
| obligations created | async infrastructure cost |
| unresolved-obligation age | durability/operator health |

Batch APIs such as:

ts

```ts
inventory.allocate({
  lines: [
    { sku: "A", quantity: 2 },
    { sku: "B", quantity: 1 },
  ],
});
```

are preferable to orchestrating a component call per line. O(N) domain work may be unavoidable; O(N) cross-component orchestration usually should not be the default.

For observability, propagate stable identifiers:

text

```text
tenantId
operationId
correlationId
streamType
streamId
streamVersion
eventId
obligationId
attemptId
handlerKey
handlerVersion
```

Do not use logs as the authority for whether a business transaction committed. Convex supports log streams with structured function-execution, audit, scheduler/concurrency and related data, as well as exception-reporting integrations. [docs.convex.dev](https://docs.convex.dev/production/integrations/log-streams) Use those for observations; use persisted events, command receipts, and obligations for business truth.

That gives a useful separation:

text

```text
Domain journal       = what happened
Command receipt      = what retry identity was accepted
Obligation           = what deferred promise is outstanding
Provider evidence    = what an external system says occurred
Logs/traces/metrics  = how execution behaved
```

If a security/business audit record is mandatory, make it transactional and fail closed. Routine diagnostic telemetry should not make a valid business command fail. Convex exposes a dedicated audit logging mechanism with stronger guarantees than ordinary console logging, which is appropriate to evaluate for security-relevant operational events. [docs.convex.dev](https://docs.convex.dev/production/integrations/audit-logging)

Security recommendations fall into three boundaries.

**Application boundary.** Public functions authenticate and authorize first. Tenant scope is explicit and never interpreted as a wildcard. Components receive server-established identity/scope rather than trusting client-supplied authority. Convex's own component guidance recommends app-level authentication because components lack `ctx.auth`. [docs.convex.dev](https://docs.convex.dev/components/authoring)

**Background boundary.** Scheduled functions do not automatically inherit the caller's authentication context, so persist the authority/provenance needed by a future obligation rather than expecting ambient auth later. [docs.convex.dev](https://docs.convex.dev/scheduling/scheduled-functions) Distinguish "re-check the user's present authority" from "execute an already-authorized service obligation"; they have different semantics.

**Package/supply-chain boundary.** Keep runtime dependencies small, use a lockfile, verify packed artifacts in CI, and publish through npm trusted publishing. npm's current OIDC mechanism removes the need for a long-lived publish token, requires Node 22.14+/npm 11.5.1+, and can automatically create provenance attestations for eligible public GitHub/GitLab publications. [docs.npmjs.com](https://docs.npmjs.com/trusted-publishers/)

Secrets belong in deployment configuration, not events, obligation payloads, telemetry, source maps, or error data. Convex supports declared environment variables for typed deployment configuration; component environment variables are runtime values and should not be read at module initialization time. [docs.convex.dev](https://docs.convex.dev/production/environment-variables)

## CI/CD, releases, migrations, and deployment

CI should separate **fast correctness**, **compatibility**, **native Convex acceptance**, and **publishing**. GitHub's current Node CI documentation recommends `setup-node` and supports matrix testing; its current examples use `actions/checkout@v6` and `actions/setup-node@v7`. [docs.github.com](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) Convex also documents running its tests in GitHub Actions. [docs.convex.dev](https://docs.convex.dev/testing/ci)

A practical main workflow is:

yaml

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v7
        with:
          node-version: 24.x
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm run test
      - run: npm run test:types
      - run: npm run package:check

  node-compat:
    runs-on: ubuntu-latest

    strategy:
      fail-fast: false
      matrix:
        node: [18.x, 20.x, 22.x, 24.x, 26.x]

    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v7
        with:
          node-version: ${{ matrix.node }}
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm pack
      - run: npm run test:package

  convex-mock:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v7
        with:
          node-version: 24.x
          cache: npm

      - run: npm ci
      - run: npm run build:codegen
      - run: npm run test:convex
```

You can reduce the Node matrix on ordinary PRs to 18/22/24 and run the complete 18/20/22/24/26 matrix for main/release. The non-negotiable principle is that every advertised runtime must appear somewhere in the release gate.

For native Convex tests, use a dedicated harness that:

text

```text
starts a disposable local backend
sets explicit test-only configuration
pushes/codegens the actual component/app
runs the native integration suite
tears the backend down
```

Convex's local-backend testing documentation explicitly contrasts this with `convex-test`: native testing runs the actual open-source backend and enforces platform limits, but is more involved and offers less mocking/control over time, fetch, randomness, and environment values. [docs.convex.dev](https://docs.convex.dev/testing/convex-backend) Convex's own testing walkthrough describes the same lifecycle—start fresh backend, set a test marker, deploy/push code, run tests, and tear it down—and recommends keeping test-only destructive functions guarded so they cannot run in normal deployments. [stack.convex.dev](https://stack.convex.dev/testing-with-local-oss-backend)

Do **not** rely on `npx convex dev --once` alone as a generic native-test harness if the test process needs an active backend; local deployments ordinarily run as a subprocess of `convex dev` and stop when that command exits. [docs.convex.dev](https://docs.convex.dev/cli/local-deployments) Encapsulate backend lifecycle in a test script so local and CI behavior are the same.

For publishing, use an independent release workflow with OIDC:

yaml

```yaml
name: publish

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v7
        with:
          node-version: 24.x
          registry-url: https://registry.npmjs.org
          package-manager-cache: false

      - run: npm install --global npm@^11.5.1
      - run: npm ci
      - run: npm run check
      - run: npm run build
      - run: npm publish --access public
```

npm's official trusted-publishing workflow requires `id-token: write`; publishing then uses short-lived OIDC credentials instead of a stored npm write token. npm currently recommends disabling traditional automation-token publishing after trusted publishing is verified, and it can automatically attach provenance to eligible public packages. [docs.npmjs.com](https://docs.npmjs.com/trusted-publishers/)

For versioning/changelogs, Changesets is a good fit when the project has one or several publishable packages: contributors record both a SemVer intent and human summary, and release automation can aggregate these into version/changelog updates. [github.com](https://github.com/changesets/changesets/blob/main/README.md) A change entry for this project should additionally classify protocol impact:

md

```md
---
"@acme/domain-events": minor
---

Add `orders.paymentAuthorized` event schema v1.

Protocol impact:
- New event type: yes
- Existing event decoding: unchanged
- Rebuild behavior: unchanged
- New obligation handler: `payments.capture@2`
- Old handler retained: `payments.capture@1`
- Migration required: no
- Minimum Convex version: unchanged
```

The generated changelog should distinguish at least **Added, Changed, Deprecated, Removed, Fixed, Security, Data/Protocol migration**, with a migration note whenever a release affects persisted events, schemas, obligations, auth behavior, package subpaths, or runtime requirements.

A robust event-driven release model has **three separate versions**:

text

```text
npm package version
  e.g. 3.4.0

event schema version
  e.g. orders.orderPlaced / v2

durable handler version
  e.g. payments.capture / v4
```

Do not couple them mechanically. Publishing `3.5.0` does not imply all events become schema version 3, and deploying package `4.0.0` must not make old obligations referencing handler version 2 undecodable.

For historical event evolution:

**Representation-only migration.** If data representation changes without changing business meaning, perform a data/schema migration and retain semantic compatibility.

**Compatible event addition.** New optional information may use the same event schema only if old and new code interpret the event identically enough for historical rebuild. Do not bump version mechanically for every field.

**Meaning change.** Introduce a new schema version or new event type with an explicit upcaster/decoder policy.

**History can no longer reproduce today's state.** Use the baseline-event mechanism described in your design: write a versioned baseline representing migrated state and rebuild from the latest baseline rather than rewriting historical events. \[missing source 1\]

For deployed schema changes, prefer expand/migrate/contract:

text

```text
release A:
  new code reads old + new form
  new writes use compatible new form

migration:
  backfill in bounded batches
  verify invariants

release B:
  stop producing old form

later release:
  remove old reader only after compatibility horizon closes
```

The same rule applies to durable work:

text

```text
release A:
  handler v1 + v2 available
  new obligations use v2

migration/drain:
  old v1 obligations complete
  or migrate them with an explicit audited transformation

release B:
  v1 removed
```

Never deploy code that simply drops the function/body needed by accepted pending work.

For read-model migrations, use generation-based rebuilds where possible:

text

```text
active generation N
building generation N+1

live commands:
  continue N
  update N+1 where safe

backfill:
  fill N+1 with source-version guards

verify:
  coverage + consistency

single write:
  set active generation N+1

rollback window:
  retain N temporarily
```

For views requiring a consistent history across multiple streams, a controlled write pause may still be the safer mechanism unless/until you have a real consistent-cut protocol. This is a good example of where a sophisticated generic mechanism should follow evidence rather than precede it.

Convex application deployment should remain distinct from package publication. A library release publishes npm artifacts; an application deployment selects a library version and runs its own `convex deploy` after migration/acceptance checks. Convex documents production/preview CI deployment and deployment-key workflows separately. [docs.convex.dev](https://docs.convex.dev/cli/reference/deploy) This prevents an npm patch release from silently modifying every consuming backend.

Finally, backup/restore belongs in release readiness for a durable event architecture. Restoring database state does not automatically prove that external-provider state, environment configuration, code, or pending background activity has been reconciled. Convex's recovery guidance treats code/configuration and data recovery as related operational concerns, and your architecture correctly makes restoring outstanding obligations and reconciling external outcomes a first-class acceptance scenario. [docs.convex.dev](https://docs.convex.dev/database/backup-restore)

## Recommended starter blueprint and primary sources

The most appropriate repository structure for the first implementation is deliberately smaller than a future generalized platform:

text

```text
domain-events/
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ tsconfig.build.json
├─ eslint.config.js
├─ prettier.config.mjs
├─ vitest.config.ts
├─ CHANGELOG.md
├─ README.md
│
├─ src/
│  ├─ core/
│  │  ├─ decider.ts
│  │  ├─ event.ts
│  │  ├─ errors.ts
│  │  ├─ ids.ts
│  │  └─ index.ts
│  │
│  ├─ client/
│  │  └─ index.ts
│  │
│  ├─ component/
│  │  ├─ convex.config.ts
│  │  ├─ schema.ts
│  │  ├─ _generated/
│  │  │
│  │  ├─ model/
│  │  │  ├─ journal.ts
│  │  │  ├─ streams.ts
│  │  │  ├─ receipts.ts
│  │  │  └─ obligations.ts
│  │  │
│  │  ├─ commands/
│  │  ├─ queries/
│  │  ├─ internal/
│  │  └─ migrations/
│  │
│  └─ test.ts
│
├─ example/
│  ├─ convex/
│  │  ├─ convex.config.ts
│  │  ├─ orders.ts
│  │  ├─ inventory.ts
│  │  └─ model/
│  └─ ...
│
├─ test/
│  ├─ domain/
│  ├─ replay/
│  ├─ component/
│  ├─ native/
│  ├─ e2e/
│  ├─ types/
│  └─ consumers/
│     ├─ esm-nodenext/
│     ├─ cjs-nodenext/
│     └─ bundler/
│
├─ scripts/
│  ├─ native-test-harness.mjs
│  ├─ check-package.mjs
│  └─ benchmark-orders.mjs
│
└─ .github/
   └─ workflows/
      ├─ ci.yml
      ├─ native.yml
      └─ publish.yml
```

For a genuine Convex Component package, staying close to the official template's `src/component`, `src/client`, `/test`, example-app, codegen-first structure minimizes custom packaging machinery. Convex explicitly recommends testing the bundled package through an example application and documents the required component package entry points. [docs.convex.dev](https://docs.convex.dev/components/authoring)

For your specific architecture, however, I would **not implement every directory above on day one**. The staged implementation should mirror the design document:

text

```text
First:
  core event/decider types
  Orders context
  Inventory context
  one parent PlaceOrder use case
  event journals
  current state
  essential read model
  rebuild
  idempotency where actually needed
  native acceptance tests

Then, only when triggered:
  obligations
  external handlers
  workflow
  ordered consumers
  advanced rebuild protocols
```

That keeps the platform aligned with the strongest sentence in the current design: _asynchrony follows a concrete need to defer work_. \[missing source 1\]

The first experiment should therefore be **Orders + Inventory**, not a generic event framework demonstration. Implement:

text

```text
PlaceOrder
  authenticate tenant/actor
  validate request
  decide Order events
  allocate Inventory
  fold and persist both contexts
  append both journals
  update essential Order summary
  commit once

One second lifecycle command
  e.g. CancelOrder

Queries
  order detail
  essential order summary

Operations
  inspect journal
  rebuild order
  rebuild summary
```

Then benchmark 1-line, 10-line, and maximum-size orders, both uncontended and contended. Prove the Layer 0–2 acceptance cases before introducing the Layer 3 obligation abstraction.

A proposed final public surface for that first generation is intentionally small:

ts

```ts
// @acme/domain-events
export {
  defineEvent,
  defineDecider,
  foldEvents,
} from "./core/index.js";

export type {
  EventEnvelope,
  Decider,
  Decision,
  Applied,
  Rejected,
} from "./core/index.js";
```

ts

```ts
// @acme/domain-events/convex
export {
  executeCommand,
  appendEvents,
  rebuildStream,
  defineReadModel,
} from "./convex/index.js";

export type {
  CommandReceipt,
  StreamVersion,
  OperationMetadata,
} from "./convex/index.js";
```

Only after Layer 3 is justified:

ts

```ts
// @acme/domain-events/convex/durable
export {
  createObligation,
  runObligationAttempt,
  reconcileObligation,
} from "./convex/durable/index.js";

export type {
  Obligation,
  ObligationStatus,
  CompletionEvidence,
  ClassifiedFailure,
} from "./convex/durable/index.js";
```

And only after an actual ordered-consumer need appears:

ts

```ts
// Future optional capability.
import {
  defineOrderedConsumer,
} from "@acme/domain-events/convex/ordered-consumer";
```

That API topology makes **architectural cost visible in imports**. An application that uses only transactional domain behavior never imports, installs, configures, or initializes durable-worker/workflow machinery.

The primary-source catalogue underlying these recommendations is:

| Topic | Primary source |
| --- | --- |
| Node package `"type"`, `"exports"`, conditional exports, dual packages | [Node.js Packages documentation](https://nodejs.org/api/packages.html) [nodejs.org](https://nodejs.org/api/packages.html) |
| Node supported/EOL release lines | [Node.js Releases](https://nodejs.org/en/about/previous-releases) [nodejs.org](https://nodejs.org/en/about/previous-releases?source=post_page---------------------------) |
| TypeScript Node/package module resolution | [TypeScript Modules Reference](https://www.typescriptlang.org/docs/handbook/esm-node.html) [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/esm-node.html) |
| `moduleResolution` choices | [TypeScript `moduleResolution`](https://www.typescriptlang.org/tsconfig/moduleResolution.html) [typescriptlang.org](https://www.typescriptlang.org/tsconfig/moduleResolution) |
| Publishing `.d.ts` files | [TypeScript Declaration Publishing](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html) [typescriptlang.org](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html) |
| TypeScript 7 | [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) [devblogs.microsoft.com](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) |
| esbuild | [esbuild API](https://esbuild.github.io/api/) [esbuild.github.io](https://esbuild.github.io/api/) |
| Rollup | [Rollup](https://rollupjs.org/) [rollupjs.org](https://rollupjs.org/) |
| tsup maintenance status | [tsup repository](https://github.com/egoist/tsup) [github.com](https://github.com/egoist/tsup/blob/main/README.md) |
| npm OIDC/trusted publishing | [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) [docs.npmjs.com](https://docs.npmjs.com/trusted-publishers/) |
| GitHub Node CI matrix | [GitHub Actions: Building and testing Node.js](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) [docs.github.com](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) |
| Convex Components | [Convex Components](https://docs.convex.dev/components) [docs.convex.dev](https://docs.convex.dev/components) |
| Convex Component authoring/package entry points | [Authoring Components](https://docs.convex.dev/components/authoring) [docs.convex.dev](https://docs.convex.dev/components/authoring) |
| Current official Component package template | [Convex template-component package.json](https://github.com/get-convex/templates/blob/main/template-component/package.json) [github.com](https://github.com/get-convex/templates/blob/main/template-component/package.json) |
| Convex OCC/transaction behavior | [Optimistic Concurrency Control](https://docs.convex.dev/database/advanced/occ) [docs.convex.dev](https://docs.convex.dev/database/advanced/occ) |
| Convex scheduled functions | [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) [docs.convex.dev](https://docs.convex.dev/scheduling/scheduled-functions) |
| Convex actions/external I/O | [Actions](https://docs.convex.dev/functions/actions) [docs.convex.dev](https://docs.convex.dev/functions/actions) |
| Convex realtime subscriptions | [Realtime](https://docs.convex.dev/realtime) [docs.convex.dev](https://docs.convex.dev/realtime) |
| `convex-test` | [Convex `convex-test`](https://docs.convex.dev/testing/convex-test) [docs.convex.dev](https://docs.convex.dev/testing/convex-test) |
| Real local-backend testing | [Testing Local Backend](https://docs.convex.dev/testing/convex-backend) [docs.convex.dev](https://docs.convex.dev/testing/convex-backend) |
| Convex local deployments | [Local Deployments](https://docs.convex.dev/cli/local-deployments) [docs.convex.dev](https://docs.convex.dev/cli/local-deployments) |
| Package type-resolution verification | [AreTheTypesWrong CLI](https://github.com/arethetypeswrong/arethetypeswrong.github.io/tree/main/packages/cli) [github.com](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/packages/cli/README.md) |
| Vitest type testing | [Vitest `expectTypeOf`](https://vitest.dev/api/expect-typeof) [vitest.dev](https://vitest.dev/api/expect-typeof) |

The resulting architecture is deliberately less "event infrastructure" than many event-driven libraries. That is a feature. Convex already supplies transactional execution, reactive synchronization, scheduling, components, and a real local backend; the library should add only the domain semantics those primitives do not provide. [docs.convex.dev](https://docs.convex.dev/components/understanding) The highest-value library contracts are therefore **deterministic decision/evolution, event and stream identity, transactional persistence, explicit authority, replay/rebuild, scoped idempotency, and—only once needed—durable obligations with honest external-effect semantics**. This preserves the design goal that adding domain sophistication should not automatically add infrastructure.