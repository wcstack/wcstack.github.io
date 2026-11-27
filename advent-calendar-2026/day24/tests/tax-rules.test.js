// 税制の式のテスト。tax-rules-2026.js は、画面にも状態にも触れない関数の集まりなので、呼んで結果を比べるだけでよい。
import { describe, expect, it } from "vitest";
import * as R from "../../tax-rules-2026.js";

// ---- 国税庁の計算例（タックスアンサー。令和8年4月1日現在法令等） ----

describe("国税庁の計算例と同じ結果になる", () => {
  // No.1000「所得税のしくみ」具体例1（令和8年分・自営業）
  it("No.1000 具体例1: 収入 1,000万円・必要経費 700万円 → 申告納税額 63,300円", () => {
    const totalIncome = 10_000_000 - 7_000_000;
    expect(R.basicDeduction(totalIncome)).toBe(1_040_000);
    // 社会保険料控除 34万円 ＋ 配偶者控除（配偶者に収入なし）＋ 基礎控除
    const spouse = R.spouseDeduction({ hasSpouse: true, taxpayerIncome: totalIncome, spouseIncome: 0, elderly: false });
    expect(spouse).toEqual({ kind: "spouse", amount: 380_000 });
    const deductions = 340_000 + spouse.amount + R.basicDeduction(totalIncome);
    expect(deductions).toBe(1_760_000);

    const taxable = R.taxableIncome(totalIncome, deductions);
    expect(taxable).toBe(1_240_000);
    const tax = R.incomeTaxBeforeCredits(taxable);
    expect(tax).toBe(62_000);                                      // 1,240,000 × 5%
    const reconstruction = R.reconstructionTax(tax);
    expect(reconstruction).toBe(1_302);                            // 62,000 × 2.1%
    expect(R.settle(tax + reconstruction, 0, 0).payment).toBe(63_300);   // 63,302 の 100円未満を切り捨て
  });

  // No.1000 具体例2（令和8年分・会社員）。このツールが扱うのは事業所得だけなので、課税される所得金額から先を比べる
  it("No.1000 具体例2: 課税所得 236万円・源泉徴収 176,100円 → 還付 34,692円", () => {
    const tax = R.incomeTaxBeforeCredits(2_360_000);
    expect(tax).toBe(138_500);                                     // 2,360,000 × 10% − 97,500
    const reconstruction = R.reconstructionTax(tax);
    expect(reconstruction).toBe(2_908);                            // 138,500 × 2.1% = 2,908.5 の 1円未満を切り捨て

    const settlement = R.settle(tax + reconstruction, 176_100, 0);
    expect(settlement.isRefund).toBe(true);
    expect(settlement.refund).toBe(34_692);                        // 還付は切り捨てない
  });

  // No.2260「所得税の税率」の計算例
  it("No.2260: 課税所得 700万円 → 所得税 974,000円、復興特別所得税 20,454円", () => {
    expect(R.incomeTaxBeforeCredits(7_000_000)).toBe(974_000);     // 7,000,000 × 23% − 636,000
    expect(R.reconstructionTax(974_000)).toBe(20_454);
  });
});

// ---- 境界値: 「以下」と「未満」、切り捨ての向きを取り違えていないか ----

