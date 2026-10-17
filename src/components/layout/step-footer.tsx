"use client";

import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface FooterAction {
  label: string;
  href?: string;
  onClick?: () => void;
  /** When set, the action is disabled and this text says why (tooltip + screen reader). */
  disabledReason?: string | null;
  loading?: boolean;
  /** Trailing icon. Defaults to an arrow (moves to the next step). */
  icon?: ReactNode;
}

/**
 * Sticky bottom bar with Back and the primary Continue action. A disabled Continue stays
 * focusable (aria-disabled) so keyboard and screen reader users can learn why.
 */
export function StepFooter({
  back,
  next,
  status,
}: {
  back?: { href: string; label?: string };
  next?: FooterAction;
  status?: ReactNode;
}) {
  const reasonId = useId();
  const disabled = Boolean(next?.disabledReason) || Boolean(next?.loading);

  const nextButton = next && (
    <Button
      size="lg"
      className="min-w-36 px-4 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary"
      aria-disabled={disabled || undefined}
      aria-describedby={next.disabledReason ? reasonId : undefined}
      data-disabled={disabled || undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        next.onClick?.();
      }}
      asChild={Boolean(next.href) && !disabled}
    >
      {next.href && !disabled ? (
        <Link href={next.href}>
          {next.label}
          {next.icon ?? <ArrowRight data-icon="inline-end" />}
        </Link>
      ) : (
        <>
          {next.loading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
          {next.label}
          {!next.loading && (next.icon ?? <ArrowRight data-icon="inline-end" />)}
        </>
      )}
    </Button>
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        {back ? (
          <Button variant="ghost" size="lg" asChild>
            <Link href={back.href}>
              <ArrowLeft data-icon="inline-start" />
              {back.label ?? "Back"}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {status && (
            <div className="hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
              {status}
            </div>
          )}
          {next?.disabledReason ? (
            <Tooltip>
              <TooltipTrigger asChild>{nextButton}</TooltipTrigger>
              <TooltipContent side="top">{next.disabledReason}</TooltipContent>
            </Tooltip>
          ) : (
            nextButton
          )}
          {next?.disabledReason && (
            <span id={reasonId} className="sr-only">
              {next.disabledReason}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
