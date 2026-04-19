"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Badge from "../../../components/ui/Badge";
import ProgressBar from "../../../components/ui/ProgressBar";
import Spinner from "../../../components/ui/Spinner";
import Button from "../../../components/ui/Button";
import {
  getVideoStatus,
  getTranscript,
  getSummary,
  streamVideoUrl,
  askQuestionStream,
  type Utterance,
  type Transcript,
  type VideoSummary,
  type VideoStatus,
  type SSEEvent,
} from "../../../lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format seconds as HH:MM:SS */
function secToTimestamp(sec: number): string {
  const totalSec = Math.floor(sec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Format milliseconds as HH:MM:SS */
function msToTimestamp(ms: number): string {
  return secToTimestamp(ms / 1000);
}

// ── Types ──────────────────────────────────────────────────────────────────

type TabId = "transcript" | "summary";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  sources?: string[];
  isStreaming?: boolean;
}

// ── Simple markdown-ish renderer ───────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listOpen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (/^### (.+)/.test(line)) {
      if (listOpen) {
        nodes.push(<br key={`lb-${i}`} />);
        listOpen = false;
      }
      const match = line.match(/^### (.+)/);
      nodes.push(
        <h4 key={`h4-${i}`} style={{ fontSize: "0.95rem", fontWeight: 600, margin: "8px 0 4px 0" }}>
          {inlineFormat(match![1])}
        </h4>
      );
      continue;
    }
    if (/^## (.+)/.test(line)) {
      if (listOpen) {
        nodes.push(<br key={`lb-${i}`} />);
        listOpen = false;
      }
      const match = line.match(/^## (.+)/);
      nodes.push(
        <h3 key={`h3-${i}`} style={{ fontSize: "1.05rem", fontWeight: 600, margin: "10px 0 4px 0" }}>
          {inlineFormat(match![1])}
        </h3>
      );
      continue;
    }

    // Unordered list items
    if (/^[-*] /.test(line)) {
      if (!listOpen) listOpen = true;
      const content = line.replace(/^[-*] /, "");
      nodes.push(
        <div key={`li-${i}`} style={{ display: "flex", gap: "6px", paddingLeft: "4px" }}>
          <span style={{ color: "var(--accent2)", flexShrink: 0 }}>&#8226;</span>
          <span>{inlineFormat(content)}</span>
        </div>
      );
      continue;
    }

    // Ordered list items
    if (/^\d+\.\s/.test(line)) {
      if (!listOpen) listOpen = true;
      const content = line.replace(/^\d+\.\s/, "");
      nodes.push(
        <div key={`oli-${i}`} style={{ display: "flex", gap: "6px", paddingLeft: "4px" }}>
          <span style={{ color: "var(--accent2)", flexShrink: 0 }}>{line.match(/^(\d+)\./)![1]}.</span>
          <span>{inlineFormat(content)}</span>
        </div>
      );
      continue;
    }

    // Close list if non-list line
    if (listOpen && line.trim() === "") {
      listOpen = false;
      nodes.push(<div key={`sp-${i}`} style={{ height: "4px" }} />);
      continue;
    }
    if (listOpen) {
      listOpen = false;
    }

    // Empty line
    if (line.trim() === "") {
      nodes.push(<div key={`br-${i}`} style={{ height: "6px" }} />);
      continue;
    }

    // Regular paragraph line
    nodes.push(
      <span key={`p-${i}`}>
        {i > 0 && lines[i - 1].trim() !== "" ? <br /> : null}
        {inlineFormat(line)}
      </span>
    );
  }

  return nodes;
}

