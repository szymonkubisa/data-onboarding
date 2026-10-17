import type { Metadata } from "next";
import { MappingStep } from "@/features/mapping/components/mapping-step";

export const metadata: Metadata = { title: "Map columns · Data Onboarding" };

export default function MapPage() {
  return <MappingStep />;
}
