"use client";

import React, { useState } from "react";
import Image from "next/image";
import styles from "./BirthdayWishCard.module.css";

export interface BirthdayWishCardProps {
  recipientName: string;
  classNameLabel?: string; // Optional e.g. "Class 2 - A"
  deityName?: string;
  cardLine1?: string;
  cardLine2?: string;
  senderName?: string;
  senderDesignation?: string;
  schoolName?: string;
  schoolLogo?: string;
  schoolTagline?: string;
  ammanPhotoUrl?: string;
  signatureUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

export default function BirthdayWishCard({
  recipientName,
  classNameLabel,
  deityName = "Amman",
  cardLine1 = "I have great pleasure in conveying my best wishes on the eve of your birthday",
  cardLine2 = "My prayers are to {deityName} to bless you with peace, prosperity and happiness",
  senderName = "PRANAV.J",
  senderDesignation = "Correspondent",
  schoolName = "SRT SCHOOL",
  schoolLogo = "/logo/srt-logo.svg",
  schoolTagline = "UNIVERSAL SCHOOL",
  ammanPhotoUrl = "/assets/birthday/amman.jpg",
  signatureUrl = null,
  className = "",
  style,
}: BirthdayWishCardProps) {
  const [logoError, setLogoError] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  // Substitute {deityName} in cardLine2
  const effectiveLine2 = (cardLine2 || "").replace(/{deityName}/g, deityName || "Amman");

  // Format full recipient title e.g. "Anushka A (Class 10-A)" or just "Anushka A"
  const formattedRecipient = classNameLabel
    ? `${recipientName} (${classNameLabel})`
    : recipientName;

  return (
    <div
      className={`${styles.cardContainer} ${className}`}
      style={style}
      data-testid="birthday-wish-card"
    >
      {/* LEFT COLUMN: Framed Amman Deity Photo */}
      <div className={styles.photoWrapper}>
        <div className={styles.photoFrame}>
          {!photoError ? (
            <img
              src={ammanPhotoUrl}
              alt={deityName || "Amman Deity"}
              className={styles.deityImage}
              onError={() => setPhotoError(true)}
              data-testid="birthday-deity-photo"
            />
          ) : (
            <div className={styles.deityFallback} data-testid="birthday-deity-fallback">
              <span className={styles.deityFallbackIcon}>🕉️</span>
              <strong>{deityName || "Amman"}</strong>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Heading, Recipient, Message, Closing, Signature & Logo Badge */}
      <div className={styles.contentArea}>
        {/* Header & Salutation */}
        <div className={styles.headerSection}>
          <h2 className={styles.headingMain}>Happy Birthday</h2>
          <div className={styles.salutation}>
            My Dear <span className={styles.recipientName}>{formattedRecipient}</span>
          </div>
        </div>

        {/* Message Body */}
        <div className={styles.bodySection}>
          <p className={styles.messageLine}>{cardLine1}</p>
          <p className={styles.messageLine}>{effectiveLine2}</p>
        </div>

        {/* Footer: Correspondent Signature Block & Circular School Logo Badge */}
        <div className={styles.footerSection}>
          {/* Signature Block */}
          <div className={styles.signatureBlock} data-testid="birthday-signature-block">
            <span className={styles.closing}>Yours Sincerely</span>
            {signatureUrl && (
              <div className={styles.signatureGraphicWrapper}>
                <img
                  src={signatureUrl}
                  alt="Signature"
                  className={styles.signatureGraphic}
                />
              </div>
            )}
            <span className={styles.senderName}>{senderName || "PRANAV.J"}</span>
            <span className={styles.senderDesignation}>{senderDesignation || "Correspondent"}</span>
            <span className={styles.schoolAffiliation}>{schoolName || "SRT SCHOOL"}</span>
          </div>

          {/* Circular School Logo Badge */}
          <div className={styles.logoBadgeWrapper}>
            <div className={styles.logoBadgeCircle} data-testid="birthday-logo-badge">
              {!logoError && schoolLogo ? (
                <img
                  src={schoolLogo}
                  alt={schoolName || "SRT SCHOOL"}
                  className={styles.logoImage}
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div
                  className={styles.logoFallbackBadge}
                  data-testid="birthday-logo-fallback"
                >
                  SRT
                </div>
              )}
              <span className={styles.badgeSchoolName}>{schoolName || "SRT SCHOOL"}</span>
              <span className={styles.badgeTagline}>{schoolTagline || "UNIVERSAL SCHOOL"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
