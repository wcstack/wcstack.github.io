/**
 * 令和8年分（2026年分）所得税の税制定数と計算式。
 *
 * すべて純粋関数で、DOM にも state にも依存しない。年度が変わったらこのファイルを
 * 複製して tax-rules-2027.js を作り、state.js・inputs.js の import を切り替え、
 * test/tax-rules.test.mjs の境界値を更新する。
 *
 * 金額はすべて円単位の整数で計算する。率は小数ではなく [分子, 分母] の整数の組で持ち、mulRate で掛ける
 * （0.011 のような小数は 2 進数で正確に表せず、23,000 × 0.011 が 252.99… になって 1円ずれるため）。
 * 年度更新で率を書き換えるときも、1.1% は [11, 1000] のように整数で書く。
 *
 * 令和7年分（tax-rules-2025.js）からの変更（令和8年度税制改正。令和8年分以後の所得税に適用）
 *   - 基礎控除: 本則 58万 → 62万円、特例加算は合計所得 489万円以下 42万・655万円以下 5万（令和8・9年分）
 *   - 同一生計配偶者・扶養親族の合計所得要件: 58万 → 62万円以下（配偶者特別控除・特定親族特別控除の下限も 62万円超に）
 *   - ひとり親の子の総所得金額等の要件: 58万 → 62万円以下 / 勤労学生の合計所得要件: 85万 → 89万円以下
 *   - 家内労働者等の必要経費の最低保障額: 65万 → 69万円
 *   - 生命保険料控除: 23歳未満の扶養親族がいる場合の新契約の一般生命保険料の上限 6万円（令和7年度改正で
 *     令和8年分に創設、令和8年度改正で令和9年分まで延長）
 * 令和9年分以後に適用され、令和8年分には関係しない改正（このファイルには入れていない）
 *   - ひとり親控除 38万円 / 青色申告特別控除の見直し（65万・75万円）/ 極めて高い水準の所得に対する
 *     追加課税の基準 1億6,500万円・税率 30% / 防衛特別所得税 1% の創設と復興特別所得税 1.1% への引下げ
 *
 * 出典（国税庁 タックスアンサー）
 *   No.2260 所得税の税率 / No.1199 基礎控除 / No.1191 配偶者控除 / No.1195 配偶者特別控除
 *   No.1180 扶養控除 / No.1177 特定親族特別控除 / No.1140 生命保険料控除 / No.1145 地震保険料控除
 *   No.1170 寡婦控除 / No.1171 ひとり親控除 / No.1175 勤労学生控除 / No.1160 障害者控除
 *   No.1120 医療費控除 / No.1129 セルフメディケーション税制 / No.1150 寄附金控除 / No.1000 計算例
 *   No.2075 青色事業専従者給与と事業専従者控除（専従者は配偶者控除・扶養控除の対象外、白色の専従者控除）
 *   No.2072 青色申告特別控除 / No.1810 家内労働者等の必要経費の特例
 * 出典（国税庁「令和８年度税制改正（所得税の基礎控除の引上げ等関係）Ｑ＆Ａ」令和8年5月）
 *   基礎控除・扶養親族等の所得要件・家内労働者等の特例の適用時期と金額
 * 出典（財務省「令和８年度税制改正の大綱」令和7年12月26日閣議決定）
 *   勤労学生の所得要件・生命保険料控除の特例の延長・令和9年分以後の改正
 * 出典（確定申告書等作成コーナー 令和7年分 手順4。端数処理は国税通則法によるもので令和8年分も同じ）
 *   申告納税額（第一表 50）・第3期分の税額（同 52・53）の端数処理
 */

export const TAX_YEAR = 2026;
export const YEAR_LABEL = "令和8年分（2026年分）";

const num = (x) => Number(x) || 0;
const lookup = (table, amount) => table.find(([limit]) => amount <= limit);
const floor100 = (v) => Math.floor(v / 100) * 100;

/**
 * 金額 × 率 の 1円未満切り捨てを、整数だけで計算する。率は [分子, 分母] の整数の組。
 * 金額 × 分子 が Number で正確に表せる整数（2^53 未満）なら、そのまま割って切り捨てても誤差は出ない。
 * 超えるとき（課税所得が 200兆円前後を超えるなど）だけ BigInt で計算する。
 * @param amount 0 以上の整数（円）
 */
