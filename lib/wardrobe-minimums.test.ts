import test from "node:test";
import assert from "node:assert/strict";
import { applyMinimumQuantityEdits, getLocationMinimumSummary, getMinimumCoverage, getMinimumEditorItems, getMinimumEditorLocations, getMinimumSignature, getMinimumStatuses, makeMinimumFromItem, normalizeMinimumEditorQuantity, reconcileMinimumExpansion } from "./wardrobe-minimums.ts";
import type { ClothingItem, WardrobeLocation } from "./wardrobe-types.ts";

function item(overrides: Partial<ClothingItem> & Pick<ClothingItem, "id" | "name" | "quantity" | "location">): ClothingItem {
  const { id, name, quantity, location, ...other } = overrides;
  return { id, name, occasion: "Casual", occasions: ["Casual"], garmentGroup: "Tops", garmentType: "T-shirts", colour: "White", brand: "Everyday", notes: "", quantity, location, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...other };
}

test("counts physical pieces and transit pieces headed to the destination", () => {
  const source = item({ id: "source", name: "White tee", quantity: 2, location: "girlfriend" });
  const minimum = makeMinimumFromItem(source, "home", 4, "minimum");
  const statuses = getMinimumStatuses([minimum], [item({ id: "stored", name: "White tee", quantity: 1, location: "home" }), item({ id: "travelling", name: "White tee", quantity: 2, location: "wearing", transitDestination: "home" })]);
  assert.deepEqual(statuses[0], { ...minimum, current: 1, inTransit: 2, shortfall: 1 });
});

test("does not count transit headed to another location", () => {
  const source = item({ id: "source", name: "White tee", quantity: 1, location: "girlfriend" });
  const minimum = makeMinimumFromItem(source, "home", 2, "minimum");
  const statuses = getMinimumStatuses([minimum], [item({ id: "travelling", name: "White tee", quantity: 2, location: "wearing", transitDestination: "girlfriend" })]);
  assert.equal(statuses[0].current, 0);
  assert.equal(statuses[0].inTransit, 0);
  assert.equal(statuses[0].shortfall, 2);
});

test("returns location coverage for an item before a minimum is created", () => {
  const stored = item({ id: "stored", name: "White tee", quantity: 2, location: "home" });
  const travelling = item({ id: "travelling", name: "White tee", quantity: 1, location: "wearing", transitDestination: "home" });

  assert.deepEqual(getMinimumCoverage(stored, "home", [stored, travelling]), {
    current: 2,
    inTransit: 1,
    total: 3,
  });
});

test("summarizes configured minimums by location", () => {
  const tee = item({ id: "tee", name: "White tee", quantity: 1, location: "home" });
  const shorts = item({ id: "shorts", name: "Black shorts", quantity: 2, location: "girlfriend", garmentGroup: "Bottoms", garmentType: "Shorts", colour: "Black" });
  const minimums = [
    makeMinimumFromItem(tee, "home", 3, "tee-minimum"),
    makeMinimumFromItem(shorts, "girlfriend", 2, "shorts-minimum"),
  ];

  assert.deepEqual(getLocationMinimumSummary(getMinimumStatuses(minimums, [tee, shorts]), "home"), {
    configured: 1,
    belowMinimum: 1,
    totalShortfall: 2,
  });
  assert.deepEqual(getLocationMinimumSummary(getMinimumStatuses(minimums, [tee, shorts]), "girlfriend"), {
    configured: 1,
    belowMinimum: 0,
    totalShortfall: 0,
  });
});

test("applies bulk minimum edits atomically and removes blank values", () => {
  const tee = item({ id: "tee", name: "White tee", quantity: 2, location: "home" });
  const shorts = item({ id: "shorts", name: "Black shorts", quantity: 1, location: "home", garmentGroup: "Bottoms", garmentType: "Shorts", colour: "Black" });
  const existing = makeMinimumFromItem(tee, "home", 2, "tee-minimum");

  const result = applyMinimumQuantityEdits(
    [existing],
    [tee, shorts],
    "home",
    { [getMinimumSignature(tee)]: "", [getMinimumSignature(shorts)]: "3" },
    () => "shorts-minimum",
  );

  assert.deepEqual(result.invalidSignatures, []);
  assert.deepEqual(result.minimums, [makeMinimumFromItem(shorts, "home", 3, "shorts-minimum")]);
});

