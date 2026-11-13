import type { ClothingItem, Location, WardrobeLocation, WardrobeMinimum } from "./wardrobe-types";

export type MinimumStatus = WardrobeMinimum & {
  current: number;
  inTransit: number;
  shortfall: number;
};

export type MinimumEditorMode = "add" | "edit";

export function getMinimumEditorLocations(locations: WardrobeLocation[], scope: Location | null) {
  return scope ? locations.filter((location) => location.id === scope) : locations;
}

export function normalizeMinimumEditorQuantity(value: string, mode: MinimumEditorMode) {
  return mode === "add" && value.trim() === "0" ? "" : value;
}

function normalizedOccasions(item: Pick<ClothingItem, "occasions" | "occasion"> | Pick<WardrobeMinimum, "occasions">) {
  const occasions = "occasion" in item ? item.occasions ?? [item.occasion] : item.occasions;
  return occasions.map((occasion) => occasion.trim().toLocaleLowerCase()).filter(Boolean).sort();
}

export function getMinimumSignature(item: Pick<ClothingItem, "name" | "occasion" | "occasions" | "garmentGroup" | "garmentType" | "colour" | "brand" | "photo">) {
  return [item.name.trim().toLocaleLowerCase(), normalizedOccasions(item).join("|"), item.garmentGroup.toLocaleLowerCase(), item.garmentType.trim().toLocaleLowerCase(), item.colour.toLocaleLowerCase(), item.brand.trim().toLocaleLowerCase(), item.photo?.pathname ?? ""].join("::");
}

export function getMinimumSettingSignature(minimum: WardrobeMinimum) {
  return [minimum.name.trim().toLocaleLowerCase(), normalizedOccasions(minimum).join("|"), minimum.garmentGroup.toLocaleLowerCase(), minimum.garmentType.trim().toLocaleLowerCase(), minimum.colour.toLocaleLowerCase(), minimum.brand.trim().toLocaleLowerCase(), minimum.photoPathname ?? ""].join("::");
}

export function minimumMatchesItem(minimum: WardrobeMinimum, item: ClothingItem) {
  return getMinimumSettingSignature(minimum) === getMinimumSignature(item);
}

export function getMinimumCoverage(item: ClothingItem, location: Location, items: ClothingItem[]) {
  const signature = getMinimumSignature(item);
  const current = items
    .filter((candidate) => candidate.location === location && getMinimumSignature(candidate) === signature)
    .reduce((total, candidate) => total + candidate.quantity, 0);
  const inTransit = items
    .filter((candidate) => candidate.location === "wearing" && candidate.transitDestination === location && getMinimumSignature(candidate) === signature)
    .reduce((total, candidate) => total + candidate.quantity, 0);
  return { current, inTransit, total: current + inTransit };
}

function makeEditorItemFromMinimum(minimum: WardrobeMinimum): ClothingItem {
  const occasions = minimum.occasions.length ? [...minimum.occasions] : ["Other"];
  return {
    id: `minimum-${minimum.id}`,
    name: minimum.name,
    occasion: occasions[0],
    occasions,
    garmentGroup: minimum.garmentGroup,
    garmentType: minimum.garmentType,
    colour: minimum.colour,
    brand: minimum.brand,
    notes: "",
    quantity: 0,
    location: minimum.location,
    ...(minimum.photoPathname ? {
      photo: { pathname: minimum.photoPathname, filename: "", contentType: "image/jpeg" as const, size: 0 },
    } : {}),
    createdAt: "",
    updatedAt: "",
  };
}

