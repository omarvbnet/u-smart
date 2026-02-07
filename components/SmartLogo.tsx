"use client";

import React from "react";
import { motion } from "framer-motion";

interface SmartLogoProps {
  className?: string;
  showTagline?: boolean;
  variant?: "default" | "compact";
}

export default function SmartLogo({
  className = "",
  showTagline = false,
  variant = "default",
}: SmartLogoProps) {
  const iconSize = variant === "compact" ? "h-10 w-10" : "h-11 w-11 sm:h-12 sm:w-12";

  return (
    <div className={`flex items-center gap-3 group shrink-0 ${className}`}>
      <motion.div
        className={`relative ${iconSize} flex-shrink-0`}
        whileHover={{ scale: 1.04 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-blue-600 p-[2px]">
          <div className="h-full w-full rounded-2xl bg-[#0A0A0F]" />
        </div>
        <div className="absolute inset-[6px] flex items-center justify-center">
          <svg viewBox="0 0 56 56" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
              <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <path
              d="M14 18 L14 36 Q14 48 28 48 Q42 48 42 36 L42 18"
              stroke="url(#lg)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path d="M24 28 L30 28 L26 34 L30 34 L22 44 L26 30 L20 30 Z" fill="url(#lg)" opacity="0.9" />
          </svg>
        </div>
      </motion.div>
      <div className="flex flex-col justify-center">
        <span
          className="font-bold tracking-tight leading-none text-white"
          style={{ fontSize: variant === "compact" ? "1.2rem" : "1.35rem", letterSpacing: "-0.02em" }}
        >
          U<span className="text-cyan-400">Smart</span>
        </span>
        {showTagline && (
          <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-cyan-400/80 mt-0.5">
            Exclusive Agent of HDL
          </span>
        )}
      </div>
    </div>
  );
}
