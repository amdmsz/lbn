import { readFileSync } from "node:fs";

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = keyFn(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function parseMapName(text) {
  return text.match(/\bmap:\s*"([^"]+)"/)?.[1] ?? null;
}

function parseBracketFields(text, key) {
  const pattern = key
    ? new RegExp(`${key}\\s*:\\s*\\[([^\\]]+)\\]`)
    : /\[([^\]]+)\]/;
  const match = text.match(pattern);

  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

function defaultName(tableName, fields, suffix) {
  return `${tableName}_${fields.join("_")}_${suffix}`;
}

function cleanLine(line) {
  return line.replace(/\s+\/\/.*$/, "").trim();
}

export function parsePrismaNameExpectations(schemaText) {
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  const tables = [];
  const indexes = [];
  const foreignKeys = [];

  let match;
  while ((match = modelRe.exec(schemaText))) {
    const modelName = match[1];
    const body = match[2];
    const tableName = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName;

    tables.push(tableName);

    for (const rawLine of body.split(/\r?\n/)) {
      const line = cleanLine(rawLine);

      if (!line || line.startsWith("//")) {
        continue;
      }

      if (line.startsWith("@@index")) {
        const fields = parseBracketFields(line);

        if (fields.length > 0) {
          indexes.push({
            tableName,
            expectedName: parseMapName(line) ?? defaultName(tableName, fields, "idx"),
            source: line,
          });
        }

        continue;
      }

      if (line.startsWith("@@unique")) {
        const fields = parseBracketFields(line);

        if (fields.length > 0) {
          indexes.push({
            tableName,
            expectedName: parseMapName(line) ?? defaultName(tableName, fields, "key"),
            source: line,
          });
        }

        continue;
      }

      const fieldName = line.match(/^(\w+)\s+/)?.[1];

      if (!fieldName) {
        continue;
      }

      if (/@unique\b/.test(line)) {
        const uniqueText = line.slice(line.indexOf("@unique"));
        indexes.push({
          tableName,
          expectedName: parseMapName(uniqueText) ?? defaultName(tableName, [fieldName], "key"),
          source: line,
        });
      }

      if (/@relation\b/.test(line) && /\bfields\s*:/.test(line)) {
        const fields = parseBracketFields(line, "fields");

        if (fields.length > 0) {
          foreignKeys.push({
            tableName,
            expectedName: parseMapName(line) ?? defaultName(tableName, fields, "fkey"),
            source: line,
          });
        }
      }
    }
  }

  return {
    tables: [...new Set(tables)],
    indexes: uniqueBy(indexes, (item) => `${item.tableName}:${item.expectedName}`),
    foreignKeys: uniqueBy(foreignKeys, (item) => `${item.tableName}:${item.expectedName}`),
  };
}

export function loadPrismaNameExpectations(schemaPath) {
  return parsePrismaNameExpectations(readFileSync(schemaPath, "utf8"));
}

function groupNamesByTable(rows, tableKey, nameKey) {
  const grouped = new Map();

  for (const row of rows) {
    const tableName = row[tableKey];
    const name = row[nameKey];

    if (!grouped.has(tableName)) {
      grouped.set(tableName, []);
    }

    grouped.get(tableName).push(name);
  }

  return grouped;
}

function findCaseOnlyDrift(expectedNames, actualNames, makeDrift) {
  const actualSet = new Set(actualNames);
  const actualByLower = new Map();
  const drift = [];

  for (const actualName of actualNames) {
    const lowerName = actualName.toLowerCase();

    if (!actualByLower.has(lowerName)) {
      actualByLower.set(lowerName, []);
    }

    actualByLower.get(lowerName).push(actualName);
  }

  for (const expectedName of expectedNames) {
    if (actualSet.has(expectedName)) {
      continue;
    }

    const caseMatches =
      actualByLower.get(expectedName.toLowerCase())?.filter((name) => name !== expectedName) ?? [];

    if (caseMatches.length > 0) {
      drift.push(makeDrift(expectedName, caseMatches));
    }
  }

  return drift;
}

export async function readDatabaseNameDrift(prisma, expectations) {
  const lowerCaseRows = await prisma.$queryRawUnsafe("SHOW VARIABLES LIKE 'lower_case_table_names'");
  const lowerCaseTableNames = String(lowerCaseRows[0]?.Value ?? lowerCaseRows[0]?.value ?? "");

  if (lowerCaseTableNames !== "0") {
    return {
      lowerCaseTableNames,
      skipped: true,
      tables: [],
      indexes: [],
      foreignKeys: [],
    };
  }

  const tableRows = await prisma.$queryRawUnsafe(`
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  const actualTables = tableRows.map((row) => row.TABLE_NAME);
  const actualTableSet = new Set(actualTables);
  const tableDrift = findCaseOnlyDrift(expectations.tables, actualTables, (expectedName, actualNames) => ({
    type: "table",
    expectedName,
    actualNames,
  }));

  const indexRows = await prisma.$queryRawUnsafe(`
    SELECT TABLE_NAME, INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    GROUP BY TABLE_NAME, INDEX_NAME
  `);
  const indexesByTable = groupNamesByTable(indexRows, "TABLE_NAME", "INDEX_NAME");
  const indexDrift = [];

  for (const tableName of actualTableSet) {
    const expectedNames = expectations.indexes
      .filter((item) => item.tableName === tableName)
      .map((item) => item.expectedName);

    indexDrift.push(
      ...findCaseOnlyDrift(expectedNames, indexesByTable.get(tableName) ?? [], (expectedName, actualNames) => ({
        type: "index",
        tableName,
        expectedName,
        actualNames,
      })),
    );
  }

  const foreignKeyRows = await prisma.$queryRawUnsafe(`
    SELECT TABLE_NAME, CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  `);
  const foreignKeysByTable = groupNamesByTable(foreignKeyRows, "TABLE_NAME", "CONSTRAINT_NAME");
  const foreignKeyDrift = [];

  for (const tableName of actualTableSet) {
    const expectedNames = expectations.foreignKeys
      .filter((item) => item.tableName === tableName)
      .map((item) => item.expectedName);

    foreignKeyDrift.push(
      ...findCaseOnlyDrift(expectedNames, foreignKeysByTable.get(tableName) ?? [], (expectedName, actualNames) => ({
        type: "foreignKey",
        tableName,
        expectedName,
        actualNames,
      })),
    );
  }

  return {
    lowerCaseTableNames,
    skipped: false,
    tables: tableDrift,
    indexes: indexDrift,
    foreignKeys: foreignKeyDrift,
  };
}

export function hasNameDrift(drift) {
  return drift.tables.length > 0 || drift.indexes.length > 0 || drift.foreignKeys.length > 0;
}

export function formatNameDriftReport(drift, { limit = 40 } = {}) {
  const rows = [
    ...drift.tables,
    ...drift.indexes,
    ...drift.foreignKeys,
  ];
  const shown = rows.slice(0, limit);
  const lines = shown.map((item) => {
    const tablePrefix = item.tableName ? `${item.tableName}.` : "";
    return `- ${item.type}: ${tablePrefix}${item.expectedName} <= ${item.actualNames.join(", ")}`;
  });

  if (rows.length > shown.length) {
    lines.push(`- ... ${rows.length - shown.length} more`);
  }

  return lines.join("\n");
}
