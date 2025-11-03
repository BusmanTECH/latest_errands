/* eslint-disable prettier/prettier */
export function buildOrderAssignedEmailTemplate(
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
  const packageSize = order.packageSize || 'N/A';
  const description = order.description || 'No description provided';
  const eta = order.eta ? `${order.eta} minutes` : 'TBD';
  const customerName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email || 'Customer';
  const customerPhone = user?.phoneNumber || 'N/A';
  const customerEmail = user?.email || 'N/A';

  const preheader = `You have been assigned order ${trackingCode}. Please review and accept if you can complete this delivery.`;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Assigned - ${trackingCode}</title>
  <style>
    body { margin:0; padding:0; background-color:#f6f8fb; font-family:Arial, Helvetica, sans-serif; }
    table { border-collapse:collapse; }
    .container { width:100%; background:#f6f8fb; padding:24px 0; }
    .card { width:100%; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e6e9ef; border-radius:12px; overflow:hidden; }
    .header { padding:32px 24px; background:#3b82f6; color:#ffffff; text-align:center; font-family:Arial, Helvetica, sans-serif; }
    .brand { font-size:24px; font-weight:700; letter-spacing:.2px; margin-bottom:8px; }
    .header-subtitle { font-size:14px; opacity:0.9; }
    .content { padding:24px; font-family:Arial, Helvetica, sans-serif; color:#0f172a; }
    .title { margin:0 0 8px 0; font-size:18px; font-weight:700; }
    .subtitle { margin:0 0 24px 0; color:#64748b; font-size:14px; line-height:1.5; }
    .tracking-box { background:#eff6ff; border:2px solid #bfdbfe; border-radius:8px; padding:16px; text-align:center; margin:24px 0; }
    .tracking-label { font-size:12px; color:#2563eb; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; font-weight:600; }
    .tracking-code { font-size:24px; font-weight:700; color:#1e40af; font-family:'Courier New', monospace; letter-spacing:2px; }
    .info-table { width:100%; margin:24px 0; border-collapse:collapse; }
    .info-row { border-bottom:1px solid #e2e8f0; }
    .info-row-last { border-bottom:none; }
    .info-label { font-weight:600; color:#475569; font-size:14px; padding:12px 0; vertical-align:top; }
    .info-value { color:#0f172a; font-size:14px; padding:12px 0; text-align:right; }
    .location-section { margin:24px 0; }
    .location-label { font-weight:600; color:#475569; font-size:14px; margin-bottom:8px; }
    .location-text { color:#0f172a; font-size:14px; line-height:1.6; margin-bottom:16px; }
    .highlight-box { background:#fef3c7; border-left:4px solid #f59e0b; padding:16px; margin:24px 0; }
    .highlight-text { color:#92400e; font-size:14px; line-height:1.5; margin:0; }
    .contact-box { background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:16px; margin:24px 0; }
    .contact-title { font-weight:600; color:#166534; font-size:14px; margin-bottom:8px; }
    .contact-info { color:#065f46; font-size:14px; line-height:1.6; }
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
              <div class="header-subtitle">New Order Assignment</div>
            </td>
          </tr>
          <tr>
            <td class="content">
              <h1 class="title">Order Assigned to You! 🚴</h1>
              <p class="subtitle">You have been assigned a new delivery order. Please review the details below and accept if you can complete this delivery.</p>
              
              <table role="presentation" class="tracking-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
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
                <tr class="info-row">
                  <td class="info-label" width="50%">Package Category</td>
                  <td class="info-value" width="50%" align="right">${packageCategory}</td>
                </tr>
                <tr class="info-row">
                  <td class="info-label" width="50%">Package Size</td>
                  <td class="info-value" width="50%" align="right">${packageSize}</td>
                </tr>
                <tr class="info-row info-row-last">
                  <td class="info-label" width="50%">Estimated Time</td>
                  <td class="info-value" width="50%" align="right">${eta}</td>
                </tr>
              </table>

              <div class="location-section">
                <div class="location-label">📍 Pickup Location</div>
                <div class="location-text">${pickupLocation}</div>
                
                <div class="location-label">🎯 Delivery Location</div>
                <div class="location-text">${deliveryLocation}</div>
              </div>

              ${description !== 'No description provided' ? `
              <table role="presentation" class="highlight-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p class="highlight-text"><strong>Special Instructions:</strong> ${description}</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <table role="presentation" class="contact-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div class="contact-title">Customer Contact Information</div>
                    <div class="contact-info">
                      <strong>Name:</strong> ${customerName}<br>
                      <strong>Phone:</strong> ${customerPhone}<br>
                      <strong>Email:</strong> ${customerEmail}
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" class="highlight-box" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p class="highlight-text"><strong>Action Required:</strong> Please review this order and accept it in the app if you can complete the delivery. If you cannot accept this order, please reject it so it can be assigned to another rider.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="footer">
              You're receiving this email because you have been assigned order ${trackingCode} on ${brandName}.<br>
              Please log into the app to accept or reject this order.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Order Assigned to You!

Tracking Code: ${trackingCode}
Amount: ${amount}
Package: ${packageCategory} - ${packageSize}
Estimated Time: ${eta}

Pickup Location: ${pickupLocation}
Delivery Location: ${deliveryLocation}

${description !== 'No description provided' ? `Special Instructions: ${description}\n` : ''}
Customer Contact:
Name: ${customerName}
Phone: ${customerPhone}
Email: ${customerEmail}

Action Required: Please review this order and accept it in the app if you can complete the delivery.`;

  return { html, text, preheader };
}
