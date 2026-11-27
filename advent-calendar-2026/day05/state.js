// 状態の定義。入力と、計算値どうしのつながりを書く。

const sum = (amounts) => amounts.reduce((total, amount) => total + amount, 0);

export default {
  // ---- 入力 ----
  incomes: [
    { label: "売上（Web制作）", amount: 4200000 },
    { label: "売上（原稿料）", amount: 800000 },
  ],
  expenses: [
    { label: "外注費", amount: 600000 },
    { label: "地代家賃", amount: 420000 },
    { label: "通信費", amount: 180000 },
  ],

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
