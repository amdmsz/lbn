"use client";

import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, LogIn, Sparkles, UserRound } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const text = {
  mobileBrand: "Lbn CRM",
  kicker: "INTERNAL WORKSPACE",
  title: "\u767b\u5f55\u5230\u5de5\u4f5c\u53f0",
  subtitle: "\u7edf\u4e00\u8fdb\u5165\u5ba2\u6237\u3001\u76f4\u64ad\u3001\u8ba2\u5355\u3001\u5c65\u7ea6\u4e0e\u8d22\u52a1\u534f\u540c\u7cfb\u7edf\u3002",
  passwordChanged: "\u5bc6\u7801\u5df2\u66f4\u65b0\uff0c\u8bf7\u4f7f\u7528\u65b0\u5bc6\u7801\u91cd\u65b0\u767b\u5f55\u3002",
  username: "\u8d26\u53f7",
  usernamePlaceholder: "\u8bf7\u8f93\u5165\u5185\u90e8\u8d26\u53f7",
  password: "\u5bc6\u7801",
  passwordPlaceholder: "\u8bf7\u8f93\u5165\u5bc6\u7801",
  hidePassword: "\u9690\u85cf\u5bc6\u7801",
  showPassword: "\u663e\u793a\u5bc6\u7801",
  error: "\u8d26\u53f7\u6216\u5bc6\u7801\u4e0d\u6b63\u786e\uff0c\u8bf7\u786e\u8ba4\u8d26\u53f7\u5df2\u542f\u7528\uff0c\u6216\u8054\u7cfb\u7ba1\u7406\u5458\u91cd\u7f6e\u5bc6\u7801\u3002",
  pending: "\u767b\u5f55\u4e2d...",
  submit: "\u767b\u5f55",
  note: "\u6682\u65e0\u8d26\u53f7\uff1f\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u5f00\u901a\u3002\u9996\u6b21\u767b\u5f55\u5982\u9700\u6539\u5bc6\uff0c\u8bf7\u6309\u7cfb\u7edf\u63d0\u793a\u5b8c\u6210\u3002",
  opCustomer: "\u5ba2\u6237\u8fd0\u8425",
  opLive: "\u76f4\u64ad\u9080\u7ea6",
  opOrder: "\u6210\u4ea4\u5c65\u7ea6",
  brandArea: "\u54c1\u724c\u89c6\u89c9\u533a\u57df",
  formArea: "\u767b\u5f55\u8868\u5355\u533a\u57df",
};

function resolveLoginTarget(resultUrl: string | null | undefined, fallbackPath: string) {
  if (!resultUrl) return fallbackPath;
  if (typeof window === "undefined") return resultUrl;

  try {
    const resolvedUrl = new URL(resultUrl, window.location.origin);
    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}` || fallbackPath;
  } catch {
    return resultUrl.startsWith("/") ? resultUrl : fallbackPath;
  }
}

function AnimatedCharacters({ peeking, active }: { peeking: boolean; active: boolean }) {
  return (
    <div className="login-v2-characters" data-peeking={peeking} data-active={active}>
      <div className="login-v2-character login-v2-character-blue">
        <span className="login-v2-eye login-v2-eye-left" />
        <span className="login-v2-eye login-v2-eye-right" />
      </div>
      <div className="login-v2-character login-v2-character-ink">
        <span className="login-v2-eye login-v2-eye-left" />
        <span className="login-v2-eye login-v2-eye-right" />
      </div>
      <div className="login-v2-character login-v2-character-coral">
        <span className="login-v2-dot-eye login-v2-eye-left" />
        <span className="login-v2-dot-eye login-v2-eye-right" />
      </div>
      <div className="login-v2-character login-v2-character-gold">
        <span className="login-v2-dot-eye login-v2-eye-left" />
        <span className="login-v2-dot-eye login-v2-eye-right" />
        <span className="login-v2-mouth" />
      </div>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"username" | "password" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });

    setPending(false);

    if (!result || result.error) {
      setError(text.error);
      return;
    }

    router.push(resolveLoginTarget(result.url, callbackUrl));
    router.refresh();
  }

  return (
    <main className="login-v2">
      <section className="login-v2-left" aria-label={text.brandArea}>
        <div className="login-v2-brand-row">
          <div className="login-v2-brand-mark">
            <span />
            <span />
          </div>
          <span className="login-v2-brand-name">Lbn CRM</span>
        </div>

        <AnimatedCharacters peeking={showPassword} active={focusedField === "password" || password.length > 0} />

        <div className="login-v2-left-footer">
          <span>{text.opCustomer}</span>
          <span>{text.opLive}</span>
          <span>{text.opOrder}</span>
        </div>
      </section>

      <section className="login-v2-right" aria-label={text.formArea}>
        <div className="login-v2-form-wrap">
          <div className="login-v2-mobile-brand">
            <div className="login-v2-brand-mark">
              <span />
              <span />
            </div>
            <span>{text.mobileBrand}</span>
          </div>

          <div className="login-v2-form-header">
            <p className="login-v2-kicker">
              <Sparkles className="h-4 w-4" /> {text.kicker}
            </p>
            <h1>{text.title}</h1>
            <p>{text.subtitle}</p>
          </div>

          <form className="login-v2-form" onSubmit={handleSubmit}>
            {passwordChanged ? <div className="login-v2-success">{text.passwordChanged}</div> : null}

            <label className="login-v2-field">
              <span>{text.username}</span>
              <div className="login-v2-input-shell">
                <UserRound className="h-5 w-5" />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onFocus={() => setFocusedField("username")}
                  onBlur={() => setFocusedField(null)}
                  autoComplete="username"
                  placeholder={text.usernamePlaceholder}
                  required
                />
              </div>
            </label>

            <label className="login-v2-field">
              <span>{text.password}</span>
              <div className="login-v2-input-shell">
                <LockKeyhole className="h-5 w-5" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder={text.passwordPlaceholder}
                  required
                />
                <button
                  type="button"
                  className="login-v2-eye-button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? text.hidePassword : text.showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error ? <div className="login-v2-error">{error}</div> : null}

            <button type="submit" disabled={pending} className="login-v2-submit">
              <span>{pending ? text.pending : text.submit}</span>
              <LogIn className="h-4 w-4" />
            </button>
          </form>

          <div className="login-v2-note">{text.note}</div>
        </div>
      </section>
    </main>
  );
}
