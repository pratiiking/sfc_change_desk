import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { NotificationJob } from '../models/NotificationJob.js';
import { sendMail } from './mail.service.js';
import { ChangeRequest, PreSpendRequest, TravelRequest } from '../models/index.js';
import { isManagerReviewStage } from '../config/approvalWorkflow.js';

let workerInterval = null;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes lease lock

export const enqueueNotification = async ({
  module,
  requestId,
  approvalCycle = 1,
  jobType,
  recipientEmail,
  payload = {}
}, tx = null) => {
  const options = tx ? { transaction: tx } : {};
  return await NotificationJob.create({
    module,
    requestId: String(requestId),
    approvalCycle,
    jobType,
    recipientEmail,
    payload,
    status: 'pending'
  }, options);
};

export const processNotificationJobs = async () => {
  const workerId = `worker-${process.pid}-${Date.now()}`;
  const now = new Date();
  const leaseExpiry = new Date(now.getTime() + CLAIM_TIMEOUT_MS);

  // 1. Recover expired claims or find pending/retryable jobs
  // Atomically claim up to 10 jobs
  try {
    const jobs = await NotificationJob.findAll({
      where: {
        status: { [Op.in]: ['pending', 'processing'] },
        [Op.or]: [
          { lockedUntil: null },
          { lockedUntil: { [Op.lt]: now } }
        ],
        attempts: { [Op.lt]: sequelize.col('max_attempts') }
      },
      limit: 10
    });

    for (const job of jobs) {
      // Try to acquire lease
      const [updated] = await NotificationJob.update({
        status: 'processing',
        workerId,
        lockedUntil: leaseExpiry,
        attempts: job.attempts + 1
      }, {
        where: {
          id: job.id,
          [Op.or]: [
            { lockedUntil: null },
            { lockedUntil: { [Op.lt]: now } },
            { workerId: job.workerId }
          ]
        }
      });

      if (updated === 0) continue; // Claimed by another worker

      // Re-verify request stage and cycle before sending
      try {
        let isEligible = true;
        if (job.module === 'cr') {
          const cr = await ChangeRequest.findByPk(job.requestId);
          if (!cr) isEligible = false;
          else if (job.jobType === 'manager_invitation' || job.jobType === 'manager_reminder') {
            if (!isManagerReviewStage(cr.approvalStage) || cr.approvalCycle !== job.approvalCycle) isEligible = false;
          }
        } else if (job.module === 'prespend') {
          const ps = await PreSpendRequest.findByPk(job.requestId);
          if (!ps) isEligible = false;
          else if (job.jobType === 'manager_invitation' || job.jobType === 'manager_reminder') {
            if (!isManagerReviewStage(ps.approvalStage) || ps.approvalCycle !== job.approvalCycle) isEligible = false;
          }
        } else if (job.module === 'travel') {
          const tr = await TravelRequest.findByPk(job.requestId);
          if (!tr) isEligible = false;
          else if (job.jobType === 'manager_invitation' || job.jobType === 'manager_reminder') {
            if (!isManagerReviewStage(tr.approvalStage) || tr.approvalCycle !== job.approvalCycle) isEligible = false;
          }
        }

        if (!isEligible) {
          await job.update({ status: 'cancelled', lastError: 'Stage or cycle invalidated prior to send' });
          continue;
        }

        const mailPayload = job.payload || {};
        const safeAttachments = (mailPayload.attachments || []).map((att) => {
          if (att && att.content && typeof att.content === 'object' && att.content.type === 'Buffer' && Array.isArray(att.content.data)) {
            return { ...att, content: Buffer.from(att.content.data) };
          }
          return att;
        });

        const sendRes = await sendMail({
          to: job.recipientEmail,
          cc: mailPayload.cc,
          subject: mailPayload.subject,
          text: mailPayload.text,
          html: mailPayload.html,
          attachments: safeAttachments.length ? safeAttachments : undefined
        });

        if (sendRes.sent || sendRes.skipped) {
          await job.update({
            status: 'sent',
            sentAt: new Date(),
            lastError: sendRes.skipped ? `Skipped: ${sendRes.skipped}` : null
          });
        } else {
          await job.update({
            status: job.attempts + 1 >= job.maxAttempts ? 'failed' : 'pending',
            lastError: sendRes.error || 'Unknown send failure',
            lockedUntil: new Date(Date.now() + 60000 * (job.attempts + 1)) // exponential backoff
          });
        }
      } catch (err) {
        console.error(`[NotificationWorker] Job ${job.id} failed:`, err.message);
        await job.update({
          status: job.attempts + 1 >= job.maxAttempts ? 'failed' : 'pending',
          lastError: err.message,
          lockedUntil: new Date(Date.now() + 60000 * (job.attempts + 1))
        });
      }
    }
  } catch (err) {
    console.error('[NotificationWorker] Queue poll error:', err.message);
  }
};

export const startNotificationWorker = (intervalMs = 10000) => {
  if (workerInterval) return;
  console.log('[NotificationWorker] Started notification queue runner');
  workerInterval = setInterval(async () => {
    await processNotificationJobs();
  }, intervalMs);
};

export const stopNotificationWorker = () => {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
};
