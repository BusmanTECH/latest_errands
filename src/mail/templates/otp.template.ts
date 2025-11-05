
export function buildOtpEmailTemplate(
  brandName: string,
  subject: string,
  otp: string,
): { html: string; text: string; preheader: string } {
  const preheader = 'Your one-time verification code (expires in 10 minutes).';
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { margin:0; padding:0; background-color:#f6f8fb; }
    table { border-collapse:collapse; }
    .container { width:100%; background:#f6f8fb; padding:24px 0; }
    .card { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e6e9ef; border-radius:12px; overflow:hidden; }
    .header { padding:20px 24px; background:#0f172a; color:#ffffff; font-family:Arial, Helvetica, sans-serif; }
    .brand { font-size:18px; font-weight:700; letter-spacing:.2px; }
    .content { padding:24px; font-family:Arial, Helvetica, sans-serif; color:#0f172a; }
    .title { margin:0 0 8px 0; font-size:18px; font-weight:700; }
    .muted { margin:0 0 16px 0; color:#64748b; font-size:14px; line-height:1.5; }
    .otp { display:inline-block; font-family:SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:700; font-size:28px; letter-spacing:4px; color:#0f172a; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; }
    .footer { padding:16px 24px 24px 24px; font-family:Arial, Helvetica, sans-serif; color:#94a3b8; font-size:12px; }
    .preheader { display:none; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
    a { color:#0ea5e9; text-decoration:none; }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table role="presentation" class="card" cellspacing="0" cellpadding="0">
          <tr>
            <td class="header">
              <div class="brand">${brandName}</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="title">Your verification code</h1>
              <p class="muted">Use the code below to continue. This code will expire in 10 minutes. If you did not request this, you can safely ignore this email.</p>
              <div class="otp">${otp}</div>
            </td>
          </tr>
          <tr>
            <td class="footer">
              You’re receiving this email because you requested a verification code from ${brandName}. If this wasn’t you, please ignore or contact support.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = `Your verification code is ${otp}. It expires in 10 minutes. If you didn’t request this, ignore this email.`;
  return { html, text, preheader };
}
