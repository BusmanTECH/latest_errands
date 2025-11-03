import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';

@Module({
  providers: [ReceiptService],
  exports: [ReceiptService],
})
export class ReceiptModule {}

