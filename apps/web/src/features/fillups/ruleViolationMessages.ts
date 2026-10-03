import type { RuleCheckDetail, RuleFailureReason } from '@fuel-tracking/shared-types';

// Plain-language Arabic for the rule engine's raw reason codes — shown to
// the station employee instead of the bare enum value. Per the design
// system notes: a system code must never stand alone — paired with its
// Arabic meaning wherever it's shown.
//
// Round 6: DRIVER_* renamed to OWNER_* — rule checks are scoped to the
// vehicle's owner now, not a driver (see
// docs/DESIGN_owner_based_fillups.md).
export const RULE_VIOLATION_MESSAGES: Record<RuleFailureReason, string> = {
  VEHICLE_GAP_TOO_SHORT: 'لم يمر وقت كافٍ منذ آخر تعبئة لهذه المركبة.',
  VEHICLE_WEEKLY_CAP_REACHED: 'بلغت هذه المركبة الحد الأقصى المسموح به من التعبئات لهذا الأسبوع.',
  OWNER_GAP_TOO_SHORT: 'لم يمر وقت كافٍ منذ آخر تعبئة لمالك هذه المركبة.',
  OWNER_WEEKLY_CAP_REACHED:
    'بلغ مالك هذه المركبة الحد الأقصى المسموح به من التعبئات لهذا الأسبوع (على جميع مركباته).',
  LITERS_PER_PERSON_CAP_REACHED: 'بلغ مالك هذه المركبة الحد الأقصى المسموح به من اللترات لهذا الأسبوع.',
};

// Round 7 item 1: short rule names for the pre-submit per-rule breakdown
// (RECORD_FILL_UP_PAGE's rule-review card) — distinct from
// RULE_VIOLATION_MESSAGES above, which is the full failure sentence shown
// only when a rule actually fails.
export const RULE_CHECK_LABELS: Record<RuleFailureReason, string> = {
  VEHICLE_GAP_TOO_SHORT: 'الفاصل الزمني — المركبة',
  VEHICLE_WEEKLY_CAP_REACHED: 'الحد الأسبوعي — المركبة',
  OWNER_GAP_TOO_SHORT: 'الفاصل الزمني — المالك',
  OWNER_WEEKLY_CAP_REACHED: 'الحد الأسبوعي — المالك',
  LITERS_PER_PERSON_CAP_REACHED: 'حد اللترات الأسبوعي — المالك',
};

// The check's real actual/limit numbers, in a human sentence — computed
// entirely from GET /fillups/rule-preview's response (the same rule
// engine a real submission runs), never a separate client-side estimate.
export function describeRuleCheck(check: RuleCheckDetail): string {
  switch (check.reason) {
    case 'VEHICLE_GAP_TOO_SHORT':
    case 'OWNER_GAP_TOO_SHORT':
      return check.actual === null
        ? 'لا توجد تعبئة سابقة'
        : `مرّ ${check.actual} ${check.actual === 1 ? 'يوم' : 'أيام'} منذ آخر تعبئة — الحد الأدنى ${check.limit} ${
            check.limit === 1 ? 'يوم' : 'أيام'
          }`;
    case 'VEHICLE_WEEKLY_CAP_REACHED':
    case 'OWNER_WEEKLY_CAP_REACHED':
      return `${check.actual ?? 0} من ${check.limit} تعبئات هذا الأسبوع`;
    case 'LITERS_PER_PERSON_CAP_REACHED':
      return `${check.actual ?? 0} من ${check.limit} لتر هذا الأسبوع`;
  }
}
