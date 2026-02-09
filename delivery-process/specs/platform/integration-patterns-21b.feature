@libar-docs
@libar-docs-release:v0.2.0
@libar-docs-pattern:IntegrationPatterns21b
@libar-docs-status:roadmap
@libar-docs-phase:21
@libar-docs-effort:1w
@libar-docs-product-area:Platform
@libar-docs-depends-on:IntegrationPatterns21a
@libar-docs-executable-specs:platform-core/tests/features/behavior/integration
Feature: Integration Patterns (21b) - Schema Evolution & Contract Testing

  **Problem:** Schema evolution breaks consumers. No tooling validates producer-consumer
  compatibility, leading to runtime failures and integration bugs.

  **Solution:** Schema evolution and contract testing patterns:
  - **Upcasters/Downcasters** — Migrate events between schema versions
  - **Contract Testing** — Validate producer-consumer compatibility
  - **Violation Detection** — Detect and report contract violations (ties to Phase 18)

  **Why It Matters for Convex-Native ES:**
  | Benefit | How |
  | Evolution safety | Upcasters migrate historical events automatically |
  | Consumer protection | Downcasters support old consumers with new events |
  | Early detection | Contract tests catch mismatches before production |
  | Observability | Violation detection integrates with Phase 18 metrics |

  **Key Concepts:**
  | Concept | Description | Example |
  | Upcaster | Migrates old schema to new | V1→V2 adds default unit |
  | Downcaster | Transforms new schema for old consumers | V2→V1 strips new fields |
  | Contract Test | Validates schema compatibility | Producer emits valid V1 |
  | Contract Sample | Generated test data from schema | createContractSample('EntityCreatedV1') |
  | Violation Detection | Detects mismatches at runtime | Schema mismatch metrics |

  **Relationship to Phase 21a:** Depends on IntegrationPatterns21a for Published Language registry.

  **Relationship to Phase 18:** Contract violation detection uses Phase 18 metrics infrastructure.
  Interface is stubbed until Phase 18 provides implementation.

  Background: Deliverables
    Given the following deliverables:
      | Deliverable | Status | Location | Tests | Test Type |
      | Upcaster implementation | pending | @libar-dev/platform-core/src/integration/versioning.ts | Yes | unit |
      | Downcaster implementation | pending | @libar-dev/platform-core/src/integration/versioning.ts | Yes | unit |
      | Migration path validation | pending | @libar-dev/platform-core/src/integration/versioning.ts | Yes | unit |
      | Contract sample generation | pending | @libar-dev/platform-core/src/integration/testing/samples.ts | Yes | unit |
      | Producer contract tests | pending | @libar-dev/platform-core/src/integration/testing/producer.ts | Yes | unit |
      | Consumer contract tests | pending | @libar-dev/platform-core/src/integration/testing/consumer.ts | Yes | unit |
      | Compatibility verification | pending | @libar-dev/platform-core/src/integration/testing/compatibility.ts | Yes | unit |
      | Contract violation detection | pending | @libar-dev/platform-core/src/integration/testing/violations.ts | Yes | unit |

  # ============================================================================
  # RULE 4: Schema Versioning Enables Evolution
  # ============================================================================

  Rule: Schema versioning enables evolution

    Old consumers continue working when schemas evolve through upcasting and downcasting.

    **Version Migration (Upcasting):**
    """typescript
    // V1 schema (original)
    const EntityCreatedV1 = { entityId, principalId, entries };

    // V2 schema (added unit)
    const EntityCreatedV2 = { entityId, principalId, entries, unit };

    // Upcaster: V1 → V2 (add default)
    const upcastV1toV2 = (v1) => ({
      ...v1,
      unit: 'USD',  // Default for legacy events
    });

    // Downcaster: V2 → V1 (for old consumers)
    const downcastV2toV1 = (v2) => {
      const { unit, ...rest } = v2;
      return rest;  // Strip new field
    };
    """

    **Chain Migration:**
    """typescript
    // For V1 → V3, chain through V2
    const migrationPath = getMigrationPath('EntityCreated', '1.0.0', '3.0.0');
    // Returns: ['1.0.0', '2.0.0', '3.0.0']

    const v3Event = upcast('EntityCreated', v1Event, '1.0.0', '3.0.0');
    // Automatically chains V1→V2→V3 upcasters
    """

    @acceptance-criteria @happy-path
    Scenario: V1 consumer receives V2 event
      Given a consumer expecting EntityCreatedV1
      And producer emits EntityCreatedV2
      When event is delivered
      Then downcaster should transform to V1 format
      And consumer should process successfully

    @acceptance-criteria @happy-path
    Scenario: Upcast historical events
      Given historical events stored as V1
      When loading events for V2 consumer
      Then all events are upcasted to V2
      And default values are applied for missing fields

    @acceptance-criteria @happy-path
    Scenario: Chain upcasters for multi-version migration
      Given versions V1, V2, V3 with upcasters V1→V2 and V2→V3
      When I upcast a V1 event to V3
      Then both upcasters are applied in sequence
      And final result is valid V3

    @acceptance-criteria @happy-path
    Scenario: Upcast adds computed field
      Given V1 has { entries } array
      And V2 adds computed { entryCount }
      When upcasting V1 to V2
      Then entryCount equals entries.length

    @acceptance-criteria @validation
    Scenario: Incompatible schema change is rejected
      Given a V3 schema with breaking changes
      And no migration path from V2
      When attempting to register V3
      Then registration fails with code "NO_MIGRATION_PATH"

    @acceptance-criteria @validation
    Scenario: Breaking change without migration
      Given V2 removes required V1 field "entityId"
      When attempting to register V2 as backwardCompatible with V1
      Then an error is thrown with code "BREAKING_CHANGE"
      And error suggests registering migration function

  # ============================================================================
  # RULE 5: Contract Tests Validate Integration
  # ============================================================================

  Rule: Contract tests validate integration

    Producer and consumer contracts are tested independently.
    Violation detection integrates with Phase 18 metrics.

    **Contract Testing Pattern:**
    """typescript
    // Producer contract test
    describe('ProducerContext BC - Producer Contract', () => {
      it('emits valid EntityCreatedV1 events', async () => {
        const event = await produceEntityCreatedEvent();
        const result = EntityCreatedV1.safeParse(event.payload);
        expect(result.success).toBe(true);
      });
    });

    // Consumer contract test
    describe('DownstreamContext BC - Consumer Contract', () => {
      it('accepts valid EntityCreatedV1 events', async () => {
        const event = createContractSample('EntityCreatedV1');
        const result = await downstreamHandler.handle(event);
        expect(result.status).toBe('processed');
      });
    });
    """

    **Violation Detection (Phase 18 integration):**
    """typescript
    // ContractMetrics interface (stubbed until Phase 18)
    interface ContractMetrics {
      recordViolation(violation: ContractViolation): void;
      getViolations(since?: number): ContractViolation[];
    }

    interface ContractViolation {
      eventType: string;
      producerVersion: string;
      consumerExpectedVersion: string;
      timestamp: number;
      details: string;
    }
    """

    @acceptance-criteria @happy-path
    Scenario: Contract test validates schema compatibility
      Given EntityCreatedV1 contract
      When running contract tests
      Then producer should emit valid V1 events
      And consumer should accept valid V1 events

    @acceptance-criteria @happy-path
    Scenario: Contract sample generation
      Given a registered schema "EntityCreatedV1"
      When I call createContractSample('EntityCreatedV1')
      Then a valid sample event is generated
      And it passes schema validation

    @acceptance-criteria @happy-path
    Scenario: Generate multiple unique samples
      Given a registered schema "EntityCreatedV1"
      When I call createContractSamples('EntityCreatedV1', 10)
      Then I receive 10 unique sample events
      And all pass schema validation

    @acceptance-criteria @happy-path
    Scenario: Producer contract test utility
      Given a producer function that creates EntityCreated events
      When I run createProducerContractTest('EntityCreatedV1', producer)
      Then test passes when producer emits valid V1 events

    @acceptance-criteria @happy-path
    Scenario: Consumer contract test utility
      Given a consumer handler for EntityCreated
      When I run createConsumerContractTest('EntityCreatedV1', consumer)
      Then test passes when consumer processes sample events

    @acceptance-criteria @happy-path
    Scenario: Compatible producer and consumer verified
      Given producer emitting EntityCreatedV1
      And consumer expecting EntityCreatedV1
      When I run verifyContractCompatibility(producer, consumer, 'EntityCreatedV1')
      Then verification passes

    @acceptance-criteria @happy-path
    Scenario: Compatible with downcaster
      Given producer emitting EntityCreatedV2
      And consumer expecting EntityCreatedV1
      And downcaster V2 → V1 is registered
      When I run verifyContractCompatibility(producer, consumer)
      Then verification passes

    @acceptance-criteria @validation
    Scenario: Detect producer-consumer mismatch
      Given producer emitting EntityCreatedV2
      And consumer expecting EntityCreatedV1
      And no downcaster registered
      When running contract tests
      Then test fails with "SCHEMA_MISMATCH"
      And suggested fix mentions "register downcaster"

    @acceptance-criteria @happy-path
    Scenario: Contract violation is recorded
      Given a schema mismatch detected at runtime
      When violation detection processes the mismatch
      Then a ContractViolation is created
      And it includes eventType, versions, and timestamp
      And it is passed to ContractMetrics.recordViolation()

    @acceptance-criteria @edge-case
    Scenario: Contract violations are queryable
      Given multiple contract violations have been recorded
      When I call contractMetrics.getViolations(since: oneHourAgo)
      Then I receive violations from the last hour
      And they are sorted by timestamp descending
