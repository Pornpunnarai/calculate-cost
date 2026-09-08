"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { createBrowserClient } from "@/lib/supabase/client";
import type { Unit } from "@/lib/types";
import { canDeleteUnit } from "@/lib/validation";

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const supabase = createBrowserClient();
      const { data, error: loadError } = await supabase
        .from("units")
        .select("*")
        .order("created_at");
      if (loadError) {
        setError("โหลดหน่วยไม่สำเร็จ");
        return;
      }
      setUnits((data ?? []) as Unit[]);
    } catch {
      setError("โหลดหน่วยไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!name.trim() || !symbol.trim()) {
        setError("กรอกชื่อและสัญลักษณ์หน่วย");
        return;
      }
      const supabase = createBrowserClient();
      const { error: insertError } = await supabase.from("units").insert({
        name: name.trim(),
        symbol: symbol.trim(),
        is_builtin: false,
      });
      if (insertError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      setName("");
      setSymbol("");
      await load();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    }
  }

  async function onDelete(unit: Unit) {
    setError("");
    try {
      const supabase = createBrowserClient();
      const { count, error: countError } = await supabase
        .from("ingredients")
        .select("id", { count: "exact", head: true })
        .eq("purchase_unit_id", unit.id);
      if (countError) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      if (!canDeleteUnit(unit.is_builtin, count ?? 0)) {
        setError(
          unit.is_builtin
            ? "ลบหน่วยระบบไม่ได้"
            : "ลบไม่ได้ เพราะมีวัตถุดิบใช้หน่วยนี้อยู่",
        );
        return;
      }
      const { error: deleteError } = await supabase
        .from("units")
        .delete()
        .eq("id", unit.id);
      if (deleteError) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      await load();
    } catch {
      setError("ลบไม่สำเร็จ");
    }
  }

  return (
    <section>
      <h1>หน่วย</h1>
      {error ? <ErrorBanner message={error} /> : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="unit-name">ชื่อ</label>
        <input
          id="unit-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="unit-symbol">สัญลักษณ์</label>
        <input
          id="unit-symbol"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          placeholder="อัน, ใบ, แก้ว"
        />
        <button type="submit">เพิ่มหน่วย</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>สัญลักษณ์</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.id}>
              <td>{unit.name}</td>
              <td>{unit.symbol}</td>
              <td>
                {unit.is_builtin ? null : (
                  <button type="button" onClick={() => void onDelete(unit)}>
                    ลบ
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
