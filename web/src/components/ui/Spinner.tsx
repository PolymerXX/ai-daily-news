"use client";

import React from "react";

interface SpinnerProps {
  size?: number;
  className?: string;
  color?: string;
}

export default function Spinner({
  size = 24,
  className = "",
  color = "var(--accent2)",
}: SpinnerProps) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-t-transparent u-spin ${className}`}
      style={{
        width: size,
        height: size,
        borderColor: `${color} transparent transparent transparent`,
      }}
      role="status"
      aria-label="Loading"
    />
  );
}
