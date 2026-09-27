import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { loginInputSchema, type LoginInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { AuthShell, FieldError } from "./AuthShell";

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
    <AuthShell title={tr.auth.loginTitle} description={tr.auth.loginSubtitle}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="email">{tr.auth.email}</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="password">{tr.auth.password}</Label>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
          <FieldError message={errors.password?.message} />
        </div>
        {authError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">{authError}</p>}
        <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
          {tr.auth.loginButton}
        </Button>
        <div className="text-center">
          <Link to="/reset-password" className="text-sm text-muted hover:text-text">
            {tr.auth.forgotPassword}
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
