@deciders @inventory @evolve
Feature: Reservation Evolve Functions
  Pure state transition functions for reservation events.

  These evolve functions apply events to produce new state,
  enabling deterministic event replay and projection rebuilding.

  Background:
    Given a decider context

  # ==========================================================================
  # ReservationConfirmed Event
  # ==========================================================================

  @evolve
  Scenario: Evolve reservation state with ReservationConfirmed
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_001      |
      | orderId        | ord_001      |
      | status         | pending      |
    When I evolve with ReservationConfirmed event
    Then the evolved reservation should have status "confirmed"
    And the evolved reservation should have reservationId "res_001"

  # ==========================================================================
  # ReservationReleased Event
  # ==========================================================================

  @evolve
  Scenario: Evolve pending reservation with ReservationReleased
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_002      |
      | status         | pending      |
    When I evolve with ReservationReleased event
    Then the evolved reservation should have status "released"

  @evolve
  Scenario: Evolve confirmed reservation with ReservationReleased
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_003      |
      | status         | confirmed    |
    When I evolve with ReservationReleased event
    Then the evolved reservation should have status "released"

  # ==========================================================================
  # ReservationExpired Event
  # ==========================================================================

  @evolve
  Scenario: Evolve pending reservation with ReservationExpired
    Given a reservation state:
      | field          | value        |
      | reservationId  | res_004      |
      | status         | pending      |
    When I evolve with ReservationExpired event
    Then the evolved reservation should have status "expired"
