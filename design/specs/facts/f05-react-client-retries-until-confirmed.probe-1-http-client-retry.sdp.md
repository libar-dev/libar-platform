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

Probe 1 · native backend tier · fixture composition.

## Intent

- outcome: The HTTP client sends each call once, and a caller's retry after a lost response is a second execution. (Probe 1, F5)

```gwt
Given an HTTP client, ConvexHttpClient, whose transport delivers each request to the backend and then fails as a lost response would
When its caller sends a mutation which inserts one marker row, sees the call fail, and sends the same mutation again
Then the client sent {requestsPerCall: 1} request for each call
And the backend holds {markerRows: 2} marker rows
```

## Verification — executable

- Runs in the native backend tier on the fixture composition; every test owns its disposable backend.
- The transport is the `fetch` the test passes to `ConvexHttpClient`: it performs the request, drops the response and throws, as a connection lost after the commit would.
- The test also asserts that one call on an unfaulted transport sends one request and leaves one row.
- On the first run of this example, on 2026-10-01 on release `precompiled-2026-09-28-5c7cb5b`, the bound values held.
