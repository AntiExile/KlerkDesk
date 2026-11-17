'use server';

import { z } from 'zod';
import { checkSandboxHealth } from '@/lib/boat';
import {
  getContractorSettings,
  requireAuthenticatedConvex,
  updateContractorSettings,
} from '@/lib/convex-store';
import type { ContractorSettings } from '@/types';

const LinkedCsdEnterpriseSchema = z.object({
  enterpriseName: z.string().min(1),
  csdNumber: z.string().min(1),
  status: z.string().min(1),
});

const DirectorSchema = z.object({
  fullName: z.string().min(1),
  idNumber: z.string().min(6),
  isOrganOfStateEmployee: z.boolean(),
  organOfStateDetails: z.string().optional(),
  linkedCsdEnterprises: z.array(LinkedCsdEnterpriseSchema),
});

const UpdateSettingsSchema = z
  .object({
    companyName: z.string().optional(),
    registrationNumber: z.string().optional(),
    csdMaaaNumber: z.string().optional(),
    taxRefNumber: z.string().optional(),
    taxPinNumber: z.string().optional(),
    cidbGrade: z.string().optional(),
    bbbeeLevel: z.string().optional(),
    municipalRegions: z.array(z.string()).optional(),
    sectors: z.array(z.string()).optional(),
    whatsappNumber: z.string().optional(),
    planTier: z.enum(['starter', 'pro', 'ops']).optional(),
    directors: z.array(DirectorSchema).optional(),
  })
  .strict();

export async function getContractorSettingsAction(): Promise<ContractorSettings> {
  await requireAuthenticatedConvex();
  return getContractorSettings();
}

export async function saveContractorSettingsAction(
  payload: z.input<typeof UpdateSettingsSchema>
): Promise<ContractorSettings> {
  await requireAuthenticatedConvex();
  const parsed = UpdateSettingsSchema.parse(payload);
  return updateContractorSettings(parsed);
}

export async function testSandboxConnectionAction() {
  await requireAuthenticatedConvex();
  return checkSandboxHealth();
}
