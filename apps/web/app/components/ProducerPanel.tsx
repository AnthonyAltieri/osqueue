import { useState, useRef, useCallback, useEffect } from "react";
import { getQueueClient, registry } from "~/lib/queue-client";

type JobType = keyof typeof registry;

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: "email:send", label: "email:send" },
  { value: "report:generate", label: "report:generate" },
];

const SAMPLE_PAYLOADS: Record<JobType, () => unknown> = {
  "email:send": () => ({
    to: `user${Math.floor(Math.random() * 1000)}@example.com`,
    subject: `Notification #${Math.floor(Math.random() * 10000)}`,
    body: "This is a test email from the osqueue demo.",
  }),
  "report:generate": () => ({
    reportId: `RPT-${Math.floor(Math.random() * 100000)}`,
    format: Math.random() > 0.5 ? "pdf" : "csv",
  }),
};

export function ProducerPanel() {
  const [jobType, setJobType] = useState<JobType>("email:send");
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [intervalMs, setIntervalMs] = useState(1000);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const submitOne = useCallback(async () => {
    setSubmitting(true);
    try {
      const client = getQueueClient();
      const payload = SAMPLE_PAYLOADS[jobType]();
      const id = await client.submitJob(jobType, payload as any);
      setSubmittedIds((prev) => [id, ...prev].slice(0, 50));
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  }, [jobType]);

  // Auto-submit timer
  useEffect(() => {
    if (autoSubmit) {
      autoTimerRef.current = setInterval(submitOne, intervalMs);
      return () => {
        if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      };
    } else {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    }
  }, [autoSubmit, intervalMs, submitOne]);

  return (
    <div className="border border-border bg-surface-1">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-display font-bold tracking-wide">
          Submit Jobs
        </h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Job Type Selector */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.15em] text-text-dim mb-2">
            Job Type
          </label>
          <div className="flex gap-2">
            {JOB_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setJobType(t.value)}
                className={`px-3 py-1.5 text-xs border transition-colors ${
                  jobType === t.value
                    ? "border-purple bg-purple-dim text-purple"
                    : "border-border text-text-muted hover:border-text-dim"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Payload Preview */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.15em] text-text-dim mb-2">
            Sample Payload
          </label>
          <pre className="bg-surface-0 border border-border-subtle p-3 text-[11px] text-text-muted overflow-x-auto">
            {JSON.stringify(SAMPLE_PAYLOADS[jobType](), null, 2)}
          </pre>
        </div>

        {/* Submit Button */}
        <button
          onClick={submitOne}
          disabled={submitting}
          className="w-full py-2 text-xs font-bold uppercase tracking-wider bg-purple text-void border border-purple hover:bg-purple/80 transition-colors disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Job"}
        </button>

        {/* Auto Submit */}
        <div className="flex items-center gap-3 pt-2 border-t border-border-subtle">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(e) => setAutoSubmit(e.target.checked)}
              className="accent-purple"
            />
            Auto Submit
          </label>
          <label className="flex items-center gap-2 text-xs text-text-muted">
            every
            <input
              type="number"
              value={intervalMs}
              onChange={(e) =>
                setIntervalMs(Math.max(200, Number(e.target.value)))
              }
              className="w-16 px-2 py-1 text-xs bg-surface-0 border border-border text-text tabular-nums focus:outline-none focus:border-purple"
              min={200}
              step={100}
            />
            ms
          </label>
        </div>
      </div>

      {/* Submitted IDs */}
      {submittedIds.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-text-dim mb-2">
            Recently Submitted ({submittedIds.length})
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {submittedIds.map((id, i) => (
              <div
                key={`${id}-${i}`}
                className="text-[11px] text-text-dim font-mono animate-fade-in"
              >
                {id.slice(0, 8)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
