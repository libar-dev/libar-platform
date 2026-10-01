---
id: spec:facts.f05-react-client-retries-until-confirmed.probe-1-http-client-retry
kind: example
altitude: story
readiness: defined
relations:
  refines: spec:facts.f05-react-client-retries-until-confirmed
  verifies: spec:facts.f05-react-client-retries-until-confirmed
---
# Probe 1: the HTTP client and a caller's retry

Probe 1 · native tier · fixture composition.

## Intent

- outcome: The backend executes each call once, and a caller's retry is a second call. (Probe 1, F5)

```gwt
Given an HTTP client whose caller sends a mutation which inserts one marker row and discards the response
When the caller sends the same mutation again
Then the backend holds {markerRows: 2} marker rows
```

## Verification — executable

- Runs in the native tier on the fixture composition; every test owns its disposable backend.
- The test asserts that one call with no retry leaves exactly one row, and records that `ConvexHttpClient` sends each mutation in one request with no retry of its own.