describe("境界の前後", () => {
  it("速算表: 段が変わる金額ちょうどは、上の段。その前後で税額が正しい", () => {
    const tax = R.incomeTaxBeforeCredits;
    const rate = (taxable) => R.percentLabel(R.bracketFor(taxable)[1]);
    // 境目ちょうどの税額は、どちらの段の式でも同じになる。式の取り違えは、境目の一つ上の金額で分かる
    expect([rate(1_949_000), rate(1_950_000)]).toEqual(["5%", "10%"]);
    expect([tax(1_949_000), tax(1_950_000), tax(1_951_000)]).toEqual([97_450, 97_500, 97_600]);
    expect([rate(3_299_000), rate(3_300_000)]).toEqual(["10%", "20%"]);
    expect([tax(3_299_000), tax(3_300_000), tax(3_301_000)]).toEqual([232_400, 232_500, 232_700]);
    expect([rate(6_949_000), rate(6_950_000)]).toEqual(["20%", "23%"]);
    expect([tax(6_949_000), tax(6_950_000), tax(6_951_000)]).toEqual([962_300, 962_500, 962_730]);
    expect(tax(0)).toBe(0);
  });

  it("課税される所得金額: 1,000円未満を切り捨てる。控除のほうが多くても、マイナスにはならない", () => {
    expect(R.taxableIncome(3_000_999, 1_000_000)).toBe(2_000_000);
    expect(R.taxableIncome(3_001_000, 1_000_000)).toBe(2_001_000);
    expect(R.taxableIncome(1_000_000, 1_440_000)).toBe(0);
  });

  it("青色申告特別控除: 差引金額が上限。赤字なら 0", () => {
    expect(R.blueDeduction("blue65", 4_800_000)).toBe(650_000);
    expect(R.blueDeduction("blue65", 400_000)).toBe(400_000);
    expect(R.blueDeduction("blue65", -50_000)).toBe(0);
    expect(R.blueDeduction("white", 4_800_000)).toBe(0);
  });

  it("基礎控除: 合計所得 489万円までは 104万円", () => {
    expect(R.basicDeduction(4_890_000)).toBe(1_040_000);
    expect(R.basicDeduction(4_890_001)).toBe(670_000);
  });

  it("扶養親族: 所得 62万円までが扶養控除。19〜22歳は 123万円まで、段階的に減る", () => {
    expect(R.dependentStatus("general", 620_000)).toEqual({ status: "dependent", amount: 380_000 });
    expect(R.dependentStatus("general", 620_001)).toEqual({ status: "overIncome", amount: 0 });
    expect(R.dependentStatus("specific", 620_001)).toEqual({ status: "specificRelative", amount: 630_000 });
    expect(R.dependentStatus("specific", 1_230_000)).toEqual({ status: "specificRelative", amount: 30_000 });
    expect(R.dependentStatus("specific", 1_230_001)).toEqual({ status: "overIncome", amount: 0 });
  });

  it("配偶者: 所得 62万円までが配偶者控除、133万円までが配偶者特別控除。本人の所得が 1,000万円を超えると対象外", () => {
    const of = (spouseIncome, taxpayerIncome = 3_000_000, elderly = false) =>
      R.spouseDeduction({ hasSpouse: true, taxpayerIncome, spouseIncome, elderly });
    expect(of(620_000)).toEqual({ kind: "spouse", amount: 380_000 });
    expect(of(620_001)).toEqual({ kind: "special", amount: 380_000 });
    expect(of(1_000_000)).toEqual({ kind: "special", amount: 360_000 });
    expect(of(1_330_000)).toEqual({ kind: "special", amount: 30_000 });
    expect(of(1_330_001)).toEqual({ kind: "none", amount: 0 });
    expect(of(0, 3_000_000, true)).toEqual({ kind: "spouse", amount: 480_000 });          // 70歳以上
    expect([9_000_000, 9_000_001, 9_500_001, 10_000_001].map((income) => of(0, income).amount)).toEqual([380_000, 260_000, 130_000, 0]);
    expect(R.spouseDeduction({ hasSpouse: false, taxpayerIncome: 3_000_000, spouseIncome: 0, elderly: false })).toEqual({ kind: "none", amount: 0 });
  });

  it("精算: 納める税金は 100円未満を切り捨て、還付される税金は切り捨てない", () => {
    expect(R.settle(141_408, 81_680, 0)).toMatchObject({ isRefund: false, payment: 59_700, refund: 0 });   // 差額 59,728
    expect(R.settle(141_408, 141_350, 0)).toMatchObject({ isRefund: false, payment: 0, refund: 0 });       // 差額 58
    expect(R.settle(141_408, 200_000, 0)).toMatchObject({ isRefund: true, payment: 0, refund: 58_592 });
  });
});
