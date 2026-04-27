const { WORKER_APPROVAL_STATUS, WORKER_STATUS } = require('../utils/constants');
const prisma = require('../lib/prisma');
const { createWithNumericId } = require('../lib/numericIds');

function calculateAssignmentScore(worker) {
  return (worker.rating * 10) + worker.totalJobs - (worker.activeJobs * 5);
}

async function assignWorkersToOrder(orderId, category, blockId, requestedCount) {
  const eligibleWorkers = await prisma.worker.findMany({
    where: {
      category,
      blockId,
      status: WORKER_STATUS.ACTIVE,
      isAvailable: true,
      approvalStatus: WORKER_APPROVAL_STATUS.APPROVED,
    },
    select: {
      id: true,
      rating: true,
      activeJobs: true,
      totalJobs: true,
    },
  });

  const scoredWorkers = eligibleWorkers
    .map((worker) => ({
      id: worker.id,
      score: calculateAssignmentScore(worker),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, requestedCount);

  if (scoredWorkers.length === 0) {
    return [];
  }

  const selectedWorkerIds = scoredWorkers.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    for (const workerId of selectedWorkerIds) {
      await createWithNumericId(tx, 'orderWorker', {
        data: {
          orderId,
          workerId,
        },
      });

      await tx.worker.update({
        where: { id: workerId },
        data: {
          activeJobs: { increment: 1 },
          totalJobs: { increment: 1 },
          status: WORKER_STATUS.BUSY,
          isAvailable: false,
        },
      });
    }
  });

  return selectedWorkerIds;
}

module.exports = {
  assignWorkersToOrder,
};