export function getMinimumEditorItems(
  itemOptions: ClothingItem[],
  minimums: WardrobeMinimum[],
  location: Location,
  mode: MinimumEditorMode,
) {
  const uniqueItems = Array.from(new Map(itemOptions.map((item) => [getMinimumSignature(item), item] as const)).values());
  if (mode === "add") {
    return uniqueItems.filter((item) => !minimums.some((minimum) => minimum.location === location && getMinimumSettingSignature(minimum) === getMinimumSignature(item)));
  }

  const locationMinimums = minimums.filter((minimum) => minimum.location === location);
  const configuredSignatures = new Set(locationMinimums.map(getMinimumSettingSignature));
  const visibleItems = uniqueItems.filter((item) => configuredSignatures.has(getMinimumSignature(item)));
  const visibleSignatures = new Set(visibleItems.map(getMinimumSignature));
  for (const minimum of locationMinimums) {
    const signature = getMinimumSettingSignature(minimum);
    if (!visibleSignatures.has(signature)) {
      visibleItems.push(makeEditorItemFromMinimum(minimum));
      visibleSignatures.add(signature);
    }
  }
  return visibleItems;
}

export function getMinimumStatuses(minimums: WardrobeMinimum[], items: ClothingItem[]): MinimumStatus[] {
  return minimums.map((minimum) => {
    const current = items.filter((item) => item.location === minimum.location && minimumMatchesItem(minimum, item)).reduce((total, item) => total + item.quantity, 0);
    const inTransit = items.filter((item) => item.location === "wearing" && item.transitDestination === minimum.location && minimumMatchesItem(minimum, item)).reduce((total, item) => total + item.quantity, 0);
    return { ...minimum, current, inTransit, shortfall: Math.max(0, minimum.minimum - current - inTransit) };
  });
}

export function getLocationMinimumSummary(statuses: MinimumStatus[], location: Location) {
  const locationStatuses = statuses.filter((status) => status.location === location);
  return {
    configured: locationStatuses.length,
    belowMinimum: locationStatuses.filter((status) => status.shortfall > 0).length,
    totalShortfall: locationStatuses.reduce((total, status) => total + status.shortfall, 0),
  };
}

export function reconcileMinimumExpansion(previousShortfallCount: number, nextShortfallCount: number, expanded: boolean) {
  if (nextShortfallCount === 0) return false;
  if (previousShortfallCount === 0) return true;
  return expanded;
}

export function makeMinimumFromItem(item: ClothingItem, location: Location, minimum: number, id: string): WardrobeMinimum {
  return { id, location, name: item.name, occasions: [...(item.occasions ?? [item.occasion])], garmentGroup: item.garmentGroup, garmentType: item.garmentType, colour: item.colour, brand: item.brand, ...(item.photo?.pathname ? { photoPathname: item.photo.pathname } : {}), minimum };
}

export function applyMinimumQuantityEdits(
  current: WardrobeMinimum[],
  itemOptions: ClothingItem[],
  location: Location,
  quantities: Record<string, string>,
  createId: () => string,
): { minimums: WardrobeMinimum[]; invalidSignatures: string[] } {
  const itemsBySignature = new Map(itemOptions.map((item) => [getMinimumSignature(item), item] as const));
  const invalidSignatures = Object.entries(quantities).flatMap(([signature, value]) => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const quantity = Number(trimmed);
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= 999 ? [] : [signature];
  });

  if (invalidSignatures.length) return { minimums: current, invalidSignatures };

  let minimums = [...current];
  for (const [signature, value] of Object.entries(quantities)) {
    const item = itemsBySignature.get(signature);
    if (!item) continue;

    const matches = minimums
      .map((minimum, index) => ({ minimum, index }))
      .filter(({ minimum }) => minimum.location === location && getMinimumSettingSignature(minimum) === signature);
    const firstMatch = matches[0];
    const insertAt = firstMatch?.index ?? minimums.length;
    const id = firstMatch?.minimum.id ?? createId();
    minimums = minimums.filter((minimum) => minimum.location !== location || getMinimumSettingSignature(minimum) !== signature);
    if (value.trim()) {
      minimums.splice(Math.min(insertAt, minimums.length), 0, makeMinimumFromItem(item, location, Number(value), id));
    }
  }

  return { minimums, invalidSignatures: [] };
}
