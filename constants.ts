
// 2025 근로소득공제 기준
export const LABOR_INCOME_DEDUCTION = [
  { limit: 5000000, rate: 0.7, base: 0 },
  { limit: 15000000, rate: 0.4, base: 3500000 },
  { limit: 45000000, rate: 0.15, base: 7500000 },
  { limit: 100000000, rate: 0.05, base: 12000000 },
  { limit: Infinity, rate: 0.02, base: 14750000 },
];

// 2025 소득세율표
export const TAX_BRACKETS = [
  { limit: 14000000, rate: 0.06, base: 0 },
  { limit: 50000000, rate: 0.15, base: 840000 },
  { limit: 88000000, rate: 0.24, base: 6240000 },
  { limit: 150000000, rate: 0.35, base: 15360000 },
  { limit: 300000000, rate: 0.38, base: 37060000 },
  { limit: 500000000, rate: 0.4, base: 94060000 },
  { limit: 1000000000, rate: 0.42, base: 174060000 },
  { limit: Infinity, rate: 0.45, base: 384060000 },
];

export const CURRENT_YEAR = 2025;

export const BASIC_DEDUCTION_AMOUNT = 1500000;
export const SENIOR_DEDUCTION_AMOUNT = 1000000;
export const DISABLED_DEDUCTION_AMOUNT = 2000000;
export const WOMAN_DEDUCTION_AMOUNT = 500000;

// 자녀세액공제: 첫째 25만, 둘째 30만, 셋째 이후 인당 40만
export const CHILD_TAX_CREDIT = [250000, 300000, 400000];
