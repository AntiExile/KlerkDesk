'use server';

import { z } from 'zod';
import { checkSandboxHealth } from '@/lib/boat';
import { getContractorSettings, updateContractorSettings } from '@/lib/convex-store';
import type { ContractorSettings } from '@/types';

const UpdateSettingsSchema = z.object({
  companyName: z.string().min(2).optional(),
  csdMaaaNumber: z.string().min(4).optional(),
  cidbGrade: z.string().min(2).optional(),
  municipalRegions: z.array(z.string()).optional(),
  whatsappNumber: z.string().min(6).optional(),
  openRouterSubKeyCapUsd: z.number().min(1).max(100).optional(),
});

export async function getContractorSettingsAction(): Promise<ContractorSettings> {
  return getContractorSettings();
}

export async function saveContractorSettingsAction(
  payload: z.input<typeof UpdateSettingsSchema>
): Promise<ContractorSettings> {
  const parsed = UpdateSettingsSchema.parse(payload);
  return updateContractorSettings(parsed);
}

export async function testSandboxConnectionAction() {
  return checkSandboxHealth();
}
