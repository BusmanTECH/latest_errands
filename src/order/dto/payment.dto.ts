import { IsString, IsNumber, IsOptional, IsObject, IsArray } from "class-validator";

export class paymentDto {
    @IsString() orderId: string;
}