export function mulRate(amount, [n, d]) {
  const product = amount * n;
  if (Number.isSafeInteger(product) || !Number.isInteger(amount)) return Math.floor(product / d);
  return Number((BigInt(amount) * BigInt(n)) / BigInt(d));
}

/** 率の表示（[5, 100] → "5%"、[21, 1000] → "2.1%"） */
export const percentLabel = ([n, d]) => `${(n * 100) / d}%`;

/** 人数として使える値か（0 以上の整数）。小数・負数・数値以外は計算に使わない。 */
export const isCount = (n) => Number.isInteger(n) && n >= 0;

// ---- 所得税の速算表: [この金額「未満」まで, 税率 [分子, 分母], 控除額] ----
// 国税庁の表は「1,000円から1,949,000円まで 5%」「1,950,000円から … 10%」なので、上限は「未満」で引く
// （他の表は「以下」。税額は境界で連続しているので金額は同じだが、税率の表示が 1 段ずれる）
export const TAX_BRACKETS = [
  [1_950_000, [5, 100], 0],
  [3_300_000, [10, 100], 97_500],
  [6_950_000, [20, 100], 427_500],
  [9_000_000, [23, 100], 636_000],
  [18_000_000, [33, 100], 1_536_000],
  [40_000_000, [40, 100], 2_796_000],
  [Infinity, [45, 100], 4_796_000],
];

// ---- 基礎控除: [合計所得金額の上限, 控除額]（令和8年・9年分の特例加算込み） ----
// 本則 62万円（合計所得 2,350万円以下）＋ 特例加算（489万円以下 42万円、489万円超 655万円以下 5万円）
export const BASIC_DEDUCTION = [
  [4_890_000, 1_040_000],
  [6_550_000, 670_000],
  [23_500_000, 620_000],
  [24_000_000, 480_000],
  [24_500_000, 320_000],
  [25_000_000, 160_000],
  [Infinity, 0],
];

export const RECONSTRUCTION_RATE = [21, 1000];   // 復興特別所得税 2.1%（基準所得税額に対して。1.1% への引下げは令和9年分から）
// 令和7年分から: 基準所得金額が 3億3,000万円を超えると追加課税（いわゆるミニマムタックス）の対象になり得る。
// このツールでは計算しないため、超えたら対象範囲外として扱う（1億6,500万円への引下げは令和9年分から）
export const MINIMUM_TAX_THRESHOLD = 330_000_000;

// ---- 青色申告特別控除 ----
// 55万・65万は期限内申告が要件（期限後は 10万）。65万はさらに e-Tax での申告か優良な電子帳簿の保存（No.2072）
// （令和9年分から 55万 → e-Tax 必須で 65万、65万 → 優良な電子帳簿も必須で 75万に見直し。令和8年分は従来どおり）
export const BLUE_DEDUCTION = { white: 0, blue10: 100_000, blue55: 550_000, blue65: 650_000 };

// ---- 事業専従者控除（白色申告のみ。No.2075） ----
// 専従者 1 人ごとに「上限（配偶者 86万円・その他 50万円）」と「控除前の事業所得 ÷（専従者の数＋1）」の小さい方
export const FAMILY_EMPLOYEE_SPOUSE_CAP = 860_000;
export const FAMILY_EMPLOYEE_OTHER_CAP = 500_000;

// ---- 家内労働者等の必要経費の特例（No.1810）: 令和8年分の最低保障額（令和7年分 65万円）。収入金額が限度 ----
export const HOME_WORKER_MIN_EXPENSES = 690_000;

// ---- 生命保険料控除 ----
export const LIFE_INSURANCE_CAP = 120_000;          // 全体の上限
export const LIFE_NEW_CAP = 40_000;                 // 新制度 各区分の上限
export const LIFE_OLD_CAP = 50_000;                 // 旧制度 各区分の上限
// 令和8・9年分の特例: 23歳未満の扶養親族がいる場合、新契約の一般生命保険料の上限（新旧を合わせる場合も）。
// 介護医療保険料・個人年金保険料と、全体の上限 12万円は変わらない（No.1140）
export const LIFE_NEW_GENERAL_YOUNG_CAP = 60_000;

