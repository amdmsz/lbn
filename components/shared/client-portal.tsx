"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ClientPortal({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Required client-only portal guard for Next.js hydration.
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(children, document.body);
}
