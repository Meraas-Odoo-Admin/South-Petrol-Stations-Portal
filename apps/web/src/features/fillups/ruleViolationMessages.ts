import type { RuleFailureReason } from '@fuel-tracking/shared-types';

// Plain-language Arabic for the rule engine's raw reason codes — shown to
// the station employee instead of the bare enum value. Per the design
// system notes: a system code must never stand alone — paired with its
// Arabic meaning wherever it's shown.
export const RULE_VIOLATION_MESSAGES: Record<RuleFailureReason, string> = {
  VEHICLE_GAP_TOO_SHORT: 'لم يمر وقت كافٍ منذ آخر تعبئة لهذه المركبة.',
  VEHICLE_WEEKLY_CAP_REACHED: 'بلغت هذه المركبة الحد الأقصى المسموح به من التعبئات لهذا الأسبوع.',
  DRIVER_GAP_TOO_SHORT: 'لم يمر وقت كافٍ منذ آخر تعبئة لهذا السائق.',
  DRIVER_WEEKLY_CAP_REACHED:
    'بلغ هذا السائق الحد الأقصى المسموح به من التعبئات لهذا الأسبوع (على جميع مركباته).',
  LITERS_PER_PERSON_CAP_REACHED: 'بلغ هذا السائق الحد الأقصى المسموح به من اللترات لهذا الأسبوع.',
};
