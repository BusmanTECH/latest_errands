
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import axios from 'axios';
import { buildOtpEmailTemplate } from './templates/otp.template';
import { buildOrderCreatedEmailTemplate } from './templates/order-created.template';
import { buildOrderAssignedEmailTemplate } from './templates/order-assigned.template';
import { buildOrderAcceptedEmailTemplate } from './templates/order-accepted.template';
import { buildOrderStartedEmailTemplate } from './templates/order-started.template';
import { buildOrderCompletedEmailTemplate } from './templates/order-completed.template';
import { buildOrderRejectedEmailTemplate } from './templates/order-rejected.template';
import { buildWithdrawalRequestEmailTemplate } from './templates/withdrawal-request.template';
import { buildWithdrawalApprovedEmailTemplate } from './templates/withdrawal-approved.template';
import { buildWithdrawalRejectedEmailTemplate } from './templates/withdrawal-rejected.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly twilioSid: string;
  private readonly twilioToken: string;
  private readonly fromPhone: string;
  private readonly client: Twilio;
  private readonly mjApiKey: string;
  private readonly mjApiSecret: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private readonly config: ConfigService) {
    this.twilioSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    this.twilioToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    this.fromPhone = this.config.get<string>('TWILIO_FROM');
    this.client = new Twilio(this.twilioSid, this.twilioToken);

    this.mjApiKey = this.config.get<string>('MJ_API_KEY') || '';
    this.mjApiSecret = this.config.get<string>('MJ_API_SECRET') || '';
    this.fromEmail = this.config.get<string>('MAIL_FROM') || '';
    this.fromName = this.config.get<string>('MAIL_FROM_NAME') || 'Errands';
  }

  async sendOtpSms(
    toPhone: string,
    purpose: string,
    otp: string,
  ): Promise<void> {
    const body = `${purpose}: ${otp}. Expires in 10 minutes.`;
    try {
      await this.client.messages.create({
        from: this.fromPhone,
        to: toPhone,
        body,
      });
    } catch (err: any) {
      this.logger.error('Twilio send error', err?.message || err);
    }
  }

  async sendOtpEmail(
    toEmail: string,
    subject: string,
    otp: string,
  ): Promise<void> {
    if (!this.mjApiKey || !this.mjApiSecret || !this.fromEmail) {
      this.logger.warn('Mailjet env vars not set; skipping email send');
      return;
    }
    const auth = Buffer.from(`${this.mjApiKey}:${this.mjApiSecret}`).toString(
      'base64',
    );
    const { html, text, preheader } = buildOtpEmailTemplate(
      this.fromName,
      subject,
      otp,
    );
    const payload = {
      Messages: [
        {
          From: { Email: this.fromEmail, Name: this.fromName },
          To: [{ Email: toEmail }],
          Subject: subject,
          HTMLPart: html,
          TextPart: text,
          CustomID: 'otp-verification',
          CustomCampaign: 'otp-verification',
        },
      ],
    };
    try {
      await axios.post('https://api.mailjet.com/v3.1/send', payload, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err: any) {
      this.logger.error(
        'Mailjet send error',
        err?.response?.data || err?.message || err,
      );
    }
  }

  
  async sendEmail(
    toEmail: string,
    subject: string,
    html: string,
    text: string,
    preheader?: string,
    customId?: string,
  ): Promise<void> {
    if (!this.mjApiKey || !this.mjApiSecret || !this.fromEmail) {
      this.logger.warn('Mailjet env vars not set; skipping email send');
      return;
    }
    const auth = Buffer.from(`${this.mjApiKey}:${this.mjApiSecret}`).toString(
      'base64',
    );
    const payload = {
      Messages: [
        {
          From: { Email: this.fromEmail, Name: this.fromName },
          To: [{ Email: toEmail }],
          Subject: subject,
          HTMLPart: html,
          TextPart: text,
          CustomID: customId || 'order-notification',
          CustomCampaign: customId || 'order-notification',
        },
      ],
    };
    try {
      await axios.post('https://api.mailjet.com/v3.1/send', payload, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (err: any) {
      this.logger.error(
        'Mailjet send error',
        err?.response?.data || err?.message || err,
      );
    }
  }

  
  async sendOrderCreatedEmail(order: any, user: any): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn('User email not found, skipping order created email');
        return;
      }
      const { html, text, preheader } = buildOrderCreatedEmailTemplate(
        this.fromName,
        order,
        user,
      );
      await this.sendEmail(
        user.email,
        `Order Created - Tracking: ${order.trackingCode || 'N/A'}`,
        html,
        text,
        preheader,
        'order-created',
      );
    } catch (error) {
      this.logger.error('Error sending order created email:', error);
    }
  }

  
  async sendOrderAssignedEmail(
    order: any,
    user: any,
    rider: any,
  ): Promise<void> {
    try {
      if (!rider?.email) {
        this.logger.warn(
          'Rider email not found, skipping order assigned email',
        );
        return;
      }
      const { html, text, preheader } = buildOrderAssignedEmailTemplate(
        this.fromName,
        order,
        user,
        rider,
      );
      await this.sendEmail(
        rider.email,
        `New Order Assignment - ${order.trackingCode || 'N/A'}`,
        html,
        text,
        preheader,
        'order-assigned',
      );
    } catch (error) {
      this.logger.error('Error sending order assigned email:', error);
    }
  }

  
  async sendOrderAcceptedEmail(
    order: any,
    user: any,
    rider: any,
  ): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn('User email not found, skipping order accepted email');
        return;
      }
      const { html, text, preheader } = buildOrderAcceptedEmailTemplate(
        this.fromName,
        order,
        user,
        rider,
      );
      await this.sendEmail(
        user.email,
        `Order Accepted - ${order.trackingCode || 'N/A'}`,
        html,
        text,
        preheader,
        'order-accepted',
      );
    } catch (error) {
      this.logger.error('Error sending order accepted email:', error);
    }
  }

  
  async sendOrderStartedEmail(
    order: any,
    user: any,
    rider: any,
  ): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn('User email not found, skipping order started email');
        return;
      }
      const { html, text, preheader } = buildOrderStartedEmailTemplate(
        this.fromName,
        order,
        user,
        rider,
      );
      await this.sendEmail(
        user.email,
        `Order Started - ${order.trackingCode || 'N/A'}`,
        html,
        text,
        preheader,
        'order-started',
      );
    } catch (error) {
      this.logger.error('Error sending order started email:', error);
    }
  }

  
  async sendOrderCompletedEmail(
    order: any,
    user: any,
    rider: any,
  ): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn(
          'User email not found, skipping order completed email',
        );
        return;
      }
      const { html, text, preheader } = buildOrderCompletedEmailTemplate(
        this.fromName,
        order,
        user,
        rider,
      );
      await this.sendEmail(
        user.email,
        `Order Completed - ${order.trackingCode || 'N/A'}`,
        html,
        text,
        preheader,
        'order-completed',
      );
    } catch (error) {
      this.logger.error('Error sending order completed email:', error);
    }
  }

  
  async sendOrderRejectedEmail(
    order: any,
    user: any,
    rider: any,
  ): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn('User email not found, skipping order rejected email');
        return;
      }
      const { html, text, preheader } = buildOrderRejectedEmailTemplate(
        this.fromName,
        order,
        user,
        rider,
      );
      await this.sendEmail(
        user.email,
        `Order Assignment Update - ${order.trackingCode || 'N/A'}`,
        html,
        text,
        preheader,
        'order-rejected',
      );
    } catch (error) {
      this.logger.error('Error sending order rejected email:', error);
    }
  }

  
  async sendReceiptEmail(
    order: any,
    user: any,
    receiptPDF: Buffer,
  ): Promise<void> {
    try {
      if (!this.mjApiKey || !this.mjApiSecret || !this.fromEmail) {
        this.logger.warn('Mailjet env vars not set; skipping receipt email');
        return;
      }

      if (!user?.email) {
        this.logger.warn('User email not found, skipping receipt email');
        return;
      }

      const auth = Buffer.from(`${this.mjApiKey}:${this.mjApiSecret}`).toString(
        'base64',
      );

      
      const pdfBase64 = receiptPDF.toString('base64');
      const fileName = `Receipt_${order.trackingCode || order.id.substring(0, 8)}.pdf`;

      const payload = {
        Messages: [
          {
            From: { Email: this.fromEmail, Name: this.fromName },
            To: [{ Email: user.email }],
            Subject: `Receipt for Order ${order.trackingCode || 'N/A'}`,
            HTMLPart: `
              <html>
                <body>
                  <h2>Order Receipt</h2>
                  <p>Dear ${user.firstName || 'Customer'},</p>
                  <p>Thank you for using ${this.fromName}. Please find your receipt attached to this email.</p>
                  <p><strong>Order Details:</strong></p>
                  <ul>
                    <li>Order ID: ${order.id}</li>
                    <li>Tracking Code: ${order.trackingCode || 'N/A'}</li>
                    <li>Total Amount: NGN ${Number(order.amount || 0).toFixed(2)}</li>
                  </ul>
                  <p>If you have any questions, please contact our support team.</p>
                  <p>Best regards,<br>${this.fromName} Team</p>
                </body>
              </html>
            `,
            TextPart: `Order Receipt\n\nThank you for using ${this.fromName}. Please find your receipt attached.\n\nOrder ID: ${order.id}\nTracking Code: ${order.trackingCode || 'N/A'}\nTotal Amount: NGN ${Number(order.amount || 0).toFixed(2)}`,
            Attachments: [
              {
                ContentType: 'application/pdf',
                Filename: fileName,
                Base64Content: pdfBase64,
              },
            ],
            CustomID: 'order-receipt',
            CustomCampaign: 'order-receipt',
          },
        ],
      };

      await axios.post('https://api.mailjet.com/v3.1/send', payload, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      this.logger.log(
        `Receipt email sent to ${user.email} for order ${order.trackingCode || order.id}`,
      );
    } catch (error: any) {
      this.logger.error(
        'Error sending receipt email:',
        error?.response?.data || error?.message || error,
      );
      throw error;
    }
  }

  
  async sendWithdrawalRequestEmail(
    withdrawalRequest: any,
    user: any,
  ): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn(
          'User email not found, skipping withdrawal request email',
        );
        return;
      }
      const { html, text, preheader } = buildWithdrawalRequestEmailTemplate(
        this.fromName,
        withdrawalRequest,
        user,
      );
      await this.sendEmail(
        user.email,
        `Withdrawal Request Submitted - ${withdrawalRequest.id?.substring(0, 8).toUpperCase() || 'N/A'}`,
        html,
        text,
        preheader,
        'withdrawal-request',
      );
    } catch (error) {
      this.logger.error('Error sending withdrawal request email:', error);
    }
  }

  
  async sendWithdrawalApprovedEmail(
    withdrawalRequest: any,
    user: any,
  ): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn(
          'User email not found, skipping withdrawal approved email',
        );
        return;
      }
      const { html, text, preheader } = buildWithdrawalApprovedEmailTemplate(
        this.fromName,
        withdrawalRequest,
        user,
      );
      await this.sendEmail(
        user.email,
        `Withdrawal Approved - ${withdrawalRequest.id?.substring(0, 8).toUpperCase() || 'N/A'}`,
        html,
        text,
        preheader,
        'withdrawal-approved',
      );
    } catch (error) {
      this.logger.error('Error sending withdrawal approved email:', error);
    }
  }

  
  async sendWithdrawalRejectedEmail(
    withdrawalRequest: any,
    user: any,
    rejectionReason: string,
  ): Promise<void> {
    try {
      if (!user?.email) {
        this.logger.warn(
          'User email not found, skipping withdrawal rejected email',
        );
        return;
      }
      const { html, text, preheader } = buildWithdrawalRejectedEmailTemplate(
        this.fromName,
        withdrawalRequest,
        user,
        rejectionReason,
      );
      await this.sendEmail(
        user.email,
        `Withdrawal Request Rejected - ${withdrawalRequest.id?.substring(0, 8).toUpperCase() || 'N/A'}`,
        html,
        text,
        preheader,
        'withdrawal-rejected',
      );
    } catch (error) {
      this.logger.error('Error sending withdrawal rejected email:', error);
    }
  }
}
