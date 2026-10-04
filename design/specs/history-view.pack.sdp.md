---
id: pack:history-view
specs:
  - spec:application.history-projection
  - spec:application.projection-contract
  - spec:application.read-models
  - spec:application.rebuild
  - spec:application.history-rebuild
  - spec:application.history-rebuild.write-pause-rebuild-interrupt
  - spec:application.history-rebuild.write-pause-rebuild-abort
  - spec:application.history-rebuild.write-pause-rebuild-version-change
  - spec:application.history-rebuild.write-pause-rebuild-installation
  - spec:application.history-rebuild.write-pause-rebuild-source-order-mismatch
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

The Specs a history view rests on, in reading order. A history view is a read model whose row folds the events of several streams, such as the order allocation history of the example domain. The history projection comes first because it pins the form, its fold and that view; the projection contract and the read models follow with the row conventions and the read-model rules every view shares. The rebuild, the history rebuild with its five examples, the write pause and the generation registry say how such a view comes to exist and is rebuilt while the commands that write its sources are refused. The rebuild comes first because it holds the operator entries and the batch chain both paths share; the history rebuild holds the paused path alone and the five examples verify it, so the rebuild's implementation binding claims the online path and the history rebuild shows the paused path designed apart from it. The example domain names the events the view folds, and the command declaration and the command pipeline bind the view to the commands that feed it and write it inside each command. The event envelope, the journal and the queries are where the events come from on the live path and on the backfill, and D9 is the decision that a read model which depends on history across several streams rebuilds under a write pause.
