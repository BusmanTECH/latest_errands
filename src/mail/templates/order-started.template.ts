/* eslint-disable prettier/prettier */
export function buildOrderStartedEmailTemplate(
  brandName: string,
  order: any,
  user: any,
  rider: any,
): { html: string; text: string; preheader: string } {
  const trackingCode = order.trackingCode || 'N/A';
  const pickupLocation = order.pickupLocation?.address || order.pickupLocation || 'N/A';
  const deliveryLocation = order.deliveryLocation?.address || order.deliveryLocation || 'N/A';
  const riderName = rider?.firstName && rider?.lastName 
    ? `${rider.firstName} ${rider.lastName}` 
    : rider?.email || 'Rider';
  const riderPhone = rider?.phoneNumber || 'N/A';

  const preheader = `Rider ${riderName} has started your order ${trackingCode} and is on the way to pickup.`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Started - ${trackingCode}</title>
  <style>
    body { margin:0; padding:0; background-color:#f6f8fb; font-family:Arial, Helvetica, sans-serif; }
    table { border-collapse:collapse; }
    .container { width:100%; background:#f6f8fb; padding:24px 0; }
    .card { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e6e9ef; border-radius:12px; overflow:hidden; }
    .header { padding:32px 24px; background:#f59e0b; color:#ffffff; text-align:center; font-family:Arial, Helvetica, sans-serif; }
    .brand { font-size:24px; font-weight:700; letter-spacing:.2px; margin-bottom:8px; }
    .header-subtitle { font-size:14px; opacity:0.9; }
    .content { padding:24px; font-family:Arial, Helvetica, sans-serif; color:#0f172a; }
    .title { margin:0 0 8px 0; font-size:18px; font-weight:700; }
    .subtitle { margin:0 0 24px 0; color:#64748b; font-size:14px; line-height:1.5; }
    .tracking-box { background:#fffbeb; border:2px solid #fcd34d; border-radius:8px; padding:16px; text-align:center; margin:24px 0; }
    .tracking-label { font-size:12px; color:#d97706; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; font-weight:600; }
    .tracking-code { font-size:24px; font-weight:700; color:#b45309; font-family:'Courier New', monospace; letter-spacing:2px; }
    .status-badge { display:inline-block; background:#fef3c7; color:#b45309; padding:8px 16px; border-radius:20px; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin:16px 0; }
    .location-section { margin:24px 0; }
    .location-label { font-weight:600; color:#475569; font-size:14px; margin-bottom:8px; }
    .location-text { color:#0f172a; font-size:14px; line-height:1.6; margin-bottom:16px; }
    .highlight-box { background:#eff6ff; border-left:4px solid #3b82f6; padding:16px; margin:24px 0; }
    .highlight-text { color:#1e40af; font-size:14px; line-height:1.5; margin:0; }
    .rider-box { background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:16px; margin:24px 0; }
    .rider-title { font-weight:600; color:#92400e; font-size:14px; margin-bottom:8px; }
    .rider-info { color:#78350f; font-size:14px; line-height:1.6; }
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
              <div class="header-subtitle">Order in Progress</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="title">Order Started! 🚀</h1>
              <p class="subtitle">Your rider has started the delivery and is on the way to your pickup location.</p>
              
              <table role="presentation" class="tracking-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div class="tracking-label">Tracking Code</div>
                    <div class="tracking-code">${trackingCode}</div>
                    <div class="status-badge">In Transit</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="rider-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div class="rider-title">👤 Your Rider</div>
                    <div class="rider-info">
                      <strong>Name:</strong> ${riderName}<br>
                      <strong>Phone:</strong> ${riderPhone}
                    </div>
                  </td>
                </tr>
              </table>

              <div class="location-section">
                <div class="location-label">📍 Pickup Location</div>
                <div class="location-text">${pickupLocation}</div>
                
                <div class="location-label">🎯 Delivery Location</div>
                <div class="location-text">${deliveryLocation}</div>
              </div>

              <table role="presentation" class="highlight-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p class="highlight-text"><strong>Action Required:</strong> Please ensure someone is available at the pickup location to hand over the package. The rider will contact you if needed. You can track the order progress in real-time using the tracking code.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="footer">
              You're receiving this email because order ${trackingCode} has started on ${brandName}.<br>
              Track your order progress using the tracking code above.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Order Started!

Tracking Code: ${trackingCode}

Your rider has started the delivery and is on the way to your pickup location.

Your Rider:
Name: ${riderName}
Phone: ${riderPhone}

Pickup Location: ${pickupLocation}
Delivery Location: ${deliveryLocation}

Action Required: Please ensure someone is available at the pickup location to hand over the package. The rider will contact you if needed.`;

  return { html, text, preheader };
}
