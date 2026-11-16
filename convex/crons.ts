import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// 06:30 AM SAST (UTC+2) = 04:30 UTC
crons.daily(
  'morning-sast-portal-scan',
  { hourUTC: 4, minuteUTC: 30 },
  internal.tenderOps.runScheduledPortalScan
);

// Daily compliance expiry reminders at 07:00 AM SAST (05:00 UTC)
crons.daily(
  'daily-compliance-expiry-reminders',
  { hourUTC: 5, minuteUTC: 0 },
  internal.tenderOps.runDailyComplianceExpiryCheck
);

export default crons;
