import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../authorization/authorization.types.js';
import type { AuditRequestContext } from '../common/http/request-context.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { AlertLifecycleActionType } from '../generated/prisma/enums.js';
import type {
  AcknowledgeAlertDto,
  FalseAlarmAlertDto,
  ResolveAlertDto,
} from './dto/alert-lifecycle.dto.js';
import { ALERT_INCLUDE, toAlertData } from './alerts.service.js';
import { AlertLifecyclePostCommit } from './alert-lifecycle-post-commit.js';
import {
  lifecyclePayloadHash,
  lifecycleTransition,
  normalizeLifecyclePayload,
  type NormalizedLifecyclePayload,
  validateIdempotencyHeader,
} from './alert-lifecycle-policy.js';
import type {
  AlertLifecycleCommittedEvent,
  AlertMutationResponse,
  LifecycleActionType,
} from './alert-lifecycle.types.js';

interface ExecuteInput {
  readonly organizationId: string;
  readonly alertId: string;
  readonly idempotencyKey: string | undefined;
  readonly actionType: LifecycleActionType;
  readonly payload: NormalizedLifecyclePayload;
  readonly principal: AuthenticatedPrincipal;
  readonly request: AuditRequestContext;
}

@Injectable()
export class AlertLifecycleService {
  private readonly logger = new Logger(AlertLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postCommit: AlertLifecyclePostCommit,
  ) {}

