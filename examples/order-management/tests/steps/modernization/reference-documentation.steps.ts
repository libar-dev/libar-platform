/**
 * Reference Implementation Documentation - Step Definitions
 *
 * @libar-docs
 * @libar-docs-implements ExampleAppModernization
 * @libar-docs-phase 23
 *
 * These tests verify the README.md structure and link validity:
 * - Reference Implementation designation is present
 * - All 7 platform patterns are cataloged with links
 * - All code links point to existing files
 * - All documentation links are valid
 * - Architecture diagram shows both BCs
 *
 * @since Phase 23 (Example App Modernization - Rule 4)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Constants
// ============================================================================

const EXAMPLE_APP_ROOT = path.resolve(__dirname, "../../..");
const README_PATH = path.join(EXAMPLE_APP_ROOT, "README.md");

// Expected patterns from the feature spec
const EXPECTED_PATTERNS = [
  { pattern: "CMS Dual-Write", phase: "02" },
  { pattern: "Pure Deciders", phase: "14" },
  { pattern: "Projection Categories", phase: "15" },
  { pattern: "DCB", phase: "16" },
  { pattern: "Reactive Projections", phase: "17" },
  { pattern: "Fat Events", phase: "20" },
  { pattern: "Reservation Pattern", phase: "20" },
] as const;

// ============================================================================
// Test Types
// ============================================================================

interface TestState {
  readmeContent: string | null;
  readmeExists: boolean;
  patternsSection: string | null;
  architectureSection: string | null;
  extractedPatterns: PatternRow[];
  linkValidationResults: LinkValidationResult[];
  error: Error | null;
}

interface PatternRow {
  pattern: string;
  phase: string;
  codeLink: string | null;
  docLink: string | null;
}

interface LinkValidationResult {
  link: string;
  type: "code" | "doc";
  exists: boolean;
  resolvedPath: string;
}

// ============================================================================
// Test State
// ============================================================================

let state: TestState | null = null;

function resetState(): void {
  state = {
    readmeContent: null,
    readmeExists: false,
    patternsSection: null,
    architectureSection: null,
    extractedPatterns: [],
    linkValidationResults: [],
    error: null,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the patterns table from README content
 */
function extractPatternsTable(content: string): PatternRow[] {
  const patterns: PatternRow[] = [];

  // Find the "Patterns Demonstrated" section
  const patternsSectionMatch = content.match(
    /## Patterns Demonstrated\s*\n([\s\S]*?)(?=\n## |\n---|$)/
  );
  if (!patternsSectionMatch) return patterns;

  const section = patternsSectionMatch[1];

  // Parse markdown table rows
  // Format: | Pattern | Phase | Code | Documentation |
  const tableRowRegex =
    /\|\s*([^|]+)\s*\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|/g;

  let match;
  while ((match = tableRowRegex.exec(section)) !== null) {
    patterns.push({
      pattern: match[1].trim(),
      phase: match[2].trim(),
      codeLink: match[4].trim(),
      docLink: match[6].trim(),
    });
  }

  return patterns;
}

/**
 * Validate that a relative link points to an existing file
 */
function validateLink(link: string, basePath: string, type: "code" | "doc"): LinkValidationResult {
  // Handle anchor links (e.g., ./CLAUDE.md#section)
  const linkWithoutAnchor = link.split("#")[0];

  // Resolve relative path
  const resolvedPath = path.resolve(path.dirname(basePath), linkWithoutAnchor);

  return {
    link,
    type,
    exists: fs.existsSync(resolvedPath),
    resolvedPath,
  };
}

/**
 * Extract the Architecture section content
 */