// ---- 地震保険料控除 ----
export const EARTHQUAKE_CAP = 50_000;
export const OLD_LONG_TERM_CAP = 15_000;

// ---- 配偶者控除 / 配偶者特別控除 ----
export const SPOUSE_INCOME_LIMIT = 620_000;         // 配偶者控除: 配偶者の合計所得がこれ以下（令和7年分 58万円）
export const SPOUSE_SPECIAL_LIMIT = 1_330_000;      // 配偶者特別控除: これ以下（62万円超 133万円以下）
export const TAXPAYER_INCOME_LIMIT = 10_000_000;    // 本人の合計所得がこれを超えると対象外
export const SPOUSE_DEDUCTION = [380_000, 260_000, 130_000];            // 本人 900万以下 / 950万以下 / 1,000万以下
export const SPOUSE_DEDUCTION_ELDERLY = [480_000, 320_000, 160_000];    // 老人控除対象配偶者（70歳以上）
export const SPOUSE_SPECIAL = [   // [配偶者の合計所得の上限, [3列]]
  [950_000, [380_000, 260_000, 130_000]],
  [1_000_000, [360_000, 240_000, 120_000]],
  [1_050_000, [310_000, 210_000, 110_000]],
  [1_100_000, [260_000, 180_000, 90_000]],
  [1_150_000, [210_000, 140_000, 70_000]],
  [1_200_000, [160_000, 110_000, 60_000]],
  [1_250_000, [110_000, 80_000, 40_000]],
  [1_300_000, [60_000, 40_000, 20_000]],
  [1_330_000, [30_000, 20_000, 10_000]],
];

// ---- 扶養控除 ----
// 配偶者・扶養親族・特定親族のいずれも、事業専従者（その年に青色事業専従者給与を受けた人、
// 白色申告者の事業専従者）は対象外（No.2075 / No.1195 / No.1177）
export const DEPENDENT_INCOME_LIMIT = 620_000;      // 扶養親族: 合計所得がこれ以下（令和7年分 58万円）
// 19〜22歳（specific）は所得で自動判定: 62万円以下 → 特定扶養親族、62万円超 123万円以下 → 特定親族特別控除
// under23: 年末に 23歳未満の区分（生命保険料控除の特例の判定に使う）。一般の控除対象扶養親族は
// 16〜18歳（teen）と 23〜69歳（general）で控除額は同じだが、この判定のために区分を分けている
export const DEPENDENT_KINDS = {
  teen:             { label: "一般の控除対象扶養親族（16〜18歳）", amount: 380_000, under23: true },
  specific:         { label: "19〜22歳（特定扶養親族／特定親族特別控除）", amount: 630_000, under23: true },
  general:          { label: "一般の控除対象扶養親族（23〜69歳）", amount: 380_000 },
  elderlyLiving:    { label: "老人扶養親族・同居老親等（70歳以上）", amount: 580_000 },
  elderlyOther:     { label: "老人扶養親族・同居老親等以外（70歳以上）", amount: 480_000 },
  young:            { label: "16歳未満（所得税の控除なし）", amount: 0, under23: true },
};
// 旧版の保存データにある区分名 → 現在の区分名
// （令和7年分の general は 16〜18歳も含んでいたが、23〜69歳の general としてそのまま読む。年齢区分は年ごとに見直しが要る）
export const DEPENDENT_KIND_ALIASES = { specificRelative: "specific" };
// 特定親族特別控除（令和7年分新設）: [親族の合計所得の上限, 控除額]。62万円超 123万円以下（令和7年分は 58万円超）
export const SPECIFIC_RELATIVE_LIMIT = 1_230_000;
export const SPECIFIC_RELATIVE = [
  [850_000, 630_000], [900_000, 610_000], [950_000, 510_000], [1_000_000, 410_000], [1_050_000, 310_000],
  [1_100_000, 210_000], [1_150_000, 110_000], [1_200_000, 60_000], [1_230_000, 30_000],
];

