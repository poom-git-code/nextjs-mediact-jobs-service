import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'

@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Validation failed (positive integer expected)')
    }
    return parsed
  }
}
