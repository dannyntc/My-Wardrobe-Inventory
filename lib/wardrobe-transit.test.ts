import assert from "node:assert/strict";
import test from "node:test";
import type { ClothingItem } from "./wardrobe-types.ts";
import { applyOutfitChange } from "./wardrobe-transit.ts";

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

test("moves a selected outfit into Wearing without changing total quantities", () => {
  const items = [item({ id: "shirt", name: "White tee", quantity: 2, location: "home" })];

  const result = applyOutfitChange(items, {
    at: "home",
    putAway: [],
    putOn: [{ itemId: "shirt", quantity: 1 }],
  }, createId, "2026-01-02T00:00:00.000Z");

  assert.deepEqual(result, [
    { ...items[0], quantity: 1, updatedAt: "2026-01-02T00:00:00.000Z" },
    { ...items[0], id: "generated-1", quantity: 1, location: "wearing", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
  ]);
});

test("records a combined change at a destination and merges matching pieces", () => {
  const items = [
    item({ id: "worn", name: "White tee", quantity: 1, location: "wearing" }),
    item({ id: "stored", name: "White tee", quantity: 1, location: "girlfriend" }),
    item({ id: "next", name: "Navy overshirt", quantity: 1, location: "girlfriend", garmentType: "Overshirts", colour: "Navy Blue" }),
  ];

  const result = applyOutfitChange(items, {
    at: "girlfriend",
    putAway: [{ itemId: "worn", quantity: 1 }],
    putOn: [{ itemId: "next", quantity: 1 }],
  }, createId, "2026-01-03T00:00:00.000Z");

  assert.deepEqual(result, [
    { ...items[1], quantity: 2, updatedAt: "2026-01-03T00:00:00.000Z" },
    { ...items[2], location: "wearing", updatedAt: "2026-01-03T00:00:00.000Z" },
  ]);
});

test("allows putting worn pieces away without selecting replacements", () => {
  const items = [item({ id: "worn", name: "Black jeans", quantity: 1, location: "wearing" })];

  const result = applyOutfitChange(items, {
    at: "home",
    putAway: [{ itemId: "worn", quantity: 1 }],
    putOn: [],
  }, createId, "2026-01-04T00:00:00.000Z");

  assert.equal(result[0].location, "home");
  assert.equal(result[0].quantity, 1);
});

test("rejects stale or invalid selections atomically", () => {
  const items = [item({ id: "shirt", name: "White tee", quantity: 1, location: "home" })];

  assert.throws(() => applyOutfitChange(items, {
    at: "home",
    putAway: [],
    putOn: [{ itemId: "shirt", quantity: 2 }],
  }, createId, "2026-01-05T00:00:00.000Z"), /only has 1 available/);

  assert.deepEqual(items, [item({ id: "shirt", name: "White tee", quantity: 1, location: "home" })]);
});

test("rejects a destination merge above the per-item limit", () => {
  const items = [
    item({ id: "worn", name: "White tee", quantity: 1, location: "wearing" }),
    item({ id: "stored", name: "White tee", quantity: 999, location: "girlfriend" }),
  ];

  assert.throws(() => applyOutfitChange(items, {
    at: "girlfriend",
    putAway: [{ itemId: "worn", quantity: 1 }],
    putOn: [],
  }, createId, "2026-01-06T00:00:00.000Z"), /cannot exceed 999 pieces/);
});
