"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeOwnAvatarAction,
  updateOwnAvatarAction,
  type SelfAvatarActionResult,
} from "@/lib/account/self-actions";
import { resolveAvatarSrc } from "@/lib/account/avatar";
import { cn } from "@/lib/utils";

function InitialsAvatar({
  label,
  large = false,
}: Readonly<{
  label: string;
  large?: boolean;
}>) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-accent)_0%,#73d2ff_100%)] font-semibold text-white shadow-[0_10px_18px_rgba(47,107,255,0.18)]",
        large ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm",
      )}
    >
      {label}
    </div>
  );
}

function getInitials(name: string) {
  const tokens = name
    .trim()
    .split(/\s+/)
    .map((item) => item[0])
    .filter(Boolean);

  return (tokens.slice(0, 2).join("") || name.slice(0, 2) || "U").toUpperCase();
}

export function AvatarSettingsPanel({
  user,
  avatarPath,
  onAvatarChange,
}: Readonly<{
  user: {
    name: string;
    username: string;
    roleName: string;
  };
  avatarPath: string | null;
  onAvatarChange: (avatarPath: string | null) => void;
}>) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [state, setState] = useState<SelfAvatarActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const initials = getInitials(user.name);
  const avatarSrc = resolveAvatarSrc(avatarPath);

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await updateOwnAvatarAction(formData);
      setState(result);

      if (result.status === "success") {
        onAvatarChange(result.avatarPath);
        setSelectedFileName("");
        form.reset();
        router.refresh();
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      const result = await removeOwnAvatarAction();
      setState(result);

      if (result.status === "success") {
        onAvatarChange(null);
        setSelectedFileName("");
        inputRef.current?.form?.reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-3.5">
      <div className="flex items-center gap-3">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={user.name}
            className="h-16 w-16 rounded-full object-cover shadow-[0_10px_18px_rgba(15,23,42,0.12)]"
          />
        ) : (
          <InitialsAvatar label={initials} large />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
            {user.name}
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-sidebar-muted)]">
            @{user.username}
          </p>
          <p className="mt-1 text-[12px] text-[var(--color-sidebar-muted)]">
            {user.roleName}
          </p>
        </div>
      </div>

      <form onSubmit={handleUpload} className="space-y-3">
        <label className="block">
          <input
            ref={inputRef}
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) =>
              setSelectedFileName(event.target.files?.[0]?.name ?? "")
            }
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="crm-button crm-button-secondary min-h-0 w-full px-3 py-2 text-sm"
          >
            {selectedFileName ? "重新选择图片" : "选择头像图片"}
          </button>
        </label>

        <p className="text-[12px] text-[var(--color-sidebar-muted)]">
          {selectedFileName || "支持 JPG、PNG、WEBP，2MB 内。"}
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !selectedFileName}
            className="crm-button crm-button-primary min-h-0 flex-1 px-3 py-2 text-sm"
          >
            {pending ? "保存中..." : "保存头像"}
          </button>
          <button
            type="button"
            disabled={pending || !avatarPath}
            onClick={handleRemove}
            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
          >
            移除
          </button>
        </div>
      </form>

      {state?.message ? (
        <p
          className={cn(
            "text-[12px] leading-5",
            state.status === "success" ? "text-[var(--color-success)]" : "text-[var(--color-danger)]",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
