export default function MobileLoading() {
  return (
    <main className="lbn-mobile-app mx-auto min-h-[100svh] max-w-[520px] bg-[#f7f8fb]">
      <div className="lbn-mobile-screen px-6">
        <div className="h-10 w-28 rounded-[14px] bg-white" />
        <div className="mt-8 rounded-[24px] bg-white px-5 py-5">
          <div className="h-6 w-32 rounded-full bg-[#eef2f6]" />
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="h-20 rounded-[18px] bg-[#f7f8fb]" />
            <div className="h-20 rounded-[18px] bg-[#f7f8fb]" />
            <div className="h-20 rounded-[18px] bg-[#f7f8fb]" />
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-20 rounded-[22px] bg-white" />
          <div className="h-20 rounded-[22px] bg-white" />
          <div className="h-20 rounded-[22px] bg-white" />
        </div>
      </div>
    </main>
  );
}
