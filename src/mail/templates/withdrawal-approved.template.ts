
export function buildWithdrawalApprovedEmailTemplate(
  brandName: string,
  withdrawalRequest: any,
  user: any,
): { html: string; text: string; preheader: string } {
  const amount = withdrawalRequest.amount
    ? `₦${Number(withdrawalRequest.amount).toLocaleString()}`
    : 'N/A';
  const currency = withdrawalRequest.currency || 'NGN';
  const requestId = withdrawalRequest.id?.substring(0, 8).toUpperCase() || 'N/A';
  const processedAt = withdrawalRequest.processedAt
    ? new Date(withdrawalRequest.processedAt).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  const preheader = `Great news! Your withdrawal request of ${amount} has been approved and processed.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Withdrawal Approved</title>
  <style>
    body { margin:0; padding:0; background-color:#f6f8fb; font-family:Arial, Helvetica, sans-serif; }
    table { border-collapse:collapse; }
    .container { width:100%; background:#f6f8fb; padding:24px 0; }
    .card { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e6e9ef; border-radius:12px; overflow:hidden; }
    .header { padding:32px 24px; background:#10b981; color:#ffffff; text-align:center; font-family:Arial, Helvetica, sans-serif; }
    .brand { font-size:24px; font-weight:700; letter-spacing:.2px; margin-bottom:8px; }
    .header-subtitle { font-size:14px; opacity:0.9; }
    .content { padding:24px; font-family:Arial, Helvetica, sans-serif; color:#0f172a; }
    .title { margin:0 0 8px 0; font-size:18px; font-weight:700; }
    .subtitle { margin:0 0 24px 0; color:#64748b; font-size:14px; line-height:1.5; }
    .success-box { background:#f0fdf4; border:2px solid #86efac; border-radius:8px; padding:16px; text-align:center; margin:24px 0; }
    .success-icon { font-size:48px; margin:16px 0; }
    .amount-label { font-size:12px; color:#059669; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; font-weight:600; }
    .amount-value { font-size:28px; font-weight:700; color:#047857; }
    .info-table { width:100%; margin:24px 0; border-collapse:collapse; }
    .info-row { border-bottom:1px solid #e2e8f0; }
    .info-row-last { border-bottom:none; }
    .info-label { font-weight:600; color:#475569; font-size:14px; padding:12px 0; vertical-align:top; }
    .info-value { color:#0f172a; font-size:14px; padding:12px 0; text-align:right; }
    .highlight-box { background:#dbeafe; border-left:4px solid #3b82f6; padding:16px; margin:24px 0; }
    .highlight-text { color:#1e40af; font-size:14px; line-height:1.5; margin:0; }
    .footer { padding:16px 24px 24px 24px; font-family:Arial, Helvetica, sans-serif; color:#94a3b8; font-size:12px; line-height:1.6; }
    .preheader { display:none; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
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
              <div class="header-subtitle">Withdrawal Approved</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="title">Withdrawal Approved! ✅</h1>
              <p class="subtitle">Your withdrawal request has been approved and processed successfully.</p>
              
              <table role="presentation" class="success-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div class="success-icon">✅</div>
                    <div class="amount-label">Withdrawal Amount</div>
                    <div class="amount-value">${amount}</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="info-table" cellspacing="0" cellpadding="0">
                <tr class="info-row">
                  <td class="info-label" width="50%">Request ID</td>
                  <td class="info-value" width="50%" align="right">${requestId}</td>
                </tr>
                <tr class="info-row">
                  <td class="info-label" width="50%">Currency</td>
                  <td class="info-value" width="50%" align="right">${currency}</td>
                </tr>
                <tr class="info-row">
                  <td class="info-label" width="50%">Status</td>
                  <td class="info-value" width="50%" align="right"><strong style="color:#10b981;">Approved</strong></td>
                </tr>
                <tr class="info-row info-row-last">
                  <td class="info-label" width="50%">Processed At</td>
                  <td class="info-value" width="50%" align="right">${processedAt}</td>
                </tr>
              </table>

              <table role="presentation" class="highlight-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p class="highlight-text"><strong>💰 Funds Processed</strong><br>
                    The amount of ${amount} has been successfully debited from your wallet and processed. The funds should be available in your account according to your selected withdrawal method.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="footer">
              You're receiving this email because your withdrawal request from ${brandName} wallet has been approved.<br>
              If you have any questions or concerns, please contact our support team.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Withdrawal Approved!

Your withdrawal request has been approved and processed successfully.

Withdrawal Details:
Amount: ${amount}
Currency: ${currency}
Request ID: ${requestId}
Status: Approved
Processed At: ${processedAt}

Funds Processed
The amount of ${amount} has been successfully debited from your wallet and processed. The funds should be available in your account according to your selected withdrawal method.

You're receiving this email because your withdrawal request from ${brandName} wallet has been approved.
If you have any questions or concerns, please contact our support team.`;

  return { html, text, preheader };
}

