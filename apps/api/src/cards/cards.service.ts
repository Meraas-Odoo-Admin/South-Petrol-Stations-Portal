import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type VehicleCard, type VehicleCardIssueReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { RegistrationStationsService } from '../registration-stations/registration-stations.service';
import { CardRendererService } from './render/card-renderer.service';
import { generateCardNumber, normalizeScannedCardNumber } from './card-number';
import type { IssueCardDto } from './dto/issue-card.dto';
import type { CardRenderMode } from './render/card-html';

type Tx = Prisma.TransactionClient;

// The card's "make, model, colour" line, from the vehicle as it is now.
// Stored on the card as printedVehicleLine; a card whose line (or plate)
// no longer matches its vehicle "needs reissue".
export function vehicleLineOf(vehicle: { make?: string | null; model: string | null; color: string | null }): string {
  // Phase 5A: "make model — colour". Vehicles registered before the make/model
  // split carry the manufacturer in `make` and no model, so their line reads
  // exactly as it was printed.
  const name = [vehicle.make?.trim(), vehicle.model?.trim()].filter(Boolean).join(' ');
  return [name, vehicle.color?.trim()].filter(Boolean).join(' — ');
}

// The card's issue date as printed: the calendar day in Libya.
function libyaDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tripoli', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

// The seam for the open client question (OPEN_ITEMS.md): whether a lost/
// damaged replacement needs a supervisor's approval, a fee or a police
// report. Today nothing needs approval — every replacement still carries a
// required reason and is audited. When the client answers, this returns
// true for the affected reasons and issue() routes them into an approval
// request instead of issuing directly; nothing else has to be restructured.
export class CardIssuePolicy {
  requiresApproval(_reason: VehicleCardIssueReason): boolean {
    return false;
  }
}

const CARD_INCLUDE = {
  registrationStation: { select: { id: true, internalCode: true, name: true } },
  issuedBy: { select: { id: true, fullName: true } },
  cancelledBy: { select: { id: true, fullName: true } },
} as const;

type CardVehicle = {
  currentPlate: string;
  make: string | null;
  model: string | null;
  color: string | null;
  manufactureYear: number | null;
  fuelType: 'PETROL' | 'DIESEL' | null;
  chassisNumber: string | null;
  registrationBooklet: string | null;
};
type CardWithVehicle = VehicleCard & { vehicle: CardVehicle };

const CARD_VEHICLE_SELECT = {
  currentPlate: true,
  make: true,
  model: true,
  color: true,
  manufactureYear: true,
  fuelType: true,
  chassisNumber: true,
  registrationBooklet: true,
} as const;

const FUEL_AR: Record<string, string> = { PETROL: 'بنزين', DIESEL: 'ديزل' };

