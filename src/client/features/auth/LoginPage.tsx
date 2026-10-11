import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import type { LoginRedirectState } from "../../components/layout/RequireAuth.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { TextField } from "../../components/ui/TextField.tsx";
import { api } from "../../lib/api.ts";
import { useAuthStatus } from "../../lib/queries.ts";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";
import { AuthLayout } from "./AuthLayout.tsx";

/** One password field (spec §8.2). Too many tries shows "Too many tries, wait N min". */
export function LoginPage() {
  const auth = useAuthStatus().data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const from = (useLocation().state as LoginRedirectState | null)?.from ?? "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (auth && !auth.setupDone) return <Navigate to="/setup" replace />;
  if (auth?.loggedIn && !busy) return <Navigate to={from} replace />;

  async function logIn(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.login(password);
      // Everything cached belongs to the old session: reload it (this also resumes the save queue).
      await qc.invalidateQueries();
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyErrorMessage(err));
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      mood="wave"
      title="Welcome back!"
      subtitle="Log in to see your class."
      footer={
        <Link
          to="/reset"
          className="inline-flex min-h-14 items-center rounded-full px-5 font-display text-lg font-semibold text-forest underline-offset-4 hover:bg-white/70 hover:underline"
        >
          Forgot password?
        </Link>
      }
    >
      <form onSubmit={(e) => void logIn(e)} className="flex flex-col gap-5" noValidate>
        {/* Lets password managers file the password under a name. */}
        <input type="text" name="username" autoComplete="username" value="teacher" readOnly hidden />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(undefined);
          }}
          error={error}
        />
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
