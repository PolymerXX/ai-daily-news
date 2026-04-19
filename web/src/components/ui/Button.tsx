"use client";

import React from "react";

type ButtonVariant = "default" | "accent" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    "bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--border)] hover:border-[var(--text2)]",
  accent:
    "bg-[var(--accent)] text-white border border-transparent hover:bg-[var(--accent2)]",
  ghost:
    "bg-transparent text-[var(--text)] hover:bg-[var(--surface2)]",
  danger:
    "bg-[var(--error)] text-white border border-transparent hover:opacity-90",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-sm rounded",
  md: "px-4 py-2 text-sm rounded-md",
  lg: "px-6 py-3 text-base rounded-lg",
};

export default function Button({
  variant = "default",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 font-medium
        transition-colors duration-150 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        u-focus-ring
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full u-spin" />
      )}
      {children}
    </button>
  );
}
