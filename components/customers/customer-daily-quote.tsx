"use client";

import { useEffect, useState } from "react";

const MOTIVATIONAL_QUOTES = [
  { text: "我们在想象中受的苦多于现实。", author: "塞内加 (Seneca)" },
  {
    text: "阻碍我们前进的，最终会成为我们前进的道路。",
    author: "马可·奥勒留 (Marcus Aurelius)",
  },
  {
    text: "伟大的事业不是靠冲动做成的，而是由一系列小事汇聚而成的。",
    author: "梵高 (Vincent van Gogh)",
  },
  {
    text: "我们最害怕做的事情，往往是我们最需要做的事情。",
    author: "蒂姆·费里斯 (Tim Ferriss)",
  },
  { text: "不要预测未来，去创造它。", author: "彼得·德鲁克 (Peter Drucker)" },
  { text: "耐心是一切聪敏才智的基础。", author: "柏拉图 (Plato)" },
  { text: "流水不争先，争的是滔滔不绝。", author: "老子 (Laozi)" },
] as const;

export function DailyQuote() {
  const [quote, setQuote] = useState<(typeof MOTIVATIONAL_QUOTES)[number]>(
    MOTIVATIONAL_QUOTES[0],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);

      setQuote(MOTIVATIONAL_QUOTES[nextIndex]);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <figure className="mt-12 mb-8 text-center">
      <blockquote className="text-sm italic tracking-wide text-muted-foreground/60">
        {quote.text}
      </blockquote>
      <figcaption className="mt-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground/40">
        {quote.author}
      </figcaption>
    </figure>
  );
}