function extractArchitectureSection(content: string): string | null {
  const match = content.match(/## Architecture(?: Diagram)?\s*\n([\s\S]*?)(?=\n## |$)/);
  return match ? match[1] : null;
}

// ============================================================================
// Feature Test
// ============================================================================

const feature = await loadFeature("tests/features/modernization/reference-documentation.feature");

describeFeature(feature, ({ Background, Rule, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  Background(({ Given }) => {
    Given("the example app README exists at {string}", (_ctx: unknown, expectedPath: string) => {
      resetState();

      // Verify path matches
      const normalizedExpected = expectedPath.replace(/^examples\//, "");
      expect(README_PATH).toContain(normalizedExpected.replace(/^order-management\//, ""));

      // Check if file exists
      state!.readmeExists = fs.existsSync(README_PATH);
      if (state!.readmeExists) {
        state!.readmeContent = fs.readFileSync(README_PATH, "utf-8");
      }
    });
  });

  Rule("README documents the app as a Reference Implementation", ({ RuleScenario }) => {
    // ========================================================================
    // Scenario: README has Reference Implementation designation
    // ========================================================================
    RuleScenario(
      "README has Reference Implementation designation",
      ({ Given, When, Then, And }) => {
        Given("the example app README", () => {
          expect(state!.readmeExists).toBe(true);
          expect(state!.readmeContent).not.toBeNull();
        });

        When("reading the document header", () => {
          // Header is the first ~500 chars
          const header = state!.readmeContent!.substring(0, 500);
          expect(header).toBeDefined();
        });

        Then('it should have a clear "Reference Implementation" badge or heading', () => {
          const content = state!.readmeContent!;
          // Check for "Reference Implementation" in header area
          const headerArea = content.substring(0, 500).toLowerCase();
          expect(headerArea).toContain("reference implementation");
        });

        And("the purpose section should explain:", (_ctx: unknown, _docString: string) => {
          const content = state!.readmeContent!.toLowerCase();

          // The docstring says:
          // "This is a reference implementation for learning the @libar-dev platform."
          // "It is not intended for production use."
          // We verify the essence is captured (exact wording may differ)

          // Check for "learning" or "platform development" context
          const hasLearningPurpose =
            content.includes("learning") ||
            content.includes("platform development") ||
            content.includes("serve platform");

          // Check for "not production" context
          const hasNotProduction =
            content.includes("not a production") ||
            content.includes("not intended for production") ||
            content.includes("not production");

          expect(hasLearningPurpose).toBe(true);
          expect(hasNotProduction).toBe(true);
        });
      }
    );

    // ========================================================================
    // Scenario: All demonstrated patterns are cataloged
    // ========================================================================
    RuleScenario("All demonstrated patterns are cataloged", ({ Given, Then }) => {
      Given('the "Patterns Demonstrated" section in README', () => {
        expect(state!.readmeExists).toBe(true);
        state!.patternsSection = state!.readmeContent!;
        state!.extractedPatterns = extractPatternsTable(state!.readmeContent!);
      });

      Then(
        "it should list the following patterns:",
        (
          _ctx: unknown,
          dataTable: {
            Pattern: string;
            Phase: string;
            "Has Code Link": string;
            "Has Doc Link": string;
          }[]
        ) => {
          // Verify we have the expected number of patterns
          expect(state!.extractedPatterns.length).toBe(EXPECTED_PATTERNS.length);

          // Verify each expected pattern is present
          for (const expected of dataTable) {
            const found = state!.extractedPatterns.find(
              (p) => p.pattern === expected.Pattern && p.phase === expected.Phase
            );

            expect(
              found,
              `Pattern "${expected.Pattern}" (Phase ${expected.Phase}) not found`
            ).toBeDefined();

            if (expected["Has Code Link"] === "Yes") {
              expect(found!.codeLink, `${expected.Pattern} should have code link`).not.toBeNull();
            }
            if (expected["Has Doc Link"] === "Yes") {
              expect(found!.docLink, `${expected.Pattern} should have doc link`).not.toBeNull();
            }
          }
        }
      );
    });

    // ========================================================================
    // Scenario: Pattern links are valid
    // ========================================================================
    RuleScenario("Pattern links are valid", ({ Given, When, Then, And }) => {
      Given("each pattern in the catalog has a code location link", () => {
        expect(state!.readmeExists).toBe(true);
        state!.extractedPatterns = extractPatternsTable(state!.readmeContent!);

        // Verify each pattern has a code link
        for (const pattern of state!.extractedPatterns) {
          expect(pattern.codeLink, `${pattern.pattern} missing code link`).not.toBeNull();
        }
      });

      When("validating the links", () => {
        state!.linkValidationResults = [];

        for (const pattern of state!.extractedPatterns) {
          if (pattern.codeLink) {
            state!.linkValidationResults.push(validateLink(pattern.codeLink, README_PATH, "code"));
          }
          if (pattern.docLink) {
            state!.linkValidationResults.push(validateLink(pattern.docLink, README_PATH, "doc"));
          }
        }
      });

      Then("all code links should point to existing files", () => {
        const codeLinks = state!.linkValidationResults.filter((r) => r.type === "code");

        for (const result of codeLinks) {
          expect(
            result.exists,
            `Code link not found: ${result.link} → ${result.resolvedPath}`
          ).toBe(true);
        }
      });

      And("all documentation links should be valid", () => {
        const docLinks = state!.linkValidationResults.filter((r) => r.type === "doc");

        for (const result of docLinks) {
          expect(result.exists, `Doc link not found: ${result.link} → ${result.resolvedPath}`).toBe(
            true
          );
        }
      });
    });

    // ========================================================================
    // Scenario: Architecture diagram is present
    // ========================================================================
    RuleScenario("Architecture diagram is present", ({ Given, When, Then, And }) => {
      Given("the README", () => {
        expect(state!.readmeExists).toBe(true);
        expect(state!.readmeContent).not.toBeNull();
      });

      When("looking for the Architecture Diagram section", () => {
        state!.architectureSection = extractArchitectureSection(state!.readmeContent!);
      });

      Then("it should include a visual diagram (Mermaid or image)", () => {
        expect(state!.architectureSection).not.toBeNull();

        // Check for Mermaid diagram or image
        const hasMermaid =
          state!.architectureSection!.includes("```mermaid") ||
          state!.architectureSection!.includes("graph ");
        const hasImage =
          state!.architectureSection!.includes("![") ||
          state!.architectureSection!.includes("<img");

        expect(
          hasMermaid || hasImage,
          "Architecture section should contain a Mermaid diagram or image"
        ).toBe(true);
      });

      And("the diagram should show Orders BC and Inventory BC", () => {
        const section = state!.architectureSection!.toLowerCase();

        expect(section).toContain("orders");
        expect(section).toContain("inventory");
        // Check for "BC" or "bounded context" indication
        expect(section.includes("bc") || section.includes("bounded")).toBe(true);
      });

      And("the diagram should indicate where each platform pattern is used", () => {
        const section = state!.architectureSection!.toLowerCase();

        // Check that key patterns are mentioned in the architecture section
        // (either in diagram text or in explanatory text)
        const mentionedPatterns = [
          "decider",
          "dual-write",
          "dcb",
          "projection",
          "fat events",
          "reservation",
        ];

        const mentionCount = mentionedPatterns.filter((p) => section.includes(p)).length;

        // At least 4 of the key patterns should be mentioned
        expect(
          mentionCount,
          `Only ${mentionCount} patterns mentioned in architecture section`
        ).toBeGreaterThanOrEqual(4);
      });
    });
  });
});
