"use client";

import React from "react";

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  color?: string;
  showLabel?: boolean;
  height?: number;
}

export default function ProgressBar({
  value,
  className = "",
  color = "var(--accent)",
  showLabel = true,
  height = 6,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="flex-1 bg-[var(--surface2)] rounded-full overflow-hidden"
        style={{ height }}
      >
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${clamped}%`,
            background: color,
          }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-[var(--text2)] tabular-nums min-w-[36px] text-right">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