// Registration pivot, phase 3 (plan §6): the printed vehicle card.
//  - Only registration roles, at a registration station they're scoped to
//    (open, in a live municipality), issue and print cards. Petrol-station
//    roles only ever scan.
//  - One ACTIVE card per vehicle, enforced by the database (unique
//    activeForVehicleId + a CHECK constraint); issuing a new one marks the
//    previous one REPLACED in the same transaction.
//  - Every issue, print/reprint, replacement and cancellation is audited.
//    Scanning is not.
@Injectable()
export class CardsService {
  private readonly policy = new CardIssuePolicy();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly registrationStations: RegistrationStationsService,
    private readonly renderer: CardRendererService,
  ) {}

  private needsReissue(card: CardWithVehicle): boolean {
    const v = card.vehicle;
    if (card.printedPlate !== v.currentPlate || card.printedVehicleLine !== vehicleLineOf(v)) return true;
    // Phase 6: the face also prints year, chassis and booklet. A card issued
    // before that has no snapshot of them and is not flagged for these.
    const same = (printed: string | null, current: string | null | undefined) =>
      printed === null || printed === (current ?? '');
    return !(
      same(card.printedYear, v.manufactureYear ? String(v.manufactureYear) : '') &&
      same(card.printedChassis, v.chassisNumber?.trim()) &&
      same(card.printedBooklet, v.registrationBooklet?.trim())
    );
  }

  private present(card: CardWithVehicle & Record<string, unknown>) {
    const { vehicle: _vehicle, activeForVehicleId: _marker, ...rest } = card;
    return { ...rest, needsReissue: card.status === 'ACTIVE' && this.needsReissue(card) };
  }

  async listForVehicle(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }
    const cards = await this.prisma.vehicleCard.findMany({
      where: { vehicleId },
      include: { ...CARD_INCLUDE, vehicle: { select: CARD_VEHICLE_SELECT } },
      orderBy: { issuedAt: 'desc' },
    });
    return cards.map((card) => this.present(card));
  }

  private async findCard(id: string) {
    const card = await this.prisma.vehicleCard.findUnique({
      where: { id },
      include: { ...CARD_INCLUDE, vehicle: { select: CARD_VEHICLE_SELECT } },
    });
    if (!card) {
      throw new NotFoundException('Card not found.');
    }
    return card;
  }

  // Printing, reprinting and the failed-print path happen at the office the
  // PRINTING employee works at - which is not necessarily the office that first
  // issued the card (vehicles are global: any registration employee, in any
  // office, may reprint any vehicle's card). The office comes from the request;
  // without it the card's own office is used. Phase 7: a print is recorded
  // against the office and the employee only (desks and printers are gone).
  private async resolvePrintOffice(
    card: VehicleCard,
    where: { registrationStationId?: string },
    actorId: string,
  ): Promise<string> {
    const registrationStationId = where.registrationStationId ?? card.registrationStationId;
    await this.registrationStations.assertCanRegisterAt(registrationStationId, actorId);
    return registrationStationId;
  }

  // Creates the new card row (and marks `replacing` REPLACED first) inside
  // `tx`. The snapshot is taken from the vehicle/station as they are now.
  private async createCardInTx(
    tx: Tx,
    params: {
      vehicleId: string;
      registrationStationId: string;
      reason: VehicleCardIssueReason;
      reasonNote?: string;
      actorId: string;
      replacing: VehicleCard | null;
    },
  ) {
    const station = await tx.registrationStation.findUniqueOrThrow({
      where: { id: params.registrationStationId },
      include: { municipality: { include: { securityAuthority: true } } },
    });
    if (!station.municipality.code) {
      throw new ConflictException('MUNICIPALITY_HAS_NO_CODE');
    }
    if (!station.municipality.securityAuthority) {
      throw new ConflictException('MUNICIPALITY_HAS_NO_AUTHORITY');
    }
    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: params.vehicleId } });

    if (params.replacing) {
      await tx.vehicleCard.update({
        where: { id: params.replacing.id },
        data: { status: 'REPLACED', activeForVehicleId: null, replacedAt: new Date() },
      });
      await this.audit.log(
        {
          userId: params.actorId,
          action: 'REPLACE_CARD',
          entityType: 'VehicleCard',
          entityId: params.replacing.id,
          oldValue: { status: 'ACTIVE' },
          newValue: { status: 'REPLACED', reason: params.reason },
        },
        tx,
      );
    }

    const issuedAt = new Date();
    const snapshot = {
      printedPlate: vehicle.currentPlate,
      printedVehicleLine: vehicleLineOf(vehicle),
      printedOfficeName: station.municipality.securityAuthority.name,
      printedIssueDate: libyaDate(issuedAt),
      printedStationCode: station.internalCode,
      printedMakeModel: [vehicle.make?.trim(), vehicle.model?.trim()].filter(Boolean).join(' ') || null,
      printedColor: vehicle.color?.trim() || null,
      printedYear: vehicle.manufactureYear ? String(vehicle.manufactureYear) : null,
      printedFuel: vehicle.fuelType ? (FUEL_AR[vehicle.fuelType] ?? null) : null,
      printedChassis: vehicle.chassisNumber?.trim() || null,
      printedBooklet: vehicle.registrationBooklet?.trim() || null,
    };

    // Random card numbers (31^8 ≈ 8.5e11 per municipality): a clash is
    // astronomically unlikely, but checked anyway. It's checked BEFORE the
    // insert rather than caught after: a unique-constraint error aborts the
    // whole Postgres transaction, so it can't be retried inside it. The
    // unique index stays the final guard (a race would surface as
    // CARD_ISSUE_CONFLICT and the desk simply issues again).
    let cardNumber = generateCardNumber(station.municipality.code);
    for (let attempt = 1; await tx.vehicleCard.findUnique({ where: { cardNumber }, select: { id: true } }); attempt++) {
      if (attempt >= 5) throw new ConflictException('CARD_ISSUE_CONFLICT');
      cardNumber = generateCardNumber(station.municipality.code);
    }
    const card = await tx.vehicleCard.create({
      data: {
        cardNumber,
        vehicleId: params.vehicleId,
        registrationStationId: params.registrationStationId,
        issuedById: params.actorId,
        issuedAt,
        reason: params.reason,
        reasonNote: params.reasonNote?.trim() || null,
        status: 'ACTIVE',
        activeForVehicleId: params.vehicleId,
        ...snapshot,
      },
    });
    await this.audit.log(
      {
        userId: params.actorId,
        action: 'ISSUE_CARD',
        entityType: 'VehicleCard',
        entityId: card.id,
        newValue: {
          cardNumber: card.cardNumber,
          vehicleId: card.vehicleId,
          reason: card.reason,
          registrationStationId: card.registrationStationId,
          replacedCardId: params.replacing?.id,
        },
      },
      tx,
    );
    return card;
  }

  async issue(vehicleId: string, dto: IssueCardDto, actorId: string) {
    await this.registrationStations.assertCanRegisterAt(dto.registrationStationId, actorId);
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found.');
    }

    const history = await this.prisma.vehicleCard.count({ where: { vehicleId } });
    if (dto.reason === 'FIRST_ISSUE' && history > 0) {
      throw new ConflictException('FIRST_ISSUE_NOT_ALLOWED');
    }
    if (dto.reason !== 'FIRST_ISSUE' && history === 0) {
      throw new ConflictException('NO_CARD_TO_REPLACE');
    }
    if (this.policy.requiresApproval(dto.reason)) {
      // Not reachable today — see CardIssuePolicy.
      throw new ForbiddenException('CARD_APPROVAL_REQUIRED');
    }

    try {
      const card = await this.prisma.$transaction(async (tx) => {
        const active = await tx.vehicleCard.findUnique({ where: { activeForVehicleId: vehicleId } });
        return this.createCardInTx(tx, {
          vehicleId,
          registrationStationId: dto.registrationStationId,
          reason: dto.reason,
          reasonNote: dto.reasonNote,
          actorId,
          replacing: active,
        });
      });
      return this.present(await this.findCard(card.id));
    } catch (error) {
      // Two employees issuing for the same vehicle at the same instant: the
      // database's one-active-card rule lets exactly one through.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('CARD_ISSUE_CONFLICT');
      }
      throw error;
    }
  }

  // "هل طُبعت البطاقة بشكل سليم؟" → no: the misprinted card is cancelled on
  // the spot and a new card number is issued at the same office.
  async failedPrint(cardId: string, where: { registrationStationId?: string }, actorId: string) {
    const card = await this.findCard(cardId);
    const registrationStationId = await this.resolvePrintOffice(card, where, actorId);
    if (card.status !== 'ACTIVE') {
      throw new ConflictException('CARD_NOT_ACTIVE');
    }
    const replacement = await this.prisma.$transaction(async (tx) => {
      await tx.vehicleCard.update({
        where: { id: card.id },
        data: {
          status: 'CANCELLED',
          activeForVehicleId: null,
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancelReason: 'FAILED_PRINT',
        },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CANCEL_CARD',
          entityType: 'VehicleCard',
          entityId: card.id,
          oldValue: { status: 'ACTIVE' },
          newValue: { status: 'CANCELLED', cancelReason: 'FAILED_PRINT' },
        },
        tx,
      );
      return this.createCardInTx(tx, {
        vehicleId: card.vehicleId,
        registrationStationId,
        reason: 'FAILED_PRINT',
        actorId,
        replacing: null,
      });
    });
    return this.present(await this.findCard(replacement.id));
  }

  // Cancel WITHOUT a replacement — registration supervisors and admins
  // (cards:cancel). The vehicle is left with no active card.
  async cancel(cardId: string, reason: string, actorId: string) {
    const card = await this.findCard(cardId);
    if (card.status !== 'ACTIVE') {
      throw new ConflictException('CARD_NOT_ACTIVE');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleCard.update({
        where: { id: card.id },
        data: { status: 'CANCELLED', activeForVehicleId: null, cancelledAt: new Date(), cancelledById: actorId, cancelReason: reason.trim() },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'CANCEL_CARD',
          entityType: 'VehicleCard',
          entityId: card.id,
          oldValue: { status: 'ACTIVE' },
          newValue: { status: 'CANCELLED', cancelReason: reason.trim() },
        },
        tx,
      );
    });
    return this.present(await this.findCard(card.id));
  }

  // What the single face prints: the card's own snapshot; a card issued before
  // Phase 6 has no snapshot of the extra details and reads the vehicle's
  // current ones.
  private faceData(card: CardWithVehicle) {
    const v = card.vehicle;
    return {
      cardNumber: card.cardNumber,
      plate: card.printedPlate,
      makeModel: card.printedMakeModel ?? ([v.make?.trim(), v.model?.trim()].filter(Boolean).join(' ') || card.printedVehicleLine),
      color: card.printedColor ?? v.color?.trim() ?? '',
      year: card.printedYear ?? (v.manufactureYear ? String(v.manufactureYear) : ''),
      fuel: card.printedFuel ?? (v.fuelType ? (FUEL_AR[v.fuelType] ?? '') : ''),
      chassis: card.printedChassis ?? v.chassisNumber?.trim() ?? '',
      booklet: card.printedBooklet ?? v.registrationBooklet?.trim() ?? '',
      officeName: card.printedOfficeName,
      issueDate: card.printedIssueDate,
      stationCode: card.printedStationCode,
    };
  }

  // Printing (and every reprint) regenerates the PDF from the card's stored
  // snapshot, so a reprint is always identical — and it's audited.
  async print(
    cardId: string,
    mode: CardRenderMode,
    where: { registrationStationId?: string },
    actorId: string,
  ): Promise<{ pdf: Buffer; cardNumber: string }> {
    const card = await this.findCard(cardId);
    const registrationStationId = await this.resolvePrintOffice(card, where, actorId);
    if (card.status !== 'ACTIVE') {
      throw new ConflictException('CARD_NOT_ACTIVE');
    }
    const pdf = await this.renderer.renderCardPdf(this.faceData(card), mode);
    // Every print uses up one blank card, so each is recorded (CardPrint) next
    // to its audit row (the per-card print history and the reprint reports).
    await this.prisma.$transaction(async (tx) => {
      await tx.cardPrint.create({
        data: {
          registrationStationId,
          kind: 'CARD',
          cardId: card.id,
          printedById: actorId,
        },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'PRINT_CARD',
          entityType: 'VehicleCard',
          entityId: card.id,
          newValue: {
            cardNumber: card.cardNumber,
            mode,
            printedAtRegistrationStationId: registrationStationId,
          },
        },
        tx,
      );
    });
    return { pdf, cardNumber: card.cardNumber };
  }

  // On-screen preview (not a print — not audited).
  async preview(cardId: string): Promise<Buffer> {
    const card = await this.findCard(cardId);
    return this.renderer.renderCardPreviewPng(this.faceData(card));
  }

  // The one-page printer setup card: printed once on the real printer.
  printerSetupCard(): Promise<Buffer> {
    return this.renderer.renderPrinterSetupPdf();
  }

  // The pump-side lookup (cards:scan). Returns codes the fill-up screen
  // turns into Arabic:
  //  - CARD_NOT_FOUND (404): not a card number from this system — which
  //    includes the old V-###### internalCode QR codes (never printed).
  //  - CARD_REVOKED (409): replaced or cancelled.
  //  - 200 with needsReissue: an active card whose printed plate/make/
  //    colour no longer match the vehicle — still valid, but "renew it".
  // Deliberately NOT audited: scanning isn't a change.
  async scan(rawCardNumber: string) {
    const cardNumber = normalizeScannedCardNumber(rawCardNumber);
    if (!cardNumber) {
      throw new NotFoundException('CARD_NOT_FOUND');
    }
    const card = await this.prisma.vehicleCard.findUnique({
      where: { cardNumber },
      include: {
        vehicle: {
          select: {
            id: true,
            internalCode: true,
            currentPlate: true,
            make: true,
            model: true,
            color: true,
            fuelType: true,
            manufactureYear: true,
            chassisNumber: true,
            registrationBooklet: true,
            vehicleType: { select: { name: true } },
            // After review (15 Oct 2026): the pump shows who the vehicle is
            // registered to — the name only, never the identity number.
            owner: { select: { fullName: true } },
          },
        },
      },
    });
    if (!card) {
      throw new NotFoundException('CARD_NOT_FOUND');
    }
    if (card.status !== 'ACTIVE') {
      throw new ConflictException({ message: 'CARD_REVOKED', details: { status: card.status } });
    }
    return {
      cardNumber: card.cardNumber,
      needsReissue: this.needsReissue(card),
      vehicle: card.vehicle,
    };
  }
}
