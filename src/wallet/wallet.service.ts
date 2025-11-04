/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { User, UserRole } from '../auth/entities/user.entity';
import { WithdrawalRequest, WithdrawalStatus } from './entities/withdrawal-request.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalRequestRepo: Repository<WithdrawalRequest>,
  ) {}

  async createWallet(userId: string): Promise<Wallet> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException('Wallet is only available for drivers');
    }

    // Check if wallet already exists
    const existingWallet = await this.walletRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (existingWallet) {
      throw new ConflictException('Wallet already exists for this user');
    }

    const wallet = this.walletRepo.create({
      balance: 0,
      currency: 'NGN',
      user: user,
    });

    const savedWallet = await this.walletRepo.save(wallet);
    user.wallet = savedWallet;
    await this.userRepo.save(user);

    return savedWallet;
  }

  async getWallet(userId: string): Promise<Wallet> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException('Wallet is only available for drivers');
    }

    let wallet = await this.walletRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!wallet) {
      // Create wallet if it doesn't exist
      wallet = await this.createWallet(userId);
    }

    return wallet;
  }

  async getWalletBalance(userId: string): Promise<number> {
    const wallet = await this.getWallet(userId);
    return Number(wallet.balance);
  }

  async creditWallet(
    userId: string,
    amount: number,
    narration?: string,
  ): Promise<Wallet> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Role check is done in getWallet
    const wallet = await this.getWallet(userId);
    wallet.balance = Number(wallet.balance) + Number(amount);
    return this.walletRepo.save(wallet);
  }

  async debitWallet(
    userId: string,
    amount: number,
    narration?: string,
    allowNegative?: boolean,
    negativeLimit?: number,
  ): Promise<Wallet> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Role check is done in getWallet
    const wallet = await this.getWallet(userId);
    const currentBalance = Number(wallet.balance);
    const amountNum = Number(amount);

    if (allowNegative && negativeLimit !== undefined) {
      // Allow negative balance up to limit
      const newBalance = currentBalance - amountNum;
      if (newBalance < negativeLimit) {
        throw new BadRequestException(
          `Insufficient wallet balance. Limit exceeded. Maximum negative balance allowed: ${negativeLimit} NGN`,
        );
      }
    } else {
      // Standard debit - require sufficient balance
      if (currentBalance < amountNum) {
        throw new BadRequestException('Insufficient wallet balance');
      }
    }

    wallet.balance = currentBalance - amountNum;
    return this.walletRepo.save(wallet);
  }

  async creditDriverWalletLedger(
    userId: string,
    amount: number,
  ): Promise<Wallet> {
    return this.creditWallet(userId, amount, 'Driver earnings from order');
  }

  // Withdrawal Request Methods
  async createWithdrawalRequest(
    userId: string,
    amount: number,
    narration?: string,
  ): Promise<WithdrawalRequest> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check if user has wallet and sufficient balance
    const wallet = await this.getWallet(userId);
    const currentBalance = Number(wallet.balance);

    if (currentBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    // Check if there's already a pending withdrawal request
    const pendingRequest = await this.withdrawalRequestRepo.findOne({
      where: {
        userId,
        status: WithdrawalStatus.PENDING,
      },
    });

    if (pendingRequest) {
      throw new BadRequestException(
        'You already have a pending withdrawal request. Please wait for it to be processed.',
      );
    }

    // Create withdrawal request
    const withdrawalRequest = this.withdrawalRequestRepo.create({
      userId,
      amount,
      currency: wallet.currency || 'NGN',
      narration: narration || 'Wallet withdrawal request',
      status: WithdrawalStatus.PENDING,
    });

    return await this.withdrawalRequestRepo.save(withdrawalRequest);
  }

  async getAllWithdrawalRequests(
    filters?: {
      status?: WithdrawalStatus;
      userId?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    requests: WithdrawalRequest[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.userId) {
      where.userId = filters.userId;
    }

    const [requests, total] =
      await this.withdrawalRequestRepo.findAndCount({
        where,
        relations: ['user', 'user.profileImage', 'processedBy'],
        order: { createdAt: 'DESC' },
        skip,
        take: pageSize,
      });

    return {
      requests,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getWithdrawalRequestById(
    id: string,
  ): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepo.findOne({
      where: { id },
      relations: ['user', 'user.profileImage', 'processedBy'],
    });

    if (!request) {
      throw new NotFoundException('Withdrawal request not found');
    }

    return request;
  }

  async approveWithdrawalRequest(
    requestId: string,
    adminUserId: string,
  ): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepo.findOne({
      where: { id: requestId },
      relations: ['user', 'user.profileImage'],
    });

    if (!request) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Withdrawal request is already ${request.status}`,
      );
    }

    // Check if user still has sufficient balance
    const wallet = await this.getWallet(request.userId);
    const currentBalance = Number(wallet.balance);

    if (currentBalance < request.amount) {
      throw new BadRequestException(
        'User no longer has sufficient balance for this withdrawal',
      );
    }

    // Debit the wallet
    await this.debitWallet(
      request.userId,
      request.amount,
      request.narration || 'Wallet withdrawal',
    );

    // Update request status
    request.status = WithdrawalStatus.APPROVED;
    request.processedByUserId = adminUserId;
    request.processedAt = new Date();

    return await this.withdrawalRequestRepo.save(request);
  }

  async rejectWithdrawalRequest(
    requestId: string,
    adminUserId: string,
    rejectionReason: string,
  ): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepo.findOne({
      where: { id: requestId },
      relations: ['user', 'user.profileImage'],
    });

    if (!request) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `Withdrawal request is already ${request.status}`,
      );
    }

    // Update request status
    request.status = WithdrawalStatus.REJECTED;
    request.rejectionReason = rejectionReason;
    request.processedByUserId = adminUserId;
    request.processedAt = new Date();

    return await this.withdrawalRequestRepo.save(request);
  }

  async getUserById(userId: string): Promise<User | null> {
    return await this.userRepo.findOne({
      where: { id: userId },
    });
  }
}

