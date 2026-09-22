"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefreshTrades({ intervaloMs = 30_000 }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs);
    const onFocus = () => router.refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, intervaloMs]);
  return null;
}
