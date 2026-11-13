import type { Metadata } from "next";
import { createDemoStarterContent } from "../../lib/demo-fixture";
import type { WardrobePageConfig } from "../editable-page";
import { EditablePage } from "../editable-page";

export const metadata: Metadata = {
  title: "Wardrobe Demo",
  description: "A browser-saved wardrobe inventory demo.",
};

const DEMO_LOCATIONS: WardrobePageConfig["locations"] = [
  { id: "girlfriend", letter: "A", name: "Location A", shortName: "Location A", tone: "blue" },
  { id: "home", letter: "B", name: "Location B", shortName: "Location B", tone: "amber" },
];

export default function DemoPage() {
  return (
    <EditablePage
      config={{
        mode: "demo",
        locations: DEMO_LOCATIONS,
        demoStarter: createDemoStarterContent(),
        brandLabel: "Wardrobe demo",
        title: "Where clothes live.",
        eyebrow: "Fictional clothing inventory",
        description: "Explore the board, try the filters, move pieces between locations, and save a sandbox copy in this browser.",
      }}
    />
  );
}
