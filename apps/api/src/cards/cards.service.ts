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
export function vehicleLineOf(vehicle: { model: string | null; color: string | null }): string {
  return [vehicle.model?.trim(), vehicle.color?.trim()].filter(Boolean).join(' — ');
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
  desk: { select: { id: true, name: true } },
  issuedBy: { select: { id: true, fullName: true } },
  cancelledBy: { select: { id: true, fullName: true } },
} as const;

type CardWithVehicle = VehicleCard & { vehicle: { currentPlate: string; model: string | null; color: string | null } };

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
    return card.printedPlate !== card.vehicle.currentPlate || card.printedVehicleLine !== vehicleLineOf(card.vehicle);
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
      include: { ...CARD_INCLUDE, vehicle: { select: { currentPlate: true, model: true, color: true } } },
      orderBy: { issuedAt: 'desc' },
    });
    return cards.map((card) => this.present(card));
  }

  private async findCard(id: string) {
    const card = await this.prisma.vehicleCard.findUnique({
      where: { id },
      include: { ...CARD_INCLUDE, vehicle: { select: { currentPlate: true, model: true, color: true } } },
    });
    if (!card) {
      throw new NotFoundException('Card not found.');
    }
    return card;
  }

  // Printing/reprinting and the failed-print path are desk actions at the
  // card's own registration station — same checks as registering.
  private async assertDeskActionAllowed(card: VehicleCard, actorId: string) {
    await this.registrationStations.assertCanRegisterAt(card.registrationStationId, actorId);
  }

  // Creates the new card row (and marks `replacing` REPLACED first) inside
  // `tx`. The snapshot is taken from the vehicle/station as they are now.
  private async createCardInTx(
    tx: Tx,
    params: {
      vehicleId: string;
      registrationStationId: string;
      deskId: string;
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
        deskId: params.deskId,
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
          deskId: card.deskId,
          replacedCardId: params.replacing?.id,
        },
      },
      tx,
    );
    return card;
  }

  async issue(vehicleId: string, dto: IssueCardDto, actorId: string) {
    await this.registrationStations.assertCanRegisterAt(dto.registrationStationId, actorId);
    const desk = await this.prisma.registrationDesk.findUnique({ where: { id: dto.deskId } });
    if (!desk || desk.registrationStationId !== dto.registrationStationId || !desk.isActive) {
      throw new ConflictException('DESK_NOT_AVAILABLE');
    }
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
          deskId: dto.deskId,
          reason: dto.reason,
          reasonNote: dto.reasonNote,
          actorId,
          replacing: active,
        });
      });
      return this.present(await this.findCard(card.id));
    } catch (error) {
      // Two desks issuing for the same vehicle at the same instant: the
      // database's one-active-card rule lets exactly one through.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('CARD_ISSUE_CONFLICT');
      }
      throw error;
    }
  }

  // "هل طُبعت البطاقة بشكل سليم؟" → no: the misprinted card is cancelled on
  // the spot and a new card number is issued at the same station and desk.
  async failedPrint(cardId: string, actorId: string) {
    const card = await this.findCard(cardId);
    await this.assertDeskActionAllowed(card, actorId);
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
        registrationStationId: card.registrationStationId,
        deskId: card.deskId,
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

  private faceData(card: VehicleCard) {
    return {
      cardNumber: card.cardNumber,
      plate: card.printedPlate,
      vehicleLine: card.printedVehicleLine,
      officeName: card.printedOfficeName,
      issueDate: card.printedIssueDate,
      stationCode: card.printedStationCode,
    };
  }

  // Printing (and every reprint) regenerates the PDF from the card's stored
  // snapshot, so a reprint is always identical — and it's audited.
  async print(cardId: string, mode: CardRenderMode, actorId: string): Promise<{ pdf: Buffer; cardNumber: string }> {
    const card = await this.findCard(cardId);
    await this.assertDeskActionAllowed(card, actorId);
    if (card.status !== 'ACTIVE') {
      throw new ConflictException('CARD_NOT_ACTIVE');
    }
    const pdf = await this.renderer.renderCardPdf(this.faceData(card), mode);
    await this.audit.log({
      userId: actorId,
      action: 'PRINT_CARD',
      entityType: 'VehicleCard',
      entityId: card.id,
      newValue: { cardNumber: card.cardNumber, mode },
    });
    return { pdf, cardNumber: card.cardNumber };
  }

  // On-screen preview (not a print — not audited).
  async preview(cardId: string): Promise<Buffer> {
    const card = await this.findCard(cardId);
    return this.renderer.renderCardPreviewPng(this.faceData(card));
  }

  async testCard(registrationStationId: string, actorId: string): Promise<Buffer> {
    const scope = await this.rbac.getRegistrationStationScope(actorId);
    if (scope !== null && !scope.includes(registrationStationId)) {
      throw new ForbiddenException('You do not have access to this registration station.');
    }
    const station = await this.prisma.registrationStation.findUnique({
      where: { id: registrationStationId },
      include: { municipality: { include: { securityAuthority: true } } },
    });
    if (!station) {
      throw new NotFoundException('Registration station not found.');
    }
    return this.renderer.renderTestCardPdf(station.municipality.securityAuthority?.name ?? station.municipality.name);
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
            model: true,
            color: true,
            vehicleType: { select: { name: true } },
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
