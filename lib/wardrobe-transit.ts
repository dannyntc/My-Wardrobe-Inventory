import type { ClothingItem, InventoryLocation, Location } from "./wardrobe-types";

export type OutfitSelection = {
  itemId: string;
  quantity: number;
};

export type OutfitChange = {
  at: Location;
  putAway: OutfitSelection[];
  putOn: OutfitSelection[];
};

const MAX_QUANTITY = 999;
const MAX_ITEM_RECORDS = 500;

const locationLabel: Record<InventoryLocation, string> = {
  girlfriend: "that location",
  home: "that location",
  wearing: "Wearing",
};

function normalizedOccasions(item: ClothingItem) {
  return (item.occasions ?? [item.occasion]).map((occasion) => occasion.trim().toLocaleLowerCase()).filter(Boolean).sort();
}

function sameOccasionSet(left: ClothingItem, right: ClothingItem) {
  const leftOccasions = normalizedOccasions(left);
  const rightOccasions = normalizedOccasions(right);
  return leftOccasions.length === rightOccasions.length && leftOccasions.every((occasion, index) => occasion === rightOccasions[index]);
}

function canMerge(left: ClothingItem, right: ClothingItem) {
  return !left.needsClassification
    && !right.needsClassification
    && left.location !== right.location
    && left.name.trim().toLocaleLowerCase() === right.name.trim().toLocaleLowerCase()
    && sameOccasionSet(left, right)
    && left.garmentGroup === right.garmentGroup
    && left.garmentType.trim().toLocaleLowerCase() === right.garmentType.trim().toLocaleLowerCase()
    && left.colour.toLocaleLowerCase() === right.colour.toLocaleLowerCase()
    && left.brand.trim().toLocaleLowerCase() === right.brand.trim().toLocaleLowerCase()
    && left.photo?.pathname === right.photo?.pathname;
}

function mergeNotes(left: string, right: string) {
  return [left, right].filter(Boolean).filter((note, index, notes) => notes.indexOf(note) === index).join(" · ");
}

function validateSelections(items: ClothingItem[], selections: OutfitSelection[], source: InventoryLocation) {
  const totals = new Map<string, number>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.quantity) || selection.quantity < 1) {
      throw new Error("Choose a whole number of pieces for each item.");
    }
    totals.set(selection.itemId, (totals.get(selection.itemId) ?? 0) + selection.quantity);
  }

  for (const [itemId, quantity] of totals) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("One of the selected pieces is no longer on the board. Close this dialog and try again.");
    if (item.location !== source) {
      throw new Error(`${item.name} is no longer available in ${locationLabel[source]}. Close this dialog and try again.`);
    }
    if (quantity > item.quantity) {
      throw new Error(`${item.name} only has ${item.quantity} available in ${locationLabel[source]}.`);
    }
  }
}

function moveSelection(
  items: ClothingItem[],
  selections: OutfitSelection[],
  source: InventoryLocation,
  destination: InventoryLocation,
  createItemId: () => string,
  now: string,
) {
  let next = items;
  for (const selection of selections) {
    const sourceItem = next.find((item) => item.id === selection.itemId);
    if (!sourceItem || sourceItem.location !== source) {
      throw new Error("The board changed while the outfit dialog was open. Close this dialog and try again.");
    }

    const destinationItem = next.find((item) => item.id !== sourceItem.id && item.location === destination && canMerge(sourceItem, item));
    if (destinationItem && destinationItem.quantity + selection.quantity > MAX_QUANTITY) {
      throw new Error(`${destinationItem.name} cannot exceed ${MAX_QUANTITY} pieces at ${locationLabel[destination]}.`);
    }

    const remainingQuantity = sourceItem.quantity - selection.quantity;
    if (destinationItem) {
      next = next
        .filter((item) => item.id !== sourceItem.id)
        .map((item) => item.id === destinationItem.id
          ? {
            ...item,
            quantity: item.quantity + selection.quantity,
            notes: mergeNotes(item.notes, sourceItem.notes),
            updatedAt: now,
          }
          : item)
        .concat(remainingQuantity > 0 ? [{ ...sourceItem, quantity: remainingQuantity, updatedAt: now }] : []);
      continue;
    }

    if (remainingQuantity === 0) {
      next = next.map((item) => item.id === sourceItem.id
        ? { ...item, location: destination, updatedAt: now }
        : item);
      continue;
    }

    next = [
      ...next.map((item) => item.id === sourceItem.id
        ? { ...item, quantity: remainingQuantity, updatedAt: now }
        : item),
      { ...sourceItem, id: createItemId(), quantity: selection.quantity, location: destination, createdAt: now, updatedAt: now },
    ];
  }
  if (next.length > MAX_ITEM_RECORDS) throw new Error(`This change would create more than ${MAX_ITEM_RECORDS} item records.`);
  return next;
}

export function applyOutfitChange(
  items: ClothingItem[],
  change: OutfitChange,
  createItemId: () => string,
  now = new Date().toISOString(),
) {
  if (!change.putAway.length && !change.putOn.length) {
    throw new Error("Select at least one piece to put away or put on.");
  }
  validateSelections(items, change.putAway, "wearing");
  validateSelections(items, change.putOn, change.at);

  let next = items.map((item) => ({ ...item }));
  next = moveSelection(next, change.putAway, "wearing", change.at, createItemId, now);
  next = moveSelection(next, change.putOn, change.at, "wearing", createItemId, now);
  return next;
}
