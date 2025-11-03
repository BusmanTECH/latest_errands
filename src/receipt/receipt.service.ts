/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');
import { Order } from '../order/entities/order.entity';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ReceiptService {
  async generateReceiptPDF(
    order: Order,
    user: User,
    driver: User | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 30, bottom: 30, left: 50, right: 50 },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (buffer) => buffers.push(buffer));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', (error) => reject(error));

        // Invoice Design - Simple and Clean
        const headerColor = '#000000';
        const darkGray = '#666666';

        let yPos = 50;

        // Company name and Invoice header
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .fillColor(headerColor)
          .text('ERRANDS', 60, yPos);

        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .fillColor(headerColor)
          .text('INVOICE', 400, yPos, { align: 'right', width: 152 });

        yPos += 40;

        // Invoice number and date
        const invoiceNum =
          order.trackingCode || order.id.substring(0, 8).toUpperCase();
        const invoiceDate = order.completeTime
          ? new Date(order.completeTime).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor(darkGray)
          .text(`Invoice #: ${invoiceNum}`, 60, yPos);

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor(darkGray)
          .text(`Date: ${invoiceDate}`, 400, yPos, {
            align: 'right',
            width: 152,
          });

        yPos += 50;

        // Location Section
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(headerColor)
          .text('LOCATION', 60, yPos);

        yPos += 20;

        if (order.pickupLocation && order.deliveryLocation) {
          let pickupAddress =
            typeof order.pickupLocation === 'string'
              ? order.pickupLocation
              : order.pickupLocation.address ||
                order.pickupLocation.formatted ||
                JSON.stringify(order.pickupLocation);

          let deliveryAddress =
            typeof order.deliveryLocation === 'string'
              ? order.deliveryLocation
              : order.deliveryLocation.address ||
                order.deliveryLocation.formatted ||
                JSON.stringify(order.deliveryLocation);

          // Truncate if too long
          if (pickupAddress.length > 70) {
            pickupAddress = pickupAddress.substring(0, 67) + '...';
          }
          if (deliveryAddress.length > 70) {
            deliveryAddress = deliveryAddress.substring(0, 67) + '...';
          }

          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#000000')
            .text(`From: ${pickupAddress}`, 60, yPos, { width: 492 });

          yPos += 18;

          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#000000')
            .text(`To: ${deliveryAddress}`, 60, yPos, { width: 492 });

          yPos += 40;
        }

        // Driver Information
        if (driver) {
          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor(headerColor)
            .text('DRIVER INFORMATION', 60, yPos);

          yPos += 20;

          const driverName =
            `${driver.firstName || ''} ${driver.lastName || ''}`.trim();
          const driverPhone = driver.phoneNumber || 'N/A';
          const driverEmail = driver.email || 'N/A';

          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#000000')
            .text(`Name: ${driverName}`, 60, yPos, { width: 492 });

          yPos += 18;

          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#000000')
            .text(`Phone: ${driverPhone}`, 60, yPos, { width: 492 });

          yPos += 18;

          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#000000')
            .text(`Email: ${driverEmail}`, 60, yPos, { width: 492 });

          yPos += 40;
        }

        // Payment and Amount Section
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(headerColor)
          .text('PAYMENT DETAILS', 60, yPos);

        yPos += 20;

        // Payment Method
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#000000')
          .text(
            `Payment Method: ${order.paymentMethod?.toUpperCase() || 'N/A'}`,
            60,
            yPos,
            { width: 492 },
          );

        yPos += 30;

        // Total Amount - Highlighted
        const totalAmount = Number(order.amount) || 0;

        // Divider line
        doc.moveTo(60, yPos).lineTo(552, yPos).stroke('#000000').lineWidth(1);
        yPos += 20;

        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor(headerColor)
          .text('TOTAL AMOUNT:', 60, yPos);

        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .fillColor(headerColor)
          .text(`NGN ${totalAmount.toFixed(2)}`, 350, yPos, {
            align: 'right',
            width: 202,
          });

        yPos += 60;

        // Footer - Invoice style
        const pageHeight = doc.page.height;
        const footerY = pageHeight - 40;

        // Separator line
        doc
          .moveTo(60, footerY - 25)
          .lineTo(552, footerY - 25)
          .stroke('#CCCCCC')
          .lineWidth(0.5);

        // Thank you message
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(darkGray)
          .text('Thank you for your business!', 0, footerY - 10, {
            align: 'center',
            width: 612,
          });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
