async function resolveLocationByIds(prisma, { stateId, districtId, blockId }) {
  if (!stateId || !districtId || !blockId) {
    throw new Error('stateId, districtId and blockId are required');
  }

  const block = await prisma.block.findUnique({
    where: { id: blockId },
    select: {
      id: true,
      name: true,
      districtId: true,
      District: {
        select: {
          id: true,
          name: true,
          stateId: true,
          State: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!block) {
    throw new Error('Selected block not found');
  }

  if (block.districtId !== districtId) {
    throw new Error('Selected block does not belong to selected district');
  }

  if (!block.District || block.District.stateId !== stateId) {
    throw new Error('Selected district does not belong to selected state');
  }

  return {
    state: {
      id: block.District.State.id,
      name: block.District.State.name,
    },
    district: {
      id: block.District.id,
      name: block.District.name,
    },
    block: {
      id: block.id,
      name: block.name,
    },
  };
}

module.exports = {
  resolveLocationByIds,
};