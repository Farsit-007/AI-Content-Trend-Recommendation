import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./index.css";
import { initErrorReporting } from "./lib/errorReporting.ts";
import { router } from "./routes/routes.tsx";
import { queryClient } from "./lib/queryClient.ts";
import { ThemeProvider } from "./context/ThemeProvider.tsx";
import { Toaster } from "./components/ui/sonner.tsx";

// Fire-and-forget: no-op without VITE_SENTRY_DSN, and lazily fetched when there is one, so it
// never blocks first paint. Errors thrown before the SDK lands are queued and replayed.
void initErrorReporting();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
