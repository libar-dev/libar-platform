@libar-docs
@libar-docs-adr:008
@libar-docs-adr-status:accepted
@libar-docs-adr-category:architecture
@libar-docs-pattern:PDR008ExampleAppPurpose
@libar-docs-status:completed
@libar-docs-completed:2026-01-18
@libar-docs-release:v0.2.0
@libar-docs-phase:23
@libar-docs-quarter:Q1-2026
@libar-docs-effort:30m
Feature: PDR-008 Example App Purpose and Guidelines

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | Guidelines documented | Complete | ADR-008 in docs-living/decisions/ |
      | Freeze policy removed | Complete | Removed from example-app-modernization.feature |

  Rule: Context - Unclear purpose created scope creep risk

    The example app needs clear guidelines about its purpose. It was unclear whether:
    - Features should mirror production requirements
    - Implementation should prioritize completeness vs demonstration value
    - New functionality should be added based on business needs or platform needs

    The previous "freeze policy" approach was overly prescriptive, defining explicit
    allowed/prohibited change categories. A better approach is to articulate the
    fundamental purpose that guides all decisions.

  Rule: Decision - Example app serves platform development

    The example app exists to **serve platform development**, not as a standalone product.

    Guiding Principles:

    | Principle | Description |
    |-----------|-------------|
    | Development Aid | Consumer for platform development and testing, not a production app |
    | Reference-Grade | Best possible architecture to demonstrate and test platform capabilities |
    | Platform-Driven | Features selected to serve platform development needs |

    The example app is:
    - A development aid and testing consumer for the platform
    - A reference implementation demonstrating platform capabilities
    - The primary vehicle for validating platform patterns work in realistic scenarios

    Implementation priorities:

    | Priority | Focus |
    |----------|-------|
    | 1 | Demonstrate platform capabilities with reference-grade code |
    | 2 | Provide realistic test scenarios for platform development |
    | 3 | Serve as living documentation through working examples |

    Decision criteria for changes:

    | Question | If Yes | If No |
    |----------|--------|-------|
    | Does this demonstrate a platform capability? | Likely appropriate | Likely not |
    | Does this help test/validate platform features? | Likely appropriate | Likely not |
    | Is this needed for platform development? | Appropriate | Evaluate more |
    | Is this a business feature unrelated to platform? | Not appropriate | - |

    @acceptance-criteria
    Scenario: Evaluating a platform demonstration change
      Given a proposed change to add DCB multi-product reservation
      When evaluating against the guidelines
      Then it should be approved because it demonstrates DCB pattern

    @acceptance-criteria
    Scenario: Evaluating a business feature change
      Given a proposed change to add discount code system
      When evaluating against the guidelines
      Then it should be rejected as business feature unrelated to platform

    @acceptance-criteria
    Scenario: Evaluating an uncertain change
      Given a proposed change to add a new bounded context
      When evaluating against the guidelines
      Then it should be evaluated based on whether it demonstrates integration patterns

  Rule: Consequences - Simpler guidelines than freeze policy

    Positive outcomes:
    - Clear decision criteria for example app changes
    - Focus remains on platform value, not example app features
    - Prevents scope creep into business logic unrelated to platform
    - Simpler than explicit allowed/prohibited lists

    Negative outcomes:
    - Example app may not represent a "complete" order management system
    - Some realistic business scenarios may be simplified for demonstration purposes
    - Judgment required (vs prescriptive rules)

  # Examples for reference:
  #
  # Appropriate changes:
  # - Add DCB multi-product reservation (demonstrates DCB pattern)
  # - Add reactive projection for order detail (demonstrates ReactiveProjections)
  # - Fix broken test (maintains working reference)
  # - Update to new platform API (keeps compatible with platform)
  #
  # Inappropriate changes:
  # - Add discount code system (business feature unrelated to platform)
  # - Add complex validation rules (expanding domain logic unnecessarily)
