import type { ActivityEvent } from "~/lib/use-queue";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const typeColors: Record<ActivityEvent["type"], string> = {
  submitted: "text-green",
  claimed: "text-amber",
  completed: "text-cyan",
  error: "text-red",
};

const typeIcons: Record<ActivityEvent["type"], string> = {
  submitted: "+",
  claimed: ">",
  completed: "*",
  error: "!",
};

interface ActivityLogProps {
  events: ActivityEvent[];
}

export function ActivityLog({ events }: ActivityLogProps) {
  if (events.length === 0) {
    return (
      <div className="border border-border bg-surface-1 p-6 text-center text-text-dim text-sm h-full flex items-center justify-center">
        Waiting for activity...
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface-1 overflow-hidden flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[10px] uppercase tracking-[0.15em] text-text-dim">
          Activity Log
        </span>
      </div>
      <div className="overflow-y-auto flex-1 max-h-[400px]">
        {events.map((event) => (
          <div
            key={event.id}
            className="px-3 py-1.5 text-xs border-b border-border-subtle last:border-0 animate-slide-in flex items-start gap-2"
          >
            <span className="text-text-dim tabular-nums shrink-0">
              {formatTime(event.timestamp)}
            </span>
            <span
              className={`shrink-0 w-3 text-center font-bold ${typeColors[event.type]}`}
            >
              {typeIcons[event.type]}
            </span>
            <span className="text-text-muted">{event.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
