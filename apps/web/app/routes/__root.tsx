import {
  createRootRoute,
  Link,
  Outlet,
  ScrollRestoration,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useQueue } from "~/lib/use-queue";
import { ConnectionStatus } from "~/components/ConnectionStatus";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "osqueue — Distributed Job Queue Demo" },
      {
        name: "description",
        content:
          "Real-time distributed job queue on object storage. Open multiple tabs to produce, process, and observe jobs.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Syne:wght@400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
});

function Nav() {
  const queue = useQueue(2000);
  const router = useRouterState();
  const pathname = router.location.pathname;

  const links = [
    { to: "/", label: "Dashboard" },
    { to: "/producer", label: "Producer" },
    { to: "/worker", label: "Worker" },
  ] as const;

  return (
    <nav className="border-b border-border bg-surface-0/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-sm font-display font-bold tracking-wide text-text group-hover:text-purple transition-colors">
              osqueue
            </span>
            <span className="hidden sm:inline text-[9px] uppercase tracking-[0.2em] text-text-dim border border-border px-1.5 py-0.5">
              demo
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  pathname === link.to
                    ? "text-text bg-surface-2"
                    : "text-text-muted hover:text-text hover:bg-surface-1"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <ConnectionStatus connected={queue.connected} />
      </div>
    </nav>
  );
}

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <Nav />
        <main className="max-w-6xl mx-auto px-4 py-6">
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
