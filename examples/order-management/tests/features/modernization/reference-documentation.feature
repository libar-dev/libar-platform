@libar-docs-phase:23
@libar-docs-product-area:ExampleApp
@libar-docs-pattern:ExampleAppModernization
@libar-docs-status:completed
@acceptance-criteria
Feature: Reference Implementation Documentation

  As a platform user
  I want clear documentation designating this as a reference implementation
  So that I understand its purpose and how to learn from it

  Background: Documentation context
    Given the example app README exists at "examples/order-management/README.md"

  # ============================================================================
  # Happy Path
  # ============================================================================

  Rule: README documents the app as a Reference Implementation

    @happy-path
    Scenario: README has Reference Implementation designation
      Given the example app README
      When reading the document header
      Then it should have a clear "Reference Implementation" badge or heading
      And the purpose section should explain:
        """
        This is a reference implementation for learning the @libar-dev platform.
        It is not intended for production use.
        """

    @happy-path
    Scenario: All demonstrated patterns are cataloged
      Given the "Patterns Demonstrated" section in README
      Then it should list the following patterns:
        | Pattern | Phase | Has Code Link | Has Doc Link |
        | CMS Dual-Write | 02 | Yes | Yes |
        | Pure Deciders | 14 | Yes | Yes |
        | Projection Categories | 15 | Yes | Yes |
        | DCB | 16 | Yes | Yes |
        | Reactive Projections | 17 | Yes | Yes |
        | Fat Events | 20 | Yes | Yes |
        | Reservation Pattern | 20 | Yes | Yes |

  # ============================================================================
  # Validation
  # ============================================================================

    @validation
    Scenario: Pattern links are valid
      Given each pattern in the catalog has a code location link
      When validating the links
      Then all code links should point to existing files
      And all documentation links should be valid

    @validation
    Scenario: Architecture diagram is present
      Given the README
      When looking for the Architecture Diagram section
      Then it should include a visual diagram (Mermaid or image)
      And the diagram should show Orders BC and Inventory BC
      And the diagram should indicate where each platform pattern is used