// ---- 本人に関する控除 ----
export const SINGLE_PARENT_DEDUCTION = 350_000;   // 38万円への引上げは令和9年分から
export const WIDOW_DEDUCTION = 270_000;
export const PERSONAL_STATUS_INCOME_LIMIT = 5_000_000;   // 寡婦・ひとり親: 本人の合計所得 500万円以下
export const WORKING_STUDENT_DEDUCTION = 270_000;
export const WORKING_STUDENT_INCOME_LIMIT = 890_000;     // 勤労学生: 合計所得 89万円以下（令和7年分 85万円。他の要件は本人確認）
export const DISABILITY = { general: 270_000, special: 400_000, specialLiving: 750_000 };

// ---- 医療費控除 / セルフメディケーション税制 / 寄附金控除 ----
export const MEDICAL_THRESHOLD = 100_000;
export const MEDICAL_THRESHOLD_RATE = [5, 100];
export const MEDICAL_CAP = 2_000_000;
export const SELF_MEDICATION_THRESHOLD = 12_000;
export const SELF_MEDICATION_CAP = 88_000;
export const DONATION_FLOOR = 2_000;
export const DONATION_RATE = [40, 100];

// =====================================================================
// 所得
// =====================================================================

/**
 * 家内労働者等の必要経費の特例。実際の経費が最低保障額（69万円）に満たなければ、
 * 最低保障額（ただし収入金額が限度）を必要経費にする。給与所得がないことが前提（このツールの対象範囲）。
 */
export function homeWorkerExpenses(actualExpenses, revenue) {
  const actual = Math.max(0, num(actualExpenses));
  return Math.max(actual, Math.min(HOME_WORKER_MIN_EXPENSES, Math.max(0, num(revenue))));
}

/**
 * 事業専従者控除（白色申告のみ）の合計。青色は専従者給与を必要経費として入力するので 0。
 * @param profit 控除前の事業所得（収入 − 必要経費）
 * @param spouse 配偶者が事業専従者なら true
 * @param others 配偶者以外の事業専従者の人数（0 以上の整数でなければ 0 人として扱う）
 */
export function familyEmployeeDeduction(filingType, profit, spouse, others) {
  if (filingType !== "white") return 0;
  const p = num(profit);
  const nOthers = isCount(others) ? others : 0;
  const n = (spouse ? 1 : 0) + nOthers;
  if (p <= 0 || n === 0) return 0;
  const share = Math.floor(p / (n + 1));
  return (spouse ? Math.min(FAMILY_EMPLOYEE_SPOUSE_CAP, share) : 0) + nOthers * Math.min(FAMILY_EMPLOYEE_OTHER_CAP, share);
}

/** 青色申告特別控除。差引金額（収入 − 経費）を上限とし、赤字なら 0。 */
export function blueDeduction(filingType, profitBeforeBlue) {
  const max = BLUE_DEDUCTION[filingType] ?? 0;
  return Math.max(0, Math.min(max, num(profitBeforeBlue)));
}

// =====================================================================
// 所得控除
// =====================================================================

export function basicDeduction(totalIncome) {
  return lookup(BASIC_DEDUCTION, Math.max(0, num(totalIncome)))[1];
}

/** 新制度（平成24年1月1日以後の契約）。端数切り上げ、上限 4万円。 */
export function lifeNew(p) {
  p = num(p);
  if (p <= 0) return 0;
  if (p <= 20_000) return p;
  if (p <= 40_000) return Math.ceil(p / 2 + 10_000);
  if (p <= 80_000) return Math.ceil(p / 4 + 20_000);
  return LIFE_NEW_CAP;
}

/** 旧制度（平成23年12月31日以前の契約）。端数切り上げ、上限 5万円。 */
export function lifeOld(p) {
  p = num(p);
  if (p <= 0) return 0;
  if (p <= 25_000) return p;
  if (p <= 50_000) return Math.ceil(p / 2 + 12_500);
  if (p <= 100_000) return Math.ceil(p / 4 + 25_000);
  return LIFE_OLD_CAP;
}

