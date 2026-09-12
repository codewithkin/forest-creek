"use client";

import { Toaster } from "@forest-creek/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/utils/trpc";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="dark" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
