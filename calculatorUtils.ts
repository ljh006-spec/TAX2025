
import { 
  BASIC_DEDUCTION_AMOUNT, 
  SENIOR_DEDUCTION_AMOUNT, 
  DISABLED_DEDUCTION_AMOUNT, 
  WOMAN_DEDUCTION_AMOUNT,
  CHILD_TAX_CREDIT
} from './constants';
import { Person, ExpenseData, TaxResult, Relationship } from './types';

/**
 * 근로소득금액 계산 (총급여 - 근로소득공제)
 */
export const calculateLaborIncomeAmount = (totalSalary: number): number => {
  let deduction = 0;
  if (totalSalary <= 5000000) {
    deduction = totalSalary * 0.7;
  } else if (totalSalary <= 15000000) {
    deduction = 3500000 + (totalSalary - 5000000) * 0.4;
  } else if (totalSalary <= 45000000) {
    deduction = 7500000 + (totalSalary - 15000000) * 0.15;
  } else if (totalSalary <= 100000000) {
    deduction = 12000000 + (totalSalary - 45000000) * 0.05;
  } else {
    deduction = 14750000 + (totalSalary - 100000000) * 0.02;
  }
  return Math.max(0, totalSalary - deduction);
};

/**
 * 근로소득 세액공제 계산 (산출세액 기준 공제액 및 총급여별 한도 적용)
 */
export const calculateLaborIncomeTaxCredit = (salary: number, calculatedTax: number): number => {
  if (calculatedTax <= 0) return 0;

  // 1. 산출세액 기준 기본 공제액
  let credit = 0;
  if (calculatedTax <= 1300000) {
    credit = calculatedTax * 0.55;
  } else {
    credit = 715000 + (calculatedTax - 1300000) * 0.30;
  }

  // 2. 총급여액 기준 공제 한도 (사용자 요청 기준 반영)
  let limit = 0;
  if (salary <= 33000000) {
    limit = 740000;
  } else if (salary <= 70000000) {
    // 74만원 - [(총급여액-3300만원) * 0.008], 최소 66만원
    limit = Math.max(660000, 740000 - (salary - 33000000) * 0.008);
  } else if (salary <= 120000000) {
    // 66만원 - [(총급여액-7000만원) * 0.5], 최소 50만원
    limit = Math.max(500000, 660000 - (salary - 70000000) * 0.5);
  } else {
    // 50만원 - [(총급여액-1.2억) * 0.5], 최소 20만원
    limit = Math.max(200000, 500000 - (salary - 120000000) * 0.5);
  }

  return Math.min(credit, limit);
};

/**
 * 과세표준에 따른 산출세액 계산
 */
export const calculateBaseTax = (taxableStandard: number): number => {
  if (taxableStandard <= 0) return 0;
  
  if (taxableStandard <= 14000000) {
    return taxableStandard * 0.06;
  } else if (taxableStandard <= 50000000) {
    return 840000 + (taxableStandard - 14000000) * 0.15;
  } else if (taxableStandard <= 88000000) {
    return 6240000 + (taxableStandard - 50000000) * 0.24;
  } else if (taxableStandard <= 150000000) {
    return 15360000 + (taxableStandard - 88000000) * 0.35;
  } else if (taxableStandard <= 300000000) {
    return 37060000 + (taxableStandard - 150000000) * 0.38;
  } else if (taxableStandard <= 500000000) {
    return 94060000 + (taxableStandard - 300000000) * 0.4;
  } else if (taxableStandard <= 1000000000) {
    return 174060000 + (taxableStandard - 500000000) * 0.42;
  } else {
    return 384060000 + (taxableStandard - 1000000000) * 0.45;
  }
};

/**
 * 신용카드 등 소득공제 계산 
 */
