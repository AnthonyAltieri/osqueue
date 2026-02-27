import type { JobInfo } from "@osqueue/proto";

function formatAge(createdAt: bigint): string {
  const ms = Date.now() - Number(createdAt);
  if (ms < 1000) return "<1s";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    unclaimed:
      "bg-green-dim text-green border-green/20",
    in_progress:
      "bg-amber-dim text-amber border-amber/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-wider border ${styles[status] ?? "bg-surface-2 text-text-muted border-border"}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          status === "unclaimed" ? "bg-green" : "bg-amber"
        }`}
      />
      {status === "in_progress" ? "active" : status}
    </span>
  );
}

interface JobTableProps {
  jobs: JobInfo[];
}

export function JobTable({ jobs }: JobTableProps) {
  if (jobs.length === 0) {
    return (
      <div className="border border-border bg-surface-1 p-8 text-center text-text-dim text-sm">
        No jobs in queue. Open the Producer tab to submit some.
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface-1 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-text-dim font-normal">
              Status
            </th>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-text-dim font-normal">
              Job ID
            </th>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-text-dim font-normal">
              Type
            </th>
            <th className="text-left px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-text-dim font-normal">
              Worker
            </th>
            <th className="text-right px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-text-dim font-normal">
              Age
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              key={job.id}
              className="border-b border-border-subtle last:border-0 hover:bg-surface-2/50 transition-colors animate-fade-in"
            >
              <td className="px-3 py-2">
                <StatusBadge status={job.status} />
              </td>
              <td className="px-3 py-2 font-mono text-text-muted">
                {job.id.slice(0, 8)}
              </td>
              <td className="px-3 py-2">
                {job.type ? (
                  <span className="text-purple">{job.type}</span>
                ) : (
                  <span className="text-text-dim">&mdash;</span>
                )}
              </td>
              <td className="px-3 py-2 text-text-muted">
                {job.workerId ? job.workerId.slice(0, 8) : (
                  <span className="text-text-dim">&mdash;</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                {formatAge(job.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
