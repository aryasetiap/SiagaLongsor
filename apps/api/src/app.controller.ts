import { Controller, Get } from '@nestjs/common';

import { AppService, type FoundationStatus } from './app.service.js';

@Controller()
export class AppController {
  public constructor(private readonly appService: AppService) {}

  @Get()
  public getFoundationStatus(): FoundationStatus {
    return this.appService.getFoundationStatus();
  }
}
