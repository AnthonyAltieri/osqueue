interface StatCardProps {
  label: string;
  value: number;
  color: string;
  borderColor: string;
}

function StatCard({ label, value, color, borderColor }: StatCardProps) {
  return (
    <div
      className={`border-l-2 border border-border bg-surface-1 px-4 py-3`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="text-[10px] uppercase tracking-[0.15em] text-text-dim mb-1">
        {label}
      </div>
      <div
        className="text-2xl font-display font-bold tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

interface QueueStatsProps {
  total: number;
  unclaimed: number;
  inProgress: number;
  completedTotal: number;
}

export function QueueStats({
  total,
  unclaimed,
  inProgress,
  completedTotal,
}: QueueStatsProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard
        label="Total in Queue"
        value={total}
        color="var(--color-text)"
        borderColor="var(--color-text-dim)"
      />
      <StatCard
        label="Unclaimed"
        value={unclaimed}
        color="var(--color-green)"
        borderColor="var(--color-green)"
      />
      <StatCard
        label="In Progress"
        value={inProgress}
        color="var(--color-amber)"
        borderColor="var(--color-amber)"
      />
      <StatCard
        label="Completed"
        value={completedTotal}
        color="var(--color-cyan)"
        borderColor="var(--color-cyan)"
      />
    </div>
  );
}
