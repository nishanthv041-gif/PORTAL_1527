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

export interface ReportCardEmailSubjectMark {
  subjectName: string;
  score: number;
  maxScore: number;
  isFail?: boolean;
  remarks?: string | null;
}

// Send Student Academic Report Card Email directly to a Parent's inbox
export async function sendStudentReportCardEmail({
  parentEmail,
  parentName,
  studentName,
  rollNumber,
  className,
  examName,
  totalScore,
  maxTotal,
  percentage,
  grade,
  subjectMarks = [],
  remarks,
  reportCardUrl = "https://nipoportal.vercel.app/dashboard/parent/report-cards",
  ccAdmin = true,
}: {
  parentEmail: string;
  parentName?: string | null;
  studentName: string;
  rollNumber: string;
  className: string;
  examName?: string;
  totalScore?: number;
  maxTotal?: number;
  percentage?: number | string;
  grade?: string;
  subjectMarks?: ReportCardEmailSubjectMark[];
  remarks?: string | null;
  reportCardUrl?: string;
  ccAdmin?: boolean;
}) {
  const targetRecipient = parentEmail?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!targetRecipient || !emailRegex.test(targetRecipient)) {
    return { error: `Invalid recipient email address: "${parentEmail}"` };
  }

  const { smtpEmail, transporter } = getSmtpTransporter();
  const displayName = parentName?.trim() || "Parent / Guardian";
  const ccList = (ccAdmin && targetRecipient !== smtpEmail.toLowerCase()) ? [smtpEmail] : undefined;

  const subjectRowsHtml = subjectMarks.map(sm => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px 12px; font-weight: 500; color: #1e293b;">${sm.subjectName}</td>
      <td style="padding: 10px 12px; text-align: center; font-weight: 600; color: ${sm.isFail ? '#dc2626' : '#0f172a'};">${sm.score}</td>
      <td style="padding: 10px 12px; text-align: center; color: #64748b;">${sm.maxScore}</td>
      <td style="padding: 10px 12px; text-align: center;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${sm.isFail ? '#fee2e2' : '#dcfce7'}; color: ${sm.isFail ? '#b91c1c' : '#15803d'};">
          ${sm.isFail ? 'FAIL' : 'PASS'}
        </span>
      </td>
    </tr>
  `).join('');

  const subjectRowsText = subjectMarks.map(sm => 
    `- ${sm.subjectName}: ${sm.score} / ${sm.maxScore} (${sm.isFail ? 'FAIL' : 'PASS'})`
  ).join('\n');

  const mailOptions = {
    from: `"SRT School Portal" <${smtpEmail}>`,
    replyTo: smtpEmail,
    to: targetRecipient,
    cc: ccList,
    subject: `Official Student Report Card: ${studentName} (${className}) - SRT School`,
    text: `SRT School Portal - Student Report Card\n\nDear ${displayName},\n\nThe official academic report card for ${studentName} (Roll No: ${rollNumber}, Class: ${className}) is ready.\n\nSummary:\n- Exam: ${examName || "Term Examination"}\n- Total Score: ${totalScore ?? 'N/A'} / ${maxTotal ?? 'N/A'}\n- Percentage: ${percentage ? `${percentage}%` : 'N/A'}\n- Grade: ${grade || 'N/A'}\n\nSubject Breakdown:\n${subjectRowsText || 'See full breakdown in portal'}\n\nView Complete Report Card Online:\n${reportCardUrl}\n\nWarm regards,\nSRT School Administration`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
        <div style="border-bottom: 3px solid #4f46e5; padding-bottom: 14px; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #1e293b; font-size: 22px;">
            SRT School Academic Report Card
          </h2>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Official Academic Performance & Evaluation Record</p>
        </div>

        <p style="font-size: 15px; color: #334155; margin-bottom: 16px;">
          Dear <strong>${displayName}</strong>,
        </p>

        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px;">
          The academic performance report card for your ward <strong>${studentName}</strong> has been published. Please review the performance summary below.
        </p>

        <!-- Student Profile Card -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; width: 50%;">
                <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; display: block;">Student Name</span>
                <strong style="font-size: 15px; color: #0f172a;">${studentName}</strong>
              </td>
              <td style="padding: 6px 0; width: 50%;">
                <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; display: block;">Roll Number</span>
                <span style="font-size: 14px; font-weight: 600; color: #4f46e5;">${rollNumber}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0;">
                <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; display: block;">Class / Section</span>
                <span style="font-size: 14px; color: #334155;">${className}</span>
              </td>
              <td style="padding: 6px 0;">
                <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; display: block;">Exam / Term</span>
                <span style="font-size: 14px; color: #334155;">${examName || "Term Examination"}</span>
              </td>
            </tr>
          </table>
        </div>

        ${totalScore !== undefined && maxTotal ? `
        <!-- Score Summary Cards -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="width: 33%; padding: 4px;">
              <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 11px; color: #4338ca; font-weight: 700; text-transform: uppercase;">Total Score</div>
                <div style="font-size: 18px; font-weight: 700; color: #312e81; margin-top: 4px;">${totalScore} / ${maxTotal}</div>
              </div>
            </td>
            <td style="width: 33%; padding: 4px;">
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 11px; color: #15803d; font-weight: 700; text-transform: uppercase;">Percentage</div>
                <div style="font-size: 18px; font-weight: 700; color: #166534; margin-top: 4px;">${percentage ? `${percentage}%` : 'N/A'}</div>
              </div>
            </td>
            <td style="width: 33%; padding: 4px;">
              <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 11px; color: #a16207; font-weight: 700; text-transform: uppercase;">Grade</div>
                <div style="font-size: 18px; font-weight: 700; color: #854d0e; margin-top: 4px;">${grade || 'Pass'}</div>
              </div>
            </td>
          </tr>
        </table>
        ` : ''}

        ${subjectMarks.length > 0 ? `
        <!-- Subject Breakdown Table -->
        <div style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 10px 12px; font-weight: 600; color: #475569;">Subject</th>
                <th style="padding: 10px 12px; font-weight: 600; color: #475569; text-align: center;">Score</th>
                <th style="padding: 10px 12px; font-weight: 600; color: #475569; text-align: center;">Max</th>
                <th style="padding: 10px 12px; font-weight: 600; color: #475569; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${subjectRowsHtml}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${remarks ? `
        <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
          <strong style="font-size: 13px; color: #6b21a8; display: block; margin-bottom: 4px;">Teacher Remarks:</strong>
          <span style="font-size: 13px; color: #4c1d95;">${remarks}</span>
        </div>
        ` : ''}

        <!-- CTA Link -->
        <div style="margin: 28px 0; text-align: center;">
          <a href="${reportCardUrl}" style="background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
            View Full Report Card Online &rarr;
          </a>
        </div>

        <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-bottom: 20px;">
          You can sign in to the SRT School Parent Portal at any time to verify report cards, track attendance, and communicate with teachers.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">
          SRT School Examination Department &bull; Automated Report Card Dispatch
        </p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    message: `Report card emailed to ${targetRecipient}${ccList ? ` (and CC to ${smtpEmail})` : ''}`,
    messageId: info.messageId,
  };
}
