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

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
}

