"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/api-client";

/**
 * Small submit helper shared by the settings and collaboration forms. Keeps
 * pending/error state local and refreshes server components after a success so
 * the page always reflects Forgejo's state rather than optimistic guesses.
 */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run<T>(
    operation: () => Promise<T>,
    options: { refresh?: boolean; successMessage?: string; onSuccess?: (result: T) => void } = {},
  ): Promise<T | undefined> {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await operation();
      if (options.successMessage) setSuccess(options.successMessage);
      options.onSuccess?.(result);
      if (options.refresh !== false) router.refresh();
      return result;
    } catch (caught) {
      setError(errorMessage(caught));
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, success, setError, setSuccess, run, router };
}
