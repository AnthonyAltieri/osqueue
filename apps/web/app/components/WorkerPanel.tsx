import type { WorkerState } from "~/lib/use-worker";

interface WorkerPanelProps extends WorkerState {
  start: () => void;
  stop: () => Promise<void>;
}

export function WorkerPanel({
  running,
  workerId,
  completedCount,
  activeJobs,
  start,
  stop,
}: WorkerPanelProps) {
  return (
    <div className="border border-border bg-surface-1">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-display font-bold tracking-wide">
          Browser Worker
        </h2>
        {running && (
          <span className="text-[10px] text-text-dim font-mono">
            ID: {workerId}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Start/Stop */}
        <div className="flex items-center gap-4">
          <button
            onClick={running ? stop : start}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border transition-colors ${
              running
                ? "border-red bg-red-dim text-red hover:bg-red/20"
                : "border-green bg-green-dim text-green hover:bg-green/20"
            }`}
          >
            {running ? "Stop Worker" : "Start Worker"}
          </button>

          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                running ? "bg-green animate-pulse-dot" : "bg-text-dim"
              }`}
            />
            <span className="text-xs text-text-muted">
              {running ? "Processing jobs..." : "Idle"}
            </span>
          </div>
        </div>

        {/* Completed count */}
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-text-dim text-[10px] uppercase tracking-[0.15em] block mb-0.5">
              Processed
            </span>
            <span className="text-cyan font-display font-bold text-lg tabular-nums">
              {completedCount}
            </span>
          </div>
          <div>
            <span className="text-text-dim text-[10px] uppercase tracking-[0.15em] block mb-0.5">
              Active
            </span>
            <span className="text-amber font-display font-bold text-lg tabular-nums">
              {activeJobs.length}
            </span>
          </div>
        </div>

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-text-dim">
              Active Jobs
            </div>
            {activeJobs.map((job) => (
              <div
                key={job.jobId}
                className="bg-surface-0 border border-border-subtle p-3 animate-fade-in"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-purple">{job.type}</span>
                  <span className="text-[10px] text-text-dim font-mono tabular-nums">
                    {job.jobId.slice(0, 8)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-surface-2 overflow-hidden">
                  <div
                    className="h-full progress-bar transition-[width] duration-100"
                    style={{ width: `${Math.round(job.progress * 100)}%` }}
                  />
                </div>
                <div className="text-right mt-1">
                  <span className="text-[10px] text-text-dim tabular-nums">
                    {Math.round(job.progress * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions when idle */}
        {!running && completedCount === 0 && (
          <div className="bg-surface-0 border border-border-subtle p-4 text-xs text-text-dim leading-relaxed">
            Click <strong className="text-text-muted">Start Worker</strong> to
            begin processing jobs from the queue. This browser tab acts as a
            real distributed worker with its own unique ID.
          </div>
        )}
      </div>
    </div>
  );
}
