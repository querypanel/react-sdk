"use client";

import { useLayoutEffect, useState } from "react";
import { CheckCircle2, Rocket } from "lucide-react";
import { isDocumentDark } from "../utils/documentTheme";
import "./DeploySuccessModal.css";

export interface DeploySuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dark mode. When undefined, auto-detects from DOM (html class/data-theme). */
  darkMode?: boolean;
}

export function DeploySuccessModal({
  open,
  onOpenChange,
  darkMode,
}: DeploySuccessModalProps) {
  const [docDarkMode, setDocDarkMode] = useState(false);

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;

    const sync = () => setDocDarkMode(isDocumentDark());
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, [open]);

  if (!open) return null;

  const docDarkLive = open ? isDocumentDark() : false;
  const effectiveDarkMode =
    darkMode !== undefined ? darkMode : docDarkLive || docDarkMode;

  return (
    <div
      data-qp-deploy-success
      data-theme={effectiveDarkMode ? "dark" : "light"}
    >
      <button
        type="button"
        className="qp-deploy-success-backdrop"
        onClick={() => onOpenChange(false)}
        aria-label="Close"
      />
      <div
        className="qp-deploy-success-wrap"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qp-deploy-success-title"
      >
        <div className="qp-deploy-success-dialog">
          <div className="qp-deploy-success-accent" />
          <div className="qp-deploy-success-body">
            <div className="qp-deploy-success-icon-wrap">
              <div className="qp-deploy-success-icon-badge">
                <CheckCircle2 size={36} className="qp-deploy-success-check" />
                <Rocket size={16} className="qp-deploy-success-rocket" />
              </div>
            </div>
            <div className="qp-deploy-success-copy">
              <h2 id="qp-deploy-success-title" className="qp-deploy-success-title">
                Deployed Successfully!
              </h2>
              <p className="qp-deploy-success-message">
                Your dashboard has been deployed to all of your customers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
