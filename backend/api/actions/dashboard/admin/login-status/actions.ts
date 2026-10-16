"use server";

import nodemailer from "nodemailer";

function getTransporter() {
  const smtpEmail = process.env.SMTP_EMAIL?.trim() || "nishanthv041@gmail.com";
  const smtpPassword = process.env.SMTP_PASSWORD?.trim().replace(/\s+/g, "") || "clfpizovhfpdmrpw";

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465");
  const isSecure = process.env.SMTP_PORT ? process.env.SMTP_PORT === "465" : true;

  return {
    smtpEmail,
    transporter: nodemailer.createTransport({
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
    }),
  };
}

export async function sendReportEmailAction(
  email: string,
  ipAddress: string | null,
  timestamp: Date,
  success: boolean,
  customRecipient?: string
) {
  try {
    const recipient = (customRecipient || email)?.trim();
    if (!recipient || !recipient.includes("@")) {
      return { error: `Invalid recipient email address: "${recipient || email}"` };
    }

    const { smtpEmail, transporter } = getTransporter();

    const formattedDate = new Date(timestamp).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "medium",
    });

    const mailOptions = {
      from: `"Portal Administration" <${smtpEmail}>`,
      replyTo: smtpEmail,
      to: recipient,
      subject: `Portal Account Notice: Login Activity for ${email}`,
      headers: {
        "X-Entity-Ref-ID": `${Date.now()}-${email}`,
      },
      text: `Hello,\n\nThis is an administrative account notice regarding your account (${email}).\n\nLogin Time: ${formattedDate}\nStatus: ${success ? "Success" : "Failed"}\nIP Address: ${ipAddress || "Unknown"}\n\nIf you did not initiate this login, please contact your administrator immediately.\n\nRegards,\nPortal Administration`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
          <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #1e293b; font-size: 20px;">Portal Account Notice</h2>
          </div>
          <p style="font-size: 15px; color: #334155;">Hello,</p>
          <p style="font-size: 14px; line-height: 1.5; color: #475569;">
            This is an administrative notice regarding login activity for account: <strong style="color: #0f172a;">${email}</strong>
          </p>
          <div style="background-color: ${success ? "#f0fdf4" : "#fef2f2"}; border: 1px solid ${success ? "#bbf7d0" : "#fecaca"}; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 4px 0; font-size: 14px;"><strong>Status:</strong> <span style="color: ${success ? "#16a34a" : "#dc2626"}; font-weight: bold;">${success ? "Successful Login" : "Failed Attempt"}</span></p>
            <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>Timestamp:</strong> ${formattedDate}</p>
            <p style="margin: 4px 0; font-size: 14px; color: #334155;"><strong>IP Address:</strong> ${ipAddress || "Unknown"}</p>
          </div>
          <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
            If this was you, you can safely ignore this notice. If you did not make this request, please contact your administrator or change your credentials right away.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">Portal Security Team &bull; Automated System Notice</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Successfully sent alert to ${recipient}. MessageId: ${info.messageId}`);

    return { 
      success: true, 
      message: `Security alert sent to ${recipient}!`,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error("[EMAIL SERVICE ERROR]:", error);
    return { 
      error: `Failed to send email: ${error?.message || "Please check SMTP configuration"}` 
    };
  }
}

export async function sendTestEmailAction(targetEmail: string) {
  try {
    const recipient = targetEmail?.trim();
    if (!recipient || !recipient.includes("@")) {
      return { error: `Invalid email address: "${targetEmail}"` };
    }

    const { smtpEmail, transporter } = getTransporter();

    const info = await transporter.sendMail({
      from: `"Portal Administration" <${smtpEmail}>`,
      replyTo: smtpEmail,
      to: recipient,
      subject: "Portal Test Email - Delivery Confirmation",
      text: `This is a test email sent from Portal Admin to verify that SMTP delivery is working properly.\n\nSent to: ${recipient}\nTime: ${new Date().toLocaleString()}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Portal Email Test</h2>
          <p>This email confirms that your Portal SMTP email delivery system is <strong>online and functioning</strong>.</p>
          <p style="background: #f1f5f9; padding: 10px; border-radius: 6px; font-size: 13px;">
            <strong>Recipient:</strong> ${recipient}<br/>
            <strong>Sent Time:</strong> ${new Date().toLocaleString()}<br/>
            <strong>Sender:</strong> ${smtpEmail}
          </p>
          <p style="color: #64748b; font-size: 12px;">Automated confirmation test.</p>
        </div>
      `,
    });

    return {
      success: true,
      message: `Test email successfully sent to ${recipient}!`,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error("[EMAIL TEST ERROR]:", error);
    return { error: `Email test failed: ${error?.message || "Unknown error"}` };
  }
}
