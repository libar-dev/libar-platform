@architect
@architect-adr:022
@architect-adr-status:accepted
@architect-adr-category:process
@architect-pattern:PDR022ValueTransferDoctrineAdoption
@architect-status:completed
@architect-completed:2026-05-08
@architect-release:vNEXT
@architect-quarter:Q2-2026
@architect-product-area:Platform
Feature: PDR-022 Value-Transfer Doctrine Adoption and Naming Contract

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location |
      | In-repo value-transfer doctrine | complete | libar-platform/architect/_shared/value-transfer.md |
      | In-repo annotation ownership doctrine | complete | libar-platform/architect/_shared/annotation-ownership.md |
      | In-repo spec and pattern relationship doctrine | complete | libar-platform/architect/_shared/spec-pattern-relationships.md |
      | In-repo four-tier ladder doctrine | complete | libar-platform/architect/_shared/four-tier-ladder.md |
      | In-repo FSM transitions doctrine | complete | libar-platform/architect/_shared/fsm-transitions.md |
      | Durable naming-contract decision | accepted | libar-platform/architect/decisions/pdr-022-value-transfer-doctrine-adoption.feature |

  Rule: Context - The repo depended on off-branch doctrine and needed a durable local naming contract

    Several live architect sources cited doctrine that existed only in the off-branch
    `architect-studio/.../_shared/` path. That left the repo with two problems.

    1. The guidance was not self-contained inside the sources it governed.
    2. The repo still needed an explicit naming contract for shipped patterns whose executable carriers were created later.

    The main ambiguity was whether a carrier such as `EventStoreFoundationExecutableTests`
    should replace the semantic pattern name `EventStoreFoundation`, or merely carry it.

  Rule: Decision - Keep semantic pattern names bare, reserve `*ExecutableTests` for carriers, and use `@architect-implements` for continuity

    This decision adopts the in-repo doctrine set under `libar-platform/architect/_shared/`
    as the authoritative guidance for value transfer, annotation ownership, pattern-carrier
    relationships, maturity classification, and FSM interpretation.

    Naming contract:

    | Topic | Decision |
    |------|----------|
    | Semantic pattern name | Stays bare, for example `EventStoreFoundation` |
    | Executable carrier name | Uses `*ExecutableTests` only for the artifact, for example `EventStoreFoundationExecutableTests` |
    | Continuity mechanism | `@architect-implements:<Pattern>` links the carrier back to the bare semantic pattern |

    Binding rules:

    1. Bare semantic names remain the canonical names used by roadmap specs, decisions, and graph references.
    2. `*ExecutableTests` is a carrier naming convention only. It does not rename the domain or architectural concept.
    3. `@architect-implements:<Pattern>` is the durable continuity mechanism for shipped patterns whose proving carrier is a later executable feature.
    4. `@architect-pattern` on a carrier names the artifact node that exists in the repo, while `@architect-implements` names the concept that artifact preserves.
    5. Refactoring carve-outs may create `<Pattern>ExecutableTests` carriers for older shipped patterns, but the carve-out must preserve the bare semantic name and explain the provenance honestly.

    @acceptance-criteria
    Scenario: Bare names remain canonical across roadmap and decision sources
      Given a semantic pattern named `EventStoreFoundation`
      When roadmap specs or decisions refer to that pattern
      Then they should use the bare name `EventStoreFoundation`
      And they should not rename the concept to `EventStoreFoundationExecutableTests`

    @acceptance-criteria
    Scenario: ExecutableTests names identify carrier artifacts only
      Given an executable feature created to preserve a shipped pattern
      When it is named in the repo
      Then the carrier may use the suffix `ExecutableTests`
      And that suffix should describe the proving artifact rather than the semantic pattern itself

    @acceptance-criteria
    Scenario: `@architect-implements` carries the continuity edge
      Given a carrier tagged `@architect-pattern:CommandBusFoundationExecutableTests`
      When the repo needs continuity back to the semantic concept
      Then the carrier should include `@architect-implements:CommandBusFoundation`
      And graph consumers should treat that tag as the durable link to the bare pattern name

  Rule: Consequences - Local doctrine becomes auditable and carrier naming stops polluting semantic identity

    Positive outcomes:
    - The repo no longer relies on off-branch doctrine paths for active architect guidance.
    - Bare semantic names stay stable across roadmap specs, decisions, and future graph work.
    - Executable carriers can exist without distorting the meaning of the underlying pattern.

    Negative outcomes:
    - The repo now owns another small doctrine surface that must be maintained with the architect sources.
    - Contributors must learn the difference between artifact names and semantic pattern names instead of treating them as interchangeable.
