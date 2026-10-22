"use server";

import { sendSecurityReportEmail, getSmtpTransporter } from "@/backend/lib/services/emailService";

export async function sendReportEmailAction(
  email: string,
  ipAddress: string | null,
  timestamp: Date | string,
  success: boolean,
  customRecipient?: string
) {
  try {
    const recipient = (customRecipient || email)?.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipient || !emailRegex.test(recipient)) {
      return { error: `Invalid recipient email address: "${customRecipient || email}". Please provide a valid email.` };
    }

    return await sendSecurityReportEmail({
      accountEmail: email,
      ipAddress,
      timestamp,
      success,
      recipientEmail: recipient,
    });
  } catch (error: any) {
    console.error("[EMAIL SERVICE ERROR]:", error);
    return { 
      error: `Failed to send email: ${error?.message || "Please check SMTP configuration"}` 
    };
  }
}

export async function sendTestEmailAction(targetEmail: string) {
  try {
    const recipient = targetEmail?.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipient || !emailRegex.test(recipient)) {
      return { error: `Invalid email address: "${targetEmail}". Please provide a valid address like name@example.com` };
    }

    const { smtpEmail, transporter } = getSmtpTransporter();

    const info = await transporter.sendMail({
      from: `"SRT School Administration" <${smtpEmail}>`,
      replyTo: smtpEmail,
      to: recipient,
      subject: "[SRT Portal] Test Email - Delivery Confirmation",
      text: `This is a test email sent from SRT School Portal Admin to verify that SMTP delivery is working properly.\n\nSent to: ${recipient}\nTime: ${new Date().toLocaleString()}\nSender: ${smtpEmail}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #4f46e5; margin-top: 0;">SRT Portal Email Test</h2>
          <p>This email confirms that your Portal SMTP email delivery system is <strong>online and functioning</strong>.</p>
          <p style="background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px;">
            <strong>Recipient:</strong> ${recipient}<br/>
            <strong>Sent Time:</strong> ${new Date().toLocaleString()}<br/>
            <strong>Sender Account:</strong> ${smtpEmail}
          </p>
          <p style="color: #64748b; font-size: 12px; margin-top: 15px;">Automated system delivery test confirmation.</p>
        </div>
      `,
    });

    return {
      success: true,
      message: `Test email successfully sent to ${recipient}! (Check Spam folder if not in primary inbox)`,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error("[EMAIL TEST ERROR]:", error);
    return { error: `Email test failed: ${error?.message || "Unknown error"}` };
  }
}
