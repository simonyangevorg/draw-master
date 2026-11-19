import React from "react";

/**
 * The DrawMaster wordmark: a small bracket-and-ball mark plus the name.
 * Interim brand (L-09) until a designed logo is approved. A club's own logo
 * belongs to the club, not the product.
 *
 * size  – height of the mark in px (the text scales with it)
 * light – white version, for the green panels
 */
export default function Logo({ size = 32, light = false, className = "" }) {
  return (
    <span
      className={`dm-logo${light ? " dm-logo-light" : ""}${className ? ` ${className}` : ""}`}
      style={{ fontSize: Math.round(size * 0.62) }}
      role="img"
      aria-label="DrawMaster"
    >
      <LogoMark size={size} light={light} />
      <span className="dm-logo-text" aria-hidden="true">
        Draw<strong>Master</strong>
      </span>
    </span>
  );
}

export function LogoMark({ size = 32, light = false }) {
  const line = light ? "#ffffff" : "var(--green)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {/* a 4-into-2-into-1 bracket */}
      <g fill="none" stroke={line} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5h6v6H3M3 21h6v6H3M9 8h4v16h-4M13 16h5" />
      </g>
      <circle cx="24" cy="16" r="6.2" fill="#f5c842" stroke={light ? "#ffffff" : "#1f5c3a"} strokeWidth="1.4" />
      <path d="M19.6 12.4c2.6 1.6 2.6 5.6 0 7.2M28.4 12.4c-2.6 1.6-2.6 5.6 0 7.2" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
