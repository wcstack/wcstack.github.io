// 状態の定義。入力と、計算値どうしのつながりを書く。
// 税制の定数と式は tax-rules-2026.js の純粋関数に置き、ここからは呼ぶだけにする。
import * as R from "../tax-rules-2026.js";

const sum = (amounts) => amounts.reduce((total, amount) => total + amount, 0);

export default {
  yearLabel: R.YEAR_LABEL,

  // ---- 入力 ----
  // 12/10: 申告の種類（white / blue10 / blue55 / blue65）
  filingType: "white",
  incomes: [
    { label: "売上（Web制作）", amount: 4200000 },
    { label: "売上（原稿料）", amount: 800000 },
  ],
  expenses: [
    { label: "外注費", amount: 600000 },
    { label: "地代家賃", amount: 420000 },
    { label: "通信費", amount: 180000 },
  ],
  socialInsurance: 400000,
  withholding: 81680,

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

  // ---- 12/8: 所得から所得税まで ----
  get totalIncome() {
    return Math.max(0, this.businessIncome);
  },
  get basicDeduction() {
    return R.basicDeduction(this.totalIncome);
  },
  get deductionTotal() {
    return this.socialInsurance + this.basicDeduction;
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

  // ---- 12/4: 行の追加と削除。新しい配列をパスに代入する ----
  addIncome() {
    this.incomes = this.incomes.concat({ label: "", amount: 0 });
  },
  removeIncome(event, index) {
    this.incomes = this.incomes.toSpliced(index, 1);
  },
  addExpense() {
    this.expenses = this.expenses.concat({ label: "", amount: 0 });
  },
  removeExpense(event, index) {
    this.expenses = this.expenses.toSpliced(index, 1);
  },
};
