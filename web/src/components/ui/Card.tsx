"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({
  children,
  className = "",
  hover = false,
}: CardProps) {
  return (
    <div
      className={`
        bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4
        transition-colors duration-150
        ${hover ? "hover:border-[var(--accent)] hover:bg-[var(--surface2)] cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/* Optional sub-components for structured cards */
Card.Header = function CardHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 pb-3 border-b border-[var(--border)] ${className}`}>
      {children}
    </div>
  );
};

Card.Title = function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-base font-semibold text-[var(--text)] ${className}`}>
      {children}
    </h3>
  );
};

Card.Body = function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
};
