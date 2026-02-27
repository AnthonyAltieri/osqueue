import { createFileRoute } from "@tanstack/react-router";
import { useQueue } from "~/lib/use-queue";
import { useWorker } from "~/lib/use-worker";
import { QueueStats } from "~/components/QueueStats";
import { WorkerPanel } from "~/components/WorkerPanel";
import { ActivityLog } from "~/components/ActivityLog";

export const Route = createFileRoute("/worker")({
  component: WorkerPage,
});

function WorkerPage() {
  const queue = useQueue(500);
  const worker = useWorker();

  return (
    <div className="space-y-6">
      <QueueStats
        total={queue.total}
        unclaimed={queue.unclaimed}
        inProgress={queue.inProgress}
        completedTotal={queue.completedTotal}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <WorkerPanel {...worker} />
        </div>
        <div>
          <ActivityLog events={queue.activity} />
        </div>
      </div>
    </div>
  );
}
