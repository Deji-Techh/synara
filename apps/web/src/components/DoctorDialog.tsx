import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ToolchainCheck } from "@caide/contracts";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import { serverQueryKeys } from "~/lib/serverReactQuery";
import { ensureNativeApi } from "~/nativeApi";
import {
  CheckIcon,
  CircleAlertIcon,
  GitBranchIcon,
  Loader2Icon,
  RefreshCwIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "~/lib/icons";

function ToolchainCheckIcon({ status }: { status: ToolchainCheck["status"] }) {
  switch (status) {
    case "ok":
      return <CheckIcon className="size-4 shrink-0 text-emerald-500" />;
    case "missing":
      return <TriangleAlertIcon className="size-4 shrink-0 text-amber-500" />;
    case "error":
      return <CircleAlertIcon className="size-4 shrink-0 text-destructive" />;
    default:
      return <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />;
  }
}

function ToolchainIcon({ id }: { id: ToolchainCheck["id"] }) {
  switch (id) {
    case "git":
      return <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />;
    case "flutter":
    case "dart":
      return <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />;
    default:
      return <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function statusLabel(status: ToolchainCheck["status"]): string {
  switch (status) {
    case "ok":
      return "Installed";
    case "missing":
      return "Not found";
    case "error":
      return "Unhealthy";
    default:
      return "Checking…";
  }
}

const statusClassName: Record<ToolchainCheck["status"], string> = {
  ok: "text-emerald-600",
  missing: "text-amber-600",
  error: "text-destructive",
  unknown: "text-muted-foreground",
};

export function DoctorDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { open, onOpenChange } = props;
  const queryClient = useQueryClient();

  const doctorQuery = useQuery({
    queryKey: serverQueryKeys.toolchainDoctor(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.runToolchainDoctor({});
    },
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const rerun = () => {
    void queryClient.invalidateQueries({ queryKey: serverQueryKeys.toolchainDoctor() });
  };

  const checks = doctorQuery.data?.checks ?? [];
  const isPending = doctorQuery.isPending || doctorQuery.isFetching;
  const hasFailures = checks.some((check) => check.status !== "ok");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Caide Doctor</DialogTitle>
          <DialogDescription>
            Toolchain health checks for building Flutter apps — Flutter SDK, Dart, Node.js, and Git.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          {doctorQuery.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border/60 bg-card p-8 text-center">
              <CircleAlertIcon className="size-6 text-destructive" />
              <div>
                <p className="font-medium text-foreground">Doctor could not complete</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {doctorQuery.error instanceof Error
                    ? doctorQuery.error.message
                    : "The toolchain check failed unexpectedly."}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={rerun}>
                <RefreshCwIcon className="size-4" />
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {hasFailures ? (
                    <TriangleAlertIcon className="size-4 text-amber-500" />
                  ) : (
                    <CheckIcon className="size-4 text-emerald-500" />
                  )}
                  {hasFailures ? "Some checks need attention" : "All toolchain checks passed"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isPending ? "Running…" : `${checks.length} checks`}
                </span>
              </div>

              <div className="divide-y overflow-hidden rounded-lg border border-border/60">
                {checks.map((check) => (
                  <div key={check.id} className="flex items-center gap-3 bg-card px-4 py-3">
                    <ToolchainIcon id={check.id} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{check.label}</p>
                      {check.message ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {check.message}
                        </p>
                      ) : check.version ? (
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          v{check.version}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn("shrink-0 text-xs font-medium", statusClassName[check.status])}
                    >
                      {statusLabel(check.status)}
                    </span>
                  </div>
                ))}
                {isPending && checks.length === 0 ? (
                  <div className="flex items-center gap-3 px-4 py-6">
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Checking your toolchain…</p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          <div className="flex w-full items-center justify-between gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={rerun} disabled={isPending}>
              <RefreshCwIcon className="size-4" />
              Run again
            </Button>
            <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
