const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
  PrismaClient,
  Role,
  CSCStatus,
  WorkerApprovalStatus,
  WorkerStatus,
  OrderStatus,
  AttendanceStatus,
  PaymentStatus,
  ComplaintType,
} = require('@prisma/client');
const { syncLocationHierarchy } = require('../src/services/locationImport');
const {
  addNumericId,
  addNumericIds,
  createWithNumericId,
  createManyWithNumericIds,
} = require('../src/lib/numericIds');

const prisma = new PrismaClient();

const LGD_FILE_PATHS = [
  'C:\\Users\\hp\\Downloads\\LGD - Local Government Directory, Government of India.xlsx',
  'C:\\Users\\hp\\Downloads\\LGD - Local Government Directory, Government of India (1).xlsx',
];

function dayOffset(days) {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc;
}

async function pickDistrictByName(stateId, districtName) {
  return prisma.district.findFirst({
    where: {
      stateId,
      name: {
        equals: districtName,
        mode: 'insensitive',
      },
    },
    orderBy: { name: 'asc' },
  });
}

async function pickBlockForDistrict(districtId, preferredNames = []) {
  for (const name of preferredNames) {
    const preferred = await prisma.block.findFirst({
      where: {
        districtId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });
    if (preferred) return preferred;
  }

  return prisma.block.findFirst({
    where: { districtId },
    orderBy: { name: 'asc' },
  });
}

async function seed() {
  await prisma.orderRefund.deleteMany();
  await prisma.paymentAuditLog.deleteMany();
  await prisma.paymentTicket.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.attendanceRequest.deleteMany();
  await prisma.orderWorkerDay.deleteMany();
  await prisma.orderWorker.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.order.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.cscDocument.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.user.deleteMany();
  await prisma.counter.deleteMany();

  const importInputs = LGD_FILE_PATHS
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({ path: filePath }));

  if (importInputs.length < 2) {
    throw new Error(`LGD files not found at expected paths: ${LGD_FILE_PATHS.join(', ')}`);
  }

  const locationReport = await syncLocationHierarchy(prisma, importInputs, { clearExisting: true });

  const upState = await prisma.state.findFirst({
    where: {
      name: {
        equals: 'Uttar Pradesh',
        mode: 'insensitive',
      },
    },
  });

  if (!upState) {
    throw new Error('Uttar Pradesh state was not imported from LGD files');
  }

  const districtAgra = await pickDistrictByName(upState.id, 'Agra');
  const districtAligarh = await pickDistrictByName(upState.id, 'Aligarh');
  const districtPrayagraj = await pickDistrictByName(upState.id, 'Prayagraj');

  if (!districtAgra || !districtAligarh || !districtPrayagraj) {
    throw new Error('Required demo districts (Agra, Aligarh, Prayagraj) were not found in imported data');
  }

  const blockAchhnera = await pickBlockForDistrict(districtAgra.id, ['Achhnera', 'Akola', 'Kheragarh']);
  const blockBichpuri = await pickBlockForDistrict(districtAgra.id, ['Bichpuri', 'Fatehabad']);
  const blockAkrabad = await pickBlockForDistrict(districtAligarh.id, ['Akrabad', 'Dhanipur', 'Atrauli']);
  const blockPhulpurPrayagraj = await pickBlockForDistrict(districtPrayagraj.id, ['Phulpur']);
  const blockBahadurpurPrayagraj = await pickBlockForDistrict(districtPrayagraj.id, ['Bahadurpur', 'Phulpur', 'Kaurihar']);

  if (!blockAchhnera || !blockBichpuri || !blockAkrabad || !blockPhulpurPrayagraj || !blockBahadurpurPrayagraj) {
    throw new Error('Could not resolve required demo blocks from imported districts');
  }

  const superAdminPassword = await bcrypt.hash('SuperAdmin123', 10);
  const blockAdminPassword = await bcrypt.hash('BlockAdmin123', 10);
  const cscPassword = await bcrypt.hash('CscAgent123', 10);
  const customerPassword = await bcrypt.hash('Customer123', 10);

  const superAdmin = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'Platform Super Admin',
      email: 'superadmin@bluecollar.local',
      password: superAdminPassword,
      role: Role.SUPER_ADMIN,
    },
  });

  const blockAdminAgra = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'Agra Block Admin',
      email: 'blockadmin.agra@bluecollar.local',
      phone: '9000000011',
      password: blockAdminPassword,
      role: Role.BLOCK_ADMIN,
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
    },
  });

  const blockAdminAligarh = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'Aligarh Block Admin',
      email: 'blockadmin.aligarh@bluecollar.local',
      phone: '9000000012',
      password: blockAdminPassword,
      role: Role.BLOCK_ADMIN,
      state: upState.name,
      district: districtAligarh.name,
      block: blockAkrabad.name,
      stateId: upState.id,
      districtId: districtAligarh.id,
      blockId: blockAkrabad.id,
    },
  });

  const blockAdminPrayagrajPhulpur = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'Prayagraj Phulpur Block Admin',
      email: 'blockadmin.phulpur@bluecollar.local',
      phone: '9000000013',
      password: blockAdminPassword,
      role: Role.BLOCK_ADMIN,
      state: upState.name,
      district: districtPrayagraj.name,
      block: blockPhulpurPrayagraj.name,
      stateId: upState.id,
      districtId: districtPrayagraj.id,
      blockId: blockPhulpurPrayagraj.id,
    },
  });

  const cscAgent1 = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'CSC Agent Achhnera 1',
      email: 'agent1@csc.gov.in',
      password: cscPassword,
      role: Role.CSC_AGENT,
      cscStatus: CSCStatus.APPROVED,
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      cscDocument: {
        create: await addNumericId(prisma, 'cscDocument', {
          aadhaarUrl: 'https://demo.docs/csc/agent1/aadhaar.jpg',
          bankPassbookUrl: 'https://demo.docs/csc/agent1/bank.jpg',
          cscIdOrVleCertificateUrl: 'https://demo.docs/csc/agent1/csc-id.jpg',
          characterCertificateUrl: 'https://demo.docs/csc/agent1/character.jpg',
          reviewNote: 'Verified and approved',
        }),
      },
    },
  });

  const cscAgent2 = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'CSC Agent Achhnera 2',
      email: 'agent2@csc.gov.in',
      password: cscPassword,
      role: Role.CSC_AGENT,
      cscStatus: CSCStatus.APPROVED,
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      cscDocument: {
        create: await addNumericId(prisma, 'cscDocument', {
          aadhaarUrl: 'https://demo.docs/csc/agent2/aadhaar.jpg',
          bankPassbookUrl: 'https://demo.docs/csc/agent2/bank.jpg',
          cscIdOrVleCertificateUrl: 'https://demo.docs/csc/agent2/csc-id.jpg',
          characterCertificateUrl: 'https://demo.docs/csc/agent2/character.jpg',
          reviewNote: 'Verified and approved',
        }),
      },
    },
  });

  const cscAgent3 = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'CSC Agent Achhnera Pending',
      email: 'agent3@csc.gov.in',
      password: cscPassword,
      role: Role.CSC_AGENT,
      cscStatus: CSCStatus.PENDING,
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      cscDocument: {
        create: await addNumericId(prisma, 'cscDocument', {
          aadhaarUrl: 'https://demo.docs/csc/agent3/aadhaar.jpg',
          bankPassbookUrl: 'https://demo.docs/csc/agent3/bank.jpg',
          cscIdOrVleCertificateUrl: 'https://demo.docs/csc/agent3/csc-id.jpg',
          characterCertificateUrl: 'https://demo.docs/csc/agent3/character.jpg',
        }),
      },
    },
  });

  const cscAgent4 = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'CSC Agent Achhnera Rejected',
      email: 'agent4@csc.gov.in',
      password: cscPassword,
      role: Role.CSC_AGENT,
      cscStatus: CSCStatus.REJECTED,
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      cscDocument: {
        create: await addNumericId(prisma, 'cscDocument', {
          aadhaarUrl: 'https://demo.docs/csc/agent4/aadhaar.jpg',
          bankPassbookUrl: 'https://demo.docs/csc/agent4/bank.jpg',
          cscIdOrVleCertificateUrl: 'https://demo.docs/csc/agent4/csc-id.jpg',
          characterCertificateUrl: 'https://demo.docs/csc/agent4/character.jpg',
          reviewNote: 'Please re-upload clearer character certificate',
        }),
      },
    },
  });

  const cscAgentPhulpurApproved = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'CSC Agent Phulpur Approved',
      email: 'agent.phulpur@csc.gov.in',
      password: cscPassword,
      role: Role.CSC_AGENT,
      cscStatus: CSCStatus.APPROVED,
      state: upState.name,
      district: districtPrayagraj.name,
      block: blockPhulpurPrayagraj.name,
      stateId: upState.id,
      districtId: districtPrayagraj.id,
      blockId: blockPhulpurPrayagraj.id,
      cscDocument: {
        create: await addNumericId(prisma, 'cscDocument', {
          aadhaarUrl: 'https://demo.docs/csc/agent-phulpur/aadhaar.jpg',
          bankPassbookUrl: 'https://demo.docs/csc/agent-phulpur/bank.jpg',
          cscIdOrVleCertificateUrl: 'https://demo.docs/csc/agent-phulpur/csc-id.jpg',
          characterCertificateUrl: 'https://demo.docs/csc/agent-phulpur/character.jpg',
          reviewNote: 'Verified and approved',
        }),
      },
    },
  });

  const customerUser1 = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'Asha Agra',
      email: 'customer1@example.com',
      phone: '9100000101',
      password: customerPassword,
      role: Role.CUSTOMER,
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      customer: {
        create: await addNumericId(prisma, 'customer', {
          state: upState.name,
          district: districtAgra.name,
          block: blockAchhnera.name,
          stateId: upState.id,
          districtId: districtAgra.id,
          blockId: blockAchhnera.id,
        }),
      },
    },
    include: { customer: true },
  });

  const customerUser2 = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'Rohan Agra',
      email: 'customer2@example.com',
      phone: '9100000102',
      password: customerPassword,
      role: Role.CUSTOMER,
      state: upState.name,
      district: districtAgra.name,
      block: blockBichpuri.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockBichpuri.id,
      customer: {
        create: await addNumericId(prisma, 'customer', {
          state: upState.name,
          district: districtAgra.name,
          block: blockBichpuri.name,
          stateId: upState.id,
          districtId: districtAgra.id,
          blockId: blockBichpuri.id,
        }),
      },
    },
    include: { customer: true },
  });

  const customerUser3 = await createWithNumericId(prisma, 'user', {
    data: {
      name: 'Pooja Aligarh',
      email: 'customer3@example.com',
      phone: '9100000103',
      password: customerPassword,
      role: Role.CUSTOMER,
      state: upState.name,
      district: districtAligarh.name,
      block: blockAkrabad.name,
      stateId: upState.id,
      districtId: districtAligarh.id,
      blockId: blockAkrabad.id,
      customer: {
        create: await addNumericId(prisma, 'customer', {
          state: upState.name,
          district: districtAligarh.name,
          block: blockAkrabad.name,
          stateId: upState.id,
          districtId: districtAligarh.id,
          blockId: blockAkrabad.id,
        }),
      },
    },
    include: { customer: true },
  });

  const worker1 = await createWithNumericId(prisma, 'worker', {
    data: {
      name: 'Ravi Kumar',
      phone: '9200000101',
      category: 'plumbing',
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      status: WorkerStatus.active,
      approvalStatus: WorkerApprovalStatus.APPROVED,
      isAvailable: false,
      rating: 4.8,
      activeJobs: 1,
      totalJobs: 22,
      photoUrl: 'https://demo.docs/worker/ravi/photo.jpg',
      aadhaarUrl: 'https://demo.docs/worker/ravi/aadhaar.jpg',
      bankUrl: 'https://demo.docs/worker/ravi/bank.jpg',
      createdByCscAgentId: cscAgent1.id,
    },
  });

  const worker2 = await createWithNumericId(prisma, 'worker', {
    data: {
      name: 'Sita Devi',
      phone: '9200000102',
      category: 'plumbing',
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      status: WorkerStatus.active,
      approvalStatus: WorkerApprovalStatus.APPROVED,
      isAvailable: true,
      rating: 4.6,
      activeJobs: 0,
      totalJobs: 18,
      photoUrl: 'https://demo.docs/worker/sita/photo.jpg',
      aadhaarUrl: 'https://demo.docs/worker/sita/aadhaar.jpg',
      bankUrl: 'https://demo.docs/worker/sita/bank.jpg',
      createdByCscAgentId: cscAgent1.id,
    },
  });

  await createWithNumericId(prisma, 'worker', {
    data: {
      name: 'Mohan Singh',
      phone: '9200000103',
      category: 'electrician',
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      status: WorkerStatus.inactive,
      approvalStatus: WorkerApprovalStatus.PENDING,
      isAvailable: false,
      rating: 4.2,
      activeJobs: 0,
      totalJobs: 5,
      createdByCscAgentId: cscAgent2.id,
    },
  });

  await createWithNumericId(prisma, 'worker', {
    data: {
      name: 'Kiran Lal',
      phone: '9200000104',
      category: 'painting',
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      status: WorkerStatus.suspended,
      approvalStatus: WorkerApprovalStatus.REJECTED,
      approvalNote: 'Invalid Aadhaar upload',
      isAvailable: false,
      rating: 4.1,
      activeJobs: 0,
      totalJobs: 2,
      createdByCscAgentId: cscAgent2.id,
    },
  });

  await createWithNumericId(prisma, 'worker', {
    data: {
      name: 'Prayagraj Worker',
      phone: '9200000105',
      category: 'cleaning',
      state: upState.name,
      district: districtPrayagraj.name,
      block: blockBahadurpurPrayagraj.name,
      stateId: upState.id,
      districtId: districtPrayagraj.id,
      blockId: blockBahadurpurPrayagraj.id,
      status: WorkerStatus.active,
      approvalStatus: WorkerApprovalStatus.APPROVED,
      isAvailable: true,
      rating: 4.4,
      activeJobs: 0,
      totalJobs: 7,
      createdByCscAgentId: cscAgent2.id,
    },
  });

  const order1 = await createWithNumericId(prisma, 'order', {
    data: {
      customerId: customerUser1.customer.id,
      category: 'plumbing',
      workersCount: 2,
      startDate: dayOffset(2),
      durationDays: 3,
      rate: 1200,
      total: 7200,
      status: OrderStatus.ongoing,
      customerPaymentStatus: 'paid',
      customerPaymentOrderId: 'seed_order_1',
      customerPaymentId: 'seed_payment_1',
      customerPaymentSignature: 'seed_signature_1',
      customerPaidAt: dayOffset(1),
      state: upState.name,
      district: districtAgra.name,
      block: blockAchhnera.name,
      serviceAddress: 'Ward 4, Near Primary School, Achhnera, Agra, Uttar Pradesh',
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockAchhnera.id,
      orderWorkers: {
        createMany: {
          data: await addNumericIds(prisma, 'orderWorker', [
            { workerId: worker1.id },
            { workerId: worker2.id },
          ]),
        },
      },
    },
  });

  const order1Day1 = dayOffset(2);
  const order1Day2 = dayOffset(3);
  const order1Day3 = dayOffset(4);

  await createManyWithNumericIds(prisma, 'orderWorkerDay', {
    data: [
      { orderId: order1.id, workerId: worker1.id, workDate: order1Day1, assignedById: blockAdminAgra.id, isActive: true },
      { orderId: order1.id, workerId: worker2.id, workDate: order1Day1, assignedById: blockAdminAgra.id, isActive: true },
      { orderId: order1.id, workerId: worker1.id, workDate: order1Day2, assignedById: blockAdminAgra.id, isActive: true },
      { orderId: order1.id, workerId: worker2.id, workDate: order1Day2, assignedById: blockAdminAgra.id, isActive: true },
      { orderId: order1.id, workerId: worker1.id, workDate: order1Day3, assignedById: blockAdminAgra.id, isActive: true },
      { orderId: order1.id, workerId: worker2.id, workDate: order1Day3, assignedById: blockAdminAgra.id, isActive: true },
    ],
  });

  const attendanceRequest = await createWithNumericId(prisma, 'attendanceRequest', {
    data: {
      orderId: order1.id,
      date: order1Day1,
      requestedById: blockAdminAgra.id,
      status: 'CONFIRMED',
      customerConfirmed: true,
      customerFeedback: 'Both workers arrived.',
      respondedAt: dayOffset(2),
    },
  });

  const attendance1 = await createWithNumericId(prisma, 'attendance', {
    data: {
      workerId: worker1.id,
      orderId: order1.id,
      requestId: attendanceRequest.id,
      date: order1Day1,
      status: AttendanceStatus.present,
      confirmed: true,
      customerConfirmed: true,
    },
  });

  await createWithNumericId(prisma, 'attendance', {
    data: {
      workerId: worker2.id,
      orderId: order1.id,
      requestId: attendanceRequest.id,
      date: order1Day1,
      status: AttendanceStatus.absent,
      confirmed: true,
      customerConfirmed: true,
    },
  });

  await createWithNumericId(prisma, 'payment', {
    data: {
      workerId: worker1.id,
      orderId: order1.id,
      attendanceId: attendance1.id,
      date: order1Day1,
      amount: 1200,
      status: PaymentStatus.pending,
      verified: true,
    },
  });

  await createWithNumericId(prisma, 'complaint', {
    data: {
      customerId: customerUser1.customer.id,
      orderId: order1.id,
      workerId: worker2.id,
      type: ComplaintType.absent,
      details: 'Worker did not report on scheduled date.',
      status: 'OPEN',
    },
  });

  const order2 = await createWithNumericId(prisma, 'order', {
    data: {
      customerId: customerUser2.customer.id,
      category: 'cleaning',
      workersCount: 1,
      startDate: dayOffset(-5),
      durationDays: 1,
      rate: 900,
      total: 900,
      status: OrderStatus.completed,
      customerPaymentStatus: 'paid',
      customerPaymentOrderId: 'seed_order_2',
      customerPaymentId: 'seed_payment_2',
      customerPaymentSignature: 'seed_signature_2',
      customerPaidAt: dayOffset(-6),
      state: upState.name,
      district: districtAgra.name,
      block: blockBichpuri.name,
      serviceAddress: 'House 22, Market Road, Bichpuri, Agra, Uttar Pradesh',
      stateId: upState.id,
      districtId: districtAgra.id,
      blockId: blockBichpuri.id,
      orderWorkers: {
        create: await addNumericId(prisma, 'orderWorker', {
          workerId: worker2.id,
          completed: true,
        }),
      },
    },
  });

  const completedDate = dayOffset(-5);
  await createWithNumericId(prisma, 'orderWorkerDay', {
    data: {
      orderId: order2.id,
      workerId: worker2.id,
      workDate: completedDate,
      assignedById: blockAdminAgra.id,
      isActive: true,
    },
  });

  const attendance2 = await createWithNumericId(prisma, 'attendance', {
    data: {
      workerId: worker2.id,
      orderId: order2.id,
      date: completedDate,
      status: AttendanceStatus.present,
      confirmed: true,
      customerConfirmed: true,
    },
  });

  await createWithNumericId(prisma, 'payment', {
    data: {
      workerId: worker2.id,
      orderId: order2.id,
      attendanceId: attendance2.id,
      date: completedDate,
      amount: 900,
      status: PaymentStatus.paid,
      verified: true,
      transactionRef: 'UTR000900',
      transactionDate: completedDate,
      paymentNote: 'Demo settled payment',
      paidAt: dayOffset(-4),
      lockedByAdmin: true,
      lockedAt: dayOffset(-4),
    },
  });

  console.log('LGD import summary:', JSON.stringify(locationReport));

  const credentials = [
    { label: 'SUPER_ADMIN', id: superAdmin.id, username: superAdmin.email, password: 'SuperAdmin123' },
    { label: 'BLOCK_ADMIN_AGRA', id: blockAdminAgra.id, username: blockAdminAgra.email, password: 'BlockAdmin123', state: blockAdminAgra.state, district: blockAdminAgra.district, block: blockAdminAgra.block },
    { label: 'BLOCK_ADMIN_ALIGARH', id: blockAdminAligarh.id, username: blockAdminAligarh.email, password: 'BlockAdmin123', state: blockAdminAligarh.state, district: blockAdminAligarh.district, block: blockAdminAligarh.block },
    { label: 'BLOCK_ADMIN_PRAYAGRAJ_PHULPUR', id: blockAdminPrayagrajPhulpur.id, username: blockAdminPrayagrajPhulpur.email, password: 'BlockAdmin123', state: blockAdminPrayagrajPhulpur.state, district: blockAdminPrayagrajPhulpur.district, block: blockAdminPrayagrajPhulpur.block },
    { label: 'CSC_AGENT_1_APPROVED', id: cscAgent1.id, username: cscAgent1.email, password: 'CscAgent123', block: cscAgent1.block },
    { label: 'CSC_AGENT_2_APPROVED', id: cscAgent2.id, username: cscAgent2.email, password: 'CscAgent123', block: cscAgent2.block },
    { label: 'CSC_AGENT_3_PENDING', id: cscAgent3.id, username: cscAgent3.email, password: 'CscAgent123', block: cscAgent3.block },
    { label: 'CSC_AGENT_4_REJECTED', id: cscAgent4.id, username: cscAgent4.email, password: 'CscAgent123', block: cscAgent4.block },
    { label: 'CSC_AGENT_PHULPUR_APPROVED', id: cscAgentPhulpurApproved.id, username: cscAgentPhulpurApproved.email, password: 'CscAgent123', block: cscAgentPhulpurApproved.block },
    { label: 'CUSTOMER_1', id: customerUser1.id, username: customerUser1.email, phone: customerUser1.phone, password: 'Customer123', block: customerUser1.block },
    { label: 'CUSTOMER_2', id: customerUser2.id, username: customerUser2.email, phone: customerUser2.phone, password: 'Customer123', block: customerUser2.block },
    { label: 'CUSTOMER_3', id: customerUser3.id, username: customerUser3.email, phone: customerUser3.phone, password: 'Customer123', block: customerUser3.block },
  ];

  console.log('Seed completed successfully. Demo credentials:');
  for (const credential of credentials) {
    console.log(JSON.stringify(credential));
  }
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