export const calculateCardDeduction = (totalSalary: number, appliedPeople: Person[]): number => {
  const threshold = totalSalary * 0.25; 
  
  let totalCreditCard = 0;
  let totalDebitAndCash = 0;
  let totalCulture = 0;
  let totalMarket = 0;
  let totalTransport = 0;

  appliedPeople.forEach(p => {
    if (!p.isIncomeOverLimit) {
      const e = p.expenses;
      totalCreditCard += e.creditCard;
      totalDebitAndCash += (e.debitCard + e.cashReceipt);
      
      if (totalSalary <= 70000000) {
        totalCulture += e.cultureSports;
      }
      totalMarket += e.traditionalMarket;
      totalTransport += e.publicTransport;
    }
  });

  let remainingThreshold = threshold;

  const subCredit = Math.min(totalCreditCard, remainingThreshold);
  totalCreditCard -= subCredit;
  remainingThreshold -= subCredit;

  const subDebit = Math.min(totalDebitAndCash, remainingThreshold);
  totalDebitAndCash -= subDebit;
  remainingThreshold -= subDebit;

  const subCulture = Math.min(totalCulture, remainingThreshold);
  totalCulture -= subCulture;
  remainingThreshold -= subCulture;

  const subMarket = Math.min(totalMarket, remainingThreshold);
  totalMarket -= subMarket;
  remainingThreshold -= subMarket;

  const subTransport = Math.min(totalTransport, remainingThreshold);
  totalTransport -= subTransport;
  remainingThreshold -= subTransport;

  const baseDeductionPotential = (totalCreditCard * 0.15) + (totalDebitAndCash * 0.30);
  const extraDeductionPotential = (totalCulture * 0.30) + (totalMarket * 0.40) + (totalTransport * 0.40);

  const baseLimit = totalSalary <= 70000000 ? 3000000 : 2500000;
  const finalBaseDeduction = Math.min(baseDeductionPotential, baseLimit);

  const extraLimit = totalSalary <= 70000000 ? 3000000 : 2500000;
  const finalExtraDeduction = Math.min(extraDeductionPotential, extraLimit);

  return finalBaseDeduction + finalExtraDeduction;
};

/**
 * 인적/특별세액공제 합산 계산
 */
export const calculateSpecialTaxCredits = (appliedPeople: Person[], totalSalary: number): number => {
  let credit = 0;
  
  // 1. 자녀세액공제
  appliedPeople.forEach(p => {
    if (!p.isIncomeOverLimit && p.isChildTaxCredit) {
      if (p.relationship === Relationship.CHILD_1) {
        credit += CHILD_TAX_CREDIT[0];
      } else if (p.relationship === Relationship.CHILD_2) {
        credit += CHILD_TAX_CREDIT[1];
      } else if (p.relationship === Relationship.CHILD_3 || p.relationship === Relationship.CHILD_4) {
        credit += CHILD_TAX_CREDIT[2];
      }
    }
  });

  let totalLifeIns = 0;
  let totalDisIns = 0;
  let totalEdu = 0;
  let totalDonations = 0;
  let totalUnlimitedMedical = 0;
  let totalLimitedMedical = 0;
  
  // 연금저축 및 IRP
  let totalPensionSavings = 0;
  let totalIrp = 0;

  // 고향사랑 기부금
  let totalDonationsGohyang = 0;

  appliedPeople.forEach(p => {
    const e = p.expenses;
    const personTotalMedical = e.medicalGeneral + e.medicalUnder6Over65;
    const netPersonMedical = Math.max(0, personTotalMedical - e.medicalInsuranceRefund);

    if (netPersonMedical > 0) {
      const netUnlimited = Math.max(0, e.medicalUnder6Over65 - Math.max(0, e.medicalInsuranceRefund - e.medicalGeneral));
      const netLimited = Math.max(0, netPersonMedical - netUnlimited);
      totalUnlimitedMedical += netUnlimited;
      totalLimitedMedical += Math.min(netLimited, 7000000);
    }

    if (!p.isIncomeOverLimit) {
      totalLifeIns += e.lifeInsurance;
      totalDisIns += e.disabledInsurance;
      totalEdu += (e.eduPreSchool + e.eduSchool + e.eduUniv + e.eduDisabled);
      totalDonations += (e.donationsReligious + e.donationsPublic);
      
      // 연금저축/IRP
      totalPensionSavings += (e.pensionSavings || 0);
      totalIrp += (e.irp || 0);

      // 고향사랑 기부금
      totalDonationsGohyang += (e.donationsGohyang || 0);
    }
  });

  const medicalThreshold = totalSalary * 0.03;
  const totalEligibleMedical = totalUnlimitedMedical + totalLimitedMedical;
  const medicalCredit = Math.max(0, totalEligibleMedical - medicalThreshold) * 0.15;
  credit += medicalCredit;

  credit += Math.min(totalLifeIns, 1000000) * 0.12;
  credit += Math.min(totalDisIns, 1000000) * 0.15;
  credit += totalEdu * 0.15;
  credit += totalDonations * 0.15;
  
  // 개인연금 세액공제 계산
  const pensionSavingsLimit = 6000000;
  const totalPensionLimit = 9000000;
  const eligiblePensionSavings = Math.min(totalPensionSavings, pensionSavingsLimit);
  const eligibleTotalPension = Math.min(eligiblePensionSavings + totalIrp, totalPensionLimit);
  const pensionCreditRate = totalSalary <= 55000000 ? 0.15 : 0.12;
  credit += eligibleTotalPension * pensionCreditRate;

  // 고향사랑 기부금 세액공제 계산 (요청하신 로직 적용)
  // - 10만원까지 100%
  // - 10만원 초과 20만원 이하 44%
  // - 20만원 초과 15%
  if (totalDonationsGohyang > 0) {
    if (totalDonationsGohyang <= 100000) {
      credit += totalDonationsGohyang;
    } else if (totalDonationsGohyang <= 200000) {
      credit += 100000 + (totalDonationsGohyang - 100000) * 0.44;
    } else {
      credit += 100000 + (100000 * 0.44) + (totalDonationsGohyang - 200000) * 0.15;
    }
  }

  return credit;
};

