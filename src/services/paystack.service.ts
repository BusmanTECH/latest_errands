
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaystackService {
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
    this.publicKey =
      this.configService.get<string>('PAYSTACK_PUBLIC_KEY') || '';
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  generateReference(prefix: string = 'PAY'): string {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9).toUpperCase();
    return `${prefix}-${timestamp}-${randomStr}`;
  }

  async verifyTransaction(reference: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      if (!response.data || !response.data.data) {
        throw new BadRequestException('Invalid response from Paystack');
      }

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new BadRequestException('Transaction reference not found');
      }
      if (error.response?.status === 400) {
        throw new BadRequestException(
          error.response?.data?.message || 'Invalid transaction reference',
        );
      }
      throw new InternalServerErrorException(
        `Failed to verify Paystack transaction: ${error.message}`,
      );
    }
  }

  async initializeTransaction(payload: {
    email: string;
    amount: number;
    reference: string;
    callback_url?: string;
    metadata?: any;
  }): Promise<any> {
    try {
      
      const amountInKobo = Math.round(payload.amount * 100);

      const response = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        {
          ...payload,
          amount: amountInKobo,
          channels: ['card'],
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data || !response.data.data) {
        throw new BadRequestException('Invalid response from Paystack');
      }

      return response.data;
    } catch (error) {
      if (error.response?.status === 400) {
        throw new BadRequestException(
          error.response?.data?.message ||
            'Failed to initialize Paystack transaction',
        );
      }
      throw new InternalServerErrorException(
        `Failed to initialize Paystack transaction: ${error.message}`,
      );
    }
  }

  async chargeAuthorization(payload: {
    email: string;
    amount: number;
    authorization_code: string;
    reference: string;
    metadata?: any;
  }): Promise<any> {
    try {
      
      const amountInKobo = Math.round(payload.amount * 100);

      const response = await axios.post(
        `${this.baseUrl}/transaction/charge_authorization`,
        {
          ...payload,
          amount: amountInKobo,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 400) {
        throw new BadRequestException(
          error.response?.data?.message || 'Failed to charge authorization',
        );
      }
      throw new InternalServerErrorException(
        `Failed to charge authorization: ${error.message}`,
      );
    }
  }

  async initiateRefund(reference: string, amount: number): Promise<any> {
    try {
      
      const amountInKobo = Math.round(amount * 100);

      const response = await axios.post(
        `${this.baseUrl}/refund`,
        {
          transaction: reference,
          amount: amountInKobo,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data || !response.data.data) {
        throw new BadRequestException('Invalid response from Paystack');
      }

      return response.data;
    } catch (error) {
      if (error.response?.status === 400) {
        throw new BadRequestException(
          error.response?.data?.message || 'Failed to initiate refund',
        );
      }
      throw new InternalServerErrorException(
        `Failed to initiate refund: ${error.message}`,
      );
    }
  }
}
