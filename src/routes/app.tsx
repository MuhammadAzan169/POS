import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ScopeProvider } from "@/lib/scope";

export const Route = createFileRoute("/app")({
  // The reporting scope wraps the whole signed-in area so the chosen period and
  // shop survive navigation between pages instead of resetting on every route.
  component: () => (
    <ScopeProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ScopeProvider>
  ),
});
