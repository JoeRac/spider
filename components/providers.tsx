'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      // 5-minute stale window keeps the (very few) client-side queries
      // from re-fetching aggressively. Free-tier Neon thanks us.
      queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
