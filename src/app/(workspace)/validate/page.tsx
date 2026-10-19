import type { Metadata } from "next";
import { ValidationStep } from "@/features/validation/components/validation-step";

export const metadata: Metadata = { title: "Validate · Data Onboarding" };

export default function ValidatePage() {
  return <ValidationStep />;
}
