import { createFileRoute } from "@tanstack/react-router";
import { useQueue } from "~/lib/use-queue";
import { QueueStats } from "~/components/QueueStats";
import { JobTable } from "~/components/JobTable";
import { ActivityLog } from "~/components/ActivityLog";
import { ActiveWorkers } from "~/components/ActiveWorkers";
import { RawState } from "~/components/RawState";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function DemoGuide() {
  return (
    <div className="border border-border bg-surface-1 p-4 mb-6 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="text-purple font-bold text-lg leading-none mt-0.5">
          ?
        </span>
        <div className="text-xs text-text-muted leading-relaxed space-y-1">
          <p className="text-text font-display font-semibold text-sm mb-1">
            How to Demo
          </p>
          <p>
            <strong className="text-text">Tab 1</strong> — You&apos;re here.
            This dashboard shows all jobs in real-time.
          </p>
          <p>
            <strong className="text-text">Tab 2</strong> — Open{" "}
            <strong className="text-purple">/producer</strong> and start
            submitting jobs.
          </p>
          <p>
            <strong className="text-text">Tab 3+</strong> — Open{" "}
            <strong className="text-purple">/worker</strong> in one or more
            tabs to process jobs.
          </p>
          <p className="text-text-dim pt-1">
            All state lives in S3 via the broker. No cross-tab communication
            needed.
          </p>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const queue = useQueue(500);

  return (
    <div className="space-y-6">
      <DemoGuide />

      <QueueStats
        total={queue.total}
        unclaimed={queue.unclaimed}
        inProgress={queue.inProgress}
        completedTotal={queue.completedTotal}
      />

      <ActiveWorkers
        jobs={queue.jobs}
        brokerAddress={queue.brokerAddress}
        connected={queue.connected}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <JobTable jobs={queue.jobs} />
        </div>
        <div>
          <ActivityLog events={queue.activity} />
        </div>
      </div>

      <RawState pollMs={1000} />
    </div>
  );
}
