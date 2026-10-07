import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router-dom";
import { setPasswordInputSchema, type SetPasswordInput } from "@lbf/contracts";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { AuthShell, FieldError } from "./AuthShell";
import { parseOtpLink } from "./otp-link";

/**
 * Davet ve şifre sıfırlama e-postalarının hedefi. Tek kullanımlık belirteç formu
 * gönderirken doğrulanır (sayfa açılışında değil): böylece bağlantı önizleyicileri
 * veya sayfanın yeniden çizilmesi belirteci tüketemez.
 */
export function SetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const link = parseOtpLink(location.search);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordInput>({ resolver: zodResolver(setPasswordInputSchema) });

  if (!link) {
    return (
      <AuthShell title={tr.auth.setPasswordTitle}>
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-[#f87171]">{tr.auth.otpLinkInvalid}</p>
        <div className="mt-4 text-center">
          <button type="button" onClick={() => navigate("/login", { replace: true })} className="text-sm text-muted hover:text-text">
            {tr.auth.backToLogin}
          </button>
        </div>
      </AuthShell>
    );
  }

  const onSubmit = async (values: SetPasswordInput) => {
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
    if (verifyError) {
      setError(tr.auth.otpLinkInvalid);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
    if (updateError) {
      setError(tr.auth.setPasswordError);
      return;
    }
    navigate("/", { replace: true });
  };

  const description =
    link.type === "invite" ? tr.auth.setPasswordInviteDescription : tr.auth.setPasswordRecoveryDescription;

  return (
    <AuthShell title={tr.auth.setPasswordTitle} description={description}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="password">{tr.auth.newPassword}</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          <FieldError message={errors.password ? tr.auth.passwordTooShort : undefined} />
        </div>
        <div>
          <Label htmlFor="confirm">{tr.auth.confirmPassword}</Label>
          <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
          <FieldError message={errors.confirm ? tr.auth.passwordMismatch : undefined} />
        </div>
        {error && <p className="text-sm text-[#f87171]">{error}</p>}
        <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
          {tr.auth.setPasswordButton}
        </Button>
      </form>
    </AuthShell>
  );
}
