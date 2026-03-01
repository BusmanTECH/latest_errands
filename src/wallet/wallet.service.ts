import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { User, UserRole } from '../auth/entities/user.entity';
import {
  WithdrawalRequest,
  WithdrawalStatus,
} from './entities/withdrawal-request.entity';
import { BankInformation } from './entities/bank-information.entity';
import { TransactionService } from '../transaction/transaction.service';
import {
  TransactionType,
  TransactionStatus,
} from '../transaction/entities/transaction.entity';
import { PaymentService } from '../payment/payment.service';
import {
  CreateBankInformationDto,
  UpdateBankInformationDto,
} from './dto/bank-information.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalRequestRepo: Repository<WithdrawalRequest>,
    @InjectRepository(BankInformation)
    private readonly bankInformationRepo: Repository<BankInformation>,
    private readonly transactionService: TransactionService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
  ) {}

  async createWallet(userId: string): Promise<Wallet> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException('Wallet is only available for drivers');
    }

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

  async getWallet(
    userId: string,
  ): Promise<Wallet & { ctrlQ: number; limitAmount: number }> {
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
      wallet = await this.createWallet(userId);
    }

    const limit = await this.paymentService.getBalanceLimit();

    return {
      ...wallet,
      ctrlQ: limit,
      limitAmount: limit,
    } as Wallet & { ctrlQ: number; limitAmount: number };
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

    const wallet = await this.getWallet(userId);
    const currentBalance = Number(wallet.balance);
    const amountNum = Number(amount);

    if (allowNegative && negativeLimit !== undefined) {
      const newBalance = currentBalance - amountNum;
      if (newBalance < negativeLimit) {
        throw new BadRequestException(
          `Insufficient wallet balance. Limit exceeded. Maximum negative balance allowed: ${negativeLimit} NGN`,
        );
      }
    } else {
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

  async createWithdrawalRequest(
    userId: string,
    amount: number,
    narration?: string,
  ): Promise<WithdrawalRequest> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check if bank information exists
    const bankInfo = await this.bankInformationRepo.findOne({
      where: { userId },
    });

    if (!bankInfo) {
      throw new BadRequestException(
        'Bank information is required before creating a withdrawal request. Please add your bank details first.',
      );
    }

    const wallet = await this.getWallet(userId);
    const currentBalance = Number(wallet.balance);

    if (currentBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

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

    const withdrawalRequest = this.withdrawalRequestRepo.create({
      userId,
      amount,
      currency: wallet.currency || 'NGN',
      narration: narration || 'Wallet withdrawal request',
      status: WithdrawalStatus.PENDING,
    });

    const savedRequest =
      await this.withdrawalRequestRepo.save(withdrawalRequest);

    try {
      const transactionNarration = narration
        ? ` (Withdrawal Request: ${savedRequest.amount})`
        : `Wallet withdrawal request (Withdrawal Request: ${savedRequest.amount})`;

      const transactionReference = `TXN-WD-${savedRequest.id}-${Date.now()}`;

      await this.transactionService.createTransaction({
        driverId: userId,
        type: TransactionType.DEBIT,
        amount: amount,
        currency: wallet.currency || 'NGN',
        narration: transactionNarration,
        status: TransactionStatus.INITIATED,
        reference: transactionReference,
      });
    } catch (transactionError) {
      console.error(
        '[WALLET_SERVICE] Error creating transaction for withdrawal request:',
        transactionError,
      );
    }

    return savedRequest;
  }

  async getAllWithdrawalRequests(filters?: {
    status?: WithdrawalStatus;
    userId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
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

    const [requests, total] = await this.withdrawalRequestRepo.findAndCount({
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

  async getWithdrawalRequestById(id: string): Promise<WithdrawalRequest> {
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

    const wallet = await this.getWallet(request.userId);
    const currentBalance = Number(wallet.balance);

    if (currentBalance < request.amount) {
      throw new BadRequestException(
        'User no longer has sufficient balance for this withdrawal',
      );
    }

    await this.debitWallet(
      request.userId,
      request.amount,
      request.narration || 'Wallet withdrawal',
    );

    request.status = WithdrawalStatus.APPROVED;
    request.processedByUserId = adminUserId;
    request.processedAt = new Date();

    const savedRequest = await this.withdrawalRequestRepo.save(request);

    try {
      const transactions = await this.transactionService.getTransactions(
        request.userId,
        {
          type: TransactionType.DEBIT,
          status: TransactionStatus.INITIATED,
          page: 1,
          pageSize: 100,
        },
      );

      const withdrawalTransaction = transactions.transactions.find(
        (txn) =>
          txn.narration?.includes(`Withdrawal Request: ${request.id}`) ||
          txn.reference?.includes(`WD-${request.id}`),
      );

      if (withdrawalTransaction) {
        await this.transactionService.updateTransactionStatus(
          withdrawalTransaction.id,
          TransactionStatus.SUCCESSFUL,
          true,
        );

        console.log('[WALLET_SERVICE] Transaction updated to SUCCESSFUL:', {
          transactionId: withdrawalTransaction.id,
          withdrawalRequestId: request.id,
          driverId: request.userId,
          amount: request.amount,
        });
      } else {
        console.warn(
          '[WALLET_SERVICE] Could not find transaction for withdrawal request:',
          request.id,
        );
      }
    } catch (transactionError) {
      console.error(
        '[WALLET_SERVICE] Error updating transaction status for withdrawal approval:',
        transactionError,
      );
    }

    return savedRequest;
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

    request.status = WithdrawalStatus.REJECTED;
    request.rejectionReason = rejectionReason;
    request.processedByUserId = adminUserId;
    request.processedAt = new Date();

    const savedRequest = await this.withdrawalRequestRepo.save(request);

    try {
      const transactions = await this.transactionService.getTransactions(
        request.userId,
        {
          type: TransactionType.DEBIT,
          status: TransactionStatus.INITIATED,
          page: 1,
          pageSize: 100,
        },
      );

      const withdrawalTransaction = transactions.transactions.find(
        (txn) =>
          txn.narration?.includes(`Withdrawal Request: ${request.id}`) ||
          txn.reference?.includes(`WD-${request.id}`),
      );

      if (withdrawalTransaction) {
        await this.transactionService.updateTransactionStatus(
          withdrawalTransaction.id,
          TransactionStatus.CANCELLED,
          false,
        );

        console.log('[WALLET_SERVICE] Transaction updated to CANCELLED:', {
          transactionId: withdrawalTransaction.id,
          withdrawalRequestId: request.id,
          driverId: request.userId,
          rejectionReason: rejectionReason,
        });
      } else {
        console.warn(
          '[WALLET_SERVICE] Could not find transaction for withdrawal request:',
          request.id,
        );
      }
    } catch (transactionError) {
      console.error(
        '[WALLET_SERVICE] Error updating transaction status for withdrawal rejection:',
        transactionError,
      );
    }

    return savedRequest;
  }

  async getUserById(userId: string): Promise<User | null> {
    return await this.userRepo.findOne({
      where: { id: userId },
    });
  }

  async createOrUpdateBankInformation(
    userId: string,
    dto: CreateBankInformationDto,
  ): Promise<BankInformation> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException(
        'Bank information is only available for drivers',
      );
    }

    const existingBankInfo = await this.bankInformationRepo.findOne({
      where: { userId },
    });

    if (existingBankInfo) {
      // Update existing bank information
      Object.assign(existingBankInfo, dto);
      return await this.bankInformationRepo.save(existingBankInfo);
    } else {
      // Create new bank information
      const bankInfo = this.bankInformationRepo.create({
        userId,
        ...dto,
      });
      return await this.bankInformationRepo.save(bankInfo);
    }
  }

  async getBankInformation(userId: string): Promise<BankInformation> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException(
        'Bank information is only available for drivers',
      );
    }

    const bankInfo = await this.bankInformationRepo.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!bankInfo) {
      throw new NotFoundException('Bank information not found');
    }

    return bankInfo;
  }

  async updateBankInformation(
    userId: string,
    dto: UpdateBankInformationDto,
  ): Promise<BankInformation> {
    const bankInfo = await this.getBankInformation(userId);
    Object.assign(bankInfo, dto);
    return await this.bankInformationRepo.save(bankInfo);
  }

  async deleteBankInformation(userId: string): Promise<void> {
    const bankInfo = await this.bankInformationRepo.findOne({
      where: { userId },
    });

    if (!bankInfo) {
      throw new NotFoundException('Bank information not found');
    }

    await this.bankInformationRepo.remove(bankInfo);
  }
}
