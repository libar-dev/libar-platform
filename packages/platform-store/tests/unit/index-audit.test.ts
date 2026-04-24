import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const schemaPath = new URL("../../src/component/schema.ts", import.meta.url);
const componentLibPath = new URL("../../src/component/lib.ts", import.meta.url);

describe("event store index audit", () => {
  it("keeps only the replacement event-type compound index on the events table", () => {
    const schemaSource = readFileSync(schemaPath, "utf8");

    expect(schemaSource).toContain('.index("by_event_type_and_global_position", ["eventType", "globalPosition"])');
    expect(schemaSource).not.toContain('.index("by_event_type", ["eventType", "timestamp"])');
    expect(schemaSource).not.toContain('.index("by_bounded_context", ["boundedContext", "timestamp"])');
    expect(schemaSource).not.toContain('.index("by_event_id", ["eventId"])');
    expect(schemaSource).not.toContain('.index("by_category", ["category", "globalPosition"])');
  });

  it("routes event-type catch-up reads through the replacement compound index", () => {
    const libSource = readFileSync(componentLibPath, "utf8");

    expect(libSource).toContain('withIndex("by_event_type_and_global_position"');
    expect(libSource).not.toContain('withIndex("by_event_type",');
  });
});
