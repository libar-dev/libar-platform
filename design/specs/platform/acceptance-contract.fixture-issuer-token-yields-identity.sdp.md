---
id: spec:platform.acceptance-contract.fixture-issuer-token-yields-identity
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:platform.acceptance-contract
  verifies: spec:platform.acceptance-contract
---
# A token signed by the fixture issuer yields the caller's identity

E-13 · native tier · fixture composition.

## Intent

- outcome: An ordinary client carrying a token the harness signed is the identity the token names, and a client with no token is nobody. (E-13)

```gwt
Given a disposable backend whose environment variables name the fixture issuer {issuer: "https://fixture-issuer.test"} and its data-URI key set
And an ordinary client carrying a token the harness signed for subject {subject: "user-1"}
When the client calls a public query that returns the caller's identity
Then the identity names issuer {identityIssuer: "https://fixture-issuer.test"} and subject {identitySubject: "user-1"}
And the same query from a client with no token returns an identity {anonymousHasIdentity: false}
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that `tokenIdentifier` is the issuer and the subject joined by a vertical bar, and that a token signed by a key outside the key set is refused.
