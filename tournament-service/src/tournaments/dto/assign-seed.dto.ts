import { IsInt, Max, Min, ValidateIf } from 'class-validator';

export class AssignSeedDto {
  /** 1..64 (the service also caps it at the tournament's maximum); null clears the seed. */
  @ValidateIf((o) => o.seed !== null)
  @IsInt()
  @Min(1)
  @Max(64)
  seed: number | null;
}
