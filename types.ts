
export enum Relationship {
  SELF_M = '본인(남)',
  SELF_F = '본인(여)',
  SPOUSE = '배우자',
  CHILD_1 = '자녀(첫째)',
  CHILD_2 = '자녀(둘째)',
  CHILD_3 = '자녀(셋째)',
  CHILD_4 = '자녀(넷째)',
  PARENT = '부모',
  SIBLING = '형제'
}

export interface ExpenseData {
  publicPension: number;       // 공무원연금 (공적연금)
  housingFunds: number;        // 주택자금
  pensionSavings: number;      // 연금저축 (추가)
  irp: number;                 // IRP (추가)
  healthInsurance: number;
  lifeInsurance: number;
  disabledInsurance: number;
  medicalUnder6Over65: number;
  medicalGeneral: number;
  medicalInsuranceRefund: number;
  eduPreSchool: number;
  eduSchool: number;
  eduUniv: number;
  eduDisabled: number;
  creditCard: number;
  debitCard: number;
  cashReceipt: number;
  traditionalMarket: number;
  cultureSports: number;
  publicTransport: number;
  donationsReligious: number; // 기부금(종교)
  donationsPublic: number;    // 기부금(단체)
  donationsGohyang: number;   // 기부금(고향사랑) (추가)
}

export interface Person {
  id: string;
  applied: boolean;
  name: string;
  relationship: Relationship;
  birthYear: number;
  isBasicDeduction: boolean;
  isIncomeOverLimit: boolean;
  isWomanDeduction: boolean;
  isDisabled: boolean;
  isSenior: boolean;
  isChildTaxCredit: boolean;
  expenses: ExpenseData;
}

export interface TaxResult {
  totalSalary: number;
  laborIncomeAmount: number;
  totalDeductions: number;
  taxableStandard: number;
  calculatedTax: number;
  laborIncomeTaxCredit: number; // 근로소득 세액공제
  specialTaxCredits: number;    // 특별세액공제 (보험, 의료, 교육, 기부 등)
  finalTax: number;
  effectiveTaxRate: number;     // 실효세율 (%)
}
