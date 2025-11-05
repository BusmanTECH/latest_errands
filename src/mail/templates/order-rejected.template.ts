
export function buildOrderRejectedEmailTemplate(
  brandName: string,
  order: any,
  user: any,
  rider: any,
): { html: string; text: string; preheader: string } {
  const trackingCode = order.trackingCode || 'N/A';
  const amount = order.amount ? `₦${Number(order.amount).toLocaleString()}` : 'N/A';
  const pickupLocation = order.pickupLocation?.address || order.pickupLocation || 'N/A';
  const deliveryLocation = order.deliveryLocation?.address || order.deliveryLocation || 'N/A';
  const packageCategory = order.packageCategory || 'Standard';
  const riderName = rider?.firstName && rider?.lastName 
    ? `${rider.firstName} ${rider.lastName}` 
    : rider?.email || 'Rider';

  const preheader = `The assigned rider has rejected order ${trackingCode}. Your order will be reassigned to another rider.`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Rejected - ${trackingCode}</title>
  <style>
    body { margin:0; padding:0; background-color:#f6f8fb; font-family:Arial, Helvetica, sans-serif; }
    table { border-collapse:collapse; }
    .container { width:100%; background:#f6f8fb; padding:24px 0; }
    .card { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e6e9ef; border-radius:12px; overflow:hidden; }
    .header { padding:32px 24px; background:#ef4444; color:#ffffff; text-align:center; font-family:Arial, Helvetica, sans-serif; }
    .brand { font-size:24px; font-weight:700; letter-spacing:.2px; margin-bottom:8px; }
    .header-subtitle { font-size:14px; opacity:0.9; }
    .content { padding:24px; font-family:Arial, Helvetica, sans-serif; color:#0f172a; }
    .title { margin:0 0 8px 0; font-size:18px; font-weight:700; }
    .subtitle { margin:0 0 24px 0; color:#64748b; font-size:14px; line-height:1.5; }
    .tracking-box { background:#fef2f2; border:2px solid #fecaca; border-radius:8px; padding:16px; text-align:center; margin:24px 0; }
    .tracking-label { font-size:12px; color:#dc2626; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; font-weight:600; }
    .tracking-code { font-size:24px; font-weight:700; color:#991b1b; font-family:'Courier New', monospace; letter-spacing:2px; }
    .info-table { width:100%; margin:24px 0; border-collapse:collapse; }
    .info-row { border-bottom:1px solid #e2e8f0; }
    .info-row-last { border-bottom:none; }
    .info-label { font-weight:600; color:#475569; font-size:14px; padding:12px 0; vertical-align:top; }
    .info-value { color:#0f172a; font-size:14px; padding:12px 0; text-align:right; }
    .location-section { margin:24px 0; }
    .location-label { font-weight:600; color:#475569; font-size:14px; margin-bottom:8px; }
    .location-text { color:#0f172a; font-size:14px; line-height:1.6; margin-bottom:16px; }
    .highlight-box { background:#eff6ff; border-left:4px solid #3b82f6; padding:16px; margin:24px 0; }
    .highlight-text { color:#1e40af; font-size:14px; line-height:1.5; margin:0; }
    .warning-box { background:#fef3c7; border-left:4px solid #f59e0b; padding:16px; margin:24px 0; }
    .warning-text { color:#92400e; font-size:14px; line-height:1.5; margin:0; }
    .rider-box { background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:16px; margin:24px 0; }
    .rider-title { font-weight:600; color:#991b1b; font-size:14px; margin-bottom:8px; }
    .rider-info { color:#7f1d1d; font-size:14px; line-height:1.6; }
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
              <div class="header-subtitle">Order Assignment Update</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="title">Order Assignment Rejected</h1>
              <p class="subtitle">The assigned rider has declined this order. Don't worry - we're working on reassigning it to another available rider.</p>
              
              <table role="presentation" class="tracking-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div class="tracking-label">Tracking Code</div>
                    <div class="tracking-code">${trackingCode}</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="rider-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div class="rider-title">⚠️ Previous Assignment</div>
                    <div class="rider-info">
                      <strong>Rider:</strong> ${riderName}<br>
                      <strong>Status:</strong> Rejected assignment
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="info-table" cellspacing="0" cellpadding="0">
                <tr class="info-row">
                  <td class="info-label" width="50%">Order Amount</td>
                  <td class="info-value" width="50%" align="right">${amount}</td>
                </tr>
                <tr class="info-row info-row-last">
                  <td class="info-label" width="50%">Package Category</td>
                  <td class="info-value" width="50%" align="right">${packageCategory}</td>
                </tr>
              </table>

              <div class="location-section">
                <div class="location-label">📍 Pickup Location</div>
                <div class="location-text">${pickupLocation}</div>
                
                <div class="location-label">🎯 Delivery Location</div>
                <div class="location-text">${deliveryLocation}</div>
              </div>

              <table role="presentation" class="warning-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p class="warning-text"><strong>What happens next?</strong> Your order status has been reset to "New" and will be automatically reassigned to another available rider soon. You'll receive a notification once a new rider accepts your order.</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="highlight-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p class="highlight-text"><strong>No action needed:</strong> This is an automated process. We're working to find you the best available rider for your delivery. You'll be notified as soon as your order is reassigned.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="footer">
              You're receiving this email because the assigned rider rejected order ${trackingCode} on ${brandName}.<br>
              Your order will be reassigned automatically. If you have any concerns, please contact our support team.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Order Assignment Rejected

Tracking Code: ${trackingCode}

The assigned rider has declined this order. Don't worry - we're working on reassigning it to another available rider.

Previous Assignment:
Rider: ${riderName}
Status: Rejected assignment

Order Details:
Amount: ${amount}
Package: ${packageCategory}

Pickup Location: ${pickupLocation}
Delivery Location: ${deliveryLocation}

What happens next? Your order status has been reset to "New" and will be automatically reassigned to another available rider soon. You'll receive a notification once a new rider accepts your order.

No action needed - this is an automated process.`;

  return { html, text, preheader };
}
