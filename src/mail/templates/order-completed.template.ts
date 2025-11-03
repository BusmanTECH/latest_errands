/* eslint-disable prettier/prettier */
export function buildOrderCompletedEmailTemplate(
  brandName: string,
  order: any,
  user: any,
  rider: any,
): { html: string; text: string; preheader: string } {
  const trackingCode = order.trackingCode || 'N/A';
  const amount = order.amount ? `₦${Number(order.amount).toLocaleString()}` : 'N/A';
  const deliveryLocation = order.deliveryLocation?.address || order.deliveryLocation || 'N/A';
  const riderName = rider?.firstName && rider?.lastName 
    ? `${rider.firstName} ${rider.lastName}` 
    : rider?.email || 'Rider';
  const completedAt = order.completeTime 
    ? new Date(order.completeTime).toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : new Date().toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });

  const preheader = `Congratulations! Your order ${trackingCode} has been successfully delivered and completed.`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Completed - ${trackingCode}</title>
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
    .tracking-box { background:#f0fdf4; border:2px solid #86efac; border-radius:8px; padding:16px; text-align:center; margin:24px 0; }
    .tracking-label { font-size:12px; color:#059669; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; font-weight:600; }
    .tracking-code { font-size:24px; font-weight:700; color:#047857; font-family:'Courier New', monospace; letter-spacing:2px; }
    .success-icon { font-size:48px; margin:16px 0; }
    .info-table { width:100%; margin:24px 0; border-collapse:collapse; }
    .info-row { border-bottom:1px solid #e2e8f0; }
    .info-row-last { border-bottom:none; }
    .info-label { font-weight:600; color:#475569; font-size:14px; padding:12px 0; vertical-align:top; }
    .info-value { color:#0f172a; font-size:14px; padding:12px 0; text-align:right; }
    .location-section { margin:24px 0; }
    .location-label { font-weight:600; color:#475569; font-size:14px; margin-bottom:8px; }
    .location-text { color:#0f172a; font-size:14px; line-height:1.6; }
    .highlight-box { background:#eff6ff; border-left:4px solid #3b82f6; padding:16px; margin:24px 0; }
    .highlight-text { color:#1e40af; font-size:14px; line-height:1.5; margin:0; }
    .rider-box { background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:16px; margin:24px 0; }
    .rider-title { font-weight:600; color:#065f46; font-size:14px; margin-bottom:8px; }
    .rider-info { color:#047857; font-size:14px; line-height:1.6; }
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
              <div class="header-subtitle">Delivery Completed Successfully</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="title">Order Completed! 🎉</h1>
              <p class="subtitle">Your order has been successfully delivered to the destination.</p>
              
              <table role="presentation" class="tracking-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div class="success-icon">✅</div>
                    <div class="tracking-label">Tracking Code</div>
                    <div class="tracking-code">${trackingCode}</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="info-table" cellspacing="0" cellpadding="0">
                <tr class="info-row">
                  <td class="info-label" width="50%">Order Amount</td>
                  <td class="info-value" width="50%" align="right">${amount}</td>
                </tr>
                <tr class="info-row info-row-last">
                  <td class="info-label" width="50%">Completed At</td>
                  <td class="info-value" width="50%" align="right">${completedAt}</td>
                </tr>
              </table>

              <div class="location-section">
                <div class="location-label">🎯 Delivery Location</div>
                <div class="location-text">${deliveryLocation}</div>
              </div>

              <table role="presentation" class="rider-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div class="rider-title">👤 Delivery Rider</div>
                    <div class="rider-info">
                      <strong>Name:</strong> ${riderName}<br>
                      <strong>Thank you for choosing ${brandName}!</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="highlight-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p class="highlight-text"><strong>Thank you for using ${brandName}!</strong> We hope you had a great experience. If you have any feedback, please don't hesitate to reach out to our support team.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="footer">
              You're receiving this email because order ${trackingCode} was completed on ${brandName}.<br>
              We appreciate your business and look forward to serving you again!
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Order Completed!

Tracking Code: ${trackingCode}

Congratulations! Your order has been successfully delivered to the destination.

Order Details:
Amount: ${amount}
Completed At: ${completedAt}

Delivery Location: ${deliveryLocation}

Delivery Rider: ${riderName}

Thank you for using ${brandName}! We hope you had a great experience.`;

  return { html, text, preheader };
}
