import { IsObject, IsString, IsArray, ValidateNested, ArrayMinSize, IsOptional } from "class-validator";
import { Type } from 'class-transformer';

export class costDto {
    @IsObject() pickupCoords: any;
    @IsObject() deliveryCoords: any;
    @IsString() deliveryType: string;
    @IsString() @IsOptional() packageCategory?: string;
    
}

export class DeliveryCoord {
    @IsObject() deliveryCoords: any;
}

export class multipleCostDto {
    @IsObject() pickupCoords: any;
    @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryCoord) @ArrayMinSize(1) deliveryCoords: DeliveryCoord[];
    @IsString() deliveryType: string;
    @IsString() @IsOptional() packageCategory?: string;
    
}