  acknowledge(
    organizationId: string,
    alertId: string,
    idempotencyKey: string | undefined,
    input: AcknowledgeAlertDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<AlertMutationResponse> {
    return this.execute({
      organizationId,
      alertId,
      idempotencyKey,
      actionType: 'ACKNOWLEDGE',
      payload: input,
      principal,
      request,
    });
  }

  resolve(
    organizationId: string,
    alertId: string,
    idempotencyKey: string | undefined,
    input: ResolveAlertDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<AlertMutationResponse> {
    return this.execute({
      organizationId,
      alertId,
      idempotencyKey,
      actionType: 'RESOLVE',
      payload: input,
      principal,
      request,
    });
  }

  falseAlarm(
    organizationId: string,
    alertId: string,
    idempotencyKey: string | undefined,
    input: FalseAlarmAlertDto,
    principal: AuthenticatedPrincipal,
    request: AuditRequestContext,
  ): Promise<AlertMutationResponse> {
    return this.execute({
      organizationId,
      alertId,
      idempotencyKey,
      actionType: 'FALSE_ALARM',
      payload: input,
      principal,
      request,
    });
  }

  private async execute(input: ExecuteInput): Promise<AlertMutationResponse> {
    validateIdempotencyHeader(input.idempotencyKey, input.payload.actionId);
    const payload = normalizeLifecyclePayload(input.actionType, input.payload);
    const payloadHash = lifecyclePayloadHash({
      actionType: input.actionType,
      organizationId: input.organizationId,
      alertId: input.alertId,
      payload,
    });

    const committed = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`alert-lifecycle:${payload.actionId}`}, 0))::text`,
      );
      const locked = await transaction.$queryRaw<readonly { id: string }[]>(
        Prisma.sql`SELECT "id" FROM "Alert" WHERE "id" = ${input.alertId} AND "organizationId" = ${input.organizationId} FOR UPDATE`,
      );
      if (locked.length === 0) {
        throw new NotFoundException({
          code: 'ALERT_NOT_FOUND',
          message: 'Alert tidak ditemukan.',
        });
      }

      const prior = await transaction.alertLifecycleAction.findUnique({
        where: { actionId: payload.actionId },
      });
      if (prior !== null) {
        if (
          prior.organizationId !== input.organizationId ||
          prior.alertId !== input.alertId ||
          prior.actionType !== input.actionType ||
          prior.payloadHash !== payloadHash
        ) {
          throw idempotencyConflict();
        }
        return {
          response: prior.originalResponse as unknown as AlertMutationResponse,
          descriptor: null,
        };
      }

      const alert = await transaction.alert.findUniqueOrThrow({
        where: { id: input.alertId },
        include: ALERT_INCLUDE,
      });
      const transition = lifecycleTransition(input.actionType, alert.status);
      const occurredAt = new Date();
      const updatedAlert = await transaction.alert.update({
        where: { id: alert.id },
        data: { status: transition.nextStatus },
        include: ALERT_INCLUDE,
      });
      const metadata = lifecycleMetadata(input.actionType, payload, {
        actorId: input.principal.userId,
        previousStatus: alert.status,
        nextStatus: transition.nextStatus,
      });
      const event = await transaction.alertEvent.create({
        data: {
          alertId: alert.id,
          eventType: transition.eventType,
          observationKey: null,
          riskAssessmentId: null,
          telemetryId: null,
          actorId: input.principal.userId,
          observedAt: null,
          actedAt: occurredAt,
          metadata,
        },
      });
      const audit = await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.principal.userId,
          eventType: transition.eventType,
          entityType: 'Alert',
          entityId: alert.id,
          requestId: input.request.requestId,
          ipAddress: input.request.ipAddress,
          userAgent: input.request.userAgent,
          metadata,
        },
      });
      const response: AlertMutationResponse = {
        data: toAlertData(updatedAlert),
        action: {
          actionId: payload.actionId,
          eventId: event.id,
          eventType: transition.eventType,
          previousStatus: alert.status,
          nextStatus: transition.nextStatus,
          actedAt: occurredAt.toISOString(),
          actor: { id: input.principal.userId, name: input.principal.name },
        },
      };
      await transaction.alertLifecycleAction.create({
        data: {
          actionId: payload.actionId,
          organizationId: input.organizationId,
          alertId: alert.id,
          actionType: generatedActionType(input.actionType),
          payloadHash,
          eventId: event.id,
          auditLogId: audit.id,
          actorId: input.principal.userId,
          originalResponse: response as unknown as Prisma.InputJsonValue,
          occurredAt,
        },
      });
      const descriptor: AlertLifecycleCommittedEvent = {
        eventType: transition.eventType,
        occurredAt: occurredAt.toISOString(),
        organizationId: input.organizationId,
        siteId: alert.siteId,
        monitoringPointId: alert.monitoringPointId,
        alertId: alert.id,
      };
      return { response, descriptor };
    });

    if (committed.descriptor !== null) {
      try {
        await this.postCommit.dispatch(committed.descriptor);
      } catch {
        this.logger.warn(
          `Post-commit lifecycle notification failed alertId=${committed.descriptor.alertId}`,
        );
      }
    }
    return committed.response;
  }
}

function lifecycleMetadata(
  actionType: LifecycleActionType,
  payload: NormalizedLifecyclePayload,
  state: {
    readonly actorId: string;
    readonly previousStatus: string;
    readonly nextStatus: string;
  },
): Prisma.InputJsonObject {
  const common = {
    actorId: state.actorId,
    actionId: payload.actionId,
    previousStatus: state.previousStatus,
    nextStatus: state.nextStatus,
  };
  if (actionType === 'ACKNOWLEDGE') {
    return {
      ...common,
      note: payload.note ?? '',
      fieldCondition: payload.fieldCondition ?? '',
      sopExecuted: payload.sopExecuted ?? false,
    };
  }
  if (actionType === 'RESOLVE') {
    return { ...common, resolutionNote: payload.resolutionNote ?? '' };
  }
  return { ...common, reason: payload.reason ?? '' };
}

function generatedActionType(actionType: LifecycleActionType): AlertLifecycleActionType {
  return {
    ACKNOWLEDGE: AlertLifecycleActionType.ACKNOWLEDGE,
    RESOLVE: AlertLifecycleActionType.RESOLVE,
    FALSE_ALARM: AlertLifecycleActionType.FALSE_ALARM,
  }[actionType];
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'actionId telah digunakan untuk aksi atau payload yang berbeda.',
  });
}
