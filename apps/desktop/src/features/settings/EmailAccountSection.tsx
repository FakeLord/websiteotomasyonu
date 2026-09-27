import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Inbox, Loader2, Mail, Send } from "lucide-react";
import { suggestImapServer } from "@lbf/core";
import { getEmailAccount, setEmailAccount, type EmailAccountConfig } from "../../lib/email-account";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { formatDateTime } from "../../lib/format";
import { pollInboxOnce, useImapStatus } from "../../workers/imap-poller";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label } from "../../components/ui/input";
import { Card, CardBody, CardHeader } from "../../components/ui/card";

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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const imap = useImapStatus();

  useEffect(() => {
    void getEmailAccount()
      .then((existing) => {
        if (existing) setForm(existing);
      })
      .catch(() => undefined);
  }, []);

  const set = <K extends keyof EmailAccountConfig>(key: K, value: EmailAccountConfig[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      // SMTP sunucusu yazılırken IMAP sunucusu boşsa öneriyle doldurulur.
      if (key === "smtpHost" && !f.imapHost) {
        const suggestion = suggestImapServer(String(value));
        if (suggestion) Object.assign(next, { imapHost: suggestion.host, imapPort: suggestion.port });
      }
      return next;
    });
  const complete = form.smtpHost && form.smtpPort && form.smtpUsername && form.smtpPassword && form.fromEmail;

  const save = async () => {
    setBusy("save");
    setMessage(null);
    try {
      await setEmailAccount(form);
      setMessage({ ok: true, text: tr.settings.saveSuccess });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : tr.settings.saveError });
    } finally {
      setBusy(null);
    }
  };

  const checkInbox = async () => {
    if (!workspaceId) return;
    setMessage(null);
    try {
      await setEmailAccount(form);
      const summary = await pollInboxOnce(workspaceId);
      if (!summary) setMessage({ ok: false, text: tr.settings.inboxUnavailable });
    } catch {
      // Hata useImapStatus üzerinden aşağıda gösterilir.
    }
  };

  const sendTest = async () => {
    setBusy("test");
    setMessage(null);
    try {
      await invoke("send_email", {
        smtp: {
          host: form.smtpHost,
          port: form.smtpPort,
          username: form.smtpUsername,
          password: form.smtpPassword,
          from_name: form.fromName,
          from_email: form.fromEmail,
        },
        message: { to_email: form.fromEmail, subject: tr.settings.testEmailSubject, body: tr.settings.testEmailBody },
      });
      setMessage({ ok: true, text: tr.settings.testEmailSent(form.fromEmail) });
    } catch (err) {
      setMessage({ ok: false, text: `${tr.settings.testEmailFailed}: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <Mail className="size-4" />
            </span>
            {tr.settings.emailAccountTitle}
          </span>
        }
      />
      <CardBody className="space-y-4">
        <p className="text-sm text-muted">{tr.settings.emailAccountDescription}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label>{tr.settings.smtpHostLabel}</Label>
            <Input value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <Label>{tr.settings.smtpPortLabel}</Label>
            <Input type="number" value={form.smtpPort} onChange={(e) => set("smtpPort", Number(e.target.value))} />
          </div>
          <div>
            <Label>{tr.settings.smtpUsernameLabel}</Label>
            <Input value={form.smtpUsername} onChange={(e) => set("smtpUsername", e.target.value)} />
          </div>
          <div>
            <Label>{tr.settings.smtpPasswordLabel}</Label>
            <Input type="password" autoComplete="off" value={form.smtpPassword} onChange={(e) => set("smtpPassword", e.target.value)} />
          </div>
          <div>
            <Label>{tr.settings.fromNameLabel}</Label>
            <Input value={form.fromName} onChange={(e) => set("fromName", e.target.value)} />
          </div>
          <div>
            <Label>{tr.settings.fromEmailLabel}</Label>
            <Input type="email" value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} />
          </div>
          <div>
            <Label>{tr.settings.imapHostLabel}</Label>
            <Input
              value={form.imapHost ?? ""}
              onChange={(e) => set("imapHost", e.target.value)}
              placeholder={suggestImapServer(form.smtpHost)?.host ?? "imap.gmail.com"}
            />
          </div>
          <div>
            <Label>{tr.settings.imapPortLabel}</Label>
            <Input type="number" value={form.imapPort ?? 993} onChange={(e) => set("imapPort", Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-subtle">{tr.settings.imapHint}</p>
        <p className="text-xs text-subtle">{tr.settings.appPasswordHint}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy || !complete} onClick={() => void save()}>
            {tr.settings.saveButton}
          </Button>
          <Button variant="outline" disabled={!!busy || !complete} onClick={() => void sendTest()}>
            <Send />
            {busy === "test" ? tr.settings.testing : tr.settings.testEmail}
          </Button>
          <Button variant="outline" disabled={!!busy || imap.running || !complete || !form.imapHost || !workspaceId} onClick={() => void checkInbox()}>
            {imap.running ? <Loader2 className="animate-spin" /> : <Inbox />}
            {tr.settings.checkInbox}
          </Button>
        </div>
        {message && <p className={`text-xs ${message.ok ? "text-[#4ade80]" : "text-[#f87171]"}`}>{message.text}</p>}
        {imap.lastRunAt && (
          <p className={`text-xs ${imap.lastError ? "text-[#f87171]" : "text-muted"}`}>
            {tr.settings.inboxLastCheck(formatDateTime(imap.lastRunAt))}{" "}
            {imap.lastError
              ? `${tr.settings.inboxError}: ${imap.lastError}`
              : imap.lastSummary && tr.settings.inboxSummary(imap.lastSummary.imported, imap.lastSummary.bounces)}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
