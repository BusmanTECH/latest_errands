

import { IsNumber, ValidateNested } from 'class-validator';
class Coords { @IsNumber() lat: number; @IsNumber() lng: number; }
export class RiderLocationDto { @ValidateNested() coords: Coords; }
