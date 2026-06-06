#!/usr/bin/env node
// 编码守卫: 扫描所有 git tracked 文本文件, 检测 mojibake / 编码损坏字符,
// 防止类似 6446685 那次 "公海池 -> 鍏捣姹" 的 UTF-8/GBK 编码事故再次溜进仓库.
//
// 检测两类损坏码点:
//   1. U+FFFD REPLACEMENT CHARACTER (�) -- 几乎一定是编码损坏
//   2. 私用区 PUA U+E000-U+F8FF -- 本仓库源码不应直接写私用区字符,
//      mojibake (GBK 无法映射的字节) 常落在这里
//
// 用法: node scripts/check-encoding.mjs
// 退出码: 0 = 干净; 1 = 发现损坏 (会列出文件:行:列)

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "css", "scss",
  "md", "mdx", "txt",
  "json", "jsonc",
  "prisma", "sh", "html", "svg", "yml", "yaml",
]);

// 允许个别文件 (例如第三方生成、字体映射) 跳过. 当前为空.
const ALLOWLIST = new Set([]);

function isBadCodepoint(cp) {
  if (cp === 0xfffd) return true; // replacement char
  if (cp >= 0xe000 && cp <= 0xf8ff) return true; // PUA
  return false;
}

function listTrackedFiles() {
  const out = execSync("git ls-files", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function extensionOf(path) {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

const files = listTrackedFiles().filter((f) => {
  if (ALLOWLIST.has(f)) return false;
  return TEXT_EXTENSIONS.has(extensionOf(f));
});

const findings = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!content) continue;

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let col = 0; col < line.length; col++) {
      const cp = line.codePointAt(col);
      if (cp === undefined) continue;
      if (isBadCodepoint(cp)) {
        findings.push({
          file,
          line: i + 1,
          col: col + 1,
          codepoint: "U+" + cp.toString(16).toUpperCase().padStart(4, "0"),
        });
        break; // 每行只报第一个, 避免刷屏
      }
      if (cp > 0xffff) col++; // 跳过代理对低位
    }
  }
}

if (findings.length === 0) {
  console.log("[check-encoding] OK - 未发现 mojibake / 编码损坏字符。");
  process.exit(0);
}

console.error(
  `[check-encoding] 发现 ${findings.length} 处编码损坏字符 (mojibake)。`,
);
console.error(
  "这通常是在错误编码 (如 GBK) 下保存了 UTF-8 中文文件造成的。请用 UTF-8 重新保存修复。",
);
console.error("");

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}
for (const [file, items] of byFile) {
  console.error(`  ${file}  (${items.length} 行受影响)`);
  for (const it of items.slice(0, 5)) {
    console.error(`      L${it.line}:${it.col}  ${it.codepoint}`);
  }
  if (items.length > 5) {
    console.error(`      ... 其余 ${items.length - 5} 行`);
  }
}

process.exit(1);
