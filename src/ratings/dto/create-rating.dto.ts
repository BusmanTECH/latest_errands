
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRatingDto {
  @ApiProperty({
    description: 'Order ID for which the rating is being submitted',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    description: 'Rating value (1 to 5)',
    example: 4.5,
    minimum: 1,
    maximum: 5,
  })
  @IsNumber({}, { message: 'Rating must be a number' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must be at most 5' })
  rating: number;

  @ApiPropertyOptional({
    description: 'Optional comment/feedback',
    example: 'Great service!',
  })
  @IsString()
  @IsOptional()
  comment?: string;
}
