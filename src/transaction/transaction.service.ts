/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';
import { User } from '../auth/entities/user.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createTransaction(dto: CreateTransactionDto): Promise<Transaction> {
    // Validate that either userId or driverId is provided
    if (!dto.userId && !dto.driverId) {
      throw new BadRequestException(
        'Either userId or driverId must be provided',
      );
    }

    // Generate reference if not provided
    let reference = dto.reference;
    if (!reference) {
      reference = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    }

    // Check if reference already exists (only if reference is provided)
    if (reference) {
      const existingTransaction = await this.transactionRepo.findOne({
        where: { reference },
      });
      if (existingTransaction) {
        // If reference exists, generate a new one
        reference = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      }
    }

    const transaction = this.transactionRepo.create({
      type: dto.type,
      status: dto.status || TransactionStatus.INITIATED,
      amount: dto.amount,
      currency: dto.currency || 'NGN',
      narration: dto.narration,
      orderId: dto.orderId,
      reference,
    });

    // Set user or driver relationship
    if (dto.userId) {
      const user = await this.userRepo.findOne({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException('User not found');
      transaction.user = user;
    }

    if (dto.driverId) {
      const driver = await this.userRepo.findOne({
        where: { id: dto.driverId },
      });
      if (!driver) throw new NotFoundException('Driver not found');
      transaction.driver = driver;
      console.log('[TRANSACTION_SERVICE] Setting driver relation:', {
        driverId: dto.driverId,
        driverFound: !!driver,
        transactionType: dto.type,
        narration: dto.narration,
      });
    }

    const savedTransaction = await this.transactionRepo.save(transaction);
    console.log('[TRANSACTION_SERVICE] Transaction saved:', {
      id: savedTransaction.id,
      driverId:
        savedTransaction.driver?.id || (savedTransaction as any).driverId,
      type: savedTransaction.type,
      status: savedTransaction.status,
    });

    // Reload with relations for proper serialization
    const transactionWithRelations = await this.transactionRepo.findOne({
      where: { id: savedTransaction.id },
      relations: ['user', 'driver'],
    });

    return transactionWithRelations || savedTransaction;
  }

  async getTransactions(
    userId?: string,
    filters?: {
      type?: TransactionType;
      status?: TransactionStatus;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    transactions: Transaction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .leftJoinAndSelect('transaction.driver', 'driver');

    if (userId) {
      queryBuilder.where(
        '(user.id = :userId OR driver.id = :userId OR transaction.driverId = :userId)',
        { userId },
      );
    }

    if (filters?.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: filters.type });
    }

    if (filters?.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: filters.status,
      });
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');
    queryBuilder.skip(skip).take(pageSize);

    const [transactions, total] = await queryBuilder.getManyAndCount();

    // Serialize transactions to remove circular references
    const serializedTransactions = transactions.map((txn) =>
      this.serializeTransaction(txn),
    );

    return {
      transactions: serializedTransactions,
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Serialize transaction to remove circular references
   */
  serializeTransaction(transaction: Transaction): any {
    return {
      id: transaction.id,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      narration: transaction.narration,
      orderId: transaction.orderId,
      reference: transaction.reference,
      isVerified: transaction.isVerified,
      verifiedAt: transaction.verifiedAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      user: transaction.user
        ? {
            id: transaction.user.id,
            firstName: transaction.user.firstName,
            lastName: transaction.user.lastName,
            email: transaction.user.email,
            phoneNumber: transaction.user.phoneNumber,
            role: transaction.user.role,
          }
        : null,
      driver: transaction.driver
        ? {
            id: transaction.driver.id,
            firstName: transaction.driver.firstName,
            lastName: transaction.driver.lastName,
            email: transaction.driver.email,
            phoneNumber: transaction.driver.phoneNumber,
            role: transaction.driver.role,
          }
        : null,
    };
  }

  async getUserTransactions(
    params: any,
    userId?: string,
  ): Promise<{
    status: string;
    message: string;
    data: {
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
      transactions: Transaction[];
    };
  }> {
    const { page = 1, pageSize = 50, ...rest } = params;
    const skip = (Number(page) - 1) * Number(pageSize);

    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .leftJoinAndSelect('transaction.driver', 'driver');

    if (userId) {
      queryBuilder.where(
        '(user.id = :userId OR driver.id = :userId OR transaction.driverId = :userId)',
        { userId },
      );
    }

    // Apply filters from rest params
    if (rest.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: rest.type });
    }
    if (rest.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: rest.status,
      });
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');
    queryBuilder.skip(skip).take(Number(pageSize));

    const [transactions, total] = await queryBuilder.getManyAndCount();

    // Serialize transactions to remove circular references
    const serializedTransactions = transactions.map((txn) =>
      this.serializeTransaction(txn),
    );

    return {
      status: 'success',
      message: 'transactions fetched',
      data: {
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / Number(pageSize)),
        },
        transactions: serializedTransactions,
      },
    };
  }

  async getAllTransactions(page: number, filters: any) {
    const limit = 20;
    const skip = (page - 1) * limit;

    // Clean up filters
    const sanitizedFilters: Record<string, any> = {};
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        sanitizedFilters[key] = value;
      }
    });

    const searchKeyword = sanitizedFilters.search;
    delete sanitizedFilters.search;

    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .leftJoinAndSelect('transaction.driver', 'driver');

    // Apply filters
    if (sanitizedFilters.type) {
      queryBuilder.andWhere('transaction.type = :type', {
        type: sanitizedFilters.type,
      });
    }
    if (sanitizedFilters.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: sanitizedFilters.status,
      });
    }

    // Search keyword
    if (searchKeyword) {
      queryBuilder.andWhere(
        '(transaction.type ILIKE :keyword OR transaction.reference ILIKE :keyword OR transaction.status ILIKE :keyword OR transaction.narration ILIKE :keyword)',
        { keyword: `%${searchKeyword}%` },
      );
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [transactions, total] = await queryBuilder.getManyAndCount();

    // Serialize transactions to remove circular references
    const serializedTransactions = transactions.map((txn) =>
      this.serializeTransaction(txn),
    );

    return {
      success: true,
      data: serializedTransactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTransactionById(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['user', 'driver'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  /**
   * Get serialized transaction by ID (safe for JSON responses)
   */
  async getSerializedTransactionById(id: string): Promise<any> {
    const transaction = await this.getTransactionById(id);
    return this.serializeTransaction(transaction);
  }

  async getTransactionByReference(
    reference: string,
  ): Promise<Transaction | null> {
    return this.transactionRepo.findOne({
      where: { reference },
      relations: ['user', 'driver'],
    });
  }

  async updateTransactionStatus(
    id: string,
    status: TransactionStatus,
    isVerified?: boolean,
  ): Promise<Transaction> {
    const transaction = await this.getTransactionById(id);

    transaction.status = status;
    if (isVerified !== undefined) {
      transaction.isVerified = isVerified;
      if (isVerified) {
        transaction.verifiedAt = new Date();
      }
    }

    return this.transactionRepo.save(transaction);
  }

  async updateTransactionByReference(
    reference: string,
    status: TransactionStatus,
    isVerified?: boolean,
  ): Promise<Transaction> {
    const transaction = await this.getTransactionByReference(reference);
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    transaction.status = status;
    if (isVerified !== undefined) {
      transaction.isVerified = isVerified;
      if (isVerified) {
        transaction.verifiedAt = new Date();
      }
    }

    return this.transactionRepo.save(transaction);
  }
}
