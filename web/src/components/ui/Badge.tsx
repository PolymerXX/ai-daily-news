"use client";

import React from "react";

type BadgeStatus = "pending" | "processing" | "completed" | "failed";

interface BadgeProps {
  status: BadgeStatus;
  children?: React.ReactNode;
  className?: string;
}

const statusConfig: Record<
  BadgeStatus,
  { label: string; bg: string; text: string }
> = {
  pending: {
    label: "Pending",
    bg: "bg-[var(--warning)]/15",
    text: "text-[var(--warning)]",
  },
  processing: {
    label: "Processing",
    bg: "bg-[var(--accent)]/15",
    text: "text-[var(--accent2)]",
  },
  completed: {
    label: "Completed",
    bg: "bg-[var(--success)]/15",
    text: "text-[var(--success)]",
  },
  failed: {
    label: "Failed",
    bg: "bg-[var(--error)]/15",
    text: "text-[var(--error)]",
  },
};

export default function Badge({
  status,
  children,
  className = "",
}: BadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
        text-xs font-medium
        ${config.bg} ${config.text}
        ${className}
      `}
    >
      {/* Status dot */}
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          status === "processing" ? "u-pulse" : ""
        }`}
        style={{
          backgroundColor:
            status === "pending"
              ? "var(--warning)"
              : status === "processing"
              ? "var(--accent2)"
              : status === "completed"
              ? "var(--success)"
              : "var(--error)",
        }}
      />
      {children || config.label}
    </span>
  );
}
