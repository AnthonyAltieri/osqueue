import { useState, useEffect, useCallback } from "react";
import { getBrokerUrl } from "~/lib/queue-client";

export function RawState({ pollMs = 1000 }: { pollMs?: number }) {
  const [json, setJson] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${getBrokerUrl()}/state`);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setJson(JSON.stringify(data, null, 2));
      setError("");
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch");
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, pollMs);
    return () => clearInterval(id);
  }, [poll, pollMs]);

  return (
    <div className="border border-border bg-surface-1">
      <div
        className="px-4 py-3 border-b border-border flex items-center justify-between cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h2 className="text-sm font-display font-bold tracking-wide">
          S3 Raw State
        </h2>
        <span className="text-[10px] text-text-dim font-mono">
          {collapsed ? "+" : "-"} queue.json
        </span>
      </div>

      {!collapsed && (
        <div className="p-4 overflow-auto max-h-[600px]">
          {error ? (
            <p className="text-red text-xs font-mono">{error}</p>
          ) : (
            <pre className="text-xs text-text-muted font-mono whitespace-pre leading-relaxed">
              {json || "Loading..."}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
