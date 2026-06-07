"use client";

/**
 * Mobile proxy connection settings drawer.
 *
 * 从 mobile-app-shell.tsx 抽出 (Phase 2 plan).
 * 自包含: 自身管理 serverUrl / message / pending 三个本地 state.
 * 父组件只负责传入 profile / onClose / onSaved.
 */

import { useState } from "react";
import { X } from "lucide-react";
import {
  reloadNativeApp,
  saveNativeConnectionProfile,
  testNativeConnection,
  type NativeConnectionProfile,
} from "@/lib/calls/native-mobile-call";

export function ConnectionSettingsDrawer({
  profile,
  onClose,
  onSaved,
}: Readonly<{
  profile: NativeConnectionProfile | null;
  onClose: () => void;
  onSaved: (profile: NativeConnectionProfile) => void;
}>) {
  const [serverUrl, setServerUrl] = useState(
    profile?.serverUrl ?? profile?.defaultServerUrl ?? "https://123.207.59.121/mobile",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function testCurrentConnection() {
    setPending(true);
    setMessage("正在检测连接...");

    try {
      const result = await testNativeConnection(serverUrl);
      setMessage(
        result.ok
          ? `连接正常，HTTP ${result.status ?? 200}`
          : result.message ?? `连接失败，HTTP ${result.status ?? 0}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接检测失败。");
    } finally {
      setPending(false);
    }
  }

  async function saveAndReload() {
    setPending(true);
    setMessage("正在保存代理地址...");

    try {
      const nextProfile = await saveNativeConnectionProfile(serverUrl);
      onSaved(nextProfile);
      setMessage("已保存，正在重新连接 CRM。");
      await reloadNativeApp();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "代理地址保存失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[74] md:hidden">
      <button
        type="button"
        aria-label="关闭连接设置"
        onClick={onClose}
        className="absolute inset-0 bg-black/28 backdrop-blur-[8px]"
      />
      <section className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#f7f8fb] px-5 pb-6 pt-4 shadow-[0_-22px_60px_rgba(16,24,40,0.18)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d0d5dd]" />

        <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(16,24,40,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#98a1af]">
                Proxy
              </p>
              <h2 className="mt-1 text-[22px] font-semibold text-[#20242c]">
                连接代理
              </h2>
              <p className="mt-2 text-[13px] leading-5 text-[#667085]">
                手机不在公司 WiFi 时填写公网 HTTPS 代理入口，入口需反代到 CRM 服务器。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[#667085]"
              aria-label="关闭"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <label className="mt-5 grid gap-2 text-[13px] font-medium text-[#667085]">
            CRM / 代理地址
            <input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="https://crm.cclbn.com/mobile"
              className="h-12 rounded-[16px] border border-black/5 bg-[#fbfcfe] px-3 text-[15px] text-[#20242c] outline-none"
            />
          </label>

          {message ? (
            <p className="mt-3 rounded-[14px] bg-[#f7f8fb] px-3 py-2 text-[12px] leading-5 text-[#667085]">
              {message}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={testCurrentConnection}
              className="h-12 rounded-[16px] bg-[#eaf3ff] text-[15px] font-semibold text-[#1677ff] disabled:opacity-60"
            >
              检测
            </button>
            <button
              type="button"
              disabled={pending || !serverUrl.trim()}
              onClick={saveAndReload}
              className="h-12 rounded-[16px] bg-[#1677ff] text-[15px] font-semibold text-white shadow-[0_14px_28px_rgba(22,119,255,0.22)] disabled:bg-[#d0d5dd] disabled:shadow-none"
            >
              保存并重连
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