test("rejects an invalid bulk value without changing existing minimums", () => {
  const tee = item({ id: "tee", name: "White tee", quantity: 2, location: "home" });
  const existing = makeMinimumFromItem(tee, "home", 2, "tee-minimum");

  const result = applyMinimumQuantityEdits(
    [existing],
    [tee],
    "home",
    { [getMinimumSignature(tee)]: "0" },
    () => "unused",
  );

  assert.equal(result.invalidSignatures.length, 1);
  assert.deepEqual(result.minimums, [existing]);
});

test("treats zero as skipped only in Add mode", () => {
  assert.equal(normalizeMinimumEditorQuantity("0", "add"), "");
  assert.equal(normalizeMinimumEditorQuantity("0", "edit"), "0");
  assert.equal(normalizeMinimumEditorQuantity(" 3 ", "add"), " 3 ");
});

test("opens only when a new shortage appears and closes when coverage is restored", () => {
  assert.equal(reconcileMinimumExpansion(0, 2, false), true);
  assert.equal(reconcileMinimumExpansion(2, 1, false), false);
  assert.equal(reconcileMinimumExpansion(1, 0, true), false);
  assert.equal(reconcileMinimumExpansion(0, 1, false), true);
});

test("scopes add candidates to item and location combinations without a minimum", () => {
  const tee = item({ id: "tee", name: "White tee", quantity: 2, location: "home" });
  const shorts = item({ id: "shorts", name: "Black shorts", quantity: 1, location: "home", garmentGroup: "Bottoms", garmentType: "Shorts", colour: "Black" });
  const homeMinimum = makeMinimumFromItem(tee, "home", 2, "tee-home-minimum");

  assert.deepEqual(
    getMinimumEditorItems([tee, shorts], [homeMinimum], "home", "add").map((candidate) => candidate.id),
    ["shorts"],
  );
  assert.deepEqual(
    getMinimumEditorItems([tee, shorts], [homeMinimum], "girlfriend", "add").map((candidate) => candidate.id),
    ["tee", "shorts"],
  );
});

test("scopes the minimum editor to the selected location while preserving the global view", () => {
  const locations: WardrobeLocation[] = [
    { id: "girlfriend", letter: "D", name: "Dan's Place", shortName: "Dan's", tone: "dan" },
    { id: "home", letter: "K", name: "Kayn's Place", shortName: "Kayn's", tone: "kayn" },
  ];

  assert.deepEqual(getMinimumEditorLocations(locations, "home"), [locations[1]]);
  assert.deepEqual(getMinimumEditorLocations(locations, null), locations);
});

test("scopes edit candidates to saved minimum signatures and preserves orphaned minimums", () => {
  const tee = item({ id: "tee", name: "White tee", quantity: 2, location: "home" });
  const shorts = item({ id: "shorts", name: "Black shorts", quantity: 1, location: "home", garmentGroup: "Bottoms", garmentType: "Shorts", colour: "Black" });
  const orphan = item({ id: "orphan", name: "Lost overshirt", quantity: 1, location: "home", garmentGroup: "Other", garmentType: "Other", colour: "Blue" });
  const savedMinimums = [
    makeMinimumFromItem(tee, "home", 2, "tee-home-minimum"),
    makeMinimumFromItem(orphan, "girlfriend", 1, "orphan-minimum"),
  ];

  const candidates = getMinimumEditorItems([tee, shorts], savedMinimums, "home", "edit");
  assert.deepEqual(candidates.map((candidate) => candidate.name), ["White tee"]);
  assert.deepEqual(getMinimumEditorItems([tee, shorts], savedMinimums, "girlfriend", "edit").map((candidate) => candidate.name), ["Lost overshirt"]);
});