/** Inline formatting: **bold**, `code` */
function inlineFormat(text: string): React.ReactNode {
  // Split by **bold** and `code`
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`b-${key++}`} style={{ fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={`c-${key++}`}
          style={{
            background: "var(--surface2)",
            padding: "1px 5px",
            borderRadius: "3px",
            fontSize: "0.85em",
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// ── Status label mapping ───────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting to start...",
  processing: "Processing video...",
  transcribing: "Transcribing audio...",
  summarizing: "Generating summary...",
  completed: "Done",
  failed: "Failed",
};

// ═══════════════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════════════

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // ── State ──────────────────────────────────────────────────────────────
  const [videoStatus, setVideoStatus] = useState<VideoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [summary, setSummary] = useState<VideoSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("transcript");
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [videoError, setVideoError] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch status ──────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const status = await getVideoStatus(id);
      setVideoStatus(status);
      return status;
    } catch (err) {
      console.error("Failed to fetch video status:", err);
      return null;
    }
  }, [id]);

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const status = await fetchStatus();
      if (status?.status === "completed") {
        // Fetch transcript and summary in parallel
        const [t, s] = await Promise.all([
          getTranscript(id).catch(() => null),
          getSummary(id).catch(() => null),
        ]);
        setTranscript(t);
        setSummary(s);
      }
      setLoading(false);
    };
    init();
  }, [id, fetchStatus]);

  // ── Polling for in-progress videos ────────────────────────────────────
  useEffect(() => {
    if (videoStatus?.status !== "pending" && videoStatus?.status !== "processing") {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      const status = await fetchStatus();
      if (!status) return;
      if (status.status === "completed") {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        // Load transcript & summary
        const [t, s] = await Promise.all([
          getTranscript(id).catch(() => null),
          getSummary(id).catch(() => null),
        ]);
        setTranscript(t);
        setSummary(s);
      } else if (status.status === "failed") {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [videoStatus?.status, fetchStatus, id]);

  // ── Auto-scroll chat ──────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Highlight current utterance in transcript ─────────────────────────
  const currentUtteranceIdx = useMemo(() => {
    if (!transcript?.utterances.length) return -1;
    return transcript.utterances.findIndex(
      (u) => currentVideoTime >= u.start && currentVideoTime <= u.end
    );
  }, [transcript, currentVideoTime]);

  // Auto-scroll transcript to current utterance
  useEffect(() => {
    if (currentUtteranceIdx < 0 || !transcriptContainerRef.current) return;
    const container = transcriptContainerRef.current;
    const activeEl = container.querySelector(`[data-utterance="${currentUtteranceIdx}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentUtteranceIdx]);

  // ── Video time update ─────────────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentVideoTime(videoRef.current.currentTime);
    }
  }, []);

  // ── Seek to timestamp ─────────────────────────────────────────────────
  const seekTo = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // ── Send chat question ────────────────────────────────────────────────
  const handleSendQuestion = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || isStreaming) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
    };

    // Add AI placeholder
    const aiMsgId = `ai-${Date.now()}`;
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "ai",
      content: "",
      isStreaming: true,
    };

    setChatMessages((prev) => [...prev, userMsg, aiMsg]);
    setChatInput("");
    setIsStreaming(true);
    setChatLoading(true);

    try {
      const stream = askQuestionStream(id, question);

      for await (const event of stream) {
        if (event.type === "delta") {
          const e = event as { type: "delta"; content: string };
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMsgId
                ? { ...msg, content: msg.content + e.content }
                : msg
            )
          );
          setChatLoading(false);
        } else if (event.type === "done") {
          const e = event as { type: "done"; sources?: string[] };
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMsgId
                ? { ...msg, isStreaming: false, sources: e.sources }
                : msg
            )
          );
          setIsStreaming(false);
          break;
        } else if (event.type === "error") {
          const e = event as { type: "error"; error: string };
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMsgId
                ? { ...msg, content: `Error: ${e.error}`, isStreaming: false }
                : msg
            )
          );
          setIsStreaming(false);
          break;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to get response";
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMsgId
            ? { ...msg, content: `Error: ${errorMsg}`, isStreaming: false }
            : msg
        )
      );
      setIsStreaming(false);
    }
  }, [chatInput, id, isStreaming]);

  // ── Parse source timestamps ───────────────────────────────────────────
  const parseSourceTimestamp = useCallback((source: string): number | null => {
    // Try to extract timestamp patterns like "00:05:30" or "5:30"
    const match = source.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const h = match[3] ? parseInt(match[1]) : 0;
      const m = parseInt(match[2]);
      const s = match[3] ? parseInt(match[3]) : parseInt(match[1]);
      return h * 3600 + (match[3] ? m * 60 : 0) + s;
    }
    return null;
  }, []);

  // ── Determine video title ─────────────────────────────────────────────
  const videoTitle = summary?.title || videoStatus?.message || `Video ${id.slice(0, 8)}`;

  // ── Render: Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={32} />
          <span className="text-sm text-[var(--text2)]">Loading video...</span>
        </div>
      </div>
    );
  }

  // ── Render: Failed ────────────────────────────────────────────────────
  if (videoStatus?.status === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="u-fade-in flex flex-col items-center gap-4 p-8 rounded-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            maxWidth: "480px",
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,118,117,0.15)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Processing Failed</h2>
          <p className="text-sm text-[var(--text2)] text-center">
            {videoStatus.error || "An unexpected error occurred while processing this video."}
          </p>
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
            &larr; Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: Processing / Pending ──────────────────────────────────────
  if (
    videoStatus?.status === "pending" ||
    videoStatus?.status === "processing"
  ) {
    const progress = videoStatus.progress ?? 0;
    const statusMessage = videoStatus.message || STATUS_LABELS[videoStatus.status] || "Processing...";

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="u-fade-in flex flex-col gap-6 p-8 rounded-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            maxWidth: "480px",
            width: "100%",
          }}
        >
          <div className="flex items-center gap-3">
            <Spinner size={24} />
            <h2 className="text-lg font-semibold">Processing Video</h2>
          </div>
          <p className="text-sm text-[var(--text2)] u-truncate">{videoTitle}</p>
          <ProgressBar
            value={progress}
            showLabel
            height={8}
            color="var(--accent)"
          />
          <p className="text-sm text-[var(--text2)]">{statusMessage}</p>
          <p className="text-xs text-[var(--text2)] opacity-60">
            This page will update automatically...
          </p>
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
            &larr; Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: Completed ─────────────────────────────────────────────────
  const videoSrc = streamVideoUrl(id);

  return (
    <div className="flex flex-col" style={{ background: "var(--bg)", height: "100vh", overflow: "hidden" }}>
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0 u-glass"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-[var(--text2)] hover:text-[var(--text)] transition-colors u-focus-ring rounded px-1"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Home
        </button>
        <div
          style={{ width: "1px", height: "16px", background: "var(--border)" }}
        />
        <h1 className="text-sm font-medium u-truncate flex-1">{videoTitle}</h1>
        <Badge status="completed" />
      </header>

      {/* ── Main content grid ──────────────────────────────────────────── */}
      <div
        className="flex-1 grid gap-0 min-h-0"
        data-video-grid
        style={{
          gridTemplateColumns: "3fr 2fr",
          overflow: "hidden",
        }}
      >
        {/* LEFT SIDE: Player + Transcript/Summary */}
        <div
          className="flex flex-col border-r min-h-0 overflow-hidden"
          data-main-panel
          style={{ borderColor: "var(--border)" }}
        >
          {/* Video Player */}
          <div
            className="relative bg-black w-full shrink-0"
            style={{ aspectRatio: "16 / 9", maxHeight: "55vh" }}
          >
            {videoError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-[var(--text2)]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <span className="text-sm">Video playback not available</span>
                <span className="text-xs opacity-60">
                  This may be a YouTube-sourced video
                </span>
              </div>
            ) : (
              <video
                ref={videoRef}
                className="w-full h-full"
                controls
                onTimeUpdate={handleTimeUpdate}
                onError={() => setVideoError(true)}
              >
                <source src={videoSrc} />
                Your browser does not support the video tag.
              </video>
            )}
          </div>

          {/* Tab bar */}
          <div
            className="flex border-b shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            {(["transcript", "summary"] as TabId[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2.5 text-sm font-medium transition-colors relative"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color:
                    activeTab === tab
                      ? "var(--accent2)"
                      : "var(--text2)",
                }}
              >
                {tab === "transcript" ? "Transcript" : "Summary"}
                {activeTab === tab && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 u-scroll p-4 overflow-hidden" style={{ minHeight: 0 }}>
            {/* ── Transcript Tab ───────────────────────────────────────── */}
            {activeTab === "transcript" && (
              <div ref={transcriptContainerRef}>
                {!transcript?.utterances.length ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="flex flex-col items-center gap-2">
                      <Spinner size={20} />
                      <span className="text-sm text-[var(--text2)]">
                        Loading transcript...
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {transcript.utterances.map((u: Utterance, idx: number) => {
                      const isActive = idx === currentUtteranceIdx;
                      return (
                        <button
                          key={idx}
                          data-utterance={idx}
                          onClick={() => seekTo(u.start)}
                          className="text-left px-3 py-2 rounded-lg transition-all duration-150 group"
                          style={{
                            background: isActive
                              ? "rgba(108,92,231,0.12)"
                              : "transparent",
                            border: "none",
                            cursor: "pointer",
                            width: "100%",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              (e.currentTarget as HTMLElement).style.background = "var(--surface2)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              (e.currentTarget as HTMLElement).style.background = "transparent";
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className="text-xs font-mono flex-shrink-0 pt-0.5"
                              style={{
                                color: isActive
                                  ? "var(--accent2)"
                                  : "var(--text2)",
                                minWidth: "52px",
                              }}
                            >
                              {secToTimestamp(u.start)}
                            </span>
                            {u.speaker && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                                style={{
                                  background: "rgba(162,155,254,0.12)",
                                  color: "var(--accent2)",
                                }}
                              >
                                {u.speaker}
                              </span>
                            )}
                            <span
                              className="text-sm leading-relaxed"
                              style={{
                                color: isActive
                                  ? "var(--text)"
                                  : "var(--text2)",
                              }}
                            >
                              {u.text}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Summary Tab ──────────────────────────────────────────── */}
            {activeTab === "summary" && (
              <div>
                {!summary ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="flex flex-col items-center gap-2">
                      <Spinner size={20} />
                      <span className="text-sm text-[var(--text2)]">
                        Loading summary...
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="u-fade-in flex flex-col gap-5">
                    {/* Title */}
                    <div>
                      <h2
                        className="text-xl font-semibold leading-tight"
                        style={{ color: "var(--text)" }}
                      >
                        {summary.title}
                      </h2>
                    </div>

                    {/* Summary text */}
                    <div>
                      <h3
                        className="text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: "var(--text2)" }}
                      >
                        Summary
                      </h3>
                      <p className="text-sm leading-relaxed text-[var(--text)]">
                        {summary.summary}
                      </p>
                    </div>

                    {/* Key points */}
                    {summary.key_points.length > 0 && (
                      <div>
                        <h3
                          className="text-xs font-semibold uppercase tracking-wider mb-2"
                          style={{ color: "var(--text2)" }}
                        >
                          Key Points
                        </h3>
                        <ul className="flex flex-col gap-1.5">
                          {summary.key_points.map((point, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2 text-sm"
                            >
                              <span
                                className="flex-shrink-0 mt-1 w-1.5 h-1.5 rounded-full"
                                style={{ background: "var(--accent)" }}
                              />
                              <span className="text-[var(--text)]">
                                {point}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Topics */}
                    {summary.topics && summary.topics.length > 0 && (
                      <div>
                        <h3
                          className="text-xs font-semibold uppercase tracking-wider mb-2"
                          style={{ color: "var(--text2)" }}
                        >
                          Topics
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {summary.topics.map((topic, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                background: "var(--surface2)",
                                color: "var(--text2)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: AI Q&A Chat */}
        <div
          className="flex flex-col min-h-0 overflow-hidden"
          data-chat-panel
        >
          {/* Chat header */}
          <div
            className="flex items-center gap-2 px-4 py-3 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              AI Q&amp;A
            </span>
          </div>

          {/* Messages area */}
          <div className="flex-1 u-scroll p-4 overflow-hidden" style={{ minHeight: 0 }}>
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 opacity-50">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-sm text-[var(--text2)] text-center max-w-[200px]">
                  Ask a question about this video
                </p>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className="u-fade-in mb-3"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems:
                    msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {/* Message bubble */}
                <div
                  className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          background: "var(--accent)",
                          color: "#fff",
                          borderBottomRightRadius: "6px",
                        }
                      : {
                          background: "var(--surface2)",
                          color: "var(--text)",
                          borderBottomLeftRadius: "6px",
                        }
                  }
                >
                  {msg.role === "ai" && msg.isStreaming && !msg.content ? (
                    <span className="flex items-center gap-2">
                      <span className="text-[var(--text2)]">Thinking</span>
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-[var(--text2)] u-pulse" />
                        <span
                          className="w-1 h-1 rounded-full bg-[var(--text2)] u-pulse"
                          style={{ animationDelay: "0.2s" }}
                        />
                        <span
                          className="w-1 h-1 rounded-full bg-[var(--text2)] u-pulse"
                          style={{ animationDelay: "0.4s" }}
                        />
                      </span>
                    </span>
                  ) : msg.role === "ai" ? (
                    <div>{renderMarkdown(msg.content)}</div>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>

                {/* Sources section for AI messages */}
                {msg.role === "ai" && !msg.isStreaming && msg.sources && msg.sources.length > 0 && (
                  <div
                    className="mt-1.5 px-2 py-1.5 rounded-lg text-xs"
                    style={{
                      background: "rgba(108,92,231,0.08)",
                      border: "1px solid rgba(108,92,231,0.15)",
                      maxWidth: "85%",
                    }}
                  >
                    <div
                      className="font-semibold mb-1"
                      style={{ color: "var(--accent2)" }}
                    >
                      Sources
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {msg.sources.map((source, sIdx) => {
                        const ts = parseSourceTimestamp(source);
                        return (
                          <button
                            key={sIdx}
                            onClick={() => {
                              if (ts !== null) seekTo(ts);
                            }}
                            className="text-left text-xs text-[var(--text2)] hover:text-[var(--accent2)] transition-colors"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: ts !== null ? "pointer" : "default",
                              padding: "1px 0",
                            }}
                          >
                            {source}
                            {ts !== null && (
                              <span className="ml-1 opacity-50">&#9654;</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div
            className="flex items-center gap-2 p-3 border-t shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            <input
              ref={chatInputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendQuestion();
                }
              }}
              placeholder="Ask about this video..."
              disabled={isStreaming}
              className="flex-1 px-3 py-2 rounded-lg text-sm u-focus-ring"
              style={{
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                outline: "none",
                transition: "border-color 0.15s",
              }}
            />
            <button
              onClick={handleSendQuestion}
              disabled={isStreaming || !chatInput.trim()}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150"
              style={{
                background:
                  isStreaming || !chatInput.trim()
                    ? "var(--surface2)"
                    : "var(--accent)",
                color:
                  isStreaming || !chatInput.trim()
                    ? "var(--text2)"
                    : "#fff",
                border: "none",
                cursor:
                  isStreaming || !chatInput.trim()
                    ? "not-allowed"
                    : "pointer",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Responsive: mobile stacking ────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          [data-video-grid] {
            grid-template-columns: 1fr !important;
          }
          [data-video-grid] > [data-chat-panel] {
            height: 50vh !important;
            border-top: 1px solid var(--border) !important;
            border-right: none !important;
          }
          [data-video-grid] > [data-main-panel] {
            border-right: none !important;
          }
        }
      `}} />
    </div>
  );
}
