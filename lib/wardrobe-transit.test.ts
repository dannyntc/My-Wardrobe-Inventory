import assert from "node:assert/strict";
import test from "node:test";
import type { ClothingItem } from "./wardrobe-types.ts";
import { applyArrival, applyStartTransit } from "./wardrobe-transit.ts";

function item(overrides: Partial<ClothingItem> & Pick<ClothingItem, "id" | "name" | "quantity" | "location">): ClothingItem {
  const { id, name, quantity, location, ...otherOverrides } = overrides;
  return {
    id,
    name,
    occasion: "Casual",
    occasions: ["Casual"],
    garmentGroup: "Tops",
    garmentType: "T-shirts",
    colour: "White",
    brand: "Everyday",
    needsClassification: false,
    notes: "",
    quantity,
    location,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...otherOverrides,
  } as ClothingItem;
}

const createId = (() => {
  let index = 0;
  return () => `generated-${++index}`;
})();

test("rejects stale or invalid selections atomically", () => {
  const items = [item({ id: "shirt", name: "White tee", quantity: 1, location: "home" })];

  assert.throws(() => applyStartTransit(items, "home", [{ itemId: "shirt", quantity: 2 }], createId, "2026-01-05T00:00:00.000Z"), /only has 1 available/);

  assert.deepEqual(items, [item({ id: "shirt", name: "White tee", quantity: 1, location: "home" })]);
});

test("rejects a destination merge above the per-item limit", () => {
  const items = [
    item({ id: "worn", name: "White tee", quantity: 1, location: "wearing" }),
    item({ id: "stored", name: "White tee", quantity: 999, location: "girlfriend" }),
  ];

  assert.throws(() => applyArrival(items, "girlfriend", [{ itemId: "worn", quantity: 1 }], createId, "2026-01-06T00:00:00.000Z"), /cannot exceed 999 pieces/);
});

test("starts transit from either physical location and preserves the total", () => {
  const items = [item({ id: "shirt", name: "White tee", quantity: 2, location: "home" })];

  const result = applyStartTransit(items, "home", [{ itemId: "shirt", quantity: 1 }], createId, "2026-01-07T00:00:00.000Z");

  assert.equal(result.find((candidate) => candidate.location === "home")?.quantity, 1);
  assert.equal(result.find((candidate) => candidate.location === "wearing")?.quantity, 1);
  assert.equal(result.reduce((total, candidate) => total + candidate.quantity, 0), 2);
});

test("confirms arrival at the opposite location and merges matching pieces", () => {
  const items = [
    item({ id: "worn", name: "White tee", quantity: 1, location: "wearing" }),
    item({ id: "stored", name: "White tee", quantity: 2, location: "girlfriend" }),
  ];

  const result = applyArrival(items, "girlfriend", [{ itemId: "worn", quantity: 1 }], createId, "2026-01-08T00:00:00.000Z");

  assert.equal(result.length, 1);
  assert.equal(result[0].location, "girlfriend");
  assert.equal(result[0].quantity, 3);
});

test("confirms a return to the original source and leaves partial transit wearing", () => {
  const items = [
    item({ id: "worn", name: "White tee", quantity: 2, location: "wearing" }),
    item({ id: "stored", name: "White tee", quantity: 1, location: "home" }),
  ];

  const result = applyArrival(items, "home", [{ itemId: "worn", quantity: 1 }], createId, "2026-01-09T00:00:00.000Z");

  assert.equal(result.find((candidate) => candidate.location === "home")?.quantity, 2);
  assert.equal(result.find((candidate) => candidate.location === "wearing")?.quantity, 1);
});
