import React from "react";
import Image from "next/image";

export interface SrtLogoProps {
  /** Size in pixels, clamp string, or percentage. Defaults to fluid clamp */
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  alt?: string;
}

export default function SrtLogo({
  size,
  className = "",
  style,
  priority = true,
  alt = "SRT Universal School Crest",
}: SrtLogoProps) {
  // If size is a specific number, convert to px
  const isNumberSize = typeof size === "number";
  const dimensionStyle: React.CSSProperties = size
    ? isNumberSize
      ? { width: `${size}px`, height: `${size}px` }
      : { width: size, height: size }
    : {
        width: "clamp(120px, 28vmin, 280px)",
        height: "clamp(120px, 28vmin, 280px)",
      };

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
        ...dimensionStyle,
        ...style,
      }}
    >
      <Image
        src="/logo/srt-logo.svg"
        alt={alt}
        fill
        sizes="(max-width: 640px) 180px, (max-width: 1024px) 240px, 280px"
        priority={priority}
        unoptimized
        style={{
          objectFit: "contain",
          width: "100%",
          height: "100%",
          filter: "drop-shadow(0 10px 25px rgba(0, 0, 0, 0.45))",
        }}
      />
    </div>
  );
}