/**
 * 令和8・9年分の特例: 23歳未満の扶養親族がいる場合の新制度の一般生命保険料。端数切り上げ、上限 6万円。
 * 介護医療保険料・個人年金保険料には使わない（No.1140）。
 */
export function lifeNewGeneralYoung(p) {
  p = num(p);
  if (p <= 0) return 0;
  if (p <= 30_000) return p;
  if (p <= 60_000) return Math.ceil(p / 2 + 15_000);
  if (p <= 120_000) return Math.ceil(p / 4 + 30_000);
  return LIFE_NEW_GENERAL_YOUNG_CAP;
}

// 新旧それぞれの控除額から: 新・旧・（新＋旧, 上限 cap）のうち最大（片方だけならその額）
const combineNewOld = (n, o, cap) => (n > 0 && o > 0 ? Math.max(n, o, Math.min(n + o, cap)) : Math.max(n, o));

/** 同じ区分に新旧両方がある場合: 新・旧・（新＋旧, 上限4万円）のうち最大。 */
export function lifeCombined(pNew, pOld) {
  return combineNewOld(lifeNew(pNew), lifeOld(pOld), LIFE_NEW_CAP);
}

/**
 * 一般生命保険料控除（新旧）。23歳未満の扶養親族がいれば、新制度の式と新旧合算の上限が
 * 6万円の特例になる（旧制度だけの上限 5万円は変わらない）。
 */
export function lifeGeneral(pNew, pOld, youngDependent = false) {
  return youngDependent
    ? combineNewOld(lifeNewGeneralYoung(pNew), lifeOld(pOld), LIFE_NEW_GENERAL_YOUNG_CAP)
    : lifeCombined(pNew, pOld);
}

/**
 * 生命保険料控除の内訳と合計（合計は 12万円まで）。
 * @param youngDependent 23歳未満の扶養親族がいる（一般生命保険料の特例。isYoungDependent で判定）
 */
export function lifeInsuranceDeduction({ newGeneral, oldGeneral, care, newPension, oldPension, youngDependent = false }) {
  const general = lifeGeneral(newGeneral, oldGeneral, youngDependent);
  const careAmount = lifeNew(care);
  const pension = lifeCombined(newPension, oldPension);
  return { general, care: careAmount, pension, total: Math.min(general + careAmount + pension, LIFE_INSURANCE_CAP) };
}

/** 旧長期損害保険料（平成18年までの契約）。上限 1.5万円。 */
export function oldLongTerm(p) {
  p = num(p);
  if (p <= 0) return 0;
  if (p <= 10_000) return p;
  if (p <= 20_000) return Math.ceil(p / 2 + 5_000);
  return OLD_LONG_TERM_CAP;
}

/**
 * 地震保険料控除。地震保険料は 5万円まで、旧長期損害保険料と合わせても 5万円まで。
 * 1 つの契約で地震保険料と旧長期損害保険料の両方を払っている場合は、どちらか一方だけを
 * 入力する前提（納税者の選択で一方のみ控除。No.1145）。この関数は入力された両方を合算する。
 */
export function earthquakeDeduction(premium, oldLongTermPremium) {
  const eq = Math.min(Math.max(0, num(premium)), EARTHQUAKE_CAP);
  return Math.min(eq + oldLongTerm(oldLongTermPremium), EARTHQUAKE_CAP);
}

/** 本人の合計所得による列（0: 900万以下, 1: 950万以下, 2: 1,000万以下, -1: 対象外）。 */
export function taxpayerColumn(income) {
  income = num(income);
  if (income <= 9_000_000) return 0;
  if (income <= 9_500_000) return 1;
  if (income <= TAXPAYER_INCOME_LIMIT) return 2;
  return -1;
}

/**
 * 配偶者控除 / 配偶者特別控除。配偶者が事業専従者なら、どちらも対象外。
 * @returns {{ kind: "none"|"spouse"|"special", amount: number }}
 */
