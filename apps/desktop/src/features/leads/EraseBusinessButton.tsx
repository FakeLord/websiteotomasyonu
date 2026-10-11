import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { tr } from "../../i18n/tr";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { Button } from "../../components/ui/button";
import { Label, Textarea } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";
import { supabase } from "../../lib/supabase-client";
import { STORAGE_BUCKET } from "../customers/customer-data";
import { rpc } from "../outreach/outreach";

/** Kalıcı silme (ADR 0019): yalnızca yönetici görür; sebep zorunlu; kişisel veri silinir, özetler bastırma listesine yazılır. */
export function EraseBusinessButton({ businessId }: { businessId: string }) {
  const membership = useWorkspaceMembership().data;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const erase = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 3) throw new Error(tr.erase.reasonRequired);
      // Müşteri belgeleri (ADR 0024): kayıtlar cascade ile silinir ama dosyalar kovada kalırdı; önce dosyalar kaldırılır.
      // Dosya silinemezse işlem durur ki yol bilgisi kaybolmadan yeniden denenebilsin.
      const { data: files, error: listError } = await supabase.from("customer_documents").select("file_path").eq("business_id", businessId);
      if (listError) throw new Error(listError.message);
      const paths = (files ?? []).map((f) => f.file_path as string);
      if (paths.length > 0) {
        const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
        if (removeError) throw new Error(removeError.message);
      }
      return rpc("erase_business", { p_business_id: businessId, p_reason: reason.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["businesses"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setOpen(false);
      navigate("/leads");
    },
  });

  if (membership?.role !== "ADMIN") return null;

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Trash2 />
        {tr.erase.button}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) erase.reset();
          setOpen(next);
        }}
      >
        <DialogContent title={tr.erase.title} description={tr.erase.description} size="md">
          <div className="space-y-4">
            <div>
              <Label>{tr.erase.reasonLabel}</Label>
              <Textarea
                value={reason}
                rows={3}
                maxLength={200}
                placeholder={tr.erase.reasonPlaceholder}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {erase.isError && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {erase.error instanceof Error ? erase.error.message : tr.erase.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tr.common.cancel}
              </Button>
              <Button variant="danger" disabled={erase.isPending} onClick={() => erase.mutate()}>
                {erase.isPending && <Loader2 className="animate-spin" />}
                {tr.erase.confirm}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
