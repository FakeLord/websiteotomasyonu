import { useEffect, useState, type ReactNode } from "react";
import { getEmailAccount, setEmailAccount, type EmailAccountConfig } from "../../lib/email-account";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const EMPTY: EmailAccountConfig = {
  smtpHost: "",
  smtpPort: 587,
  smtpUsername: "",
  smtpPassword: "",
  fromName: "",
  fromEmail: "",
};

export function EmailAccountSection() {
  const [form, setForm] = useState<EmailAccountConfig>(EMPTY);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getEmailAccount().then((existing) => {
      if (existing) setForm(existing);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setEmailAccount(form);
      setMessage(tr.settings.saveSuccess);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : tr.settings.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <div>
        <h2 className="text-lg font-medium text-slate-900">{tr.settings.emailAccountTitle}</h2>
        <p className="text-sm text-slate-500">{tr.settings.emailAccountDescription}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={tr.settings.smtpHostLabel}>
          <Input value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
        </Field>
        <Field label={tr.settings.smtpPortLabel}>
          <Input type="number" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} />
        </Field>
        <Field label={tr.settings.smtpUsernameLabel}>
          <Input value={form.smtpUsername} onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })} />
        </Field>
        <Field label={tr.settings.smtpPasswordLabel}>
          <Input type="password" value={form.smtpPassword} onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })} />
        </Field>
        <Field label={tr.settings.fromNameLabel}>
          <Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
        </Field>
        <Field label={tr.settings.fromEmailLabel}>
          <Input type="email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
        </Field>
      </div>
      <Button disabled={saving} onClick={() => void save()}>
        {tr.settings.saveButton}
      </Button>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-xs text-slate-600">
      <span>{label}</span>
      {children}
    </label>
  );
}
