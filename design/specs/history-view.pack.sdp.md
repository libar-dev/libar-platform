---
id: pack:history-view
specs:
  - spec:application.history-projection
  - spec:application.projection-contract
  - spec:application.read-models
  - spec:application.rebuild
  - spec:application.rebuild.write-pause-rebuild-interrupt
  - spec:application.rebuild.write-pause-rebuild-abort
  - spec:application.write-pause
  - spec:application.generation-registry
  - spec:application.orders-inventory-example
  - spec:command.command-declaration
  - spec:command.command-pipeline
  - spec:context.event-envelope
  - spec:context.journal
  - spec:context.queries
  - spec:decisions.d09-rebuild-online-by-default
modelRefs:
  - spec:platform.vocabulary
---
# History view

The Specs a history view rests on, in reading order. A history view is a read model whose row folds the events of several streams, such as the order allocation history of the example domain. The history projection comes first because it pins the form, its fold and that view; the projection contract and the read models follow with the row conventions and the read-model rules every view shares. The rebuild with its two examples, the write pause and the generation registry say how such a view comes to exist and is rebuilt while the commands that write its sources are refused. The example domain names the events the view folds, and the command declaration and the command pipeline bind the view to the commands that feed it and write it inside each command. The event envelope, the journal and the queries are where the events come from on the live path and on the backfill, and D9 is the decision that a read model which depends on history across several streams rebuilds under a write pause.
