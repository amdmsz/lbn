#!/usr/bin/env node
// 视觉债务检测脚本 (报告型, 不强制阻断)
//
// 扫描所有 components/ + app/ 下 .tsx/.ts 文件, 报告下列视觉债务的残留量:
//
//   1. text-black/N + border-black/N + bg-black/N -- 不响应 dark mode 的
//      硬编码黑色 alpha 值, 应该用 text-foreground/text-muted-foreground/
//      border-border 等主题 token
//   2. bg-white/N -- 同上, 不响应 dark mode, 应用 bg-card/--color-shell-surface
//   3. rounded-2xl + 自定义 rem 圆角 -- 不符合 DESIGN.md 标准
//      (rounded-xl=12px / rounded-md=6px)
//
// 用法: node scripts/check-visual-tokens.mjs
//        node scripts/check-visual-tokens.mjs --strict  (任何残留都 exit 1)
//
// 默认退出码: 0 (仅报告). --strict 模式: 任何残留都 1.
// 跳过 mobile/ (独立 iOS 风格设计语言).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const STRICT = process.argv.includes("--strict");

const PATTERNS = [
  { name: "text-black/N", re: /text-black\/\d+/g },
  { name: "border-black/N", re: /border-black\/\d+/g },
  { name: "bg-black/N", re: /bg-black\/\d+/g },
  { name: "bg-white/N", re: /bg-white\/\d+/g },
  { name: "rounded-2xl", re: /\brounded-2xl\b/g },
  { name: "rounded-[Nrem]", re: /rounded-\[[\d.]+rem\]/g },
];

const SKIP_PATTERNS = [
  /\/mobile\//,
  /\/node_modules\//,
  /\.next/,
  /\/\.git\//,
];

function listTrackedTsx() {
  const out = execSync("git ls-files components/ app/", {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".tsx") || s.endsWith(".ts"))
    .filter((s) => !SKIP_PATTERNS.some((re) => re.test(s)));
}

const files = listTrackedTsx();
const perFile = new Map();
const perPattern = new Map(PATTERNS.map((p) => [p.name, 0]));
let totalHits = 0;

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const byPattern = {};
  let fileHits = 0;
  for (const { name, re } of PATTERNS) {
    const matches = content.match(re);
    const n = matches ? matches.length : 0;
    if (n) {
      byPattern[name] = n;
      fileHits += n;
      perPattern.set(name, perPattern.get(name) + n);
    }
  }
  if (fileHits) {
    perFile.set(file, { total: fileHits, byPattern });
    totalHits += fileHits;
  }
}

console.log("[check-visual-tokens] 视觉债务残留报告");
console.log(`扫描文件: ${files.length} | 含残留文件: ${perFile.size} | 总残留: ${totalHits}`);
console.log("");

if (totalHits === 0) {
  console.log("✅ 全部干净。");
  process.exit(0);
}

console.log("按模式:");
for (const [name, n] of perPattern) {
  if (n) console.log(`  ${String(n).padStart(4)}  ${name}`);
}

const sorted = [...perFile.entries()].sort((a, b) => b[1].total - a[1].total);
console.log("\n按文件 (前 15):");
for (const [file, info] of sorted.slice(0, 15)) {
  const cols = Object.entries(info.byPattern)
    .map(([n, c]) => `${n}=${c}`)
    .join(" ");
  console.log(`  ${String(info.total).padStart(4)}  ${file}`);
  console.log(`        ${cols}`);
}
if (sorted.length > 15) {
  console.log(`  ... 其余 ${sorted.length - 15} 个文件`);
}

if (STRICT) {
  console.error("\n--strict: 退出码 1");
  process.exit(1);
}
process.exit(0);