export function spouseDeduction({ hasSpouse, taxpayerIncome, spouseIncome, elderly, familyEmployee = false }) {
  const col = taxpayerColumn(taxpayerIncome);
  if (!hasSpouse || familyEmployee || col < 0) return { kind: "none", amount: 0 };
  const inc = Math.max(0, num(spouseIncome));
  if (inc <= SPOUSE_INCOME_LIMIT) {
    return { kind: "spouse", amount: (elderly ? SPOUSE_DEDUCTION_ELDERLY : SPOUSE_DEDUCTION)[col] };
  }
  if (inc <= SPOUSE_SPECIAL_LIMIT) {
    return { kind: "special", amount: lookup(SPOUSE_SPECIAL, inc)[1][col] };
  }
  return { kind: "none", amount: 0 };
}

/**
 * 扶養親族 1 人分の判定と控除額。親族の合計所得から自動判定する（年齢区分・同居などは本人確認）。
 * @returns {{ status: "dependent"|"specificRelative"|"noDeduction"|"overIncome"|"familyEmployee"|"unknown", amount: number }}
 *   dependent: 扶養控除 / specificRelative: 特定親族特別控除 / noDeduction: 16歳未満（控除なし）/
 *   overIncome: 所得が上限を超えて対象外 / familyEmployee: 事業専従者のため対象外
 */
export function dependentStatus(kind, income, familyEmployee = false) {
  kind = DEPENDENT_KIND_ALIASES[kind] ?? kind;
  const base = DEPENDENT_KINDS[kind];
  if (!base) return { status: "unknown", amount: 0 };
  if (kind === "young") return { status: "noDeduction", amount: 0 };
  if (familyEmployee) return { status: "familyEmployee", amount: 0 };
  const inc = Math.max(0, num(income));
  if (inc <= DEPENDENT_INCOME_LIMIT) return { status: "dependent", amount: base.amount };
  if (kind === "specific" && inc <= SPECIFIC_RELATIVE_LIMIT) {
    return { status: "specificRelative", amount: lookup(SPECIFIC_RELATIVE, inc)[1] };
  }
  return { status: "overIncome", amount: 0 };
}

/** 扶養親族 1 人分の控除額（扶養控除または特定親族特別控除）。 */
export function dependentDeduction(kind, income, familyEmployee = false) {
  return dependentStatus(kind, income, familyEmployee).amount;
}

/**
 * 年末に 23歳未満の扶養親族か（生命保険料控除の特例の判定）。扶養親族は合計所得 62万円以下で
 * 事業専従者でない親族で、16歳未満も含む（16歳未満は所得欄がないので所得要件は満たすものとして扱う）。
 * 特定親族特別控除の対象（19〜22歳で 62万円超）は扶養親族ではないので含めない。
 */
export function isYoungDependent(kind, income, familyEmployee = false) {
  kind = DEPENDENT_KIND_ALIASES[kind] ?? kind;
  if (!DEPENDENT_KINDS[kind]?.under23 || familyEmployee) return false;
  return kind === "young" || Math.max(0, num(income)) <= DEPENDENT_INCOME_LIMIT;
}

/** 寡婦控除 / ひとり親控除。本人の合計所得 500万円以下が要件。 */
export function personalDeduction(status, totalIncome) {
  if (num(totalIncome) > PERSONAL_STATUS_INCOME_LIMIT) return 0;
  if (status === "singleParent") return SINGLE_PARENT_DEDUCTION;
  if (status === "widow") return WIDOW_DEDUCTION;
  return 0;
}

/** 勤労学生控除。合計所得 89万円以下が要件（勤労以外の所得 10万円以下・学生である要件は本人確認）。 */
export function workingStudentDeduction(checked, totalIncome) {
  return checked && num(totalIncome) <= WORKING_STUDENT_INCOME_LIMIT ? WORKING_STUDENT_DEDUCTION : 0;
}

/** 障害者控除。人数が 0 以上の整数でない区分（0.5 人・負数など）は計算に使わない（0 人扱い）。 */
export function disabilityDeduction(general, special, specialLiving) {
  const count = (n) => (isCount(n) ? n : 0);
  return count(general) * DISABILITY.general
       + count(special) * DISABILITY.special
       + count(specialLiving) * DISABILITY.specialLiving;
}

