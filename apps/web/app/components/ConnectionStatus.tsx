export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <div
        className={`h-2 w-2 rounded-full ${
          connected
            ? "bg-green animate-pulse-dot"
            : "bg-red"
        }`}
      />
      <span className={connected ? "text-text-muted" : "text-red"}>
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}
