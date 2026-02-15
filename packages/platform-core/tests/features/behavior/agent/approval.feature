Feature: Approval Module

  Pure functions for the human-in-loop approval workflow including
  approval determination, authorization checks, status transitions,
  factory functions, type guards, Zod schemas, and timeout helpers.

  Background: Module imported
    Given the module is imported from platform-core

  Rule: Error codes contain all expected entries
    **Invariant:** APPROVAL_ERROR_CODES maps each error name to its string value
    **Verified by:** Scenario asserting all six error codes

    @acceptance-criteria @happy-path
    Scenario: All six error codes are present
      Then APPROVAL_ERROR_CODES contains the following entries:
        | code                       | value                      |
        | APPROVAL_NOT_FOUND         | APPROVAL_NOT_FOUND         |
        | INVALID_STATUS_TRANSITION  | INVALID_STATUS_TRANSITION  |
        | ALREADY_PROCESSED          | ALREADY_PROCESSED          |
        | APPROVAL_EXPIRED           | APPROVAL_EXPIRED           |
        | INVALID_TIMEOUT_FORMAT     | INVALID_TIMEOUT_FORMAT     |
        | UNAUTHORIZED_REVIEWER      | UNAUTHORIZED_REVIEWER      |

  Rule: Status constants define the four approval statuses
    **Invariant:** APPROVAL_STATUSES is a readonly 4-element tuple of pending, approved, rejected, expired
    **Verified by:** Scenarios checking content and length

    Scenario: APPROVAL_STATUSES contains all four statuses in order
      Then APPROVAL_STATUSES equals pending, approved, rejected, expired

    Scenario: APPROVAL_STATUSES is a 4-element array
      Then APPROVAL_STATUSES is an array with 4 elements

  Rule: isApprovalStatus type guard validates status strings
    **Invariant:** Returns true only for the four valid status strings
    **Verified by:** Scenarios covering valid values, invalid strings, and non-string types

    Scenario: Returns true for valid status strings
      Then isApprovalStatus returns true for all valid statuses:
        | value    |
        | pending  |
        | approved |
        | rejected |
        | expired  |

    Scenario: Returns false for invalid strings
      Then isApprovalStatus returns false for invalid values:
        | value    |
        | invalid  |
        | PENDING  |
        | Approved |
        |          |

    Scenario: Returns false for non-string types
      Then isApprovalStatus returns false for non-string types including number, null, undefined, object, and array

  Rule: ApprovalStatusSchema validates with Zod
    **Invariant:** Accepts valid statuses and rejects invalid values
    **Verified by:** Scenarios for valid and invalid inputs

    Scenario: Accepts all four valid statuses
      Then ApprovalStatusSchema accepts all APPROVAL_STATUSES values

    Scenario: Rejects invalid status values
      Then ApprovalStatusSchema rejects invalid values:
        | value    |
        | custom   |
        | PENDING  |
        | Approved |
        |          |

  Rule: PendingApprovalSchema validates approval objects
    **Invariant:** Accepts well-formed approvals and rejects malformed ones
    **Verified by:** Scenarios for valid, missing-field, and invalid-confidence cases

    Scenario: Accepts a valid approval object
      Given a test approval with default values
      Then PendingApprovalSchema accepts the approval

    Scenario: Rejects approval with missing required fields
      Then PendingApprovalSchema rejects an object with only approvalId

    Scenario: Rejects approval with confidence above 1
      Given a test approval with confidence 1.5
      Then PendingApprovalSchema rejects the approval

    Scenario: Rejects approval with negative confidence
      Given a test approval with confidence -0.1
      Then PendingApprovalSchema rejects the approval

  Rule: ApprovalAuthContextSchema validates auth context objects
    **Invariant:** Accepts valid auth contexts, optionally with roles or agentIds
    **Verified by:** Scenarios for plain, with-roles, with-agentIds, and empty-userId cases

    Scenario: Accepts valid auth context with userId only
      Then ApprovalAuthContextSchema accepts a context with userId "user-123"

    Scenario: Accepts auth context with roles
      Then ApprovalAuthContextSchema accepts a context with roles "reviewer" and "admin"

    Scenario: Accepts auth context with agentIds
      Then ApprovalAuthContextSchema accepts a context with agentIds "agent-1" and "agent-2"

    Scenario: Rejects auth context with empty userId
      Then ApprovalAuthContextSchema rejects a context with empty userId

  Rule: parseApprovalTimeout converts duration strings to milliseconds
    **Invariant:** Returns milliseconds for valid Nd/Nh/Nm patterns, null otherwise
    **Verified by:** Scenarios for valid formats, invalid formats, and zero values

    Scenario: Parses valid duration strings
      Then parseApprovalTimeout returns correct milliseconds:
        | input | expected            |
        | 7d    | 604800000           |
        | 24h   | 86400000            |
        | 30m   | 1800000             |
        | 1d    | 86400000            |
        | 1h    | 3600000             |
        | 1m    | 60000               |

    Scenario: Returns null for invalid formats
      Then parseApprovalTimeout returns null for all of:
        | input   |
        | invalid |
        | abc     |
        |         |
        | 24      |
        | h24     |
        | 60s     |

    Scenario: Returns null for zero values
      Then parseApprovalTimeout returns null for all of:
        | input |
        | 0d    |
        | 0h    |
        | 0m    |

  Rule: isValidApprovalTimeout checks format validity
    **Invariant:** Returns true for valid duration formats, false otherwise
    **Verified by:** Scenarios for valid and invalid formats

    Scenario: Returns true for valid timeout formats
      Then isValidApprovalTimeout returns true for:
        | input |
        | 24h   |
        | 7d    |
        | 30m   |

    Scenario: Returns false for invalid timeout formats
      Then isValidApprovalTimeout returns false for:
        | input   |
        | invalid |
        |         |

  Rule: calculateExpirationTime computes expiration from config and requestedAt
    **Invariant:** Adds parsed timeout (or default) to requestedAt
    **Verified by:** Scenarios for explicit, missing, and invalid timeout configs

    Scenario: Uses explicit timeout from config
      Given a config with approvalTimeout "1h" and requestedAt 1000000
      When I calculate the expiration time
      Then the expiration time equals requestedAt plus 3600000

    Scenario: Uses default timeout when not specified
      Given a config with no approvalTimeout and requestedAt 1000000
      When I calculate the expiration time
      Then the expiration time equals requestedAt plus the default timeout

    Scenario: Uses default timeout for invalid format
      Given a config with approvalTimeout "invalid" and requestedAt 1000000
      When I calculate the expiration time
      Then the expiration time equals requestedAt plus the default timeout

  Rule: shouldRequireApproval determines if approval is needed based on confidence
    **Invariant:** Returns true when confidence <= threshold (inclusive boundary)
    **Verified by:** Scenarios covering below, at, and above threshold plus default

    Scenario: Returns true when confidence is below threshold
      Given a config with confidenceThreshold 0.9
      Then shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true

    Scenario: Returns true when confidence equals threshold (inclusive)
      Given a config with confidenceThreshold 0.9
      Then shouldRequireApproval for action "SomeAction" with confidence 0.9 returns true

    Scenario: Returns false when confidence is above threshold
      Given a config with confidenceThreshold 0.9
      Then shouldRequireApproval for action "SomeAction" with confidence 0.95 returns false

    Scenario: Uses default threshold of 0.9 when not specified
      Given a config with no confidenceThreshold
      Then shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true
      And shouldRequireApproval for action "SomeAction" with confidence 0.91 returns false

  Rule: requiresApproval list forces approval regardless of confidence
    **Invariant:** Actions in requiresApproval always return true
    **Verified by:** Scenarios for listed and unlisted actions

    Scenario: Returns true for listed action even with high confidence
      Given a config with confidenceThreshold 0.9 and requiresApproval list "DeleteCustomer,TransferFunds"
      Then shouldRequireApproval for action "DeleteCustomer" with confidence 0.99 returns true
      And shouldRequireApproval for action "TransferFunds" with confidence 1.0 returns true

    Scenario: Returns false for unlisted action with high confidence
      Given a config with confidenceThreshold 0.9 and requiresApproval list "DeleteCustomer"
      Then shouldRequireApproval for action "UpdateCustomer" with confidence 0.95 returns false

  Rule: autoApprove list skips approval regardless of confidence
    **Invariant:** Actions in autoApprove always return false
    **Verified by:** Scenarios for auto-approved actions with low confidence

    Scenario: Returns false for auto-approved action with low confidence
      Given a config with confidenceThreshold 0.9 and autoApprove list "LogEvent,SendNotification"
      Then shouldRequireApproval for action "LogEvent" with confidence 0.1 returns false
      And shouldRequireApproval for action "SendNotification" with confidence 0.5 returns false

    Scenario: autoApprove takes precedence over low confidence
      Given a config with confidenceThreshold 0.9 and autoApprove list "SafeAction"
      Then shouldRequireApproval for action "SafeAction" with confidence 0.1 returns false

  Rule: requiresApproval takes precedence over autoApprove
    **Invariant:** If action is in both lists, requiresApproval wins
    **Verified by:** Scenario with action in both lists

    Scenario: requiresApproval wins when action is in both lists
      Given a config with requiresApproval "ConflictAction" and autoApprove "ConflictAction"
      Then shouldRequireApproval for action "ConflictAction" with confidence 0.99 returns true

  Rule: shouldRequireApproval edge cases
    **Invariant:** Empty or undefined lists fall through to confidence check
    **Verified by:** Scenarios for empty lists, undefined lists, and boundary confidence values

    Scenario: Falls through to confidence check with empty lists
      Given a config with confidenceThreshold 0.9 and empty requiresApproval and autoApprove
      Then shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true
      And shouldRequireApproval for action "SomeAction" with confidence 0.95 returns false

    Scenario: Falls through to confidence check with undefined lists
      Given a config with confidenceThreshold 0.9
      Then shouldRequireApproval for action "SomeAction" with confidence 0.85 returns true

    Scenario: Handles confidence of 0
      Given a config with confidenceThreshold 0.9
      Then shouldRequireApproval for action "SomeAction" with confidence 0 returns true

    Scenario: Handles confidence of 1
      Given a config with confidenceThreshold 0.9
      Then shouldRequireApproval for action "SomeAction" with confidence 1 returns false

  Rule: isAuthorizedReviewer checks agentIds restriction
    **Invariant:** If agentIds is set and non-empty, approval agentId must be in the list
    **Verified by:** Scenarios for matching, non-matching, undefined, and empty agentIds

    Scenario: Returns true when agentId is in authContext agentIds
      Given an approval with agentId "agent-1"
      And an auth context with agentIds "agent-1,agent-2"
      Then isAuthorizedReviewer returns true

    Scenario: Returns false when agentId is not in authContext agentIds
      Given an approval with agentId "agent-3"
      And an auth context with agentIds "agent-1,agent-2"
      Then isAuthorizedReviewer returns false

    Scenario: Returns true when agentIds is undefined
      Given an approval with agentId "any-agent"
      And an auth context with no agentIds
      Then isAuthorizedReviewer returns true

    Scenario: Returns true when agentIds is empty
      Given an approval with agentId "any-agent"
      And an auth context with empty agentIds
      Then isAuthorizedReviewer returns true

  Rule: isAuthorizedReviewer checks roles
    **Invariant:** Roles are checked after agentIds; empty or undefined roles pass
    **Verified by:** Scenarios for present, undefined, and empty roles

    Scenario: Returns true when user has at least one role
      Given a default approval
      And an auth context with roles "reviewer"
      Then isAuthorizedReviewer returns true

    Scenario: Returns true when roles is undefined
      Given a default approval
      And an auth context with no roles
      Then isAuthorizedReviewer returns true

    Scenario: Returns true when roles is empty
      Given a default approval
      And an auth context with empty roles
      Then isAuthorizedReviewer returns true

  Rule: isAuthorizedReviewer evaluates agentIds before roles
    **Invariant:** AgentIds check fails even if user has admin role
    **Verified by:** Scenarios for combined agentIds and roles

    Scenario: AgentIds check fails even with admin role
      Given an approval with agentId "restricted-agent"
      And an auth context with agentIds "other-agent" and roles "admin"
      Then isAuthorizedReviewer returns false

    Scenario: Both agentIds and roles pass
      Given an approval with agentId "allowed-agent"
      And an auth context with agentIds "allowed-agent" and roles "reviewer"
      Then isAuthorizedReviewer returns true

  Rule: generateApprovalId produces correctly formatted unique IDs
    **Invariant:** IDs have apr_ prefix, 3 underscore-delimited parts, 8-char random suffix
    **Verified by:** Scenarios for format and uniqueness

    Scenario: Generates ID with apr_ prefix and correct format
      When I generate an approval ID
      Then the approval ID starts with "apr_"
      And the approval ID has 3 underscore-delimited parts
      And the third part has 8 characters

    Scenario: Generates unique IDs over multiple calls
      When I generate 3 approval IDs with delay
      Then all 3 IDs are unique

  Rule: createPendingApproval builds approval with correct initial values
    **Invariant:** Status is pending, reviewerId/reviewedAt/reviewNote/rejectionReason are undefined
    **Verified by:** Scenarios for initial values, uniqueness, timestamps, and optional fields

    Scenario: Sets correct initial field values
      Given fake time is set to "2024-01-15T12:00:00Z"
      When I create a pending approval for agent "test-agent" decision "dec_123" action "TestAction" confidence 0.75 reason "Test reason" timeout "24h"
      Then the approval has the following initial values:
        | field      | value       |
        | agentId    | test-agent  |
        | decisionId | dec_123     |
        | actionType | TestAction  |
        | confidence | 0.75        |
        | reason     | Test reason |
        | status     | pending     |

    Scenario: Generates unique approvalIds over multiple calls
      When I create 3 pending approvals with delay
      Then all 3 approval IDs are unique

    Scenario: Sets requestedAt to current time
      Given fake time is set to "2024-01-15T12:00:00Z"
      When I create a pending approval with default values
      Then the approval requestedAt equals the current fake time

    Scenario: Calculates expiresAt based on config timeout
      Given fake time is set to "2024-01-15T12:00:00Z"
      When I create a pending approval with timeout "1h"
      Then the approval expiresAt equals requestedAt plus 3600000

    Scenario: Does not include optional fields initially
      Given fake time is set to "2024-01-15T12:00:00Z"
      When I create a pending approval with default values
      Then the approval optional fields are all undefined:
        | field           |
        | reviewerId      |
        | reviewedAt      |
        | reviewNote      |
        | rejectionReason |

  Rule: approveAction transitions pending to approved
    **Invariant:** Only pending approvals can be approved; sets reviewerId, reviewedAt, and optional reviewNote
    **Verified by:** Scenarios for transition, reviewer fields, note, and error cases

    Scenario: Transitions pending approval to approved
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval
      When I approve the approval with reviewer "reviewer-123"
      Then the result status is "approved"
      And the result reviewerId is "reviewer-123"
      And the result reviewedAt equals the current fake time

    Scenario: Includes reviewNote when provided
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval
      When I approve the approval with reviewer "reviewer-123" and note "Looks good!"
      Then the result reviewNote is "Looks good!"

    Scenario: Does not include reviewNote when not provided
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval
      When I approve the approval with reviewer "reviewer-123"
      Then the result reviewNote is undefined

    Scenario: Throws error for non-pending statuses
      Then approving a non-pending approval throws for statuses:
        | status   |
        | approved |
        | rejected |
        | expired  |

    Scenario: Preserves other fields after approval
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval with agentId "my-agent" decisionId "my-decision" confidence 0.8
      When I approve the approval with reviewer "reviewer-123"
      Then the result preserves agentId "my-agent" decisionId "my-decision" confidence 0.8

  Rule: rejectAction transitions pending to rejected
    **Invariant:** Only pending approvals can be rejected; sets reviewerId, rejectionReason, reviewedAt
    **Verified by:** Scenarios for transition, fields, and error cases

    Scenario: Transitions pending approval to rejected with reason
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval
      When I reject the approval with reviewer "reviewer-123" and reason "Not appropriate"
      Then the result status is "rejected"
      And the result reviewerId is "reviewer-123"
      And the result rejectionReason is "Customer already contacted"

    Scenario: Sets reviewedAt to current time on rejection
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval
      When I reject the approval with reviewer "reviewer-123" and reason "Reason"
      Then the result reviewedAt equals the current fake time

    Scenario: Throws error when rejecting non-pending approval
      Then rejecting a non-pending approval throws for status "approved"

  Rule: expireAction transitions pending to expired
    **Invariant:** Only pending approvals can be expired; no reviewerId is set
    **Verified by:** Scenarios for transition, no reviewer, error, and field preservation

    Scenario: Transitions pending approval to expired
      Given a pending approval
      When I expire the approval
      Then the result status is "expired"
      And the result reviewerId is undefined

    Scenario: Throws error when expiring non-pending approval
      Then expiring a non-pending approval throws for status "approved"

    Scenario: Preserves original fields after expiration
      Given a pending approval with confidence 0.7
      When I expire the approval
      Then the result confidence is 0.7
      And the result approvalId matches the original

  Rule: safeApproveAction returns result objects instead of throwing
    **Invariant:** Returns success with approved approval or failure with error code
    **Verified by:** Scenarios for success, unauthorized, invalid-transition, and expired cases

    Scenario: Returns success for valid pending approval
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval
      And a valid auth context
      When I safely approve the approval with note "Note"
      Then the safe result is successful
      And the safe result approval status is "approved"

    Scenario: Returns UNAUTHORIZED_REVIEWER when not authorized
      Given an approval with agentId "restricted-agent"
      And an auth context with agentIds "other-agent"
      When I safely approve the approval
      Then the safe result is not successful
      And the safe result error code is "UNAUTHORIZED_REVIEWER"

    Scenario: Returns INVALID_STATUS_TRANSITION when already processed
      Given an already approved approval
      And a valid auth context
      When I safely approve the approval
      Then the safe result is not successful
      And the safe result error code is "INVALID_STATUS_TRANSITION"

    Scenario: Returns APPROVAL_EXPIRED when past expiration
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval that expired 1 second ago
      And a valid auth context
      When I safely approve the approval
      Then the safe result is not successful
      And the safe result error code is "APPROVAL_EXPIRED"

  Rule: safeRejectAction returns result objects instead of throwing
    **Invariant:** Returns success with rejected approval or failure with error code
    **Verified by:** Scenarios for success, unauthorized, and expired cases

    Scenario: Returns success for valid rejection
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval
      And a valid auth context
      When I safely reject the approval with reason "Reason"
      Then the safe result is successful
      And the safe result approval status is "rejected"

    Scenario: Returns UNAUTHORIZED_REVIEWER on safe reject
      Given an approval with agentId "restricted-agent"
      And an auth context with agentIds "other-agent"
      When I safely reject the approval with reason "Reason"
      Then the safe result is not successful
      And the safe result error code is "UNAUTHORIZED_REVIEWER"

    Scenario: Returns APPROVAL_EXPIRED on safe reject
      Given fake time is set to "2024-01-15T12:00:00Z"
      And a pending approval that expired 1 second ago
      And a valid auth context
      When I safely reject the approval with reason "Reason"
      Then the safe result is not successful
      And the safe result error code is "APPROVAL_EXPIRED"

  Rule: Type guards correctly identify approval statuses
    **Invariant:** Each guard returns true only for its matching status
    **Verified by:** Scenarios for each status guard

    Scenario: isApprovalPending returns true only for pending
      Then isApprovalPending returns true for status "pending"
      And isApprovalPending returns false for statuses:
        | status   |
        | approved |
        | rejected |
        | expired  |

    Scenario: isApprovalApproved returns true only for approved
      Then isApprovalApproved returns true for status "approved"
      And isApprovalApproved returns false for status "pending"

    Scenario: isApprovalRejected returns true only for rejected
      Then isApprovalRejected returns true for status "rejected"
      And isApprovalRejected returns false for status "pending"

    Scenario: isApprovalExpired detects expired status and time-based expiration
      Then isApprovalExpired returns true for status "expired"
      And isApprovalExpired returns true for pending approval past expiration time
      And isApprovalExpired returns false for pending approval before expiration time
      And isApprovalExpired returns false for status "approved"

    Scenario: isApprovalActionable checks pending and not expired
      Then isApprovalActionable returns true for pending approval before expiration
      And isApprovalActionable returns false for pending approval at expiration
      And isApprovalActionable returns false for status "approved"

  Rule: getRemainingApprovalTime returns milliseconds until expiration
    **Invariant:** Returns positive ms for active pending, 0 for expired or non-pending
    **Verified by:** Scenarios for remaining, expired, and non-pending cases

    Scenario: Returns remaining time for pending approval
      Then getRemainingApprovalTime returns 5000 for pending approval expiring in 5000ms

    Scenario: Returns 0 for expired approval
      Then getRemainingApprovalTime returns 0 for pending approval past expiration

    Scenario: Returns 0 for non-pending status
      Then getRemainingApprovalTime returns 0 for approved status

  Rule: formatRemainingApprovalTime returns human-readable duration
    **Invariant:** Formats as "Xh Ym" for hours+minutes, "Xm" for minutes-only, "expired" for past
    **Verified by:** Scenarios for hours-minutes, minutes-only, and expired

    Scenario: Formats hours and minutes
      Then formatRemainingApprovalTime returns "2h 30m" for 2.5 hours remaining

    Scenario: Formats minutes only
      Then formatRemainingApprovalTime returns "45m" for 45 minutes remaining

    Scenario: Returns expired for past expiration
      Then formatRemainingApprovalTime returns "expired" for past expiration

  Rule: validatePendingApproval checks structural validity
    **Invariant:** Returns true for valid PendingApproval, false for invalid shapes
    **Verified by:** Scenarios for valid, invalid, and bad-confidence inputs

    Scenario: Returns true for valid approval
      Given a test approval with default values
      Then validatePendingApproval returns true

    Scenario: Returns false for invalid inputs
      Then validatePendingApproval returns false for:
        | input          |
        | empty-object   |
        | null           |
        | not-an-object  |

    Scenario: Returns false for invalid confidence
      Then validatePendingApproval returns false for confidence 2.0
