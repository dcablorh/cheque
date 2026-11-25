import { OutboxProcessor, OutboxItem, getPool, minorToDecimalString, type OutboxHandler } from '@cheque/core';
import { logger } from '@cheque/shared';

import { chequePaidPayeeEmail, chequePaidSenderEmail, chequeReceivedEmail, chequeRefundedEmail, type EmailClient } from '@cheque/notify';
import type { Pool } from 'pg';

type EmailSender = Pick<EmailClient, 'sendEmail'>;

export interface OutboxWorkerDependencies {
  redisUrl?: string;
  onChainOperation?: (item: OutboxItem) => Promise<void>;
  onCctpOperation?: (item: OutboxItem) => Promise<void>;
  emailClient?: EmailClient;
}


/** Sends a funded-cheque alert only when the cheque is ACTIVE and the payload has a real claim URL. */
export function createChequeAlertHandler(emailClient?: EmailSender, db?: Pool): OutboxHandler {
  return async (item: OutboxItem) => {
    if (!emailClient) {
      throw new Error('No email client configured; cannot send cheque alert');
    }
    const payload = (item.payload ?? {}) as { to?: unknown; claimUrl?: unknown };
    const to = typeof payload.to === 'string' ? payload.to : '';
    const claimUrl = typeof payload.claimUrl === 'string' ? payload.claimUrl : '';
    if (!to) throw new Error('Missing recipient email in alert payload');
    if (!claimUrl || claimUrl.includes('<token>')) {
      throw new Error('Missing claim URL in alert payload');
    }

    const pool = db ?? getPool();
    const res = await pool.query(
      `SELECT c.state, c.public_code AS "publicCode", c.face_amount_minor::float8 AS "faceAmountMinor",
              c.currency, c.note, c.expires_at AS "expiresAt", c.payee_name AS "payeeName", u.name AS "senderName"
         FROM cheques c
         LEFT JOIN users u ON u.id = c.sender_id
        WHERE c.id = $1`,
      [item.aggregateId]
    );
    const row = res.rows[0] as
      | {
          state?: string;
          publicCode?: string;
          faceAmountMinor?: number;
          currency?: string;
          note?: string | null;
          expiresAt?: Date | string;
          payeeName?: string | null;
          senderName?: string | null;
        }
      | undefined;
    const state = row?.state;
    if (state !== 'ACTIVE') {
      logger.info(`[Outbox] Skipping cheque alert for ${item.aggregateId}; state is ${state ?? 'missing'}`);
      return;
    }

    const amountOnly =
      row?.faceAmountMinor != null && row?.currency ? minorToDecimalString(row.faceAmountMinor) : null;
    const currency = row?.currency ?? '';

    await emailClient.sendEmail({
      to,
      ...chequeReceivedEmail({
        payeeName: row?.payeeName ?? '',
        senderName: row?.senderName ?? null,
        amount: amountOnly ?? 'a cheque',
        currency,
        note: row?.note ?? null,
        code: row?.publicCode ?? null,
        claimUrl,
      }),
    });
    logger.info(`[Outbox] Sent cheque alert email to ${to}`);
  };
}

/** Sends lifecycle status alerts (SETTLED / REFUNDED) to sender and/or recipient. */
export function createChequeStatusEmailHandler(emailClient?: EmailSender, db?: Pool): OutboxHandler {
  return async (item: OutboxItem) => {
    if (!emailClient) return;
    const payload = (item.payload ?? {}) as {
      event?: 'SETTLED' | 'REFUNDED';
      chain?: string;
      explorerUrl?: string | null;
    };
    if (!payload.event) return;

    const pool = db ?? getPool();
    const res = await pool.query(
      `SELECT c.public_code AS "publicCode", c.payee_name AS "payeeName",
              c.payee_contact_type AS "payeeContactType", c.payee_contact AS "payeeContact",
              c.face_amount_minor::float8 AS "faceAmountMinor", c.currency,
              u.email AS "senderEmail", u.name AS "senderName"
         FROM cheques c
         LEFT JOIN users u ON u.id = c.sender_id
        WHERE c.id = $1`,
      [item.aggregateId]
    );
    const row = res.rows[0] as
      | {
          publicCode: string;
          payeeName: string;
          payeeContactType: string | null;
          payeeContact: string | null;
          faceAmountMinor: number;
          currency: string;
          senderEmail: string | null;
          senderName: string | null;
        }
      | undefined;
    if (!row) return;

    const amountStr = `${minorToDecimalString(row.faceAmountMinor)} ${row.currency}`;
    const amountOnly = minorToDecimalString(row.faceAmountMinor);
    const chainLabel = payload.chain ? payload.chain.charAt(0).toUpperCase() + payload.chain.slice(1) : null;

    if (payload.event === 'SETTLED') {
      if (row.senderEmail) {
        await emailClient.sendEmail({
          to: row.senderEmail,
          ...chequePaidSenderEmail({
            code: row.publicCode,
            payeeName: row.payeeName,
            amount: amountOnly,
            chain: chainLabel,
            explorerUrl: payload.explorerUrl ?? null,
          }),
        });
      }
      if (row.payeeContactType === 'EMAIL' && row.payeeContact) {
        await emailClient.sendEmail({
          to: row.payeeContact,
          ...chequePaidPayeeEmail({
            code: row.publicCode,
            amount: amountOnly,
            chain: chainLabel,
            explorerUrl: payload.explorerUrl ?? null,
          }),
        });
      }
    } else if (payload.event === 'REFUNDED') {
      if (row.senderEmail) {
        await emailClient.sendEmail({
          to: row.senderEmail,
          ...chequeRefundedEmail({ code: row.publicCode, payeeName: row.payeeName, amount: amountOnly }),
        });
      }
    }
  };
}

export function createOutboxWorker(deps: OutboxWorkerDependencies = {}): OutboxProcessor {
  const pool = getPool();
  const processor = new OutboxProcessor(pool, {
    pollIntervalMs: 1000,
    batchSize: 10,
    redisUrl: deps.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
  });

  // Handler for chain operations (create_cheque, lock, redeem, cancel, refund on Soroban).
  // There is deliberately NO default: a missing handler must fail the item (so it retries and
  // eventually dead-letters) rather than record a fabricated "CONFIRMED" transaction.
  processor.registerHandler('chain:contract:submit', async (item: OutboxItem) => {
    if (!deps.onChainOperation) {
      throw new Error(
        `No chain handler configured; cannot execute ${String(item.payload.operation)} for ${item.aggregateId}`
      );
    }
    logger.info(`[Outbox] Executing chain operation for aggregate ${item.aggregateId}: topic=${item.topic}`);
    await deps.onChainOperation(item);
  });

  processor.registerHandler('chain:cctp', async (item: OutboxItem) => {
    if (!deps.onCctpOperation) {
      throw new Error(`No CCTP handler configured; cannot execute ${String((item.payload as { operation?: string }).operation)} for ${item.aggregateId}`);
    }
    logger.info(`[Outbox] Executing CCTP operation for aggregate ${item.aggregateId}`);
    await deps.onCctpOperation(item);
  });

  processor.registerHandler('email:cheque:alert', createChequeAlertHandler(deps.emailClient));
  processor.registerHandler('email:cheque:status', createChequeStatusEmailHandler(deps.emailClient));

  return processor;
}
