# SRT Universal School Portal

The official comprehensive school management platform for SRT Universal School ("Seeing Righteousness & Truth"), built with Next.js App Router, TypeScript, Prisma, and NextAuth.

## Portals & Roles

- **Admin Portal**: Institutional operations, batch management & student promotion, staff onboarding, academic timetables & automated period substitution, exam administration, complaints, school settings, and bulk data imports.
- **Teacher Portal**: Class management, attendance tracking, lesson planning, student report cards with gradebook document OCR, homework and assignment submissions, leave requests, and school calendar.
- **Parent Portal**: Real-time student academic progress, attendance records, homework tracking, official report cards, teacher communication, notices, and meetings.
- **Student Portal**: Daily timetables, academic grades, attendance, class activities, and notices.

## Core Architecture

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Database & ORM**: PostgreSQL via Prisma ORM
- **Authentication**: NextAuth.js (Session-based JWT with Role-Based Access Control)
- **UI & Layout**: Responsive screen-fit fluid design with mobile-first support (360px through 4K displays)
- **Iconography**: Lucide React
- **Brand Assets**: High-definition circular crest on white plate with gold trim (`/public/logo/`)

## Getting Started

### Prerequisites

- Node.js 18.18+ or 20+
- PostgreSQL database
- npm / pnpm / yarn

### Installation & Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the portal.

## Production Build

```bash
npm run build
npm run start
```

---
&copy; SRT Universal School. All rights reserved.
