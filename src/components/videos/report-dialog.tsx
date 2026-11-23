"use client";

import { useState } from "react";
import { Flag, LoaderCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

const REASONS = [
  { value: "copyright", label: "Copyright infringement" },
  { value: "illegal-content", label: "Illegal content" },
  { value: "minor-safety", label: "Child safety concerns" },
  { value: "adult-misclassification", label: "Adult content misclassified" },
  { value: "broken-playback", label: "Broken playback" },
  { value: "other", label: "Other" },
];

type Status = "idle" | "sending" | "sent" | "error";

export function ReportDialog({ videoId }: { videoId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch(`/api/videos/${videoId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: data.get("reason"),
          details: String(data.get("details") ?? "") || undefined,
          contactEmail: String(data.get("contactEmail") ?? "") || undefined,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error ?? "The report could not be submitted. Please try again.");
        return;
      }
      setStatus("sent");
      form.reset();
    } catch {
      setStatus("error");
      setMessage("Network error — please check your connection and try again.");
    }
  }

  function close() {
    setOpen(false);
    setTimeout(() => {
      setStatus("idle");
      setMessage("");
    }, 300);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClasses("ghost", "md") + " cursor-pointer"}>
        <Flag className="h-4 w-4" aria-hidden="true" /> Report
      </button>

      <Modal open={open} onClose={close} title="Report this video">
        {status === "sent" ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <Flag className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            </div>
            <p className="text-sm text-zinc-300">
              Thank you. Your report has been received and will be reviewed by the platform owner.
            </p>
            <Button variant="ghost" onClick={close}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-xs leading-relaxed text-zinc-500">
              Reports go directly to the VibePlay owner. Content involving minors or copyright
              infringement is handled with highest priority.
            </p>
            <div>
              <Label htmlFor="report-reason">Reason</Label>
              <Select id="report-reason" name="reason" required defaultValue="copyright">
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="report-details">Details</Label>
              <Textarea id="report-details" name="details" placeholder="Describe the issue (optional)…" maxLength={2000} />
            </div>
            <div>
              <Label htmlFor="report-email">Your email (optional)</Label>
              <Input id="report-email" name="contactEmail" type="email" placeholder="you@example.com" maxLength={255} />
            </div>
            {status === "error" && (
              <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {message}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={status === "sending"}>
                {status === "sending" ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending…
                  </>
                ) : (
                  "Submit report"
                )}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
