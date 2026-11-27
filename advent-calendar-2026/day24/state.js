// 状態の定義。入力と、計算値どうしのつながりを書く。
// 税制の定数と式は tax-rules-2026.js の純粋関数に置き、ここからは呼ぶだけにする。
import * as R from "../tax-rules-2026.js";

const sum = (amounts) => amounts.reduce((total, amount) => total + amount, 0);
// 12/18: 620000 → "62万円"
const man = (yen) => `${yen / 10000}万円`;

// ---- 12/11: 保存してあった値を読むときの検証。形の違う値は既定値にする（例外にしない） ----
const FILING_TYPES = Object.keys(R.BLUE_DEDUCTION);
const toNumber = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const toText = (value) => (typeof value === "string" ? value : "");
// 12/24: チェックボックスの値。true でなければ、チェックなしとして読む
const toBoolean = (value) => value === true;
const toRows = (value) =>
  Array.isArray(value)
    ? value
        .filter((row) => row !== null && typeof row === "object")
        .map((row) => ({ label: toText(row.label), amount: toNumber(row.amount), draft: toText(row.draft) }))
    : [];
// 保存する行: 行ごとの値を列で集めて、行のオブジェクトに組み直す
const toSavedRows = (labels, amounts, drafts) =>
  labels.map((label, index) => ({ label, amount: amounts[index], draft: drafts[index] }));

// ---- 12/18: 扶養親族の行。区分（kind）が一覧にない値なら「23〜69歳」として読む ----
const DEPENDENT_KINDS = Object.keys(R.DEPENDENT_KINDS);
const toDependents = (value) =>
  Array.isArray(value)
    ? value
        .filter((row) => row !== null && typeof row === "object")
        .map((row) => ({
          kind: DEPENDENT_KINDS.includes(row.kind) ? row.kind : "general",
          income: toNumber(row.income),
          draft: toText(row.draft),
        }))
    : [];
const toSavedDependents = (kinds, incomes, drafts) =>
  kinds.map((kind, index) => ({ kind, income: incomes[index], draft: drafts[index] }));

// 行の名前（科目が空なら「収入 1行目」など）。採用していない入力の一覧と、金額欄の読み上げ名に使う
const rowName = (label, fallback) => (label.trim() !== "" ? label.trim() : fallback);

// ---- 12/19: 入力の画面。name はルートの名前、path はそのパス。この並びが「前へ」「次へ」の順 ----
const STEPS = [
  { name: "type", path: "/" },
  { name: "income", path: "/income" },
  { name: "expenses", path: "/expenses" },
  { name: "deductions", path: "/deductions" },
  { name: "paid", path: "/paid" },
];

