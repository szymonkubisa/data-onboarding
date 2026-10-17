import type { ReactNode } from "react";
import { WorkflowProvider } from "@/application/workflow/react";
import { AppShell } from "@/components/layout/app-shell";
import { publicAiInfo } from "@/infrastructure/ai/config";

/**
 * Server component. Reads the AI mode from the environment (only "live"/"demo" and the
 * model id reach the browser, never the key) and mounts the client-side workflow store.
 * With Cache Components the value is resolved when the shell is prerendered, so changing
 * the key requires a redeploy, which is how Vercel env vars behave anyway.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkflowProvider>
      <AppShell ai={publicAiInfo()}>{children}</AppShell>
    </WorkflowProvider>
  );
}
