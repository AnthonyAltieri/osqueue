import { createFileRoute } from "@tanstack/react-router";
import { useQueue } from "~/lib/use-queue";
import { QueueStats } from "~/components/QueueStats";
import { ProducerPanel } from "~/components/ProducerPanel";
import { ActivityLog } from "~/components/ActivityLog";

export const Route = createFileRoute("/producer")({
  component: ProducerPage,
});

function ProducerPage() {
  const queue = useQueue(500);

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
          <ProducerPanel />
        </div>
        <div>
          <ActivityLog events={queue.activity} />
        </div>
      </div>
    </div>
  );
}