export default {
  yearLabel: R.YEAR_LABEL,

  // ---- 12/19: ルーターとつなぐ値 ----
  // いまの画面の名前（<wcs-route name="…">）。<wcs-router> から届く
  routeName: "",
  // 移る先のパス。代入すると、ルーターがその画面へ移り、移り終えると null に戻す
  /** @type {string | null} */
  navigateUrl: null,
  // いまの画面が何番目か（0 始まり）。画面の一覧にない URL なら -1
  get stepIndex() {
    return STEPS.findIndex((step) => step.name === this.routeName);
  },
  get isFirstStep() {
    return this.stepIndex <= 0;
  },
  get isLastStep() {
    return this.stepIndex < 0 || this.stepIndex === STEPS.length - 1;
  },
  prevStep() {
    if (!this.isFirstStep) this.navigateUrl = STEPS[this.stepIndex - 1].path;
  },
  nextStep() {
    if (!this.isLastStep) this.navigateUrl = STEPS[this.stepIndex + 1].path;
  },

  // ---- 入力 ----
  // 12/10: 申告の種類（white / blue10 / blue55 / blue65）
  filingType: "white",
  // 12/15: 行の draft は、その行の金額欄が採用していない入力の文字列（正しい入力なら ""）
  incomes: [
    { label: "売上（Web制作）", amount: 4200000, draft: "" },
    { label: "売上（原稿料）", amount: 800000, draft: "" },
  ],
  expenses: [
    { label: "外注費", amount: 600000, draft: "" },
    { label: "地代家賃", amount: 420000, draft: "" },
    { label: "通信費", amount: 180000, draft: "" },
  ],
  // 12/18: 扶養親族。1 人が 1 行。kind は区分、income はその親族の合計所得
  // 12/22: 最初は空の配列なので、行の形を型で書く（書かないと、行の中のパスの間違いが error にならない）
  /** @type {{ kind: string, income: number, draft: string }[]} */
  dependents: [],
  socialInsurance: 400000,
  // 12/24: 配偶者。hasSpouse は配偶者がいるか、spouseIncome は配偶者の合計所得、spouseElderly は配偶者が70歳以上か
  hasSpouse: false,
  spouseIncome: 0,
  spouseElderly: false,
  withholding: 81680,
  // 12/15: 行でない金額欄の、採用していない入力
  drafts: { socialInsurance: "", spouseIncome: "", withholding: "" },

  // ---- 12/5: 合計と差引金額。[] は全行 ----
  get incomeTotal() {
    return sum(this.$getAll("incomes.*.amount", []));
  },
  get expenseTotal() {
    return sum(this.$getAll("expenses.*.amount", []));
  },
  get profit() {
    return this.incomeTotal - this.expenseTotal;
  },

  // ---- 12/7: 行ごとの構成比。this[".amount"] は、その行の amount ----
  get "incomes.*.share"() {
    const total = this.incomeTotal;
    return total > 0 ? this[".amount"] / total : 0;
  },
  get "expenses.*.share"() {
    const total = this.expenseTotal;
    return total > 0 ? this[".amount"] / total : 0;
  },

  // ---- 12/10: 青色申告特別控除。差引金額が上限で、赤字なら 0 ----
  get blueDeduction() {
    return R.blueDeduction(this.filingType, this.profit);
  },
  get businessIncome() {
    return this.profit - this.blueDeduction;
  },
  get isLoss() {
    return this.businessIncome < 0;
  },

  // ---- 12/18: 扶養親族。区分と、その親族の合計所得から、行ごとに判定する ----
  // 判定の結果は { status, amount } のオブジェクト。控除額と説明は、この結果から読む
  get "dependents.*.status"() {
    return R.dependentStatus(this[".kind"], this[".income"]);
  },
  get "dependents.*.deduction"() {
    return this[".status"].amount;
  },
  get "dependents.*.note"() {
    const { status } = this[".status"];
    const specific = this[".kind"] === "specific";
    if (status === "dependent") return specific ? "特定扶養親族" : "扶養控除";
    if (status === "specificRelative") return "特定親族特別控除";
    if (status === "noDeduction") return "控除なし";
    if (status === "overIncome") {
      return `所得${man(specific ? R.SPECIFIC_RELATIVE_LIMIT : R.DEPENDENT_INCOME_LIMIT)}超のため対象外`;
    }
    return "";
  },
  // 16歳未満は、所得に関係なく控除がない。所得の欄を出さない
  get "dependents.*.hasIncome"() {
    return this[".kind"] !== "young";
  },
  // 所得の欄の名前。$1 は行の番号（0 始まり）
  get "dependents.*.incomeName"() {
    return `扶養親族 ${this.$1 + 1}人目の合計所得`;
  },
  // 全員分の控除額の合計
  get dependentsDeduction() {
    return sum(this.$getAll("dependents.*.deduction", []));
  },

  // ---- 12/8: 所得から所得税まで ----
  get totalIncome() {
    return Math.max(0, this.businessIncome);
  },
  get basicDeduction() {
    return R.basicDeduction(this.totalIncome);
  },
  // 12/24: 配偶者控除・配偶者特別控除。本人の合計所得と、配偶者の合計所得・年齢から判定する
  // 判定の結果は { kind, amount } のオブジェクト。控除額と、どの控除になったかの表示は、この結果から読む
  get spouseStatus() {
    return R.spouseDeduction({
      hasSpouse: this.hasSpouse,
      taxpayerIncome: this.totalIncome,
      spouseIncome: this.spouseIncome,
      elderly: this.spouseElderly,
    });
  },
  get spouseDeduction() {
    return this.spouseStatus.amount;
  },
  get spouseNote() {
    const { kind } = this.spouseStatus;
    if (kind === "spouse") return "配偶者控除";
    if (kind === "special") return "配偶者特別控除";
    return "対象外";
  },
  get deductionTotal() {
    return this.socialInsurance + this.spouseDeduction + this.dependentsDeduction + this.basicDeduction;
  },
  get taxableIncome() {
    return R.taxableIncome(this.totalIncome, this.deductionTotal);
  },
  get taxRateLabel() {
    return this.taxableIncome > 0 ? R.percentLabel(R.bracketFor(this.taxableIncome)[1]) : "—";
  },
  get incomeTax() {
    return R.incomeTaxBeforeCredits(this.taxableIncome);
  },
  get reconstructionTax() {
    return R.reconstructionTax(this.incomeTax);
  },
  get totalTax() {
    return this.incomeTax + this.reconstructionTax;
  },

  // ---- 12/9: 源泉徴収税額との精算。納付か還付か ----
  get settlement() {
    return R.settle(this.totalTax, this.withholding, 0);
  },
  get isRefund() {
    return this.settlement.isRefund;
  },
  get paymentAmount() {
    return this.settlement.payment;
  },
  get refundAmount() {
    return this.settlement.refund;
  },

  // ---- 12/15: 採用していない入力。直すまでは、その欄で最後に金額として読めた値で計算している ----
  // 行の名前。$1 は行の番号（0 始まり）
  get "incomes.*.name"() {
    return rowName(this[".label"], `収入 ${this.$1 + 1}行目`);
  },
  get "expenses.*.name"() {
    return rowName(this[".label"], `経費 ${this.$1 + 1}行目`);
  },
  // キーにパスをカンマで並べると、そのそれぞれに同じ getter が宣言される
  get "incomes.*.amountName,expenses.*.amountName"() {
    return `${this[".name"]}の金額`;
  },
  // draft が空でない欄の名前。used は、その行の欄を画面に出しているか（省くと、すべて出している）
  get pendingInputs() {
    const names = [];
    const collect = (drafts, rowNames, used = drafts.map(() => true)) => {
      drafts.forEach((draft, index) => {
        if (draft !== "" && used[index]) names.push(rowNames[index]);
      });
    };
    collect(this.$getAll("incomes.*.draft", []), this.$getAll("incomes.*.amountName", []));
    collect(this.$getAll("expenses.*.draft", []), this.$getAll("expenses.*.amountName", []));
    // 12/18: 16歳未満の行は所得の欄を出さないので、数えない
    collect(
      this.$getAll("dependents.*.draft", []),
      this.$getAll("dependents.*.incomeName", []),
      this.$getAll("dependents.*.hasIncome", []),
    );
    if (this["drafts.socialInsurance"] !== "") names.push("社会保険料控除");
    // 12/24: 配偶者がいないときは所得の欄を出さないので、数えない
    if (this.hasSpouse && this["drafts.spouseIncome"] !== "") names.push("配偶者の合計所得");
    if (this["drafts.withholding"] !== "") names.push("源泉徴収税額");
    return names;
  },
  get hasPendingInputs() {
    return this.pendingInputs.length > 0;
  },
  get pendingInputsText() {
    return this.pendingInputs.join("、");
  },
  // 欄の表示と計算に使った値が食い違っている間は、結果を「未確定」と示す
  get resultQualifier() {
    return this.hasPendingInputs ? "（未確定）" : "（概算）";
  },
  get settlementQualifier() {
    return this.hasPendingInputs ? "（未確定）" : "";
  },

  // ---- 12/11: 保存と復元。<wcs-storage> の value に、この getter・setter の組をつなぐ ----
  // getter: 保存する入力を集める。入力をパスで読むので、どれが変わっても評価し直され、
  //         新しいオブジェクトが <wcs-storage> へ流れて保存される。12/15 から、採用していない入力も保存する
  get snapshot() {
    return {
      filingType: this.filingType,
      incomes: toSavedRows(
        this.$getAll("incomes.*.label", []),
        this.$getAll("incomes.*.amount", []),
        this.$getAll("incomes.*.draft", []),
      ),
      expenses: toSavedRows(
        this.$getAll("expenses.*.label", []),
        this.$getAll("expenses.*.amount", []),
        this.$getAll("expenses.*.draft", []),
      ),
      dependents: toSavedDependents(
        this.$getAll("dependents.*.kind", []),
        this.$getAll("dependents.*.income", []),
        this.$getAll("dependents.*.draft", []),
      ),
      socialInsurance: this.socialInsurance,
      // 12/24: 配偶者の入力
      hasSpouse: this.hasSpouse,
      spouseIncome: this.spouseIncome,
      spouseElderly: this.spouseElderly,
      withholding: this.withholding,
      drafts: {
        socialInsurance: this["drafts.socialInsurance"],
        spouseIncome: this["drafts.spouseIncome"],
        withholding: this["drafts.withholding"],
      },
    };
  },
  // setter: 保存してあった入力が届いたとき（読み込み時と、別のタブが保存したとき）に入力欄へ戻す。
  //         何も保存されていなければ null が届くので、初期値のままにする
  set snapshot(saved) {
    if (saved === null || typeof saved !== "object") return;
    const drafts = saved.drafts !== null && typeof saved.drafts === "object" ? saved.drafts : {};
    this.filingType = FILING_TYPES.includes(saved.filingType) ? saved.filingType : "white";
    this.incomes = toRows(saved.incomes);
    this.expenses = toRows(saved.expenses);
    this.dependents = toDependents(saved.dependents);
    this.socialInsurance = toNumber(saved.socialInsurance);
    // 12/24: 配偶者の入力。12/23 までに保存した値にはないので、そのときは「配偶者なし」になる
    this.hasSpouse = toBoolean(saved.hasSpouse);
    this.spouseIncome = toNumber(saved.spouseIncome);
    this.spouseElderly = toBoolean(saved.spouseElderly);
    this.withholding = toNumber(saved.withholding);
    this["drafts.socialInsurance"] = toText(drafts.socialInsurance);
    this["drafts.spouseIncome"] = toText(drafts.spouseIncome);
    this["drafts.withholding"] = toText(drafts.withholding);
  },
  /** @type {Error | null} */
  storageError: null,
  get hasStorageError() {
    return this.storageError != null;
  },

  // ---- 12/4: 行の追加と削除。新しい配列をパスに代入する ----
  addIncome() {
    this.incomes = this.incomes.concat({ label: "", amount: 0, draft: "" });
  },
  removeIncome(event, index) {
    this.incomes = this.incomes.toSpliced(index, 1);
  },
  addExpense() {
    this.expenses = this.expenses.concat({ label: "", amount: 0, draft: "" });
  },
  removeExpense(event, index) {
    this.expenses = this.expenses.toSpliced(index, 1);
  },
  // 12/18: 新しい行の区分は「23〜69歳」
  addDependent() {
    this.dependents = this.dependents.concat({ kind: "general", income: 0, draft: "" });
  },
  removeDependent(event, index) {
    this.dependents = this.dependents.toSpliced(index, 1);
  },
};
