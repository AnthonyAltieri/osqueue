import type { JobInfo } from "@osqueue/proto";

interface ActiveWorkersProps {
  jobs: JobInfo[];
  brokerAddress: string;
  connected: boolean;
}

export function ActiveWorkers({ jobs, brokerAddress, connected }: ActiveWorkersProps) {
  const activeJobs = jobs.filter((job) => job.status === "in_progress");

  const workerMap = new Map<string, JobInfo[]>();
  for (const job of activeJobs) {
    if (!job.workerId) continue;
    const existing = workerMap.get(job.workerId);
    if (existing) {
      existing.push(job);
    } else {
      workerMap.set(job.workerId, [job]);
    }
  }

  return (
    <div className="border border-border bg-surface-1 overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[10px] uppercase tracking-[0.15em] text-text-dim">
          Infrastructure
        </span>
      </div>

      {/* Broker */}
      <div className="px-3 py-2.5 flex items-center gap-3 border-b border-border-subtle">
        <span
          className={`h-2 w-2 rounded-full flex-shrink-0 ${connected ? "bg-green animate-pulse-dot" : "bg-red"}`}
        />
        <span className="text-xs text-text-muted">Broker</span>
        {brokerAddress && (
          <span className="font-mono text-xs text-text-dim">{brokerAddress}</span>
        )}
        <span
          className={`ml-auto text-[10px] uppercase tracking-wider ${connected ? "text-green" : "text-red"}`}
        >
          {connected ? "connected" : "disconnected"}
        </span>
      </div>

      {/* Workers */}
      {workerMap.size === 0 ? (
        <div className="px-3 py-2.5 text-xs text-text-dim">
          No active workers. Open a <strong className="text-text-muted">/worker</strong> tab and start processing.
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {Array.from(workerMap.entries()).map(([workerId, workerJobs]) => {
            const types = [...new Set(workerJobs.map((j) => j.type).filter(Boolean))];
            return (
              <div
                key={workerId}
                className="px-3 py-2.5 flex items-center gap-3 animate-fade-in"
              >
                <span className="h-2 w-2 rounded-full bg-green animate-pulse-dot flex-shrink-0" />
                <span className="text-xs text-text-muted">Worker</span>
                <span className="font-mono text-sm text-text-muted">
                  {workerId.slice(0, 8)}
                </span>
                <span className="text-xs text-text-dim tabular-nums">
                  {workerJobs.length} {workerJobs.length === 1 ? "job" : "jobs"}
                </span>
                {types.length > 0 && (
                  <div className="flex gap-1.5 ml-auto">
                    {types.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] text-purple bg-purple/10 px-1.5 py-0.5 border border-purple/20"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
