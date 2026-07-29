import { Injectable } from '@nestjs/common';

export interface FoundationStatus {
  readonly name: 'SiagaLongsor API';
  readonly phase: '01-foundation';
}

@Injectable()
export class AppService {
  public getFoundationStatus(): FoundationStatus {
    return {
      name: 'SiagaLongsor API',
      phase: '01-foundation',
    };
  }
}
