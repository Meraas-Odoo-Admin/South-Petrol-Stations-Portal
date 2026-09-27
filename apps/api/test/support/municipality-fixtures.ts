import type { PrismaService } from '../../src/prisma/prisma.service';

// Registration pivot, phase 1: a fill-up can only be recorded at a station
// whose municipality is LIVE (FillUpsService.resolveRecordingMunicipality),
// so every e2e spec that POSTs fill-ups puts its stations in one of these.
// Self-contained per spec (unique name per runId), same pattern as the
// specs' own role/permission fixtures — never depends on seed.ts.
export async function createMunicipality(
  prisma: PrismaService,
  name: string,
  status: 'LIVE' | 'PREPARING' = 'LIVE',
): Promise<{ id: string }> {
  return prisma.municipality.create({ data: { name, status }, select: { id: true } });
}

// Fill-ups reference the municipality, so call this after the spec's
// fill-ups (and stations) are deleted.
export async function deleteMunicipalities(prisma: PrismaService, ids: string[]): Promise<void> {
  await prisma.securityAuthority.deleteMany({ where: { municipalityId: { in: ids } } });
  await prisma.municipality.deleteMany({ where: { id: { in: ids } } });
}
