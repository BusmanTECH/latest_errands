
import { IsNotEmpty, IsObject } from "class-validator";

export class SetChargesDto {
    @IsObject()
    @IsNotEmpty()
    stateCharges: Record<string, Record<string, number>>;
  }
    