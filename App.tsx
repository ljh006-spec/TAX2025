
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';
import { 
  Relationship, 
  Person, 
  ExpenseData, 
  TaxResult 
} from './types';
import { 
  calculateFullAdjustment, 
  calculateLaborIncomeAmount
} from './calculatorUtils';
import { CURRENT_YEAR } from './constants';

const DEFAULT_EXPENSES: ExpenseData = {
  publicPension: 0,
  housingFunds: 0,
  pensionSavings: 0,
  irp: 0,
  healthInsurance: 0,
  lifeInsurance: 0,
  disabledInsurance: 0,
  medicalUnder6Over65: 0,
  medicalGeneral: 0,
  medicalInsuranceRefund: 0,
  eduPreSchool: 0,
  eduSchool: 0,
  eduUniv: 0,
  eduDisabled: 0,
  creditCard: 0,
  debitCard: 0,
  cashReceipt: 0,
  traditionalMarket: 0,
  cultureSports: 0,
  publicTransport: 0,
  donationsReligious: 0,
  donationsPublic: 0,
  donationsGohyang: 0
};

const INITIAL_PERSON: Person = {
  id: 'self',
  applied: true,
  name: '나',
  relationship: Relationship.SELF_M,
  birthYear: 1990,
  isBasicDeduction: true,
  isIncomeOverLimit: false,
  isWomanDeduction: false,
  isDisabled: false,
  isSenior: false,
  isChildTaxCredit: false,
  expenses: { ...DEFAULT_EXPENSES }
};

const EXCEL_COLUMNS = [
  '적용(Y/N)', '관계', '성함', '출생년도', '기본공제(Y/N)', '소득초과(Y/N)', '부녀자공제(Y/N)', '장애인(Y/N)', '경로우대(Y/N)', '자녀공제(Y/N)',
  '공무원연금', '주택자금', '연금저축', 'IRP', '건강보험료', '보장성보험료', '장애인보험료', '의료비(일반)', '의료비(취약)', '실손보험환급', '교육비(취학전)', '교육비(초중고)', '교육비(대학)', '교육비(장애인)',
  '신용카드', '직불카드', '현금영수증', '문화체육', '전통시장', '대중교통', '기부금(종교)', '기부금(단체)', '기부금(고향사랑)'
];

