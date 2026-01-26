@deciders @inventory
Feature: Release Reservation Decider
  Pure domain logic for releasing a reservation.

  The ReleaseReservation decider validates that:
  - Reservation must be in pending or confirmed status (FSM allows release from both)

  On success, it emits ReservationReleased and updates status to "released".

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to release a pending reservation
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_001      |
      | orderId        | ord_001      |
      | status         | pending      |
    When I decide to release the reservation with reason "Order cancelled"
    Then the decision should be "success"
    And the event type should be "ReservationReleased"
    And the event payload should have reason "Order cancelled"
    And the state update should have status "released"

  @happy-path
  Scenario: Decide to release a confirmed reservation
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_002      |
      | orderId        | ord_002      |
      | status         | confirmed    |
    When I decide to release the reservation with reason "Order cancelled after confirmation"
    Then the decision should be "success"
    And the event type should be "ReservationReleased"
    And the state update should have status "released"

  @validation
  Scenario: Reject release when reservation is already released
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_003      |
      | status         | released     |
    When I decide to release the reservation with reason "Duplicate release"
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"

  @validation
  Scenario: Reject release when reservation is expired
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_004      |
      | status         | expired      |
    When I decide to release the reservation with reason "Too late"
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"
