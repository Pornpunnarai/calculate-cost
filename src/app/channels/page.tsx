"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/error-banner";
import { asNumber, createBrowserClient } from "@/lib/supabase/client";
import type { SalesChannel } from "@/lib/types";
import { isValidFeePercent } from "@/lib/validation";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const supabase = createBrowserClient();
      const { data, error: loadError } = await supabase
        .from("sales_channels")
        .select("*")
        .order("created_at");
      if (loadError) {
        setError("โหลดช่องทางขายไม่สำเร็จ");
        return;
      }
      setChannels(
        (data ?? []).map((row) => ({
          ...row,
          fee_percent: asNumber(row.fee_percent),
        })) as SalesChannel[],
      );
    } catch {
      setError("โหลดช่องทางขายไม่สำเร็จ");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!name.trim() || fee.trim() === "" || !isValidFeePercent(Number(fee))) {
        setError("กรอกชื่อ และ GP% ระหว่าง 0 ถึง 100");
        return;
      }
      const feePercent = Number(fee);
      const supabase = createBrowserClient();
      const { error: insertError } = await supabase.from("sales_channels").insert({
        name: name.trim(),
        fee_percent: feePercent,
      });
      if (insertError) {
        setError("บันทึกไม่สำเร็จ");
        return;
      }
      setName("");
      setFee("");
      await load();
    } catch {
      setError("บันทึกไม่สำเร็จ");
    }
  }

  async function onDelete(id: string) {
    setError("");
    try {
      const supabase = createBrowserClient();
      const { error: deleteError } = await supabase
        .from("sales_channels")
        .delete()
        .eq("id", id);
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
      <h1>ช่องทางขาย</h1>
      {error ? <ErrorBanner message={error} /> : null}
      <form onSubmit={onSubmit}>
        <label htmlFor="ch-name">ชื่อช่องทาง</label>
        <input
          id="ch-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Shopee"
        />
        <label htmlFor="ch-fee">GP (%)</label>
        <input
          id="ch-fee"
          inputMode="decimal"
          value={fee}
          onChange={(event) => setFee(event.target.value)}
          placeholder="12"
        />
        <button type="submit">เพิ่มช่องทาง</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>GP</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => (
            <tr key={channel.id}>
              <td>{channel.name}</td>
              <td>{channel.fee_percent}%</td>
              <td>
                <button type="button" onClick={() => void onDelete(channel.id)}>
                  ลบ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