const App: React.FC = () => {
  const [totalSalary, setTotalSalary] = useState<number>(50000000);
  const [people, setPeople] = useState<Person[]>([INITIAL_PERSON]);
  const [result, setResult] = useState<TaxResult | null>(null);
  const [advice, setAdvice] = useState<string>("");
  const [loadingAdvice, setLoadingAdvice] = useState<boolean>(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const [isAdviceModalOpen, setIsAdviceModalOpen] = useState<boolean>(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState<boolean>(false);
  
  // API Key States
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('user_gemini_api_key') || "");
  const [isApiValid, setIsApiValid] = useState<boolean>(() => localStorage.getItem('is_api_valid') === 'true');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>("");
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error' | null, text: string }>({ type: null, text: "" });

  // 변동액 표시 관련 상태
  const [taxDiff, setTaxDiff] = useState<number | null>(null);
  const prevFinalTaxRef = useRef<number>(0);
  const diffTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const syncPersonAutoChecks = useCallback((p: Person, laborIncome: number): Person => {
    const age = CURRENT_YEAR - p.birthYear;
    let updated = { ...p };

    const isChildRel = [
      Relationship.CHILD_1, 
      Relationship.CHILD_2, 
      Relationship.CHILD_3, 
      Relationship.CHILD_4
    ].includes(p.relationship);

    if (updated.isIncomeOverLimit) {
      updated.isBasicDeduction = false;
      updated.isWomanDeduction = false;
      updated.isDisabled = false;
      updated.isSenior = false;
      updated.isChildTaxCredit = false;
    } else {
      updated.isChildTaxCredit = (isChildRel && age >= 8 && age <= 20);
      updated.isSenior = (age >= 70);
      if (p.relationship === Relationship.SELF_F) {
        updated.isWomanDeduction = (laborIncome < 30000000);
      } else {
        updated.isWomanDeduction = false;
      }
    }
    
    return updated;
  }, []);

  useEffect(() => {
    const laborIncome = calculateLaborIncomeAmount(totalSalary);
    const updatedPeople = people.map(p => syncPersonAutoChecks(p, laborIncome));
    if (JSON.stringify(updatedPeople) !== JSON.stringify(people)) {
      setPeople(updatedPeople);
    }
    const calculatedResult = calculateFullAdjustment(totalSalary, updatedPeople);
    setResult(calculatedResult);
  }, [totalSalary, people, syncPersonAutoChecks]);

  // 결정세액 변동 감지 및 차액 표시 로직
  useEffect(() => {
    if (result) {
      const currentFinalTax = result.finalTax;
      if (prevFinalTaxRef.current !== currentFinalTax) {
        const diff = currentFinalTax - prevFinalTaxRef.current;
        setTaxDiff(diff);
        if (diffTimerRef.current) window.clearTimeout(diffTimerRef.current);
        diffTimerRef.current = window.setTimeout(() => {
          setTaxDiff(null);
        }, 2500);
        prevFinalTaxRef.current = currentFinalTax;
      }
    }
  }, [result?.finalTax]);

  const handleTestAndSaveKey = async () => {
    if (!tempKey.trim()) {
      setTestMessage({ type: 'error', text: "API 키를 입력해주세요." });
      return;
    }

    setIsTestingKey(true);
    setTestMessage({ type: null, text: "키 유효성을 확인하고 있습니다..." });

    try {
      const ai = new GoogleGenAI({ apiKey: tempKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: "연결 테스트입니다. 'OK'라고만 답변해주세요."
      });

      if (response.text) {
        setIsApiValid(true);
        setApiKey(tempKey);
        localStorage.setItem('user_gemini_api_key', tempKey);
        localStorage.setItem('is_api_valid', 'true');
        setTestMessage({ type: 'success', text: "API 키가 성공적으로 등록되었습니다!" });
        setTimeout(() => setIsKeyModalOpen(false), 1500);
      }
    } catch (err: any) {
      setIsApiValid(false);
      setTestMessage({ type: 'error', text: "유효하지 않은 API 키입니다. 다시 확인해주세요." });
    } finally {
      setIsTestingKey(false);
    }
  };

  const addPerson = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setPeople([...people, {
      ...INITIAL_PERSON,
      id: newId,
      name: '새 구성원',
      relationship: Relationship.CHILD_1,
      birthYear: 2015,
      applied: true,
      expenses: { ...DEFAULT_EXPENSES }
    }]);
  };

  const removePerson = (id: string) => {
    if (id === 'self') return;
    setPeople(people.filter(p => p.id !== id));
  };

  const updatePerson = (id: string, updates: Partial<Person>) => {
    setPeople(people.map(p => {
      if (p.id === id) {
        let next = { ...p, ...updates };
        if (updates.isIncomeOverLimit === true) {
          next.isBasicDeduction = false;
          next.isWomanDeduction = false;
          next.isDisabled = false;
          next.isSenior = false;
          next.isChildTaxCredit = false;
          
          const nextExp = { ...next.expenses };
          (Object.keys(DEFAULT_EXPENSES) as Array<keyof ExpenseData>).forEach(k => {
             if (!k.startsWith('medical')) (nextExp as any)[k] = 0;
          });
          next.expenses = nextExp;
        }
        return next;
      }
      return p;
    }));
  };

  const updatePersonExpense = (id: string, key: keyof ExpenseData, value: number) => {
    setPeople(people.map(p => p.id === id ? { 
      ...p, 
      expenses: { ...p.expenses, [key]: value } 
    } : p));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isApiValid) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPdf(true);
    try {
      const base64Data = await fileToBase64(file);
      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data
            }
          },
          {
            text: `이 문서는 대한민국 국세청 연말정산 간소화 서비스 PDF입니다. 
            문서에서 다음 데이터를 추출하여 JSON으로 응답하세요:
            1. 총급여 (totalSalary)
            2. 인원 목록 (people) - 각 인원별로 이름(name), 관계(relationship), 출생년도(birthYear), 지출 내역(expenses)을 추출하세요.
            
            지출 내역(expenses) 필드명 가이드:
            - publicPension: 공적연금
            - housingFunds: 주택자금
            - pensionSavings: 연금저축
            - irp: 개인형퇴직연금(IRP)
            - healthInsurance: 건강보험료
            - medicalGeneral: 일반의료비
            - medicalUnder6Over65: 65세이상/6세이하 의료비
            - medicalInsuranceRefund: 실손보험환급금
            - eduPreSchool, eduSchool, eduUniv, eduDisabled: 교육비 각 항목
            - creditCard, debitCard, cashReceipt: 카드 및 현금영수증
            - cultureSports, traditionalMarket, publicTransport: 문화체육, 전통시장, 대중교통
            - donationsReligious: 종교단체 기부금
            - donationsPublic: 일반단체/법정 기부금
            - donationsGohyang: 고향사랑 기부금`
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              totalSalary: { type: Type.NUMBER },
              people: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    relationship: { type: Type.STRING },
                    birthYear: { type: Type.NUMBER },
                    expenses: {
                      type: Type.OBJECT,
                      properties: {
                        publicPension: { type: Type.NUMBER },
                        housingFunds: { type: Type.NUMBER },
                        pensionSavings: { type: Type.NUMBER },
                        irp: { type: Type.NUMBER },
                        healthInsurance: { type: Type.NUMBER },
                        medicalGeneral: { type: Type.NUMBER },
                        medicalUnder6Over65: { type: Type.NUMBER },
                        medicalInsuranceRefund: { type: Type.NUMBER },
                        eduPreSchool: { type: Type.NUMBER },
                        eduSchool: { type: Type.NUMBER },
                        eduUniv: { type: Type.NUMBER },
                        eduDisabled: { type: Type.NUMBER },
                        creditCard: { type: Type.NUMBER },
                        debitCard: { type: Type.NUMBER },
                        cashReceipt: { type: Type.NUMBER },
                        cultureSports: { type: Type.NUMBER },
                        traditionalMarket: { type: Type.NUMBER },
                        publicTransport: { type: Type.NUMBER },
                        donationsReligious: { type: Type.NUMBER },
                        donationsPublic: { type: Type.NUMBER },
                        donationsGohyang: { type: Type.NUMBER }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      const parsedData = JSON.parse(response.text || '{}');
      if (parsedData.totalSalary) setTotalSalary(parsedData.totalSalary);
      if (parsedData.people && parsedData.people.length > 0) {
        const mappedPeople: Person[] = parsedData.people.map((p: any, idx: number) => ({
          id: idx === 0 ? 'self' : Math.random().toString(36).substr(2, 9),
          applied: true,
          name: p.name || '추출됨',
          relationship: p.relationship as Relationship || Relationship.CHILD_1,
          birthYear: p.birthYear || 1990,
          isBasicDeduction: true,
          isIncomeOverLimit: false,
          isWomanDeduction: false,
          isDisabled: false,
          isSenior: false,
          isChildTaxCredit: false,
          expenses: { ...DEFAULT_EXPENSES, ...p.expenses, lifeInsurance: 0, disabledInsurance: 0 }
        }));
        setPeople(mappedPeople);
      }
      alert("국세청 자료 분석이 완료되었습니다!");
    } catch (err: any) {
      console.error(err);
      alert("PDF 분석 중 오류가 발생했습니다. 등록된 API 키를 확인해주세요.");
    } finally {
      setIsProcessingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const handleGetAdvice = async () => {
    if (!result || !isApiValid) return;
    
    setIsAdviceModalOpen(true);
    setLoadingAdvice(true);
    setAdvice("");
    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const prompt = `2025년 대한민국 연말정산 분석: 총급여 ${result.totalSalary.toLocaleString()}원, 결정세액 ${result.finalTax.toLocaleString()}원, 실효세율 ${result.effectiveTaxRate.toFixed(2)}%. 이 데이터를 바탕으로 사용자가 세금을 더 줄일 수 있는 구체적인 방법 3가지를 가독성 있게 제안해주세요. 특히 연금저축, IRP, 고향사랑 기부금 활용 여부를 고려하세요.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAdvice(response.text || "분석 결과를 가져올 수 없습니다.");
    } catch (err: any) {
      console.error(err);
      setAdvice("AI 분석 중 오류가 발생했습니다. API 키 상태를 확인해주세요.");
    } finally {
      setLoadingAdvice(false);
    }
  };

  const downloadTemplate = () => {
    const sampleRow = [
      'Y', Relationship.SELF_M, '홍길동', 1985, 'Y', 'N', 'N', 'N', 'N', 'N',
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ];
    const ws = XLSX.utils.aoa_to_sheet([EXCEL_COLUMNS, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "양식");
    XLSX.writeFile(wb, "연말정산_입력양식_2025.xlsx");
  };

  const exportToExcel = () => {
    const data = people.map(p => [
      p.applied ? 'Y' : 'N', p.relationship, p.name, p.birthYear, 
      p.isBasicDeduction ? 'Y' : 'N', p.isIncomeOverLimit ? 'Y' : 'N', 
      p.isWomanDeduction ? 'Y' : 'N', p.isDisabled ? 'Y' : 'N', 
      p.isSenior ? 'Y' : 'N', p.isChildTaxCredit ? 'Y' : 'N',
      p.expenses.publicPension, p.expenses.housingFunds,
      p.expenses.pensionSavings, p.expenses.irp,
      p.expenses.healthInsurance, p.expenses.lifeInsurance, p.expenses.disabledInsurance,
      p.expenses.medicalGeneral, p.expenses.medicalUnder6Over65, p.expenses.medicalInsuranceRefund,
      p.expenses.eduPreSchool, p.expenses.eduSchool, p.expenses.eduUniv, p.expenses.eduDisabled,
      p.expenses.creditCard, p.expenses.debitCard, p.expenses.cashReceipt, p.expenses.cultureSports, p.expenses.traditionalMarket, p.expenses.publicTransport, p.expenses.donationsReligious, p.expenses.donationsPublic, p.expenses.donationsGohyang
    ]);
    const ws = XLSX.utils.aoa_to_sheet([EXCEL_COLUMNS, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "연말정산데이터");
    XLSX.writeFile(wb, "내_연말정산_데이터_2025.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      const rows = json.slice(1);
      const newPeople: Person[] = rows.map((row, idx) => ({
        id: idx === 0 ? 'self' : Math.random().toString(36).substr(2, 9),
        applied: row[0] === 'Y',
        relationship: (row[1] as Relationship) || Relationship.CHILD_1,
        name: row[2] || '이름없음',
        birthYear: Number(row[3]) || 1990,
        isBasicDeduction: row[4] === 'Y',
        isIncomeOverLimit: row[5] === 'Y',
        isWomanDeduction: row[6] === 'Y',
        isDisabled: row[7] === 'Y',
        isSenior: row[8] === 'Y',
        isChildTaxCredit: row[9] === 'Y',
        expenses: {
          publicPension: Number(row[10]) || 0,
          housingFunds: Number(row[11]) || 0,
          pensionSavings: Number(row[12]) || 0,
          irp: Number(row[13]) || 0,
          healthInsurance: Number(row[14]) || 0,
          lifeInsurance: Number(row[15]) || 0,
          disabledInsurance: Number(row[16]) || 0,
          medicalGeneral: Number(row[17]) || 0,
          medicalUnder6Over65: Number(row[18]) || 0,
          medicalInsuranceRefund: Number(row[19]) || 0,
          eduPreSchool: Number(row[20]) || 0,
          eduSchool: Number(row[21]) || 0,
          eduUniv: Number(row[22]) || 0,
          eduDisabled: Number(row[23]) || 0,
          creditCard: Number(row[24]) || 0,
          debitCard: Number(row[25]) || 0,
          cashReceipt: Number(row[26]) || 0,
          cultureSports: Number(row[27]) || 0,
          traditionalMarket: Number(row[28]) || 0,
          publicTransport: Number(row[29]) || 0,
          donationsReligious: Number(row[30]) || 0,
          donationsPublic: Number(row[31]) || 0,
          donationsGohyang: Number(row[32]) || 0,
        }
      }));

      if (newPeople.length > 0) {
        setPeople(newPeople);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="min-h-screen pb-20 bg-slate-50 text-slate-900">
      {/* API Key Modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-900">Google Gemini API키 등록</h3>
                <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                PDF 자동 분석 및 AI 조언 기능을 사용하려면 <span className="font-bold text-slate-800">Gemini API 키</span>가 필요합니다. 
                입력하신 키는 브라우저에만 안전하게 저장됩니다.
              </p>
              <div className="space-y-4">
                <div className="relative">
                  <input 
                    type="password" 
                    placeholder="API 키를 입력하세요" 
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                {testMessage.text && (
                  <div className={`p-4 rounded-2xl text-xs font-bold ${testMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600' : testMessage.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                    {testMessage.text}
                  </div>
                )}
                <button 
                  onClick={handleTestAndSaveKey}
                  disabled={isTestingKey}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                >
                  {isTestingKey ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : '테스트 및 저장'}
                </button>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-indigo-500 font-bold hover:underline">
                  API 키가 없으신가요? 여기서 무료로 발급받기 →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading PDF processing */}
      {isProcessingPdf && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl flex flex-col items-center max-w-sm text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">국세청 PDF 분석 중!</h3>
            <h3 className="text-xl font-bold text-slate-900 mb-2">2분 이상 지연되면 새로고침!!</h3>
            <p className="text-slate-500 text-sm leading-relaxed">AI가 복잡한 서류를 꼼꼼하게 분석합니다.</p>
            <p className="text-red-500 text-sm leading-relaxed">자동입력이 불가한 부분이 있으니 꼭 확인하세요!</p>
          </div>
        </div>
      )}

      {/* 사용법 모달 */}
      {isGuideModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-600 rounded-2xl flex items-center justify-center text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                </div>
                <h3 className="text-xl font-black text-slate-900">연말정산 자동 계산기 사용 안내</h3>
              </div>
              <button onClick={() => setIsGuideModalOpen(false)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-10">
              {/* 사용 안내 섹션 */}
              <section className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                   <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                   <h4 className="text-lg font-black text-slate-900">&lt;연말정산 자동 계산기 사용 안내&gt;</h4>
                </div>
                
                <div className="grid gap-3">
                  {[
                    { step: 1,
                      title: "총급여를 입력한다.",
                      desc: "정확한 세율 구간 판정을 위해 필수입니다.",
                      notes: [
                        "총급여는 비과세를 제외한 금액이며, 일반적으로 아래의 경로에 금액과 일치함.",
                        "나이스-연말정산-공제자료-기본사항-총급여액(비과세제외)에 표시된 금액"
                      ] },
                    { 
                      step: 2, 
                      title: "자료를 입력한다. (한 가지 방식 활용)", 
                      desc: "국세청 PDF파일, 직접 입력, 액셀 양식 중 선택",
                      notes: [
                        "PDF 활용은 구글 API키를 먼저 등록한 경우 사용이 가능함.",
                        "공적연금과 보장성 보험 등은 자동 입력이 안되므로 직접 해당 금액을 입력해야함.",
                        "나이스-연말정산-공제자료-소득공제신고서 탭에서 거의 모든 자료 금액 확인 가능"
                      ]
                    },
                    { step: 3, title: "공제 대상 정보 입력", desc: "공제 대상의 관계와 이름 출생년도를 입력한다." },
                    { step: 4, title: "공제 항목 보완 및 작성", desc: "추가 공제 항목 등 내용을 보완하며, 입력된 자료는 항목을 불문하고 직접 수정 가능." },
                    { step: 5, title: "내용 확인", desc: "입력한 내용을 최종적으로 확인한다." },
                    { step: 6, title: "비교 하기", desc: "선택 '체크 박스'로 대상을 제외/추가하여 차액을 비교.(체크 해제는 공제 대상에서 삭제를 의미)" },
                    { step: 7, title: "결과 저장", desc: "입력자료는 보존되지 않기 때문에 결과 저장을 활용하여 액셀파일로 저장 후 필요시 업로드를 추천함. 총급여액은 항시 수동입력!!" }
                  ].map((item) => (
                    <div key={item.step} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-200 transition-colors">
                      <span className="shrink-0 w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center text-xs font-black shadow-sm">{item.step}</span>
                      <div className="flex-1">
                        <p className="font-bold text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                        {item.notes && (
                          <ul className="mt-2 space-y-1">
                            {item.notes.map((note, idx) => (
                              <li key={idx} className="text-xs text-blue-600 flex gap-1.5">
                                <span className="mt-1.5 w-1 h-1 bg-blue-400 rounded-full shrink-0"></span>
                                <span>{note}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 기타 안내 섹션 */}
              <section className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl shadow-slate-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl -mr-16 -mt-16"></div>
                <div className="flex items-center gap-2 mb-6">
                   <div className="w-1.5 h-6 bg-rose-500 rounded-full"></div>
                   <h4 className="text-lg font-black">&lt;기타 안내&gt;</h4>
                </div>
                <ul className="space-y-4">
                  {[
                    "2025귀속 연말 정산 기준을 반영함.",
                    "나이스에 우선 국세청 자료를 업로드하고 '소득공제신고서'의 내용을 확인하며 자료를 확인할 것을 추천함.",
                    "전년도 비교 추가 공제 등의 세부 사항은 반영되지 않음.",
                    "기본 공제 대상은 아니지만 의료비 공제를 위해 추가한 경우 소득 초과 체크!",
                    "소득 초과 체크 시 의료비 항목을 제외한 모든 항목의 금액이 0으로 변환됨.",
                    "자녀공제, 경로, 부녀자 공제는 관계 및 출생년도 입력시 자동으로 선택됨.",
                    "선택 체크박스를 활용하여 입력 정보를 삭제하지 않고 바로 공제 대상에서 제외/포함하여 계산결과를 확인함."                
                  ].map((txt, idx) => (
                    <li key={idx} className="text-sm flex gap-3 text-slate-300">
                      <span className="text-rose-500 font-black mt-0.5">•</span>
                      <span>{txt}</span>
                    </li>
                  ))}
                </ul>
                
                {/* 강조된 API 키 안내 박스 */}
                <div className="mt-8 p-5 bg-rose-500/10 border-2 border-rose-500/30 rounded-2xl flex gap-4 items-start animate-pulse shadow-inner shadow-rose-900/20">
                  <div className="bg-rose-500 p-2 rounded-xl text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  </div>
                  <p className="text-sm font-black text-rose-400 leading-relaxed">
                    PDF파일 불러오기, AI 절세 분석 기능은 <br/>
                    <span className="text-white underline decoration-rose-500 decoration-2 underline-offset-4">구글 API 키를 먼저 등록해야 사용 가능함.</span>
                  </p>
                </div>
              </section>
            </div>

            <div className="px-8 pb-8 pt-4 shrink-0">
              <button onClick={() => setIsGuideModalOpen(false)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                확인했습니다
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 조언 모달 */}
      {isAdviceModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 flex flex-col max-h-[90vh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                </div>
                <h3 className="text-xl font-black text-slate-900">AI 절세 정밀 분석</h3>
              </div>
              <button onClick={() => setIsAdviceModalOpen(false)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              </button>
            </div>
            <div className="p-8 overflow-y-auto">
              {loadingAdvice ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-6">
                  <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-center">
                    <p className="text-slate-900 font-bold text-lg">데이터 분석 중...</p>
                    <p className="text-slate-400 text-sm mt-1">Gemini AI가 최적의 절세 방안을 시뮬레이션하고 있습니다.</p>                    
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">현재 실효세율</span>
                      <span className="text-xs font-medium text-slate-400 italic">총급여 대비 세금 비중</span>
                    </div>
                    <div className="text-4xl font-black text-indigo-900">{result?.effectiveTaxRate.toFixed(2)}%</div>
                  </div>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
                      {advice || "분석 데이터를 불러오지 못했습니다."}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-8 pb-8 pt-4 shrink-0">
              <button onClick={() => setIsAdviceModalOpen(false)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all">
                분석 결과 확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Breakdown Modal */}
      {isResultModalOpen && result && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100">
              <h3 className="text-2xl font-black text-slate-900">2025 연말정산 상세 리포트</h3>
              <button onClick={() => setIsResultModalOpen(false)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              </button>
            </div>
            <div className="p-8 max-h-[70vh] overflow-y-auto">
              <div className="space-y-6">
                <SummaryRow label="01. 총급여" value={result.totalSalary} />
                <SummaryRow label="02. 근로소득공제" value={result.totalSalary - result.laborIncomeAmount} isNegative />
                <SummaryRow label="03. 근로소득금액" value={result.laborIncomeAmount} isSubtotal />
                <SummaryRow label="04. 소득공제 합계" value={result.totalDeductions} isNegative />
                <SummaryRow label="05. 과세표준" value={result.taxableStandard} isSubtotal />
                <SummaryRow label="06. 산출세액" value={result.calculatedTax} />
                <SummaryRow label="07. 근로소득 세액공제" value={result.laborIncomeTaxCredit} isNegative />
                <SummaryRow label="08. 기타 세액공제 합계" value={result.specialTaxCredits} isNegative />
                
                <div className="mt-8 p-6 bg-blue-600 rounded-[2rem] text-white space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-blue-100 font-bold text-sm uppercase tracking-wider">최종 결정세액</div>
                    </div>
                    <div className="text-3xl font-black">{result.finalTax.toLocaleString()} <span className="text-lg">원</span></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-8 pb-8 pt-4 text-center">
              <button onClick={() => setIsResultModalOpen(false)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 bg-slate-50 border-b border-slate-200 shadow-sm px-4 pt-6 md:px-8 pb-4">
        <header className="max-w-screen-2xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">[JH]연말정산 계산기(Ver_1.0)</h1>
            <p className="text-slate-500 font-medium uppercase tracking-wider text-[10px]">Professional Income Tax Adjustment System</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* 안내사항 버튼 (위치 앞으로 변경 및 Rose 색상 강조) */}
            <button 
              onClick={() => setIsGuideModalOpen(true)} 
              className="bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-700 transition-all shadow-md shadow-rose-100 flex items-center gap-2 ring-2 ring-rose-200 ring-offset-2 ring-offset-slate-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              안내사항(필독!)
            </button>

            {/* API키 등록 버튼 */}
            <button 
                onClick={() => {
                    setTempKey(apiKey);
                    setIsKeyModalOpen(true);
                    setTestMessage({ type: isApiValid ? 'success' : null, text: isApiValid ? "현재 유효한 키가 등록되어 있습니다." : "" });
                }} 
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md ${isApiValid ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              {isApiValid ? 'API키 수정' : 'API키 등록'}
            </button>

            {/* PDF 불러오기 버튼 */}
            <button 
              onClick={() => isApiValid && pdfInputRef.current?.click()} 
              disabled={!isApiValid}
              title={!isApiValid ? "API키 등록 후 이용 가능합니다" : "PDF 분석 시작"}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md ${isApiValid ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-rose-100 cursor-pointer' : 'bg-slate-200 text-slate-600 border border-slate-300 cursor-not-allowed'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              PDF 불러오기
            </button>

            <div className="flex items-center gap-1">
              <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 text-white px-4 py-2 rounded-l-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                엑셀 업로드
              </button>
              <button onClick={downloadTemplate} className="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-r-xl border border-indigo-200 text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1" title="엑셀 양식 다운로드">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              </button>
            </div>

            <button onClick={exportToExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              결과 저장
            </button>

            <input type="file" ref={pdfInputRef} onChange={handlePdfUpload} accept=".pdf" className="hidden" />
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
          </div>
        </header>

        <div className="max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-3 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase">총급여액(비과세제외)</span>
              <span className="text-[10px] font-bold text-blue-500">근로소득: {calculateLaborIncomeAmount(totalSalary).toLocaleString()}원</span>
            </div>
            <div className="relative">
              <input 
                type="text" 
                value={totalSalary.toLocaleString()}
                onChange={(e) => {
                  const val = Number(e.target.value.replace(/,/g, ''));
                  if (!isNaN(val)) setTotalSalary(val);
                }}
                className="w-full bg-slate-50 border-2 border-transparent rounded-xl px-4 py-2 text-xl font-black focus:bg-white focus:border-blue-500 transition-all outline-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-sm">원</span>
            </div>
          </section>

          <div className="lg:col-span-9 bg-slate-900 text-white p-4 rounded-3xl shadow-lg relative overflow-hidden flex flex-col md:flex-row gap-4 items-center border border-slate-800">
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
              <CompactResultItem label="소득공제" value={result?.totalDeductions || 0} />
              <CompactResultItem label="과세표준" value={result?.taxableStandard || 0} />
              <div className="col-span-2 flex items-center justify-between bg-white/5 px-6 py-2 rounded-2xl border border-white/5">
                <div className="relative">
                  <div className="text-[10px] text-slate-500 font-bold">결정 세액(소득세! 지방소득세 10% 별도)</div>
                  <div className="flex flex-col">
                    <div className="text-2xl font-black text-white flex items-center gap-2">
                      {result ? result.finalTax.toLocaleString() : 0} 
                      <span className="text-xs opacity-40">원</span>
                      {/* 실효세율 표시 추가 */}
                      <span className="text-[11px] text-emerald-400 font-bold ml-2">({result?.effectiveTaxRate.toFixed(2)}%)</span>
                      {taxDiff !== null && (
                        <div className={`absolute -top-6 left-0 px-2 py-0.5 rounded-lg text-[10px] font-black animate-bounce transition-opacity duration-500 flex items-center gap-1 shadow-lg ${taxDiff > 0 ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                          {taxDiff > 0 ? '+' : ''}{taxDiff.toLocaleString()}원
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 min-w-[100px]">
                  <button 
                    onClick={() => setIsResultModalOpen(true)}
                    className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-emerald-400 transition-all flex items-center justify-center gap-1 shadow-lg shadow-emerald-900/40"
                  >
                    상세 내역
                  </button>
                  
                  {/* AI 절세 분석 버튼 */}
                  <button 
                    onClick={() => isApiValid && handleGetAdvice()}
                    disabled={!isApiValid}
                    title={!isApiValid ? "API키 등록 후 이용 가능합니다" : "AI 분석 실행"}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1 shadow-lg ${isApiValid ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-900/40 cursor-pointer' : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'}`}
                  >
                    AI 절세 분석
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 md:px-8 mt-8">
        <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <span className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-lg font-bold">☆</span>
              인적공제 및 개별 지출 내역
              <span className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-lg font-bold">☆</span>
            </h2>
            <button 
              onClick={addPerson}
              className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-emerald-700 shadow-md shadow-emerald-100 transition-all"
            >
              + 대상 추가
            </button>
          </div>
          
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="min-w-[3400px] border-collapse bg-white">
              <thead className="sticky top-0 z-30">
                <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
                  <th className="px-4 py-4 sticky left-0 bg-slate-50 z-30 text-left border-r border-slate-200 shadow-sm text-slate-900">선택</th>
                  <th colSpan={6} className="px-4 py-4 text-center border-r border-slate-200 bg-blue-50/30 text-blue-600">추가공제 항목</th>
                  <th colSpan={4} className="px-4 py-4 text-center border-r border-slate-200 bg-emerald-50/30 text-emerald-600">연금 및 특별공제</th>
                  <th colSpan={3} className="px-4 py-4 text-center border-r border-slate-200 bg-purple-50/30 text-purple-600">보험료</th>
                  <th colSpan={3} className="px-4 py-4 text-center border-r border-slate-200 bg-red-50/30 text-red-600">의료비</th>
                  <th colSpan={4} className="px-4 py-4 text-center border-r border-slate-200 bg-yellow-50/30 text-yellow-600">교육비</th>
                  <th colSpan={9} className="px-4 py-4 text-center bg-slate-100/50 text-slate-600">기타 카드 및 기부금</th>
                </tr>
                <tr className="bg-white text-slate-500 text-[11px] font-bold border-b border-slate-100">
                  <th className="px-4 py-3 sticky left-0 bg-white z-30 border-r border-slate-200 shadow-sm">대상자 정보</th>
                  <th className="px-2 py-3 text-center">기본</th>
                  <th className="px-2 py-3 text-center">소득초과</th>
                  <th className="px-2 py-3 text-center">부녀자</th>
                  <th className="px-2 py-3 text-center">장애인</th>
                  <th className="px-2 py-3 text-center">경로</th>
                  <th className="px-2 py-3 text-center border-r border-slate-200">자녀</th>
                  <th className="px-2 py-3 text-center">공적연금</th>
                  <th className="px-2 py-3 text-center">주택자금</th>
                  <th className="px-2 py-3 text-center">연금저축</th>
                  <th className="px-2 py-3 text-center border-r border-slate-200">IRP</th>
                  <th className="px-2 py-3 text-center">건강보험</th>
                  <th className="px-2 py-3 text-center">보장성</th>
                  <th className="px-2 py-3 text-center border-r border-slate-200">장애보장</th>
                  <th className="px-2 py-3 text-center">일반의료</th>
                  <th className="px-2 py-3 text-center">65세/6세</th>
                  <th className="px-2 py-3 text-center border-r border-slate-200">실손환급</th>
                  <th className="px-2 py-3 text-center">취학전</th>
                  <th className="px-2 py-3 text-center">초중고</th>
                  <th className="px-2 py-3 text-center">대학생</th>
                  <th className="px-2 py-3 text-center border-r border-slate-200">장애특수</th>
                  <th className="px-2 py-3 text-center">신용카드</th>
                  <th className="px-2 py-3 text-center">직불카드</th>
                  <th className="px-2 py-3 text-center">현금영수증</th>
                  <th className="px-2 py-3 text-center">문화체육</th>
                  <th className="px-2 py-3 text-center">전통시장</th>
                  <th className="px-2 py-3 text-center">대중교통</th>
                  <th className="px-2 py-3 text-center">기부금(종교)</th>
                  <th className="px-2 py-3 text-center">기부금(단체)</th>
                  <th className="px-2 py-3 text-center">기부금(고향)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map(p => (
                  <tr key={p.id} className={`group hover:bg-slate-50 transition-all ${!p.applied ? 'opacity-40 grayscale' : ''}`}>
                    <td className="px-4 py-4 sticky left-0 bg-white z-20 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={p.applied} onChange={(e) => updatePerson(p.id, { applied: e.target.checked })} className="w-5 h-5 rounded-lg border-slate-300 text-emerald-600 cursor-pointer" />
                        <select value={p.relationship} onChange={(e) => updatePerson(p.id, { relationship: e.target.value as Relationship })} className="bg-slate-100 border-0 rounded-lg px-2 py-1 text-xs font-bold">
                          {Object.values(Relationship).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <input type="text" value={p.name} onChange={(e) => updatePerson(p.id, { name: e.target.value })} className="bg-transparent border-b border-transparent focus:border-emerald-500 outline-none w-20 px-1 font-bold text-xs" />
                        <input type="number" value={p.birthYear} onChange={(e) => updatePerson(p.id, { birthYear: Number(e.target.value) })} className="bg-transparent border-b border-transparent focus:border-emerald-500 outline-none w-16 px-1 text-xs" />
                        {p.id !== 'self' && (
                          <button onClick={() => removePerson(p.id)} className="text-slate-300 hover:text-red-500 transition-colors ml-auto"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg></button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-4 text-center"><MiniCheck value={p.isBasicDeduction} onChange={(v) => updatePerson(p.id, { isBasicDeduction: v })} disabled={p.isIncomeOverLimit} /></td>
                    <td className="px-2 py-4 text-center"><MiniCheck value={p.isIncomeOverLimit} onChange={(v) => updatePerson(p.id, { isIncomeOverLimit: v })} /></td>
                    <td className="px-2 py-4 text-center"><MiniCheck value={p.isWomanDeduction} onChange={(v) => updatePerson(p.id, { isWomanDeduction: v })} disabled={p.isIncomeOverLimit || p.relationship !== Relationship.SELF_F} /></td>
                    <td className="px-2 py-4 text-center"><MiniCheck value={p.isDisabled} onChange={(v) => updatePerson(p.id, { isDisabled: v })} disabled={p.isIncomeOverLimit} /></td>
                    <td className="px-2 py-4 text-center"><MiniCheck value={p.isSenior} onChange={(v) => updatePerson(p.id, { isSenior: v })} disabled={p.isIncomeOverLimit} /></td>
                    <td className="px-2 py-4 text-center border-r border-slate-200"><MiniCheck value={p.isChildTaxCredit} onChange={(v) => updatePerson(p.id, { isChildTaxCredit: v })} disabled={p.isIncomeOverLimit || ![Relationship.CHILD_1, Relationship.CHILD_2, Relationship.CHILD_3, Relationship.CHILD_4].includes(p.relationship)} /></td>
                    
                    <ExpenseCell val={p.expenses.publicPension} onChange={(v) => updatePersonExpense(p.id, 'publicPension', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.housingFunds} onChange={(v) => updatePersonExpense(p.id, 'housingFunds', v)} disabled={p.isIncomeOverLimit} />
                    {/* 개인연금 항목 */}
                    <ExpenseCell val={p.expenses.pensionSavings} onChange={(v) => updatePersonExpense(p.id, 'pensionSavings', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.irp} onChange={(v) => updatePersonExpense(p.id, 'irp', v)} isGroupEnd disabled={p.isIncomeOverLimit} />

                    <ExpenseCell val={p.expenses.healthInsurance} onChange={(v) => updatePersonExpense(p.id, 'healthInsurance', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.lifeInsurance} onChange={(v) => updatePersonExpense(p.id, 'lifeInsurance', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.disabledInsurance} onChange={(v) => updatePersonExpense(p.id, 'disabledInsurance', v)} isGroupEnd disabled={p.isIncomeOverLimit} />
                    
                    <ExpenseCell val={p.expenses.medicalGeneral} onChange={(v) => updatePersonExpense(p.id, 'medicalGeneral', v)} />
                    <ExpenseCell val={p.expenses.medicalUnder6Over65} onChange={(v) => updatePersonExpense(p.id, 'medicalUnder6Over65', v)} />
                    <ExpenseCell val={p.expenses.medicalInsuranceRefund} onChange={(v) => updatePersonExpense(p.id, 'medicalInsuranceRefund', v)} isGroupEnd />

                    <ExpenseCell val={p.expenses.eduPreSchool} onChange={(v) => updatePersonExpense(p.id, 'eduPreSchool', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.eduSchool} onChange={(v) => updatePersonExpense(p.id, 'eduSchool', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.eduUniv} onChange={(v) => updatePersonExpense(p.id, 'eduUniv', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.eduDisabled} onChange={(v) => updatePersonExpense(p.id, 'eduDisabled', v)} isGroupEnd disabled={p.isIncomeOverLimit} />

                    <ExpenseCell val={p.expenses.creditCard} onChange={(v) => updatePersonExpense(p.id, 'creditCard', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.debitCard} onChange={(v) => updatePersonExpense(p.id, 'debitCard', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.cashReceipt} onChange={(v) => updatePersonExpense(p.id, 'cashReceipt', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.cultureSports} onChange={(v) => updatePersonExpense(p.id, 'cultureSports', v)} disabled={p.isIncomeOverLimit || totalSalary > 70000000} />
                    <ExpenseCell val={p.expenses.traditionalMarket} onChange={(v) => updatePersonExpense(p.id, 'traditionalMarket', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.publicTransport} onChange={(v) => updatePersonExpense(p.id, 'publicTransport', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.donationsReligious} onChange={(v) => updatePersonExpense(p.id, 'donationsReligious', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.donationsPublic} onChange={(v) => updatePersonExpense(p.id, 'donationsPublic', v)} disabled={p.isIncomeOverLimit} />
                    <ExpenseCell val={p.expenses.donationsGohyang} onChange={(v) => updatePersonExpense(p.id, 'donationsGohyang', v)} disabled={p.isIncomeOverLimit} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="max-w-screen-2xl mx-auto mt-20 pb-10 text-center text-slate-900 text-sm font-bold border-t border-slate-100 pt-10 px-8">
        <p>다양한 요건 별로 실제 세율과 차이가 발생할 수 있습니다. 꼭 확인 부탁드립니다.</p>
        <p className="text-[11px] mt-2 font-medium">연말정산 데이터는 브라우저 내부에서만 처리되며 AI 분석 시에만 익명화되어 전달됩니다.</p>
        <p className="text-[11px] mt-2 font-medium">배우자와 부양가족을 나누는 과정을 비교할 때 나이스 상에서 공제자 추가 제외가 불편하여 편하게 계산하고자 만든 것으로 가볍게 사용해 주시면 좋겠습니다 :)</p>
      </footer>
    </div>
  );
};

const CompactResultItem: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="bg-white/5 p-2 rounded-2xl border border-white/5">
    <div className="text-[9px] font-black text-slate-500 mb-0.5 uppercase tracking-tighter">{label}</div>
    <div className="text-lg font-black">{value.toLocaleString()} <span className="text-[9px] font-normal opacity-40">원</span></div>
  </div>
);

const SummaryRow: React.FC<{ label: string; value: number; isNegative?: boolean; isSubtotal?: boolean }> = ({ label, value, isNegative, isSubtotal }) => (
  <div className={`flex justify-between items-center py-3 ${isSubtotal ? 'border-t-2 border-slate-900 pt-4 mt-2' : 'border-b border-slate-50'}`}>
    <span className={`text-sm ${isSubtotal ? 'font-black text-slate-900' : 'font-bold text-slate-500'}`}>{label}</span>
    <span className={`text-base font-black ${isNegative ? 'text-red-500' : isSubtotal ? 'text-slate-900' : 'text-slate-700'}`}>
      {isNegative ? '-' : ''}{Math.abs(value).toLocaleString()} <span className="text-xs font-normal opacity-40 ml-1">원</span>
    </span>
  </div>
);

const MiniCheck: React.FC<{ value: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <input 
    type="checkbox" 
    checked={value} 
    onChange={(e) => !disabled && onChange(e.target.checked)}
    disabled={disabled}
    className={`w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer ${disabled ? 'opacity-20 cursor-not-allowed' : ''}`}
  />
);

const ExpenseCell: React.FC<{ val: number; onChange: (v: number) => void; isGroupEnd?: boolean; disabled?: boolean }> = ({ val, onChange, isGroupEnd, disabled }) => (
  <td className={`px-2 py-4 ${isGroupEnd ? 'border-r border-slate-200' : ''}`}>
    <div className="relative">
      <input 
        type="text" 
        value={val === 0 ? '' : val.toLocaleString()}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.replace(/,/g, '');
          const parsed = Number(raw);
          if (!isNaN(parsed)) onChange(parsed);
        }}
        className={`w-32 bg-slate-50 border border-slate-100 rounded-md p-1.5 text-[11px] font-bold text-slate-700 focus:bg-white focus:border-blue-400 outline-none text-right pr-6 ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 pointer-events-none font-normal">원</span>
    </div>
  </td>
);

export default App;
