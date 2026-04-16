"use client";

import { CheckCircle2, Rocket } from "lucide-react";

export interface DeploySuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeploySuccessModal({ open, onOpenChange }: DeploySuccessModalProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 bg-black/60 z-50"
        onClick={() => onOpenChange(false)}
        aria-label="Close"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-auto max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-950 rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 pointer-events-auto"
          style={{
            width: "fit-content",
            maxWidth: "min(320px, calc(100vw - 2rem))",
            background: "linear-gradient(to bottom right, var(--bn-colors-editor-background, #fff), #f8fafc)",
          }}
        >
          <div
            style={{
              height: "4px",
              background: "linear-gradient(to right, #3b82f6, #8b5cf6, #ec4899)",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem 1.25rem",
              textAlign: "center",
              gap: "1rem",
            }}
          >
            <div style={{ position: "relative" }}>
              <div
                style={{
                  borderRadius: "9999px",
                  padding: "0.75rem",
                  background: "linear-gradient(to bottom right, #dcfce7, #bbf7d0)",
                  border: "1px solid #86efac",
                }}
              >
                <CheckCircle2
                  size={36}
                  style={{ color: "#16a34a" }}
                />
                <Rocket
                  size={16}
                  style={{
                    color: "#16a34a",
                    position: "absolute",
                    top: "-2px",
                    right: "-2px",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <h2
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "inherit",
                }}
              >
                Deployed Successfully!
              </h2>
              <p
                style={{
                  fontSize: "0.875rem",
                  lineHeight: 1.4,
                  color: "#64748b",
                }}
              >
                Your dashboard has been deployed to all of your customers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
