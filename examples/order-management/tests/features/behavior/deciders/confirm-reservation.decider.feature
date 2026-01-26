@deciders @inventory
Feature: Confirm Reservation Decider
  Pure domain logic for confirming a pending reservation.

  The ConfirmReservation decider validates that:
  - Reservation must be in pending status (FSM transition)
  - Reservation must not be expired

  On success, it emits ReservationConfirmed and updates status to "confirmed".

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to confirm a pending reservation
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_001      |
      | orderId        | ord_001      |
      | status         | pending      |
      | expiresIn      | 3600000      |
    When I decide to confirm the reservation
    Then the decision should be "success"
    And the event type should be "ReservationConfirmed"
    And the state update should have status "confirmed"

  @validation
  Scenario: Reject confirm when reservation is already confirmed
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_002      |
      | status         | confirmed    |
    When I decide to confirm the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"

  @validation
  Scenario: Reject confirm when reservation is released
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_003      |
      | status         | released     |
    When I decide to confirm the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"

  @validation
  Scenario: Reject confirm when reservation is expired
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_004      |
      | status         | expired      |
    When I decide to confirm the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"

  @validation
  Scenario: Reject confirm when reservation has passed its expiration time
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_005      |
      | status         | pending      |
      | expiresIn      | -1000        |
    When I decide to confirm the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_EXPIRED"
