"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon, SparklesIcon, Wand2Icon } from "lucide-react";
import {
  AssistantPanel,
  DEFAULT_AI_CHART_MODEL_OPTIONS,
  type AssistantPanelProps,
  type AssistantPanelStatus,
} from "./AssistantPanel";
import { isDocumentDark } from "../utils/documentTheme";
import { ThemeProvider } from "../context/ThemeContext";
import "./AIChartModal.css";

export { DEFAULT_AI_CHART_MODEL_OPTIONS };
export type { AIChartModelOption, ChartGenerationEvent } from "./AssistantPanel";

export interface AIChartModalProps
  extends Omit<AssistantPanelProps, "onRequestClose" | "onStatusChange" | "autoFocus"> {
  isOpen: boolean;
  onClose: () => void;
  /** Whitelabel: modal title (default: "AI Analytics Assistant") */
  title?: string;
}

const IDLE_STATUS: AssistantPanelStatus = {
  isLoading: false,
  transientStatus: null,
  sessionId: null,
};

export function AIChartModal({
  isOpen,
  onClose,
  title: titleProp,
  ...panelProps
}: AIChartModalProps) {
  const modalTitle = titleProp ?? "AI Analytics Assistant";
  const [status, setStatus] = useState<AssistantPanelStatus>(IDLE_STATUS);

  // Re-render when the document theme changes (e.g. next-themes) so the header follows it immediately.
  const [, setDocDarkMode] = useState(false);
  useLayoutEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    setDocDarkMode(isDocumentDark());
    const observer = new MutationObserver(() => setDocDarkMode(isDocumentDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, [isOpen]);

  // The panel unmounts while closed, which resets the conversation.
  useEffect(() => {
    if (!isOpen) setStatus(IDLE_STATUS);
  }, [isOpen]);

  if (!isOpen) return null;

  // When open, use document theme so toggling theme updates the modal; otherwise use prop.
  // Read from document on render when open so first paint has correct theme (no flash).
  const effectiveDarkMode = isDocumentDark();

  const modalContent = (
    <ThemeProvider darkMode={effectiveDarkMode}>
    <div data-qp-ai-modal data-theme={effectiveDarkMode ? "dark" : "light"}>
      <button
        type="button"
        className="qp-ai-modal-backdrop"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div className="qp-ai-modal-wrap">
        <div className="qp-ai-modal-dialog" role="dialog" aria-modal="true">
          <div className="qp-ai-modal-header">
            <div className="qp-ai-modal-header-inner">
              <div className="qp-ai-modal-header-brand">
                <div className="qp-ai-modal-header-icon">
                  <SparklesIcon className="w-4 h-4" style={{ color: "#fff" }} />
                </div>
                <div>
                  <h2 className="qp-ai-modal-title">{modalTitle}</h2>
                  <p className="qp-ai-modal-subtitle">
                    Ask questions, explore data, and add reports to your dashboard
                  </p>
                </div>
              </div>
              <div className="qp-ai-modal-header-actions">
                {status.isLoading && (
                  <div className="qp-ai-modal-status-pill" aria-live="polite">
                    <span className="qp-ai-modal-status-dot" />
                    <span className="qp-ai-modal-status-text">{status.transientStatus ?? "Working"}</span>
                  </div>
                )}
                {!status.isLoading && status.sessionId && (
                  <div className="qp-ai-modal-session-pill" title={`Session: ${status.sessionId}`}>
                    <Wand2Icon className="w-4 h-4" />
                    <span className="qp-ai-modal-session-pill-text">Session</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="qp-ai-modal-close"
                  aria-label="Close"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <AssistantPanel
            {...panelProps}
            darkMode={effectiveDarkMode}
            onRequestClose={onClose}
            onStatusChange={setStatus}
          />
        </div>
      </div>
    </div>
    </ThemeProvider>
  );

  if (typeof document === "undefined" || !document.body) {
    return modalContent;
  }
  return createPortal(modalContent, document.body);
}
