const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  const { email, subject, message, html, otp, type = 'VERIFICATION' } = options;

  // Print formatted console log for development / debugging
  console.log('\n==================================================');
  if (otp) {
    console.log(`🔐 ${type} OTP GENERATED FOR: ${email}`);
    console.log(`🔑 OTP CODE: ${otp}`);
    console.log(`⏰ EXPIRES IN: 10 MINUTES`);
  } else {
    console.log(`📧 [${type}] EMAIL NOTIFICATION FOR: ${email}`);
    console.log(`📋 SUBJECT: ${subject}`);
    if (message) console.log(`💬 MESSAGE: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
  }
  console.log('==================================================\n');

  // Send real email if SMTP credentials are available
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const defaultHtml = otp
        ? `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #2563eb;">Travel Diary ${type === 'RESET' ? 'Password Reset' : 'Email Verification'}</h2>
            <p>Your 6-digit verification OTP code is:</p>
            <div style="background: #f1f5f9; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #1e293b; border-radius: 8px; margin: 15px 0;">
              ${otp}
            </div>
            <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
          </div>`
        : `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <p>${message ? message.replace(/\n/g, '<br/>') : ''}</p>
          </div>`;

      const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Travel Diary'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: subject,
        text: message,
        html: html || defaultHtml,
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Email successfully sent to ${email} via SMTP`);
    } catch (err) {
      console.error('❌ Failed to send SMTP email:', err.message);
    }
  }
};

module.exports = sendEmail;
