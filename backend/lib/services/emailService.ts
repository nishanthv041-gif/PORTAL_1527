import nodemailer from "nodemailer";

export function getSmtpTransporter() {
  const smtpEmail = process.env.SMTP_EMAIL?.trim() || "nishanthv041@gmail.com";
  const smtpPassword = process.env.SMTP_PASSWORD?.trim().replace(/\s+/g, "") || "clfpizovhfpdmrpw";

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465");
  const isSecure = process.env.SMTP_PORT ? process.env.SMTP_PORT === "465" : true;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: {
      user: smtpEmail,
      pass: smtpPassword,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  return { smtpEmail, transporter };
}

export function formatSystemSummary(ua?: string | null): string {
  if (!ua || ua === "Unknown" || ua === "N/A") return "Standard Web Browser";
  let os = "Desktop / PC";
  let browser = "Web Browser";

  if (/android/i.test(ua)) os = "Android Mobile";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "Apple iOS (iPhone/iPad)";
  else if (/windows nt 10/i.test(ua)) os = "Windows 10/11 PC";
  else if (/windows/i.test(ua)) os = "Windows PC";
  else if (/macintosh|mac os x/i.test(ua)) os = "Apple Mac (macOS)";
  else if (/cros/i.test(ua)) os = "Chromebook (ChromeOS)";
  else if (/linux/i.test(ua)) os = "Linux PC";

  if (/edg/i.test(ua)) browser = "Microsoft Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Google Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Mozilla Firefox";
  else if (/safari/i.test(ua)) browser = "Apple Safari";
  else if (/opera|opr/i.test(ua)) browser = "Opera";

  return `${os} (${browser})`;
}

// Send Security / Login Report Email to a specific recipient email ID
export async function sendSecurityReportEmail({
  accountEmail,
  ipAddress,
  userAgent,
  timestamp,
  success,
  recipientEmail,
  ccAdmin = true,
}: {
  accountEmail: string;
  ipAddress: string | null;
  userAgent?: string | null;
  timestamp: Date | string;
  success: boolean;
  recipientEmail: string;
  ccAdmin?: boolean;
}) {
  const targetRecipient = recipientEmail?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!targetRecipient || !emailRegex.test(targetRecipient)) {
    return { error: `Invalid recipient email address: "${recipientEmail}"` };
  }

  const { smtpEmail, transporter } = getSmtpTransporter();

  const formattedDate = new Date(timestamp).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  const deviceSummary = formatSystemSummary(userAgent);
  const ccList = (ccAdmin && targetRecipient !== smtpEmail.toLowerCase()) ? [smtpEmail] : undefined;

  const mailOptions = {
    from: `"SRT Portal" <${smtpEmail}>`,
    replyTo: smtpEmail,
    to: targetRecipient,
    cc: ccList,
    subject: `SRT Portal: Account Login Notification for ${accountEmail}`,
    headers: {
      "X-Entity-Ref-ID": `${Date.now()}-${accountEmail.replace(/[^a-zA-Z0-9]/g, "")}`,
    },
    text: `SRT School Portal - Account Activity Notice\n\nLogin Activity for Account: ${accountEmail}\nStatus: ${success ? "SUCCESSFUL LOGIN" : "FAILED LOGIN ATTEMPT"}\nDate & Time: ${formattedDate}\nIP Address: ${ipAddress || "Unknown"}\nSystem / Device: ${deviceSummary}\nFull Client Info: ${userAgent || "N/A"}\n\nThis is an automated activity report sent from the SRT School Portal Administration.\n\nPortal: https://nipoportal.vercel.app`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
        <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #1e293b; font-size: 20px;">SRT School Portal Notification</h2>
        </div>
        <p style="font-size: 15px; color: #334155;">Hello,</p>
        <p style="font-size: 14px; line-height: 1.5; color: #475569;">
          This is an official administrative notice regarding login activity for account: <strong style="color: #0f172a;">${accountEmail}</strong>
        </p>
        <div style="background-color: ${success ? "#f0fdf4" : "#fef2f2"}; border: 1px solid ${success ? "#bbf7d0" : "#fecaca"}; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 6px 0; font-size: 14px;"><strong>Status:</strong> <span style="color: ${success ? "#16a34a" : "#dc2626"}; font-weight: bold;">${success ? "Successful Login" : "Failed Attempt"}</span></p>
          <p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Date & Time:</strong> ${formattedDate}</p>
          <p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>IP Address:</strong> <code style="background: rgba(0,0,0,0.06); padding: 3px 8px; border-radius: 4px; font-weight: 600; font-family: monospace;">${ipAddress || "Unknown"}</code></p>
          <p style="margin: 6px 0; font-size: 14px; color: #334155;"><strong>Login System / Device:</strong> <span style="font-weight: 600; color: #1e293b;">${deviceSummary}</span></p>
          ${userAgent ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #64748b; word-break: break-all;"><strong>Technical User Agent:</strong> ${userAgent}</p>` : ""}
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
          This report was dispatched by Portal Administration. If you have questions regarding this activity, please contact the administrator.
        </p>
        <div style="margin-top: 24px; text-align: center;">
          <a href="https://nipoportal.vercel.app/login" style="background: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block;">Open Portal</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">SRT School Security Team &bull; Automated System Notice</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    message: `Report sent to ${targetRecipient}${ccList ? ` (and copy to ${smtpEmail})` : ""}`,
    messageId: info.messageId,
  };
}

// Send Portal Invitation Email to a teacher, parent, or staff member
export async function sendUserInviteEmail({
  email,
  name,
  role,
}: {
  email: string;
  name?: string | null;
  role: string;
}) {
  const targetRecipient = email?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!targetRecipient || !emailRegex.test(targetRecipient)) {
    return { error: `Invalid recipient email address: "${email}"` };
  }

  const { smtpEmail, transporter } = getSmtpTransporter();
  const displayName = name?.trim() || "User";
  const displayRole = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

  const mailOptions = {
    from: `"SRT School Portal" <${smtpEmail}>`,
    replyTo: smtpEmail,
    to: targetRecipient,
    subject: `Welcome to SRT School Portal - Access Invitation (${displayRole})`,
    text: `Hello ${displayName},\n\nYou have been registered on the SRT School Portal as a ${displayRole}.\n\nYour Registered Email: ${targetRecipient}\nPortal Link: https://nipoportal.vercel.app/login\n\nPlease log in using Google OAuth with this email address, or use your credentials provided by the school.\n\nRegards,\nSRT School Administration`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
        <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #1e293b; font-size: 20px;">SRT School Portal Invitation</h2>
        </div>
        <p style="font-size: 15px; color: #334155;">Hello <strong>${displayName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.5; color: #475569;">
          You have been registered on the <strong>SRT School Management Portal</strong> as a <strong style="color: #4f46e5;">${displayRole}</strong>.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0; font-size: 14px;"><strong>Account Email:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${targetRecipient}</code></p>
          <p style="margin: 4px 0; font-size: 14px;"><strong>Assigned Role:</strong> ${displayRole}</p>
          <p style="margin: 4px 0; font-size: 14px;"><strong>Access Method:</strong> Sign in with Google (OAuth) or use your designated portal credentials.</p>
        </div>
        <div style="margin: 24px 0; text-align: center;">
          <a href="https://nipoportal.vercel.app/login" style="background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">Access School Portal</a>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
          If you have any questions or require credentials assistance, please contact the school administration office.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">SRT School Administration &bull; Automated Invitation</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    message: `Invitation email sent successfully to ${targetRecipient}!`,
    messageId: info.messageId,
  };
}
