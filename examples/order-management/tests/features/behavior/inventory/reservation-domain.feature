@unit @domain @inventory @reservation
Feature: Reservation Domain Functions

  As a developer working with the inventory context
  I want pure reservation domain functions to behave correctly
  So that reservation CMS state is managed reliably

  These are pure unit tests for reservation domain helper functions:
  calculateReservationItemCount, calculateTotalReservedQuantity,
  createInitialReservationCMS, isReservationExpired, and upcastReservationCMS.

  # ============================================================================
  # Item Count Calculation
  # ============================================================================

  Rule: calculateReservationItemCount returns the number of line items

    **Invariant:** Item count equals the length of the items array
    **Rationale:** Used to display reservation summary information
    **Verified by:** Single item count, Multiple items count, Empty items count

    @acceptance-criteria @happy-path
    Scenario: Single item reservation returns count of 1
      Given a reservation with 1 item
      When I calculate the reservation item count
      Then the item count is 1

    Scenario: Multiple items reservation returns correct count
      Given a reservation with 3 items
      When I calculate the reservation item count
      Then the item count is 3

    @acceptance-criteria @validation
    Scenario: Empty items reservation returns count of 0
      Given a reservation with 0 items
      When I calculate the reservation item count
      Then the item count is 0

  # ============================================================================
  # Total Reserved Quantity Calculation
  # ============================================================================

  Rule: calculateTotalReservedQuantity sums all item quantities

    **Invariant:** Total quantity equals the sum of all individual item quantities
    **Rationale:** Used to determine total stock impact of a reservation
    **Verified by:** Sum of multiple items, Single item quantity, Empty items quantity

    @acceptance-criteria @happy-path
    Scenario: Multiple items returns sum of all quantities
      Given reservation items with quantities 5, 3, and 10
      When I calculate the total reserved quantity
      Then the total reserved quantity is 18

    Scenario: Single item returns its quantity
      Given reservation items with quantity 7
      When I calculate the total reserved quantity
      Then the total reserved quantity is 7

    @acceptance-criteria @validation
    Scenario: Empty items returns 0
      Given no reservation items
      When I calculate the total reserved quantity
      Then the total reserved quantity is 0

  # ============================================================================
  # Initial CMS Creation
  # ============================================================================

  Rule: createInitialReservationCMS produces a valid initial state

    **Invariant:** New CMS has pending status, correct version, and valid timestamps
    **Rationale:** Ensures consistent initial state for all new reservations
    **Verified by:** Correct IDs, Items initialization, Pending status, Default TTL expiry, Custom TTL expiry, Version initialization, State version, Timestamps

    @acceptance-criteria @happy-path
    Scenario: Creates CMS with correct reservationId and orderId
      Given reservation ID "res_123" and order ID "ord_456"
      When I create an initial reservation CMS with 1 item
      Then the CMS has the following properties:
        | property      | value   |
        | reservationId | res_123 |
        | orderId       | ord_456 |

    Scenario: Initializes items array correctly
      Given reservation ID "res_123" and order ID "ord_456"
      When I create an initial reservation CMS with 2 items
      Then the CMS items array has length 2
      And the CMS items match the input items

    Scenario: Sets status to pending
      Given reservation ID "res_123" and order ID "ord_456"
      When I create an initial reservation CMS with 1 item
      Then the CMS status is "pending"

    Scenario: Sets expiresAt with default TTL
      Given reservation ID "res_123" and order ID "ord_456"
      And the current timestamp is captured
      When I create an initial reservation CMS with 1 item using default TTL
      Then the CMS expiresAt is approximately now plus the default TTL

    Scenario: Supports custom TTL
      Given reservation ID "res_123" and order ID "ord_456"
      And the current timestamp is captured
      When I create an initial reservation CMS with 1 item using custom TTL of 1800000 ms
      Then the CMS expiresAt is approximately now plus 1800000 ms

    Scenario: Initializes version to 0
      Given reservation ID "res_123" and order ID "ord_456"
      When I create an initial reservation CMS with 1 item
      Then the CMS version is 0

    Scenario: Initializes with current state version
      Given reservation ID "res_123" and order ID "ord_456"
      When I create an initial reservation CMS with 1 item
      Then the CMS stateVersion equals the current reservation CMS version constant

    Scenario: Sets createdAt and updatedAt to current timestamp
      Given reservation ID "res_123" and order ID "ord_456"
      And the current timestamp is captured
      When I create an initial reservation CMS with 1 item
      Then the CMS createdAt is between the before and after timestamps
      And the CMS updatedAt equals createdAt

  # ============================================================================
  # Reservation Expiry Check
  # ============================================================================

  Rule: isReservationExpired checks pending reservations against current time

    **Invariant:** Only pending reservations with expiresAt < now are considered expired
    **Rationale:** Confirmed and released reservations are terminal states and never expire
    **Verified by:** Not expired, Expired, Confirmed ignores expiry, Released ignores expiry, Exact boundary

    @acceptance-criteria @happy-path
    Scenario: Returns false when reservation has not expired
      Given a pending reservation expiring 1 hour in the future
      When I check if the reservation is expired
      Then the reservation is not expired

    Scenario: Returns true when reservation has expired
      Given a pending reservation that expired 1 second ago
      When I check if the reservation is expired
      Then the reservation is expired

    @acceptance-criteria @validation
    Scenario: Returns false when reservation is confirmed regardless of expiry
      Given a confirmed reservation that expired 1 hour ago
      When I check if the reservation is expired
      Then the reservation is not expired

    Scenario: Returns false when reservation is released regardless of expiry
      Given a released reservation that expired 1 hour ago
      When I check if the reservation is expired
      Then the reservation is not expired

    Scenario: Handles exact expiry boundary correctly
      Given a pending reservation expiring at exactly the current time
      When I check if the reservation is expired
      Then the reservation is not expired
      But when 1 millisecond passes and I check again
      Then the reservation is expired

  # ============================================================================
  # CMS Upcasting
  # ============================================================================

  Rule: upcastReservationCMS migrates old CMS versions to current

    **Invariant:** Upcasted CMS always has stateVersion equal to CURRENT_RESERVATION_CMS_VERSION
    **Rationale:** Ensures backward compatibility when CMS schema evolves
    **Verified by:** Current version unchanged, Missing stateVersion upgraded, Future version rejected, Fields preserved

    @acceptance-criteria @happy-path
    Scenario: Returns unchanged CMS when already at current version
      Given a reservation CMS at the current state version
      When I upcast the reservation CMS
      Then the result equals the original CMS
      And the result stateVersion equals the current version constant

    Scenario: Upgrades CMS with missing stateVersion to current version
      Given a reservation CMS with missing stateVersion
      When I upcast the reservation CMS
      Then the result stateVersion equals the current version constant
      And the result preserves the original reservationId and items

    @acceptance-criteria @validation
    Scenario: Throws error for future versions
      Given a reservation CMS with stateVersion far above current
      When I attempt to upcast the reservation CMS
      Then an error is thrown matching "newer than supported version"

    Scenario: Preserves all fields during upcast
      Given a reservation CMS at state version 0 with specific field values
      When I upcast the reservation CMS
      Then all original fields are preserved in the result:
        | field         | value         |
        | reservationId | res_abc       |
        | orderId       | ord_xyz       |
        | status        | confirmed     |
        | expiresAt     | 8888888888888 |
        | version       | 5             |
        | createdAt     | 5000          |
        | updatedAt     | 6000          |
      And the result items match the original items
