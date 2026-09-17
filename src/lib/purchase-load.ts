export const BUILTIN_PURCHASE_SOURCE_NAMES = [
  "Makro",
  "ตลาด",
  "Shopee",
  "TikTok",
] as const;

export function sourceChoicesForForm(
  sources: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  if (sources.length > 0) {
    return sources;
  }
  return BUILTIN_PURCHASE_SOURCE_NAMES.map((name) => ({ id: name, name }));
}

export function unitsForPurchaseForm<T>(units: {
  rows: T[];
  failed: boolean;
}): T[] {
  if (units.failed) {
    return [];
  }
  return units.rows;
}

export function purchaseFormLoadError(args: {
  unitsFailed: boolean;
  ingredientsFailed: boolean;
  historyFailed: boolean;
}): string {
  if (args.unitsFailed) {
    return "โหลดหน่วยไม่สำเร็จ";
  }
  if (args.ingredientsFailed) {
    return "โหลดวัตถุดิบไม่สำเร็จ";
  }
  if (args.historyFailed) {
    return "โหลดประวัติซื้อไม่สำเร็จ ถ้าเพิ่งอัปเดต ให้รันไฟล์ SQL คลังซื้อเข้าใน Supabase";
  }
  return "";
}

export function unresolvedPurchaseSourceMessage(hasSourceInput: boolean): string {
  if (hasSourceInput) {
    return "บันทึกไม่สำเร็จ ถ้าเพิ่งอัปเดต ให้รันไฟล์ SQL คลังซื้อเข้าใน Supabase";
  }
  return "กรอกวันที่ซื้อและแหล่งซื้อ";
}
