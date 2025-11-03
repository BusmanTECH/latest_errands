import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadDocumentsDto {
  @ApiProperty({
    description: 'Document type identifier (not required - handled by file field names)',
    required: false,
  })
  @IsOptional()
  @IsString()
  documentType?: string;
}

