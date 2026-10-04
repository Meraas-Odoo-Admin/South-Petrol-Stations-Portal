import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { RegistrationStationsService } from '../registration-stations/registration-stations.service';
import { CardRendererService } from '../cards/render/card-renderer.service';
import { loadCardAssets } from '../cards/render/card-assets';
import { calendarDayString } from '../common/utils/grace-stage';
import { buildRegistrationSheetHtml } from './sheet-html';

// The A4 "registration stations" sheet a petrol station posts at the pump,
// generated from live data. Printing isn't a data change, so (like card
// scanning) it isn't audited.
@Injectable()
export class RegistrationSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly registrationStations: RegistrationStationsService,
    private readonly renderer: CardRendererService,
  ) {}

  // CLAUDE.md rule 3: scope is enforced here. A station supervisor can print
  // the sheet only for a station in their scope (its municipality is used);
  // naming a municipality directly is for callers who see every station.
  private async resolveMunicipalityId(query: { stationId?: string; municipalityId?: string }, actorId: string) {
    const scope = await this.rbac.getStationScope(actorId);
    if (query.stationId) {
      if (scope !== null && !scope.includes(query.stationId)) {
        throw new ForbiddenException('You do not have access to this station.');
      }
      const station = await this.prisma.station.findUnique({
        where: { id: query.stationId },
        select: { municipalityId: true },
      });
      if (!station) throw new NotFoundException('Station not found.');
      if (!station.municipalityId) throw new BadRequestException('STATION_HAS_NO_MUNICIPALITY');
      return station.municipalityId;
    }
    if (query.municipalityId) {
      if (scope !== null) {
        throw new ForbiddenException('Choose a station instead of a municipality.');
      }
      return query.municipalityId;
    }
    throw new BadRequestException('stationId or municipalityId is required.');
  }

  async renderPdf(query: { stationId?: string; municipalityId?: string }, actorId: string): Promise<Buffer> {
    const municipalityId = await this.resolveMunicipalityId(query, actorId);
    const municipality = await this.prisma.municipality.findUnique({ where: { id: municipalityId } });
    if (!municipality) throw new NotFoundException('Municipality not found.');
    const stations = await this.registrationStations.listActiveForMunicipality(municipalityId);
    const html = buildRegistrationSheetHtml(
      {
        municipalityName: municipality.name,
        cardRequiredFromDate: calendarDayString(municipality.cardRequiredFromDate),
        stations,
        printedAt: new Date(),
      },
      loadCardAssets(),
    );
    return this.renderer.renderA4Pdf(html);
  }
}
