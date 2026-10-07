import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { NotificationJob } from '../models/NotificationJob.js';
import { sendMail, buildChangeRequestManagerInvitationEmail, buildPreSpendManagerInvitationEmail, buildTravelManagerInvitationEmail } from './mail.service.js';
import { ChangeRequest, PreSpendRequest, TravelRequest } from '../models/index.js';
import { isManagerReviewStage } from '../config/approvalWorkflow.js';

let workerInterval = null;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes lease lock

// Mail HTML is rendered from the live request row at send time, not stored on the job —
// the job only needs enough to re-fetch that row and know which template to use.
const EMAIL_BUILDERS = {
  cr: { manager_invitation: buildChangeRequestManagerInvitationEmail },
  prespend: { manager_invitation: buildPreSpendManagerInvitationEmail },
  travel: { manager_invitation: buildTravelManagerInvitationEmail }
};

export const enqueueNotification = async ({
  module,
  requestId,
  approvalCycle = 1,
  jobType,
  recipientEmail
}, tx = null) => {
  const options = tx ? { transaction: tx } : {};
  return await NotificationJob.create({
    module,
    requestId: String(requestId),
    approvalCycle,
    jobType,
    recipientEmail,
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

      // Re-verify request stage and cycle before sending, using the live row
      try {
        let request = null;
        if (job.module === 'cr') request = await ChangeRequest.findByPk(job.requestId);
        else if (job.module === 'prespend') request = await PreSpendRequest.findByPk(job.requestId);
        else if (job.module === 'travel') request = await TravelRequest.findByPk(job.requestId);

        let isEligible = Boolean(request);
        if (request && (job.jobType === 'manager_invitation' || job.jobType === 'manager_reminder')) {
          if (!isManagerReviewStage(request.approvalStage) || request.approvalCycle !== job.approvalCycle) isEligible = false;
        }

        if (!isEligible) {
          // Terminal: nothing left for this job to do. notification_jobs is a
          // work queue, not an audit log (the real decision/approval history
          // lives in change_request_approvals etc.), so once a job is done,
          // the row is dropped rather than archived -- the table then only
          // ever reflects live, outstanding notification work.
          console.warn(`[NotificationWorker] Job ${job.id} (${job.module}/${job.requestId}) cancelled: Stage or cycle invalidated prior to send`);
          await job.destroy();
          continue;
        }

        const buildMail = EMAIL_BUILDERS[job.module]?.[job.jobType];
        if (!buildMail) {
          console.error(`[NotificationWorker] Job ${job.id} failed: No email builder for ${job.module}/${job.jobType}`);
          await job.destroy();
          continue;
        }
        const mailPayload = await buildMail(request);

        const sendRes = await sendMail({
          to: job.recipientEmail,
          cc: mailPayload.cc,
          subject: mailPayload.subject,
          text: mailPayload.text,
          html: mailPayload.html,
          attachments: mailPayload.attachments
        });

        if (sendRes.sent || sendRes.skipped) {
          await job.destroy();
        } else if (job.attempts + 1 >= job.maxAttempts) {
          console.error(`[NotificationWorker] Job ${job.id} (${job.module}/${job.requestId}) exhausted retries: ${sendRes.error || 'Unknown send failure'}`);
          await job.destroy();
        } else {
          await job.update({
            status: 'pending',
            lastError: sendRes.error || 'Unknown send failure',
            lockedUntil: new Date(Date.now() + 60000 * (job.attempts + 1)) // exponential backoff
          });
        }
      } catch (err) {
        if (job.attempts + 1 >= job.maxAttempts) {
          console.error(`[NotificationWorker] Job ${job.id} exhausted retries:`, err.message);
          await job.destroy();
        } else {
          console.error(`[NotificationWorker] Job ${job.id} failed, will retry:`, err.message);
          await job.update({
            status: 'pending',
            lastError: err.message,
            lockedUntil: new Date(Date.now() + 60000 * (job.attempts + 1))
          });
        }
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