/** 医療費控除の足切り額: 10万円と総所得金額等の 5% の小さい方。 */
export function medicalThreshold(totalIncome) {
  return Math.min(MEDICAL_THRESHOLD, mulRate(Math.max(0, num(totalIncome)), MEDICAL_THRESHOLD_RATE));
}

/**
 * 医療費控除（mode: "medical"）またはセルフメディケーション税制（mode: "selfMed"）。
 * セルフメディケーション税制は「一定の取組」（健康診査・予防接種など）を行っていることが要件。
 */
export function medicalDeduction({ mode, paid, reimbursed, otcPaid, otcReimbursed, otcQualified, totalIncome }) {
  if (mode === "medical") {
    const v = num(paid) - num(reimbursed) - medicalThreshold(totalIncome);
    return Math.max(0, Math.min(v, MEDICAL_CAP));
  }
  if (mode === "selfMed") {
    if (!otcQualified) return 0;
    const v = num(otcPaid) - num(otcReimbursed) - SELF_MEDICATION_THRESHOLD;
    return Math.max(0, Math.min(v, SELF_MEDICATION_CAP));
  }
  return 0;
}

/** 寄附金控除: 特定寄附金（総所得金額等の 40% が上限）− 2,000円。 */
export function donationDeduction(donation, totalIncome) {
  const capped = Math.min(Math.max(0, num(donation)), mulRate(Math.max(0, num(totalIncome)), DONATION_RATE));
  return Math.max(0, capped - DONATION_FLOOR);
}

// =====================================================================
// 税額
// =====================================================================

/** 課税される所得金額（1,000円未満切り捨て、マイナスなら 0）。 */
export function taxableIncome(totalIncome, deductionTotal) {
  const v = num(totalIncome) - num(deductionTotal);
  return v <= 0 ? 0 : Math.floor(v / 1000) * 1000;
}

/** 速算表の段。上限は「未満」で引く（1,950,000円ちょうどは 10% の段）。 */
export function bracketFor(taxable) {
  const amount = Math.max(0, num(taxable));
  return TAX_BRACKETS.find(([limit]) => amount < limit);
}

/** 課税所得に対する税額（税額控除前）。速算表: 課税所得 × 税率 − 控除額。 */
export function incomeTaxBeforeCredits(taxable) {
  taxable = Math.max(0, num(taxable));
  const [, rate, sub] = bracketFor(taxable);
  return Math.max(0, mulRate(taxable, rate) - sub);
}

/** 基準所得税額（差引所得税額）: 税額控除（配当控除・住宅ローン控除など）を差し引いた後。 */
export function baseIncomeTax(taxBeforeCredits, taxCredits) {
  return Math.max(0, num(taxBeforeCredits) - Math.max(0, num(taxCredits)));
}

/** 復興特別所得税: 基準所得税額 × 2.1%（1円未満切り捨て）。 */
export function reconstructionTax(baseTax) {
  return mulRate(Math.max(0, num(baseTax)), RECONSTRUCTION_RATE);
}

/**
 * 源泉徴収税額・予定納税額との精算（確定申告書 第一表の順序）。
 *   申告納税額 ＝ 所得税及び復興特別所得税の額 − 源泉徴収税額
 *               黒字なら 100円未満切り捨て、赤字ならそのまま
 *   第3期分の税額 ＝ 申告納税額 − 予定納税額
 *               黒字なら 100円未満切り捨てて「納める税金」、赤字ならそのまま「還付される税金」
 * 予定納税額は申告納税額を端数処理した後に差し引く（先に引くと還付額が変わる）。
 * @returns {{ declaredTax: number, balance: number, isRefund: boolean, payment: number, refund: number }}
 *   declaredTax: 申告納税額 / balance: 第3期分の税額（端数処理前の差引き）
 */
export function settle(totalTax, withholding, prepaidTax) {
  const afterWithholding = num(totalTax) - num(withholding);
  const declaredTax = afterWithholding > 0 ? floor100(afterWithholding) : afterWithholding;
  const balance = declaredTax - num(prepaidTax);
  const isRefund = balance < 0;
  return {
    declaredTax,
    balance,
    isRefund,
    payment: isRefund ? 0 : floor100(balance),
    refund: isRefund ? -balance : 0,
  };
}
