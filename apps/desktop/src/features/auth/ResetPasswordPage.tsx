import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { requestPasswordResetInputSchema, type RequestPasswordResetInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { AuthShell, FieldError } from "./AuthShell";

export function ResetPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetInputSchema),
  });

  const onSubmit = async (values: RequestPasswordResetInput) => {
    await supabase.auth.resetPasswordForEmail(values.email);
    setSent(true);
  };

  return (
    <AuthShell title={tr.auth.resetTitle} description={tr.auth.resetDescription}>
      {sent ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-[#4ade80]">{tr.auth.resetSent}</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="email">{tr.auth.email}</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            <FieldError message={errors.email?.message} />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
            {tr.auth.resetButton}
          </Button>
        </form>
      )}
      <div className="mt-4 text-center">
        <Link to="/login" className="text-sm text-muted hover:text-text">
          {tr.auth.backToLogin}
        </Link>
      </div>
    </AuthShell>
  );
}
