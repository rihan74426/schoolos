import { describe, expect, it } from "vitest";
import * as models from "../models/index.js";

// Two indexes on the same key pattern make syncIndexes/autoIndex fail on MongoDB
// ("An existing index has the same name"). The tenant plugin already indexes
// { institutionId: 1 }, so models must not declare another index on that key.
describe("model index definitions", () => {
  it("never declare two indexes with the same key pattern", () => {
    const duplicates = [];
    for (const [name, Model] of Object.entries(models)) {
      if (!Model?.schema) continue;
      const seen = new Set();
      for (const [key] of Model.schema.indexes()) {
        const id = JSON.stringify(key);
        if (seen.has(id)) duplicates.push(`${name} ${id}`);
        seen.add(id);
      }
    }
    expect(duplicates).toEqual([]);
  });
});
