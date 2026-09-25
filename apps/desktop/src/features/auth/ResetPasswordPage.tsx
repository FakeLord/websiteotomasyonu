import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import {
  requestPasswordResetInputSchema,
  type RequestPasswordResetInput,
} from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

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
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold text-slate-900">{tr.auth.resetTitle}</h1>
          <p className="text-sm text-slate-500">{tr.auth.resetDescription}</p>
        </div>

        {sent ? (
          <p className="text-sm text-green-700">{tr.auth.resetSent}</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                {tr.auth.email}
              </label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {tr.auth.resetButton}
            </Button>
          </form>
        )}

        <div className="text-center">
          <Link to="/login" className="text-sm text-slate-500 hover:underline">
            {tr.auth.backToLogin}
          </Link>
        </div>
      </div>
    </div>
  );
}
