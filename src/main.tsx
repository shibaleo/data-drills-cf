import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ClerkProvider } from "@clerk/react";
import { Toaster } from "sonner";
import { router } from "./router";
import { PersistedQueryProvider } from "./lib/persisted-query-provider";
import { publicConfig } from "./lib/public-config";
import "./app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publicConfig.clerkPublishableKey}>
      <PersistedQueryProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </PersistedQueryProvider>
    </ClerkProvider>
  </StrictMode>,
);
