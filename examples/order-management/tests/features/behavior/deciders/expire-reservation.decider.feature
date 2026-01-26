@deciders @inventory
Feature: Expire Reservation Decider
  Pure domain logic for expiring a timed-out reservation.

  The ExpireReservation decider validates that:
  - Reservation must be in pending status (only pending can expire)
  - Reservation expiration time must have passed

  On success, it emits ReservationExpired and updates status to "expired".

  Background:
    Given a decider context

  @happy-path
  Scenario: Decide to expire a pending reservation that has timed out
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_001      |
      | orderId        | ord_001      |
      | status         | pending      |
      | expiresIn      | -1000        |
    When I decide to expire the reservation
    Then the decision should be "success"
    And the event type should be "ReservationExpired"
    And the state update should have status "expired"

  @validation
  Scenario: Reject expire when reservation has not timed out yet
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_002      |
      | status         | pending      |
      | expiresIn      | 3600000      |
    When I decide to expire the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_EXPIRED"

  @validation
  Scenario: Reject expire when reservation is already confirmed
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_003      |
      | status         | confirmed    |
    When I decide to expire the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"

  @validation
  Scenario: Reject expire when reservation is already released
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_004      |
      | status         | released     |
    When I decide to expire the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"

  @validation
  Scenario: Reject expire when reservation is already expired
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_005      |
      | status         | expired      |
    When I decide to expire the reservation
    Then the decision should be "rejected"
    And the rejection code should be "RESERVATION_NOT_PENDING"
