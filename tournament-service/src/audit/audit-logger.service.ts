import { Injectable, Logger } from '@nestjs/common';

export interface AuditEvent {
  actorId: string | null;
  action: string;
  targetId?: string;
  [key: string]: unknown;
}

@Injectable()
export class AuditLogger {
  private readonly logger = new Logger('AUDIT');

  record(event: AuditEvent): void {
    this.logger.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
  }
}
