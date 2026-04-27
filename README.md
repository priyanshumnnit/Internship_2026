# Blue Collar Workforce Management Portal (ShramSangam)

Production-grade full stack platform for block-level blue-collar workforce management.

## Stack

- Frontend: React (Vite), JavaScript, TailwindCSS, Axios, GSAP, Framer Motion
- Backend: Node.js, Express.js
- DB: MongoDB + Prisma ORM
- Auth: JWT access/refresh + OTP (mock code `123456`) + Nodemailer integration
- File storage: Cloudinary URL storage

## Roles (Strict RBAC)

- `CUSTOMER`
- `WORKER`
- `CSC_AGENT`
- `BLOCK_ADMIN`
- `SUPER_ADMIN`

Every protected API checks JWT + role. `BLOCK_ADMIN` is restricted to its own block scope.

## Core Features Implemented

- Customer signup/login (email/phone + password or OTP)
- CSC agent signup/login (email only, `@csc.gov.in`, document workflow, approval states)
- Block admin creation by super admin only
- Worker registration by approved CSC only
- Worker approval/rejection by admins
- Service booking with validation and assignment scoring
- Order lifecycle (`pending`, `assigned`, `ongoing`, `completed`, `cancelled`)
- Attendance mark by admin + customer confirmation flow
- Payment generation only after verified present attendance + customer confirmation
- One payment per worker per day
- Payment status management (`pending`, `paid`, `failed`) + amount adjustment
- Worker passbook endpoint
- Complaint creation/review/resolution flow
- Analytics (workers, orders, payments, revenue)
- Pagination (`limit=20`) across list endpoints

## Setup

### 1) Backend

```bash
cd backend
npm install
```

Create `.env` (or copy `.env.example`):

```env
MONGO_DATABASE_URL="mongodb+srv://username:password@cluster-host/shramsangam?retryWrites=true&w=majority&authSource=admin"
JWT_ACCESS_SECRET=change_me_access_secret
JWT_REFRESH_SECRET=change_me_refresh_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=4000

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SERVICE=gmail
SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_gmail_app_password
# Optional aliases also supported by backend:
# SMTP_MAIL=your-email@gmail.com
# SMTP_PASSWORD=your_gmail_app_password

RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxx

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Sync schema + generate Prisma client:

```bash
npx prisma db push --accept-data-loss
npx prisma generate
```

If you are migrating existing PostgreSQL data first, keep your old SQL URL in `DATABASE_URL` or `ALTERNATE_DATABASE_URL`, set `MONGO_DATABASE_URL`, and run:

```bash
npm run migrate:sql-to-mongo -- --force-clear
```

Reset and seed demo data:

```bash
npm run seed
```

Run backend:

```bash
npm run dev
```

### 2) Frontend

```bash
cd frontend
npm install
```

Create `.env` (or copy `.env.example`):

```env
VITE_API_BASE=http://localhost:4000/api
```

Run frontend:

```bash
npm run dev
```

Build frontend:

```bash
npm run build
```

## Seed Notes

- Seed script wipes existing application data and recreates demo users, customers, workers, orders, attendance, payments, and complaints.
- OTP is mocked as `123456` for all OTP requests.

## Important API Groups

- `POST /api/auth/request-otp`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/login-otp`
- `POST /api/auth/csc-documents`
- `POST /api/workers` (approved CSC only)
- `PATCH /api/workers/:id/approval` (admin only)
- `POST /api/orders`
- `POST /api/orders/:id/payment-intent`
- `POST /api/orders/:id/payment-verify`
- `GET /api/orders/:id/assignment-availability`
- `POST /api/orders/:id/assignments`
- `DELETE /api/orders/:id/assignments`
- `POST /api/orders/:id/attendance-request`
- `POST /api/orders/:id/customer-attendance-response`
- `POST /api/attendance/mark`
- `POST /api/attendance/confirm`
- `POST /api/payments/create`
- `PATCH /api/payments/:id`
- `POST /api/payments/:id/tickets`
- `GET /api/payments/tickets/list`
- `PATCH /api/payments/tickets/:id/review`
- `POST /api/complaints`
- `PATCH /api/complaints/:id/resolve`
- `GET /api/analytics`
