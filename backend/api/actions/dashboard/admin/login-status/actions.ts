"use server";

import nodemailer from "nodemailer";

export async function sendReportEmailAction(email: string, ipAddress: string | null, timestamp: Date, success: boolean) {
  try {
    const smtpEmail = process.env.SMTP_EMAIL;
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpEmail || !smtpPassword) {
      return { error: "SMTP_EMAIL or SMTP_PASSWORD environment variables are not set. Cannot send email." };
    }

    const transporter = nodemailer.createTransport(
      process.env.SMTP_HOST
        ? {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_PORT === '465',
            auth: {
              user: smtpEmail,
              pass: smtpPassword,
            },
          }
        : {
            service: 'gmail',
            auth: {
              user: smtpEmail,
              pass: smtpPassword,
            },
          }
    );

    const mailOptions = {
      from: `"Portal Security" <${smtpEmail}>`,
      to: email,
      subject: "Security Notice: Login Activity on Your Portal Account",
      text: `Hello,\n\nWe are writing to inform you of a recent login attempt on your account.\n\nTime: ${new Date(timestamp).toLocaleString()}\nStatus: ${success ? 'Success' : 'Failed'}\nIP Address: ${ipAddress || 'Unknown'}\n\nIf this was not you, please contact the administrator immediately.\n\nThank you,\nPortal Admin`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #333;">Security Notice: Login Activity</h2>
          <p>Hello,</p>
          <p>We are writing to inform you of a recent login attempt on your account.</p>
          <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid ${success ? '#4CAF50' : '#f44336'}; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ${success ? 'Success' : 'Failed'}</p>
            <p style="margin: 5px 0;"><strong>IP Address:</strong> ${ipAddress || 'Unknown'}</p>
          </div>
          <p>If this was not you, please contact the administrator immediately.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888;">Thank you,<br/>Portal Admin</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Successfully sent alert to ${email}. MessageId: ${info.messageId}`);

    return { success: true, message: "Security alert email sent successfully!" };
  } catch (error) {
    console.error("Failed to send alert email:", error);
    return { error: "Failed to send alert email. Please check server logs." };
  }
}
