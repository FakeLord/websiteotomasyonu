import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { loginInputSchema, type LoginInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export function LoginPage() {
  const [authError, setAuthError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema) });

  const onSubmit = async (values: LoginInput) => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        setAuthError(tr.auth.loginError);
      }
    } catch {
      // secureStorage (Windows Credential Manager) veya ağ katmanındaki
      // beklenmeyen bir hata kullanıcıyı sessizce ekranda bırakmasın.
      setAuthError(tr.auth.loginError);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold text-slate-900">{tr.app.name}</h1>
          <p className="text-sm text-slate-500">{tr.auth.loginTitle}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="email">
            {tr.auth.email}
          </label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700" htmlFor="password">
            {tr.auth.password}
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
        </div>

        {authError && <p className="text-sm text-red-600">{authError}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {tr.auth.loginButton}
        </Button>

        <div className="text-center">
          <Link to="/reset-password" className="text-sm text-slate-500 hover:underline">
            {tr.auth.forgotPassword}
          </Link>
        </div>
      </form>
    </div>
  );
}
