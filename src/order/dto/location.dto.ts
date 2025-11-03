import { IsString, IsNumber, IsOptional, IsObject, IsArray } from "class-validator";

export class locationDto {
    @IsString() @IsOptional() city: string;
    @IsString() @IsOptional() state: string;
    @IsString() @IsOptional() country: string;
    @IsString() @IsOptional() zip: string;
    @IsString() @IsOptional() landmark: string;
    @IsString() @IsOptional() placeId: string;
    @IsObject() coordinate: object;
}



