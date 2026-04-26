"use client";

export default function MobileError({
  reset,
}: Readonly<{
  reset: () => void;
}>) {
  return (
    <main className="lbn-mobile-app mx-auto flex min-h-[100svh] max-w-[520px] items-center justify-center bg-[#f7f8fb] px-6">
      <div className="w-full rounded-[24px] bg-white px-6 py-8 text-center shadow-[0_16px_36px_rgba(16,24,40,0.06)]">
        <h1 className="text-[24px] font-semibold text-[#20242c]">移动工作台加载失败</h1>
        <p className="mt-3 text-[14px] leading-6 text-[#667085]">请稍后重试，或返回电脑端检查账号权限。</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 h-11 rounded-[14px] bg-[#1677ff] px-5 text-[15px] font-semibold text-white"
        >
          重新加载
        </button>
      </div>
    </main>
  );
}