export const calculateFullAdjustment = (
  totalSalary: number, 
  people: Person[]
): TaxResult => {
  const laborIncomeAmount = calculateLaborIncomeAmount(totalSalary);
  const appliedPeople = people.filter(p => p.applied);

  let personalDeduction = 0;
  let housingDeduction = 0;
  let publicPensionDeduction = 0;
  let healthInsuranceDeduction = 0;
  
  appliedPeople.forEach(p => {
    if (!p.isIncomeOverLimit && p.isBasicDeduction) {
      personalDeduction += BASIC_DEDUCTION_AMOUNT;
      if (p.isSenior) personalDeduction += SENIOR_DEDUCTION_AMOUNT;
      if (p.isDisabled) personalDeduction += DISABLED_DEDUCTION_AMOUNT;
      if (p.isWomanDeduction) personalDeduction += WOMAN_DEDUCTION_AMOUNT;
      
      housingDeduction += p.expenses.housingFunds;
      publicPensionDeduction += p.expenses.publicPension;
      healthInsuranceDeduction += p.expenses.healthInsurance;
    } else if (p.id === 'self') {
      healthInsuranceDeduction += p.expenses.healthInsurance;
      publicPensionDeduction += p.expenses.publicPension;
    }
  });
  
  const cardDeduction = calculateCardDeduction(totalSalary, appliedPeople);

  const totalDeductions = personalDeduction + cardDeduction + housingDeduction + publicPensionDeduction + healthInsuranceDeduction;
  const taxableStandard = Math.max(0, laborIncomeAmount - totalDeductions);
  const calculatedTax = calculateBaseTax(taxableStandard);
  
  // 세액공제 계산
  const laborIncomeTaxCredit = calculateLaborIncomeTaxCredit(totalSalary, calculatedTax);
  const specialTaxCredits = calculateSpecialTaxCredits(appliedPeople, totalSalary);
  
  const finalTax = Math.max(0, calculatedTax - laborIncomeTaxCredit - specialTaxCredits);
  
  // 실효세율 계산 (총급여 대비 최종 결정세액)
  const effectiveTaxRate = totalSalary > 0 ? (finalTax / totalSalary) * 100 : 0;

  return {
    totalSalary,
    laborIncomeAmount,
    totalDeductions,
    taxableStandard,
    calculatedTax,
    laborIncomeTaxCredit,
    specialTaxCredits,
    finalTax,
    effectiveTaxRate
  };
};
