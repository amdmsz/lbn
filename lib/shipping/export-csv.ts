export type ShippingExportCsvRow = {
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  productName: string;
  qty: number;
  codAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
  remark: string;
};

function escapeCsvCell(value: string | number | boolean) {
  const stringValue = String(value ?? "");
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

export function buildShippingExportCsvContent(rows: ShippingExportCsvRow[]) {
  const headers = [
    "姓名",
    "号码",
    "地址",
    "品名",
    "件数",
    "代收金额",
    "是否保价",
    "保价金额",
    "备注",
  ];

  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(","),
    ...rows.map((row) =>
      [
        row.receiverName,
        row.receiverPhone,
        row.receiverAddress,
        row.productName,
        row.qty,
        row.codAmount,
        row.insuranceRequired ? "是" : "否",
        row.insuranceAmount,
        row.remark,
      ]
        .map((value) => escapeCsvCell(value))
        .join(","),
    ),
  ];

  return `\uFEFF${lines.join("\n")}`;
}
