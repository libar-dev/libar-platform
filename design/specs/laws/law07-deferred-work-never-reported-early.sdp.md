---
id: spec:laws.law07-deferred-work-never-reported-early
kind: rule
altitude: feature
readiness: defined
relations:
  refines: spec:platform.transactional-domain-platform
---
# Deferred work is never reported as done early

Law 7 · Detail: verbatim · Traces: Law 7; detailed by D13, D14, D16.

The twelve laws of v0.1, one reworded, are the review surface; the decisions give the detail. The law is why a scheduler or Workpool ID is execution metadata and not evidence, why no onComplete callback decides whether an effect happened, and why a process returns an honest awaiting status while it waits for provider evidence. Component Specs that cite this law point `constrainedBy` at it, so the graph answers which designs it bounds.

## Intent

- outcome: An obligation reports success only when the effect is proven by evidence, never when a dispatch was scheduled or a callback fired (Law 7)
- value: A UI, an operator or a process learns of completion from the obligation's stored evidence, so a lost callback or a duplicate worker cannot fake a success (Law 7, D13, D14, D16)

## Rule

- Deferred work is never reported as done before its effect is proven. (Law 7)
