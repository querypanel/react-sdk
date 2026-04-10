"use client";


import { useState, useEffect, useId, useCallback, useRef } from "react";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ContactSalesDialog } from "@/components/contact-sales-dialog";
import Image from "next/image";
import favicon from "@/app/favicon.svg";
import { trackEvent, trackPageView } from "@/lib/analytics/mixpanel";
import {
  ArrowRightIcon,
  PlayIcon,
  Share2,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  GripVertical,
  Type,
  Heading1,
  BarChart3,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

// Block types
type TextBlock = {
  id: string;
  type: "text";
  isDefault?: boolean;
  content: string;
  format?: {
    bold?: boolean;
    italic?: boolean;
    align?: "left" | "center" | "right";
  };
};

type HeadingBlock = {
  id: string;
  type: "heading";
  isDefault?: boolean;
  content: string;
  level: 1 | 2 | 3;
};

type WidgetBlock = {
  id: string;
  type: "widget";
  widgetId: string;
  isDefault?: boolean;
  title: string;
  description: string;
  metric: string;
  change: string;
  chartType: "line" | "bar";
  chartData: number[];
  explanations: Record<
    string,
    { summary: string; highlights: string[]; details: string; changes: string[] }
  >;
};

type Block = TextBlock | HeadingBlock | WidgetBlock;

const TIMELINE_OPTIONS = [
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1m" },
];

const EXPLANATION_BY_TIMELINE: Record<
  string,
  { summary: string; highlights: string[]; details: string; changes: string[] }
> = {
  "1d": {
    summary: "Activation dipped 3.8% yesterday, driven by trial users in SMB tenants.",
    highlights: ["Spike in drop-offs after onboarding step 2", "EU traffic down 12% vs prior day"],
    details:
      "Most of the drop came from 14 tenants that paused onboarding experiments. The largest impact was on users who skipped the in-app checklist.",
    changes: ["Trial conversion -2.1%", "Workspace creation -4.6%", "Onboarding completion -6.9%"],
  },
  "1w": {
    summary: "Activation is up 6.2% WoW, led by new embedded dashboards in core accounts.",
    highlights: ["Embedded widget adoption up 18%", "Activation flow A/B test variant B improved"],
    details:
      "Growth is concentrated in mid-market tenants rolling out the new embed kit. The onboarding completion rate increased after the guided tour rollout.",
    changes: ["Activation +6.2%", "Widget installs +18%", "SQL queries +11%"],
  },
  "1m": {
    summary: "Activation is flat MoM, but retention improved after the AI insight rollout.",
    highlights: ["Narrative insights boosted retention by 3%", "Customer-facing dashboard usage +9%"],
    details:
      "Retention gains offset slower activation as acquisition shifted to smaller tenants. Embedded analytics usage remains the strongest leading indicator.",
    changes: ["Activation +0.4%", "Retention +3.0%", "Embed views +14%"],
  },
};

const ADMIN_PROMPT =
  "My data is about preventing fraud. let's set up a dashboard for monitoring usages, such as fradulent activity in the past 1month";

type DemoStep = "prompt" | "submit" | "deploy" | "customer";

function generateWidgetId() {
  return `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createFraudDashboardBlocks(): Block[] {
  return [
    {
      id: generateId(),
      type: "heading",
      isDefault: true,
      content: "Fraud Prevention Dashboard",
      level: 1,
    },
    {
      id: generateId(),
      type: "text",
      isDefault: true,
      content:
        "Monitoring suspicious activity over the last month, with focus on velocity anomalies, account takeovers, and chargeback trends. Use the timeline controls to explore volatility around spikes.",
      format: { align: "left" },
    },
    {
      id: generateId(),
      type: "text",
      isDefault: true,
      content: `Admin request: "${ADMIN_PROMPT}"`,
      format: { align: "left" },
    },
    {
      id: generateId(),
      type: "heading",
      isDefault: true,
      content: "Fraud Signals",
      level: 2,
    },
    {
      id: generateId(),
      type: "widget",
      widgetId: generateWidgetId(),
      isDefault: true,
      title: "Fraudulent activity volume",
      description: "Alerts triggered by fraud rules",
      metric: "2.4k",
      change: "+14% MoM",
      chartType: "line",
      chartData: [18, 22, 31, 28, 34, 39, 37, 44, 41],
      explanations: {
        "1d": {
          summary: "Fraud alerts dipped 4% yesterday after a temporary rule cooldown.",
          highlights: ["Cooldown reduced false positives", "Nighttime spikes persisted"],
          details:
            "Alert volume declined briefly after a threshold bump, but late-night velocity checks continued to flag clustered activity.",
          changes: ["Alerts -4%", "False positives -9%"],
        },
        "1w": {
          summary: "Alert volume up 8% WoW as high-risk merchants grew.",
          highlights: ["Risky merchant cohort +12%", "Card testing spikes Friday"],
          details:
            "High-risk merchants expanded transaction volume. Card testing attempts spiked on Friday, driving the weekly rise.",
          changes: ["Alerts +8%", "High-risk cohort +12%"],
        },
        "1m": {
          summary: "Alert volume up 14% MoM with new rules rolled out mid-month.",
          highlights: ["New velocity rules +9%", "Manual review queue +6%"],
          details:
            "New velocity checks contributed the majority of alerts, while manual review queues grew modestly with better triage.",
          changes: ["Alerts +14%", "Review queue +6%"],
        },
      },
    },
    {
      id: generateId(),
      type: "widget",
      widgetId: generateWidgetId(),
      isDefault: true,
      title: "Chargeback rate",
      description: "Chargebacks per 1,000 transactions",
      metric: "0.72%",
      change: "+0.08% MoM",
      chartType: "line",
      chartData: [0.55, 0.62, 0.58, 0.7, 0.76, 0.71, 0.69],
      explanations: {
        "1d": {
          summary: "Chargeback rate held steady after a mild dip in disputes.",
          highlights: ["Disputes -3%", "High-ticket refunds stable"],
          details:
            "Chargebacks stabilized as disputes declined slightly for high-ticket transactions, keeping the daily rate flat.",
          changes: ["Chargebacks -0.01%", "Disputes -3%"],
        },
        "1w": {
          summary: "Chargeback rate up 0.05% WoW, concentrated in two regions.",
          highlights: ["APAC +0.12%", "EMEA +0.06%"],
          details:
            "Regional spikes from APAC and EMEA raised the weekly rate. Most cases were tied to late delivery disputes.",
          changes: ["Chargebacks +0.05%", "Regional risk +2"],
        },
        "1m": {
          summary: "Chargeback rate up 0.08% MoM with more high-risk traffic.",
          highlights: ["High-risk traffic +11%", "Manual review +7%"],
          details:
            "An increase in high-risk traffic lifted chargebacks modestly. Manual review coverage expanded to offset losses.",
          changes: ["Chargebacks +0.08%", "Review +7%"],
        },
      },
    },
    {
      id: generateId(),
      type: "widget",
      widgetId: generateWidgetId(),
      isDefault: true,
      title: "Approved vs denied transactions (1M)",
      description: "API calls approved vs denied in the past month",
      metric: "92.4% approved",
      change: "-1.1% MoM",
      chartType: "bar",
      chartData: [88, 91, 94, 93, 90, 92],
      explanations: {
        "1d": {
          summary: "Approval rate dipped slightly after a brief spike in denied calls.",
          highlights: ["Denied calls +4%", "Retry storms contained"],
          details:
            "A short-lived retry storm increased denied calls for a few tenants, but automated backoff kept overall approvals steady.",
          changes: ["Approval -0.4%", "Denied +4%"],
        },
        "1w": {
          summary: "Approval rate steady WoW with fewer soft declines.",
          highlights: ["Soft declines -6%", "Approval stability improved"],
          details:
            "Rate limiting improvements reduced soft declines, keeping approvals steady across the week.",
          changes: ["Approval +0.1%", "Soft declines -6%"],
        },
        "1m": {
          summary: "Approval rate down 1.1% MoM with tighter risk rules.",
          highlights: ["Policy updates +2", "Denied calls +7%"],
          details:
            "Stricter risk rules reduced approvals slightly as higher-risk calls were denied more often.",
          changes: ["Approval -1.1%", "Denied +7%"],
        },
      },
    },
    {
      id: generateId(),
      type: "heading",
      isDefault: true,
      content: "Account Takeover Risk",
      level: 2,
    },
    {
      id: generateId(),
      type: "widget",
      widgetId: generateWidgetId(),
      isDefault: true,
      title: "High-risk login attempts",
      description: "Logins flagged by risk model",
      metric: "18.9k",
      change: "-6% MoM",
      chartType: "bar",
      chartData: [21, 19, 24, 18, 16, 20, 17],
      explanations: {
        "1d": {
          summary: "High-risk logins rose slightly after a credential-stuffing burst.",
          highlights: ["Credential stuffing +5%", "Bot mitigations active"],
          details:
            "A burst of credential stuffing attempts drove a temporary rise, but bot mitigations contained impact.",
          changes: ["Attempts +2%", "Blocked +11%"],
        },
        "1w": {
          summary: "High-risk logins down 3% WoW after new CAPTCHA rules.",
          highlights: ["CAPTCHA triggers +19%", "Repeat offenders -7%"],
          details:
            "Updated CAPTCHA thresholds reduced repeat offender success. The decline was most visible in mobile sessions.",
          changes: ["Attempts -3%", "Repeat offenders -7%"],
        },
        "1m": {
          summary: "High-risk logins down 6% MoM with IP reputation tuning.",
          highlights: ["Bad IP blocks +14%", "ATO cases -4%"],
          details:
            "IP reputation tuning eliminated noisy traffic, reducing ATO cases across the month.",
          changes: ["Attempts -6%", "ATO cases -4%"],
        },
      },
    },
    {
      id: generateId(),
      type: "text",
      isDefault: true,
      content:
        "Notes: weekend spikes correlate with card testing attempts, and most chargebacks originate from repeat offenders. Consider tightening velocity thresholds for new accounts.",
      format: { align: "left" },
    },
  ];
}

function createCustomerCustomizationBlock(): TextBlock {
  return {
    id: generateId(),
    type: "text",
    isDefault: false,
    content:
      "Customer notes: Add your policy exceptions, alert thresholds, and region-specific fraud priorities here.",
    format: { align: "left" },
  };
}

const EMBEDDED_CHAT_HISTORY = [
  {
    id: "v3",
    role: "assistant",
    text: "Updated the chart to compare 1W vs 1M with a stacked bar.",
    timestamp: "10m ago",
    chartTitle: "Activation by cohort",
  },
  {
    id: "v2",
    role: "user",
    text: "Add a churn overlay and switch to weekly granularity.",
    timestamp: "20m ago",
    chartTitle: "Activation + churn overlay",
  },
  {
    id: "v1",
    role: "assistant",
    text: "Created the initial activation widget with a line chart.",
    timestamp: "45m ago",
    chartTitle: "Activation trend",
  },
];

const EDIT_HISTORY = [
  { role: "assistant", text: "I can update this widget to focus on SMB activation. Want the last 30 days?", timestamp: "2h ago" },
  { role: "user", text: "Yes, and add a comparison to the prior month.", timestamp: "1h ago" },
  { role: "assistant", text: "Done. Updated SQL and added a delta badge.", timestamp: "45m ago" },
];

function generateId() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function Coachmark({
  title,
  body,
  className,
  onClose,
}: {
  title: string;
  body: string;
  className?: string;
  onClose: () => void;
}) {
  return (
    <div className={`pointer-events-none absolute z-50 ${className ?? ""}`}>
      <div className="max-w-[18rem] rounded-2xl border border-purple-300/80 bg-gradient-to-b from-[#2b1650] to-[#120b26] p-3 text-xs text-white shadow-[0_0_0_1px_rgba(192,132,252,0.6),0_8px_32px_rgba(76,29,149,0.45)]">
        <div className="flex items-start justify-between gap-2">
          <p className="text-white font-semibold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto text-white/70 hover:text-white"
            aria-label="Close tooltip"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-white/80">{body}</p>
      </div>
      <div className="ml-6 mt-2 h-3 w-3 rotate-45 border border-purple-300/80 bg-[#1a1033] shadow-[0_0_0_1px_rgba(192,132,252,0.6)]" />
    </div>
  );
}

export default function DemoPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dashboardTimeline, setDashboardTimeline] = useState("1w");
  const [isDashboardSummaryExpanded, setIsDashboardSummaryExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"admin" | "customer">("admin");
  const [widgetTimelines, setWidgetTimelines] = useState<Record<string, string>>({});
  const [expandedWidgets, setExpandedWidgets] = useState<Record<string, boolean>>({});
  const [editingWidget, setEditingWidget] = useState<WidgetBlock | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const editPromptId = useId();
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [activeChatVersion, setActiveChatVersion] = useState("v3");
  const addWidgetPromptId = useId();
  const [addBlockMenuOpen, setAddBlockMenuOpen] = useState<string | null>(null);
  const contactSalesButtonRef = useRef<HTMLButtonElement | null>(null);
  const [adminPrompt, setAdminPrompt] = useState(ADMIN_PROMPT);
  const [demoStep, setDemoStep] = useState<DemoStep>("prompt");
  const [hasPromptInteracted, setHasPromptInteracted] = useState(false);
  const [hasGeneratedDashboard, setHasGeneratedDashboard] = useState(false);
  const [isDeployed, setIsDeployed] = useState(false);
  const [customerBlockId, setCustomerBlockId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const generateTimeoutRef = useRef<number | null>(null);
  const [dismissedCoachmarks, setDismissedCoachmarks] = useState<DemoStep[]>([]);
  const [isSwitchingToCustomer, setIsSwitchingToCustomer] = useState(false);
  const deployTimeoutRef = useRef<number | null>(null);

  // Drag and drop state
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    trackPageView("Demo Page");
  }, []);


  useEffect(() => {
    if (hasGeneratedDashboard) return;

    if (!hasPromptInteracted) {
      setDemoStep("prompt");
      return;
    }

    if (adminPrompt.trim().length > 0) {
      setDemoStep("submit");
    } else {
      setDemoStep("prompt");
    }
  }, [adminPrompt, hasPromptInteracted, hasGeneratedDashboard]);

  const dashboardSummary = EXPLANATION_BY_TIMELINE[dashboardTimeline];
  const activeWidgetCount = blocks.filter((block) => block.type === "widget").length;

  const handlePromptChange = useCallback((value: string) => {
    setAdminPrompt(value);
    setHasPromptInteracted(true);
  }, []);

  const handlePromptSubmit = useCallback(() => {
    if (!adminPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    if (generateTimeoutRef.current) {
      window.clearTimeout(generateTimeoutRef.current);
    }
    generateTimeoutRef.current = window.setTimeout(() => {
      setBlocks(createFraudDashboardBlocks());
      setHasGeneratedDashboard(true);
      setIsDeployed(false);
      setCustomerBlockId(null);
      setViewMode("admin");
      setDemoStep("deploy");
      setIsGenerating(false);
    }, 3000);
  }, [adminPrompt, isGenerating]);

  const handleDeploy = useCallback(() => {
    if (!hasGeneratedDashboard || isSwitchingToCustomer) return;
    setIsSwitchingToCustomer(true);
    if (deployTimeoutRef.current) {
      window.clearTimeout(deployTimeoutRef.current);
    }
    deployTimeoutRef.current = window.setTimeout(() => {
      setIsDeployed(true);
      setViewMode("customer");
      setDemoStep("customer");
      setBlocks((prev) => {
        if (customerBlockId && prev.some((block) => block.id === customerBlockId)) {
          return prev;
        }
        const customizationBlock = createCustomerCustomizationBlock();
        setCustomerBlockId(customizationBlock.id);
        return [...prev, customizationBlock];
      });
      setIsSwitchingToCustomer(false);
    }, 1600);
  }, [customerBlockId, hasGeneratedDashboard, isSwitchingToCustomer]);

  useEffect(() => {
    return () => {
      if (generateTimeoutRef.current) {
        window.clearTimeout(generateTimeoutRef.current);
      }
      if (deployTimeoutRef.current) {
        window.clearTimeout(deployTimeoutRef.current);
      }
    };
  }, []);

  const addBlock = useCallback((afterBlockId: string, blockType: "text" | "heading" | "widget") => {
    const newBlock: Block = blockType === "text"
      ? {
          id: generateId(),
          type: "text",
          isDefault: viewMode === "admin",
          content: "Start typing...",
          format: { align: "left" },
        }
      : blockType === "heading"
      ? {
          id: generateId(),
          type: "heading",
          isDefault: viewMode === "admin",
          content: "New Section",
          level: 2,
        }
      : {
          id: generateId(),
          type: "widget",
          widgetId: `widget-${Date.now()}`,
          isDefault: false,
          title: "New Widget",
          description: "Click Edit to configure",
          metric: "—",
          change: "—",
          chartType: "bar",
          chartData: [20, 30, 25, 40, 35],
          explanations: {
            "1d": { summary: "No data yet.", highlights: [], details: "", changes: [] },
            "1w": { summary: "No data yet.", highlights: [], details: "", changes: [] },
            "1m": { summary: "No data yet.", highlights: [], details: "", changes: [] },
          },
        };

    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === afterBlockId);
      if (index === -1) return [...prev, newBlock];
      return [...prev.slice(0, index + 1), newBlock, ...prev.slice(index + 1)];
    });
    setAddBlockMenuOpen(null);
    setSelectedBlockId(newBlock.id);
  }, [viewMode]);

  const deleteBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  }, [selectedBlockId]);

  const updateTextBlock = useCallback((blockId: string, content: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId && b.type === "text" ? { ...b, content } : b))
    );
  }, []);

  const updateHeadingBlock = useCallback((blockId: string, content: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId && b.type === "heading" ? { ...b, content } : b))
    );
  }, []);

  const toggleTextFormat = useCallback((blockId: string, formatKey: "bold" | "italic") => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id === blockId && b.type === "text") {
          return { ...b, format: { ...b.format, [formatKey]: !b.format?.[formatKey] } };
        }
        return b;
      })
    );
  }, []);

  const setTextAlign = useCallback((blockId: string, align: "left" | "center" | "right") => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id === blockId && b.type === "text") {
          return { ...b, format: { ...b.format, align } };
        }
        return b;
      })
    );
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, blockId: string) => {
    setDraggedBlockId(blockId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", blockId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedBlockId(null);
    setDragOverBlockId(null);
    dragCounter.current = 0;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, blockId: string) => {
    e.preventDefault();
    dragCounter.current++;
    if (blockId !== draggedBlockId) {
      setDragOverBlockId(blockId);
    }
  }, [draggedBlockId]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverBlockId(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetBlockId: string) => {
    e.preventDefault();
    dragCounter.current = 0;

    if (!draggedBlockId || draggedBlockId === targetBlockId) {
      setDragOverBlockId(null);
        return;
      }

    setBlocks((prev) => {
      const draggedIndex = prev.findIndex((b) => b.id === draggedBlockId);
      const targetIndex = prev.findIndex((b) => b.id === targetBlockId);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const newBlocks = [...prev];
      const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
      
      // Insert after the target if dragging down, before if dragging up
      const insertIndex = draggedIndex < targetIndex ? targetIndex : targetIndex;
      newBlocks.splice(insertIndex, 0, draggedBlock);

      return newBlocks;
    });

    setDragOverBlockId(null);
    setDraggedBlockId(null);
  }, [draggedBlockId]);

  return (
    <main className="min-h-screen flex flex-col bg-[#0a0612] text-white overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNhKSIgb3BhY2l0eT0iMSIvPjwvc3ZnPg==')]" />
        <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[150px]" />
        <div className="absolute -top-20 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 w-[700px] h-[400px] bg-purple-700/10 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(10,6,18,0.6)_100%)]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-50 border-b border-purple-500/10 bg-black/40 backdrop-blur-xl sticky top-0">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
              <Image src={favicon} alt="QueryPanel" width={32} height={32} />
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent group-hover:from-purple-300 group-hover:to-blue-300 transition-all">
              QueryPanel
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 px-3 py-1 font-medium">
              <PlayIcon className="w-3 h-3 mr-1.5 fill-current" />
              Widget Block Editor
            </Badge>
            <ThemeSwitcher />
            <Button
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-6 shadow-lg shadow-purple-500/25"
              onClick={() => {
                trackEvent("Demo CTA Clicked", { location: "navbar", button: "Get Started" });
                window.location.href = "/auth/sign-up";
              }}
            >
              Get Started
              <ArrowRightIcon className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* View mode toggle */}
      <div className="relative z-40 border-b border-purple-500/10 bg-black/60 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Preview mode</p>
              <p className="mt-1 text-sm text-gray-300">
                {viewMode === "admin" ? "View the page as Admin" : "View the page as your customer"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {viewMode === "admin"
                  ? "Admin: can manage and distribute default dashboards from Querypanel admin site."
                  : "Customers: based on roles, they can create custom dashboards for their needs but they are not allowed to modify default ones."}
              </p>
              {isDeployed && (
                <span className="mt-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  Deployed to customers
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 p-1 self-start sm:self-center">
              <button
                type="button"
                onClick={() => setViewMode("admin")}
                className={`px-3 py-1 text-xs rounded-full transition ${
                  viewMode === "admin"
                    ? "bg-purple-500/30 text-purple-100 border border-purple-400/60"
                    : "text-gray-400 hover:text-purple-100"
                }`}
              >
                Admin
              </button>
              <button
                type="button"
                onClick={() => setViewMode("customer")}
                className={`px-3 py-1 text-xs rounded-full transition ${
                  viewMode === "customer"
                    ? "bg-purple-500/30 text-purple-100 border border-purple-400/60"
                    : "text-gray-400 hover:text-purple-100"
                }`}
              >
                Customer
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-purple-500/20 bg-black/50 p-4">
            <p className="text-xs text-purple-200 font-semibold mb-2">Low-code embed</p>
            <p className="text-xs text-gray-400 mb-3">
              Embed QueryPanel in your web app with minimal code. Generate the JWT on your backend using our SDK.
            </p>
            <pre className="rounded-lg border border-purple-500/20 bg-black/70 px-3 py-2 text-xs text-purple-100 overflow-x-auto">
              <code>{`<QuerypanelEmbedded dashboardId='1234567' features={} />`}</code>
            </pre>
          </div>
        </div>
      </div>

      {(isSwitchingToCustomer || isGenerating) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-purple-400/60 bg-gradient-to-b from-[#2b1650] to-[#120b26] px-8 py-6 text-center text-white shadow-[0_0_0_1px_rgba(192,132,252,0.6),0_12px_40px_rgba(76,29,149,0.55)]">
            <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-purple-400 via-purple-300 to-blue-400" />
            </div>
            <p className="text-sm font-semibold">
              {isSwitchingToCustomer ? "Deploying dashboard" : "Generating dashboard"}
            </p>
            <p className="text-xs text-white/70">
              {isSwitchingToCustomer ? "Switching to customer view…" : "Building widgets and notes…"}
            </p>
          </div>
        </div>
      )}

      {/* Main content - Block editor */}
      <div className="flex-1 relative z-10 flex flex-col">
        <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 flex flex-col gap-1">
          {blocks.length > 0 && (
          <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Dashboard summary</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Active widget insights</h1>
                <p className="mt-2 text-sm text-gray-400">
                  {activeWidgetCount} widgets summarized for the selected timeframe.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {TIMELINE_OPTIONS.map((option) => (
                  <button
                    key={`dashboard-${option.value}`}
                    type="button"
                    onClick={() => setDashboardTimeline(option.value)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      dashboardTimeline === option.value
                        ? "bg-purple-500/30 text-purple-100 border border-purple-400/60"
                        : "border border-white/10 text-gray-400 hover:text-purple-100 hover:border-purple-400/40"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-200">
              <p>{dashboardSummary.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboardSummary.highlights.map((item) => (
                  <span
                    key={`dashboard-${item}`}
                    className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-100"
                  >
                    {item}
              </span>
                ))}
              </div>
              {viewMode === "admin" && hasGeneratedDashboard && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <div className="relative">
                    {demoStep === "deploy" && !dismissedCoachmarks.includes("deploy") && (
                      <Coachmark
                        title="Deploy the dashboard"
                        body="Publish the default view to customers and continue to customization."
                        className="-top-24 left-0"
                        onClose={() =>
                          setDismissedCoachmarks((prev) => (prev.includes("deploy") ? prev : [...prev, "deploy"]))
                        }
                      />
                    )}
                    <Button
                      onClick={handleDeploy}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white gap-2"
                    >
                      Deploy dashboard
                      <ArrowRightIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  <span className="text-xs text-gray-500">
                    Deploys the default dashboard to your customers.
                  </span>
                </div>
              )}
              {isDashboardSummaryExpanded && (
                <div className="mt-3 space-y-2 text-gray-400">
                  <p>{dashboardSummary.details}</p>
                  <ul className="space-y-1 text-xs">
                    {dashboardSummary.changes.map((change) => (
                      <li key={`dashboard-${change}`} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsDashboardSummaryExpanded((prev) => !prev)}
              className="mt-4 inline-flex items-center gap-2 text-xs text-purple-200 hover:text-purple-100"
            >
              {isDashboardSummaryExpanded ? "Collapse" : "Expand"} summary
              {isDashboardSummaryExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
          )}

          {blocks.map((block) => {
            const isSelected = selectedBlockId === block.id;

            if (block.type === "text") {
              const isDragOver = dragOverBlockId === block.id;
              return (
                <div
                  key={block.id}
                  id={`block-${block.id}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, block.id)}
                  onDragEnd={handleDragEnd}
                  onDragEnter={(e) => handleDragEnter(e, block.id)}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, block.id)}
                  className={`group relative rounded-lg transition-all cursor-pointer ${
                    isSelected ? "ring-2 ring-purple-500/50 bg-purple-500/5" : "hover:bg-white/5"
                  } ${isDragOver ? "ring-2 ring-blue-500/50 bg-blue-500/10" : ""} ${
                    draggedBlockId === block.id ? "opacity-50" : ""
                  }`}
                  onClick={() => setSelectedBlockId(block.id)}
                >
                  {demoStep === "customer" &&
                    viewMode === "customer" &&
                    block.id === customerBlockId &&
                    !dismissedCoachmarks.includes("customer") && (
                      <Coachmark
                        title="Customize the customer view"
                        body="Edit this customer-only note or add new blocks for their needs."
                        className="-top-24 left-4"
                        onClose={() =>
                          setDismissedCoachmarks((prev) =>
                            prev.includes("customer") ? prev : [...prev, "customer"]
                          )
                        }
                      />
                    )}
                  {/* Block controls */}
                  <div className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white cursor-grab active:cursor-grabbing"
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
            </div>

                  {/* Inline formatting toolbar */}
                  {isSelected && (
                    <div className="absolute -top-10 left-0 flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 backdrop-blur">
                      <button
                        type="button"
                        onClick={() => toggleTextFormat(block.id, "bold")}
                        className={`p-1.5 rounded ${block.format?.bold ? "bg-purple-500/30 text-purple-100" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                      >
                        <Bold className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTextFormat(block.id, "italic")}
                        className={`p-1.5 rounded ${block.format?.italic ? "bg-purple-500/30 text-purple-100" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                      >
                        <Italic className="h-4 w-4" />
                      </button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <button
                        type="button"
                        onClick={() => setTextAlign(block.id, "left")}
                        className={`p-1.5 rounded ${block.format?.align === "left" || !block.format?.align ? "bg-purple-500/30 text-purple-100" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                      >
                        <AlignLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextAlign(block.id, "center")}
                        className={`p-1.5 rounded ${block.format?.align === "center" ? "bg-purple-500/30 text-purple-100" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                      >
                        <AlignCenter className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextAlign(block.id, "right")}
                        className={`p-1.5 rounded ${block.format?.align === "right" ? "bg-purple-500/30 text-purple-100" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
                      >
                        <AlignRight className="h-4 w-4" />
                      </button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <button
                        type="button"
                        onClick={() => deleteBlock(block.id)}
                        className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div
                    contentEditable={viewMode === "admin" || !block.isDefault}
                    suppressContentEditableWarning
                    onBlur={(e) => updateTextBlock(block.id, e.currentTarget.textContent || "")}
                    onClick={(e) => {
                      if (viewMode === "customer" && block.isDefault) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className={`px-4 py-3 text-gray-200 outline-none ${
                      block.format?.bold ? "font-semibold" : ""
                    } ${block.format?.italic ? "italic" : ""} ${
                      block.format?.align === "center"
                        ? "text-center"
                        : block.format?.align === "right"
                        ? "text-right"
                        : "text-left"
                    }`}
                  >
                    {block.content}
          </div>

                  {/* Add block button between blocks */}
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition z-10">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAddBlockMenuOpen(addBlockMenuOpen === block.id ? null : block.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/50 bg-purple-500/20 text-purple-200 hover:bg-purple-500/40"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      {addBlockMenuOpen === block.id && (
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-white/10 bg-black/90 p-1 backdrop-blur z-20">
                          {viewMode === "admin" && (
                            <>
                              <button
                                type="button"
                                onClick={() => addBlock(block.id, "text")}
                                className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10"
                                title="Add text"
                              >
                                <Type className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => addBlock(block.id, "heading")}
                                className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10"
                                title="Add heading"
                              >
                                <Heading1 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setAddBlockMenuOpen(null);
                              setIsAddWidgetOpen(true);
                            }}
                            className="p-2 rounded text-purple-300 hover:text-purple-100 hover:bg-purple-500/20"
                            title="Add widget"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            if (block.type === "heading") {
              const HeadingTag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
              const headingClasses =
                block.level === 1
                  ? "text-3xl font-bold"
                  : block.level === 2
                  ? "text-2xl font-semibold"
                  : "text-xl font-medium";
              const isDragOver = dragOverBlockId === block.id;

              return (
                <div
                  key={block.id}
                  id={`block-${block.id}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, block.id)}
                  onDragEnd={handleDragEnd}
                  onDragEnter={(e) => handleDragEnter(e, block.id)}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, block.id)}
                  className={`group relative rounded-lg transition-all cursor-pointer ${
                    isSelected ? "ring-2 ring-purple-500/50 bg-purple-500/5" : "hover:bg-white/5"
                  } ${isDragOver ? "ring-2 ring-blue-500/50 bg-blue-500/10" : ""} ${
                    draggedBlockId === block.id ? "opacity-50" : ""
                  }`}
                  onClick={() => setSelectedBlockId(block.id)}
                >
                  <div className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white cursor-grab active:cursor-grabbing"
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>

                  {isSelected && (
                    <div className="absolute -top-10 left-0 flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 backdrop-blur">
                      {(viewMode === "admin" || !block.isDefault) && (
                        <button
                          type="button"
                          onClick={() => deleteBlock(block.id)}
                          className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}

                  <HeadingTag
                    contentEditable={viewMode === "admin" || !block.isDefault}
                    suppressContentEditableWarning
                    onBlur={(e) => updateHeadingBlock(block.id, e.currentTarget.textContent || "")}
                    onClick={(e) => {
                      if (viewMode === "customer" && block.isDefault) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className={`px-4 py-3 text-white outline-none ${headingClasses}`}
                  >
                    {block.content}
                  </HeadingTag>

                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition z-10">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setAddBlockMenuOpen(addBlockMenuOpen === block.id ? null : block.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/50 bg-purple-500/20 text-purple-200 hover:bg-purple-500/40"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      {addBlockMenuOpen === block.id && (
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-white/10 bg-black/90 p-1 backdrop-blur z-20">
                          {viewMode === "admin" && (
                            <>
                              <button
                                type="button"
                                onClick={() => addBlock(block.id, "text")}
                                className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10"
                                title="Add text"
                              >
                                <Type className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => addBlock(block.id, "heading")}
                                className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10"
                                title="Add heading"
                              >
                                <Heading1 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setAddBlockMenuOpen(null);
                              setIsAddWidgetOpen(true);
                            }}
                            className="p-2 rounded text-purple-300 hover:text-purple-100 hover:bg-purple-500/20"
                            title="Add widget"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </button>
          </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            if (block.type === "widget") {
              const widgetTimeline = widgetTimelines[block.id] ?? "1w";
              const widgetExplanation = block.explanations[widgetTimeline] ?? block.explanations["1w"];
              const isExpanded = expandedWidgets[block.id] ?? false;
              const chartMax = Math.max(...block.chartData);
              const chartPoints = block.chartData
                .map((value, i) => {
                  const x = (i / Math.max(block.chartData.length - 1, 1)) * 100;
                  const y = 60 - (value / Math.max(chartMax, 1)) * 48;
                  return `${x},${y}`;
                })
                .join(" ");
              const isDragOver = dragOverBlockId === block.id;

              return (
                <div
                  key={block.id}
                  id={`block-${block.id}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, block.id)}
                  onDragEnd={handleDragEnd}
                  onDragEnter={(e) => handleDragEnter(e, block.id)}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, block.id)}
                  className={`group relative my-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-purple-500/50 border-purple-500/30 bg-purple-500/5"
                      : "border-white/10 bg-black/40 hover:border-purple-500/20"
                  } ${isDragOver ? "ring-2 ring-blue-500/50 bg-blue-500/10" : ""} ${
                    draggedBlockId === block.id ? "opacity-50" : ""
                  } p-6 backdrop-blur`}
                  onClick={() => setSelectedBlockId(block.id)}
                >
                  <div className="absolute -left-10 top-6 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white cursor-grab active:cursor-grabbing"
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{block.title}</h3>
                      <p className="mt-1 text-xs text-gray-400">{block.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {viewMode === "admin" && (
                        <Button size="sm" className="bg-white/10 hover:bg-white/20 text-white">
                          <Share2 className="h-4 w-4" />
                          Share
                        </Button>
                      )}
                      {viewMode === "admin" && (
                        <Button
                          size="sm"
                          className="bg-white/10 hover:bg-white/20 text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingWidget(block);
                            setEditPrompt("");
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                      )}
                      {(viewMode === "admin" || !block.isDefault) && (
                        <Button
                          size="sm"
                          className="bg-white/10 hover:bg-white/20 text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBlock(block.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
          </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {TIMELINE_OPTIONS.map((option) => (
                      <button
                        key={`${block.id}-${option.value}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setWidgetTimelines((prev) => ({ ...prev, [block.id]: option.value }));
                        }}
                        className={`rounded-full px-3 py-1 text-[10px] transition ${
                          widgetTimeline === option.value
                            ? "bg-purple-500/30 text-purple-100 border border-purple-400/60"
                            : "border border-white/10 text-gray-400 hover:text-purple-100 hover:border-purple-400/40"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3">
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>Sample data</span>
                      <span>{block.chartType === "bar" ? "Bars" : "Trend"}</span>
                    </div>
                    <svg
                      viewBox="0 0 100 60"
                      className="mt-2 h-20 w-full"
                      role="img"
                      aria-labelledby={`${block.id}-chart-title`}
                    >
                      <title id={`${block.id}-chart-title`}>{`${block.title} sample chart`}</title>
                      <defs>
                        <linearGradient id={`${block.id}-gradient`} x1="0" x2="1" y1="0" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.7" />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.7" />
                        </linearGradient>
                      </defs>
                      {block.chartType === "bar" ? (
                        block.chartData.map((value, i) => {
                          const barWidth = 100 / block.chartData.length - 4;
                          const x = i * (100 / block.chartData.length) + 2;
                          const height = (value / Math.max(chartMax, 1)) * 48;
                          return (
                            <rect
                              key={`${block.id}-bar-${i}`}
                              x={x}
                              y={60 - height}
                              width={barWidth}
                              height={height}
                              rx={2}
                              fill={`url(#${block.id}-gradient)`}
                            />
                          );
                        })
                      ) : (
                        <>
                          <polyline
                            points={chartPoints}
                            fill="none"
                            stroke={`url(#${block.id}-gradient)`}
                            strokeWidth="3"
                          />
                          {block.chartData.map((value, i) => {
                            const x = (i / Math.max(block.chartData.length - 1, 1)) * 100;
                            const y = 60 - (value / Math.max(chartMax, 1)) * 48;
                            return (
                              <circle
                                key={`${block.id}-dot-${i}`}
                                cx={x}
                                cy={y}
                                r="2.5"
                                fill="#A78BFA"
                              />
                            );
                          })}
                        </>
                      )}
                    </svg>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                    <span className="text-lg font-semibold text-white">{block.metric}</span>
                    <span className="text-emerald-300">{block.change}</span>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-gray-200">
                    <p>{widgetExplanation.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {widgetExplanation.highlights.map((item) => (
                        <span
                          key={`${block.id}-${item}`}
                          className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[10px] text-purple-100"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                    {isExpanded && (
                      <div className="mt-3 space-y-2 text-gray-400">
                        <p>{widgetExplanation.details}</p>
                        <ul className="space-y-1 text-[10px]">
                          {widgetExplanation.changes.map((change) => (
                            <li key={`${block.id}-${change}`} className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                              {change}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedWidgets((prev) => ({
                          ...prev,
                          [block.id]: !isExpanded,
                        }));
                      }}
                      className="mt-3 inline-flex items-center gap-2 text-[10px] text-purple-200 hover:text-purple-100"
                    >
                      {isExpanded ? "Collapse" : "Expand"} explanation
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>

                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition z-10">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddBlockMenuOpen(addBlockMenuOpen === block.id ? null : block.id);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/50 bg-purple-500/20 text-purple-200 hover:bg-purple-500/40"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      {addBlockMenuOpen === block.id && (
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-white/10 bg-black/90 p-1 backdrop-blur z-20">
                          <button
                            type="button"
                            onClick={() => addBlock(block.id, "text")}
                            className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10"
                            title="Add text"
                          >
                            <Type className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock(block.id, "heading")}
                            className="p-2 rounded text-gray-400 hover:text-white hover:bg-white/10"
                            title="Add heading"
                          >
                            <Heading1 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddBlockMenuOpen(null);
                              setIsAddWidgetOpen(true);
                            }}
                            className="p-2 rounded text-purple-300 hover:text-purple-100 hover:bg-purple-500/20"
                            title="Add widget"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </button>
                        </div>
            )}
          </div>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Empty state / Add first block */}
          {blocks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-purple-400/50 bg-black/30 p-10">
              <div className="flex flex-col gap-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Start with a prompt</p>
                  <h2 className="mt-3 text-xl font-semibold text-white">Describe the dashboard you want to build</h2>
                  <p className="mt-2 text-sm text-gray-400">
                    Ask Querypanel to build dashboard with notes and widgets.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                  <div className="relative flex-1">
                    {demoStep === "prompt" && !dismissedCoachmarks.includes("prompt") && (
                      <Coachmark
                        title="Write the admin request"
                        body="Use the prefilled prompt (or edit it) to describe the fraud dashboard."
                        className="-top-24 right-4"
                        onClose={() =>
                          setDismissedCoachmarks((prev) => (prev.includes("prompt") ? prev : [...prev, "prompt"]))
                        }
                      />
                    )}
                    <Input
                      className="h-12 rounded-full border border-purple-500/30 bg-black/70 px-5 text-sm text-white placeholder:text-gray-500"
                      value={adminPrompt}
                      onChange={(event) => handlePromptChange(event.target.value)}
                      onFocus={() => setHasPromptInteracted(true)}
                      disabled={isGenerating}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handlePromptSubmit();
                        }
                      }}
                    />
                  </div>
                  <div className="relative">
                    {demoStep === "submit" && !dismissedCoachmarks.includes("submit") && (
                      <Coachmark
                        title="Generate the dashboard"
                        body="Click to create the fraud dashboard with notes and widgets."
                        className="-top-24 left-0"
                        onClose={() =>
                          setDismissedCoachmarks((prev) => (prev.includes("submit") ? prev : [...prev, "submit"]))
                        }
                      />
                    )}
                    <Button
                      className="h-12 rounded-full bg-white px-6 text-black hover:bg-gray-100 gap-2"
                      onClick={handlePromptSubmit}
                      disabled={!adminPrompt.trim() || isGenerating}
                    >
                      {isGenerating ? "Generating..." : "Generate"}
                      {!isGenerating && <ArrowRightIcon className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Tip: tweak the timeframe or add specific fraud signals to visualize.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <section className="relative z-10 border-t border-purple-500/10 bg-black/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Ready to ship embedded analytics?</h2>
            <p className="mt-2 text-sm text-gray-400">
              Talk to us about custom widget blocks, security, and pricing.
            </p>
          </div>
          <ContactSalesDialog>
            <Button
              ref={contactSalesButtonRef}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
            >
              Contact Sales
            </Button>
          </ContactSalesDialog>
        </div>
      </section>

      <footer className="relative z-10 border-t border-purple-500/10 py-8 bg-black/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src={favicon} alt="QueryPanel" width={20} height={20} className="opacity-60" />
              <span className="text-sm text-gray-500">© {new Date().getFullYear()} QueryPanel</span>
              <span className="text-gray-700">•</span>
              <span className="text-xs text-gray-600">Widget Block Editor</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                Home
              </Link>
              <Link href="/auth/sign-up" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                Sign Up
              </Link>
              <a
                href="https://www.npmjs.com/package/@querypanel/node-sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-purple-400 transition-colors"
              >
                npm Package
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Edit widget modal */}
      <Dialog
        open={!!editingWidget}
        onOpenChange={(open) => {
          if (!open) {
            setEditingWidget(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto overscroll-contain border border-white/10 bg-[#0a0612] p-4 text-white sm:w-full sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Edit widget {editingWidget ? `• ${editingWidget.title}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.7fr] gap-6">
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Agent chat</p>
                <div className="mt-4 space-y-3 max-h-60 overflow-y-auto">
                  {EDIT_HISTORY.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        message.role === "user"
                          ? "bg-purple-500/20 text-purple-100 ml-auto max-w-[80%]"
                          : "bg-white/10 text-gray-200 max-w-[85%]"
                      }`}
                    >
                      <p className="text-[11px] uppercase text-purple-200/70">
                        {message.role === "user" ? "You" : "Agent"}
                      </p>
                      <p className="mt-1">{message.text}</p>
                      <p className="mt-1 text-[10px] text-gray-400">{message.timestamp}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor={editPromptId} className="text-xs uppercase tracking-[0.2em] text-purple-300">
                  Ask for a widget change
                </label>
                <Input
                  id={editPromptId}
                  value={editPrompt}
                  onChange={(event) => setEditPrompt(event.target.value)}
                  placeholder="Ask for a change to this widget..."
                  className="mt-2 bg-black/40 border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Chart preview</p>
                <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>{editingWidget ? `${editingWidget.title} v${activeChatVersion.replace("v", "")}` : "Widget preview"}</span>
                    <span>Preview</span>
                  </div>
                  <div className="mt-2 h-20 rounded-md border border-white/10 bg-gradient-to-r from-purple-500/20 to-blue-500/10" />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Change history</p>
                <div className="mt-3 space-y-2 text-xs text-gray-400 max-h-40 overflow-y-auto">
                  {EMBEDDED_CHAT_HISTORY.map((item) => (
                    <div
                      key={`${item.id}-edit-history`}
                      className={`flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 ${
                        activeChatVersion === item.id ? "bg-purple-500/10 text-purple-100" : "bg-black/30"
                      }`}
                    >
                      <div>
                        <p className="text-xs text-white">{item.chartTitle}</p>
                        <p className="text-[10px] text-gray-400">{item.timestamp}</p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => setActiveChatVersion(item.id)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Rollback
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  className="bg-white/10 hover:bg-white/20 text-white"
                  onClick={() => setEditingWidget(null)}
                >
                  Close
                </Button>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white">
                  Apply changes
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add widget modal */}
      <Dialog open={isAddWidgetOpen} onOpenChange={setIsAddWidgetOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto overscroll-contain border border-white/10 bg-[#0a0612] p-4 text-white sm:w-full sm:max-w-3xl sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Create new widget</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.7fr] gap-6">
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Agent chat</p>
                <div className="mt-4 space-y-3 max-h-60 overflow-y-auto">
                  {EMBEDDED_CHAT_HISTORY.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        message.role === "user"
                          ? "bg-purple-500/20 text-purple-100 ml-auto max-w-[80%]"
                          : "bg-white/10 text-gray-200 max-w-[85%]"
                      }`}
                    >
                      <p className="text-[11px] uppercase text-purple-200/70">
                        {message.role === "user" ? "You" : "Agent"}
                      </p>
                      <p className="mt-1">{message.text}</p>
                      <p className="mt-1 text-[10px] text-gray-400">{message.timestamp}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor={addWidgetPromptId}
                  className="text-xs uppercase tracking-[0.2em] text-purple-300"
                >
                  Describe your widget
                </label>
                <Input
                  id={addWidgetPromptId}
                  placeholder="Create a widget for embedded usage by tenant, weekly."
                  className="mt-2 bg-black/40 border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-purple-300">Chart preview</p>
                <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>{EMBEDDED_CHAT_HISTORY.find((item) => item.id === activeChatVersion)?.chartTitle}</span>
                    <span>v{activeChatVersion.replace("v", "")}</span>
                  </div>
                  <div className="mt-2 h-20 rounded-md border border-white/10 bg-gradient-to-r from-purple-500/20 to-blue-500/10" />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-purple-300">History</p>
                <div className="mt-3 space-y-2 text-xs text-gray-400 max-h-40 overflow-y-auto">
                  {EMBEDDED_CHAT_HISTORY.map((item) => (
                    <div
                      key={`${item.id}-history`}
                      className={`flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 ${
                        activeChatVersion === item.id ? "bg-purple-500/10 text-purple-100" : "bg-black/30"
                      }`}
                    >
                      <div>
                        <p className="text-xs text-white">{item.chartTitle}</p>
                        <p className="text-[10px] text-gray-400">{item.timestamp}</p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => setActiveChatVersion(item.id)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Rollback
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  className="bg-white/10 hover:bg-white/20 text-white"
                  onClick={() => setIsAddWidgetOpen(false)}
                >
                  Close
                </Button>
                <Button
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
                  onClick={() => {
                    addBlock(blocks[blocks.length - 1]?.id || "", "widget");
                    setIsAddWidgetOpen(false);
                  }}
                >
                  Add widget
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
