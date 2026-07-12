import nodemailer from 'nodemailer';
import config from '../config';
export const sendEmail = async (to: string, html: string) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: config.smtp_email,
      pass: config.smtp_password,
    },
  });
  await transporter.sendMail({
    from: 'robayatfarsit@gmail.com',
    to,
    subject: 'Your CCleaner Account is Ready! 🔐',
    html,
  });
};

export const generateEmailHtml = (tempPassword: string, email: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to CCleaner!</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Poppins', Arial, sans-serif;
      background: linear-gradient(135deg, #f5f7f9 0%, #e4edf5 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      line-height: 1.5;
    }

    .container {
      max-width: 500px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(46, 125, 50, 0.15);
      overflow: hidden;
      position: relative;
    }

    .header {
      background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
      color: #fff;
      padding: 30px 20px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .header::before {
      content: "";
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
      transform: rotate(30deg);
    }

    .header h2 {
      margin: 0;
      font-size: 26px;
      font-weight: 600;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .logo {
      font-size: 28px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
    }

    .body {
      padding: 30px;
    }

    .info-card {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
      border: 1px solid #e9ecef;
      position: relative;
    }

    .info-card::before {
      content: "👤";
      position: absolute;
      top: -15px;
      left: 20px;
      background: white;
      padding: 5px 10px;
      border-radius: 20px;
      font-size: 14px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }

    .info-item {
      display: flex;
      margin-bottom: 8px;
      font-size: 16px;
    }

    .info-label {
      font-weight: 500;
      min-width: 100px;
      color: #495057;
    }

    .info-value {
      font-weight: 600;
      color: #212529;
    }

    .password-box {
      background: linear-gradient(to right, #e8f5e9, #c8e6c9);
      border: 2px dashed #2e7d32; /* Changed to dashed border */
      padding: 20px;
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      color: #1b5e20;
      border-radius: 12px;
      margin: 25px 0;
      letter-spacing: 2px;
      box-shadow: 0 4px 10px rgba(129, 199, 132, 0.3);
      position: relative;
      overflow: hidden;
    }

    .password-box::after {
      content: "⚠️";
      position: absolute;
      top: -12px; /* Adjusted position */
      right: -12px; /* Adjusted position */
      background: #ffeb3b;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 6px rgba(0,0,0,0.16);
      font-size: 18px;
    }

    .note {
      font-size: 14px;
      color: #495057;
      background: #f1f8e9;
      padding: 16px 16px 16px 30px; /* Added left padding */
      border-left: 4px solid #4caf50;
      border-radius: 8px;
      margin-bottom: 30px;
      position: relative;
    }

    .note::before {
      content: "💡";
      position: absolute;
      left: 10px; /* Adjusted position */
      top: 50%;
      transform: translateY(-50%);
      font-size: 18px;
    }

    .login-btn {
      display: block;
      text-align: center;
      background: linear-gradient(to right, #2e7d32, #388e3c);
      color: #ffffff !important;
      padding: 16px 0;
      border-radius: 12px;
      text-decoration: none !important;
      font-weight: 600;
      font-size: 17px;
      margin: 15px 0;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(46, 125, 50, 0.4);
      position: relative;
      overflow: hidden;
    }

    .footer {
      text-align: center;
      font-size: 12px;
      color: #6c757d;
      padding: 20px;
      background: #f8f9fa; /* Added background */
      border-top: 1px solid #e9ecef;
    }

    @media (max-width: 600px) {
      .container {
        margin: 20px;
      }
      .password-box {
        font-size: 20px;
        padding: 15px;
      }
      .header h2 {
        font-size: 22px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="logo">🧹</span> Welcome to CCleaner!</h2>
    </div>
    <div class="body">
      <div class="info-card">
        <div class="info-item">
          <div class="info-label">Email:</div>
          <div class="info-value">${email}</div>
        </div>
      </div>

      <div class="password-box">
        ${tempPassword}
      </div>

      <div class="note">
        This is your temporary password. You'll be prompted to change it after your first login for security purposes.
      </div>

      <a href="${config.web_url}" class="login-btn">Login to Your Account</a>
      
      
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} CCleaner. All rights reserved.<br>
      <span style="font-size: 10px; opacity: 0.7;">This is an automated message - please do not reply</span>
    </div>
  </div>
</body>
</html>
`;
};


