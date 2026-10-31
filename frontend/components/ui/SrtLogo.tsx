import React from "react";
import Image from "next/image";

export interface SrtLogoProps {
  /** Size in pixels, clamp string, or percentage. Defaults to fluid clamp */
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  alt?: string;
  /** Place logo on a clean circular white plate with gold ring and soft shadow */
  withPlate?: boolean;
}

export default function SrtLogo({
  size,
  className = "",
  style,
  priority = true,
  alt = "SRT Universal School Crest",
  withPlate = false,
}: SrtLogoProps) {
  const isNumberSize = typeof size === "number";
  const dimensionStyle: React.CSSProperties = size
    ? isNumberSize
      ? { width: `${size}px`, height: `${size}px` }
      : { width: size, height: size }
    : {
        width: "clamp(160px, 32vmin, 320px)",
        height: "clamp(160px, 32vmin, 320px)",
      };

  const imageElement = (
    <div
      style={{
        position: "relative",
        flexShrink: 0,
        ...dimensionStyle,
      }}
    >
      <Image
        src="/logo/srt-logo.png"
        alt={alt}
        fill
        sizes="(max-width: 640px) 240px, (max-width: 1024px) 360px, 640px"
        priority={priority}
        unoptimized
        style={{
          objectFit: "contain",
          width: "100%",
          height: "100%",
          imageRendering: "auto",
        }}
      />
    </div>
  );

  if (withPlate) {
    return (
      <div
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          border: "2.5px solid #f2b84b",
          boxShadow: "0 14px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(242, 184, 75, 0.35)",
          padding: "clamp(16px, 2.5vmin, 24px)",
          flexShrink: 0,
          ...style,
        }}
      >
        {imageElement}
      </div>
    );
  }

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
        src="/logo/srt-logo.png"
        alt={alt}
        fill
        sizes="(max-width: 640px) 240px, (max-width: 1024px) 360px, 640px"
        priority={priority}
        unoptimized
        style={{
          objectFit: "contain",
          width: "100%",
          height: "100%",
          imageRendering: "auto",
        }}
      />
    </div>
  );
}

