import type { Metadata } from "next";
import { ExportStep } from "@/features/export/components/export-step";

export const metadata: Metadata = { title: "Export · Data Onboarding" };

export default function ExportPage() {
  return <ExportStep />;
}
