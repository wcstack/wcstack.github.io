// 画面のテスト。index.html を happy-dom の上に組み立てて、利用者と同じ操作をし、計算結果の欄を読む。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fire, mount, settle } from "@wcstack/testing";
// 読み込むと <yen-input> が登録される
import "../yen-input.js";

// ---- ページを組み立てる ----

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");          // index.html のあるフォルダ
const page = readFileSync(join(appDir, "index.html"), "utf8");
const body = page.slice(page.indexOf("<body>") + "<body>".length, page.indexOf("</body>"));
const base = /<base href="([^"]+)">/.exec(page)[1];                           // ページを置いたフォルダ

// ページが使う要素を登録する関数。index.html の <script> と同じく、state を最後にする
const bootstrap = [
  async () => (await import("@wcstack/storage")).bootstrapStorage(),
  async () => (await import("@wcstack/router")).bootstrapRouter(),
  async () => (await import("@wcstack/state")).bootstrapState(),
];

/** ブラウザで「base + path」を開いたのと同じ形で、ページを組み立てる（path を省くと、最初の画面） */
function open(path = "") {
  window.happyDOM.setURL("http://localhost" + base + path);
  document.head.innerHTML = `<base href="${base}">`;
  return mount(body, {
    bootstrap,
    // <wcs-state src="./state.js"> が指す URL（base に続く部分がファイル名）を、手元のファイルに写す
    resolveModule: (url) => pathToFileURL(join(appDir, url.pathname.slice(base.length))),
  });
}

// ---- 利用者の操作 ----

const $ = (selector) => document.querySelector(selector);
const rows = (table) => [...document.querySelectorAll(`${table} tbody tr`)];

/** 画面へのリンクを押す。<wcs-link> のすぐ後ろに作られる <a> が、押されるリンク */
async function goTo(path) {
  $(`wcs-link[to="${path}"] + a`).click();
  await settle();
}

/** ボタンを、書いてある文字で探して押す（within を渡すと、その中から探す） */
async function press(label, within = document) {
  fire([...within.querySelectorAll("button")].find((button) => button.textContent.includes(label)), "click");
  await settle();
}

/** 金額欄に打つ */
async function typeYen(yenInput, text) {
  const input = yenInput.querySelector("input");
  input.value = text;
  fire(input, "input");
  await settle();
}

/** 選択肢を選ぶ（<select> は change で状態に届く） */
async function choose(select, value) {
  select.value = value;
  fire(select, "change");
  await settle();
}

/** チェックボックスを入れる・外す */
async function setChecked(checkbox, on) {
  checkbox.checked = on;
  fire(checkbox, "input");
  fire(checkbox, "change");
  await settle();
}

/** ラジオボタンを選ぶ */
async function check(radio) {
  radio.checked = true;
  fire(radio, "input");
  fire(radio, "change");
  await settle();
}

// ---- 計算結果を読む ----

const text = (selector) => $(selector).textContent.replace(/\s+/g, " ").trim();
const amount = (selector) => Number(text(selector).replaceAll(",", ""));
const result = () => ({
  課税される所得金額: amount("#taxable-income"),
  所得税: amount("#income-tax"),
  復興特別所得税: amount("#reconstruction-tax"),
  [text("#settlement .label")]: amount("#settlement .amount span"),
});

let app;
beforeEach(() => localStorage.clear());
afterEach(() => app?.unmount());

describe("入力から、納める税金まで", () => {
  it("何も入力していないときの計算結果", async () => {
    app = await open();

    expect(text("wcs-outlet h2")).toBe("1. 申告の種類");
    expect(result()).toEqual({ 課税される所得金額: 2_360_000, 所得税: 138_500, 復興特別所得税: 2_908, 納める税金: 59_700 });
  });

  // 国税庁 タックスアンサー No.1000 具体例1（令和8年分）: 収入のない配偶者がいる、自営業の人
  it("国税庁の計算例 1 のとおりに入力すると、納める税金は 63,300円になる", async () => {
    app = await open();

    await goTo("/income");                                           // 収入 1,000万円
    await press("削除", rows("#incomes")[1]);
    await typeYen(rows("#incomes")[0].querySelector("yen-input"), "10000000");

    await goTo("/expenses");                                         // 必要経費 700万円
    await press("削除", rows("#expenses")[2]);
    await press("削除", rows("#expenses")[1]);
    await typeYen(rows("#expenses")[0].querySelector("yen-input"), "7000000");

    await goTo("/deductions");                                       // 社会保険料控除 34万円、配偶者あり（収入なし）
    await typeYen($("#social-insurance").closest("yen-input"), "340000");
    await setChecked($("#has-spouse"), true);

    await goTo("/paid");                                             // 源泉徴収なし
    await typeYen($("#withholding").closest("yen-input"), "");

    expect(amount("#business-income")).toBe(3_000_000);
    expect(amount("#spouse-deduction")).toBe(380_000);
    expect(amount("#deduction-total")).toBe(1_760_000);
    expect(result()).toEqual({ 課税される所得金額: 1_240_000, 所得税: 62_000, 復興特別所得税: 1_302, 納める税金: 63_300 });
  });

  // No.1000 具体例2 と、課税される所得金額（236万円）と源泉徴収税額（176,100円）が同じになる入力
  it("源泉徴収税額のほうが多ければ、還付になる。還付額は切り捨てない", async () => {
    app = await open();
    await goTo("/paid");

    await typeYen($("#withholding").closest("yen-input"), "176100");

    expect(result()).toEqual({ 課税される所得金額: 2_360_000, 所得税: 138_500, 復興特別所得税: 2_908, 還付される税金: 34_692 });
  });

  it("青色申告 65万円控除と、19〜22歳の扶養親族（所得 90万円）", async () => {
    app = await open();
    await check($('input[type="radio"][value="blue65"]'));

    await goTo("/deductions");
    await press("扶養親族の行を追加");
    await choose(rows("#dependents")[0].querySelector("select"), "specific");
    await typeYen(rows("#dependents")[0].querySelector("yen-input"), "900000");

    // 事業所得 380万 − 65万 = 315万。所得控除 40万 + 61万（特定親族特別控除）+ 104万 = 205万。課税所得 110万 × 5%
    expect(amount("#blue-deduction")).toBe(650_000);
    expect(amount("#deduction-total")).toBe(2_050_000);
    expect(result()).toEqual({ 課税される所得金額: 1_100_000, 所得税: 55_000, 復興特別所得税: 1_155, 還付される税金: 25_525 });
  });
});

describe("配偶者控除と配偶者特別控除", () => {
  /** 「4. 所得控除」の画面を開いて、配偶者がいることにする */
  async function withSpouse() {
    app = await open("deductions");
    await setChecked($("#has-spouse"), true);
  }
  const spouseIncome = () => $("#spouse-income").closest("yen-input");

  it("配偶者がいなければ、控除はない。所得の欄も出ない", async () => {
    app = await open("deductions");

    expect($("#has-spouse").checked).toBe(false);
    expect($("#spouse-income")).toBeNull();
    expect(amount("#spouse-deduction")).toBe(0);
    expect(result().納める税金).toBe(59_700);
  });

  it("配偶者がいて、所得がなければ、配偶者控除 38万円", async () => {
    await withSpouse();

    expect(text("#spouse-note")).toBe("配偶者控除");
    expect(amount("#spouse-deduction")).toBe(380_000);
    expect(amount("#deduction-total")).toBe(1_820_000);
    expect(result().納める税金).toBe(20_900);
  });

  it("配偶者が 70歳以上なら、48万円", async () => {
    await withSpouse();

    await setChecked($("#spouse-elderly"), true);

    expect(amount("#spouse-deduction")).toBe(480_000);
    expect(result().納める税金).toBe(14_200);
  });

  it("配偶者の所得が 62万円を超えると配偶者特別控除になり、133万円を超えると対象外", async () => {
    await withSpouse();

    await typeYen(spouseIncome(), "1000000");
    expect([text("#spouse-note"), amount("#spouse-deduction")]).toEqual(["配偶者特別控除", 360_000]);
    expect(result().納める税金).toBe(22_900);

    await typeYen(spouseIncome(), "1330001");
    expect([text("#spouse-note"), amount("#spouse-deduction")]).toEqual(["対象外", 0]);
    expect(result().納める税金).toBe(59_700);
  });

  it("配偶者の所得が読めない間は「未確定」。配偶者がいないことにすると、数えない", async () => {
    await withSpouse();

    await typeYen(spouseIncome(), "-1");
    expect(text("#result-qualifier")).toBe("（未確定）");
    expect(text("#pending span")).toBe("配偶者の合計所得");

    await setChecked($("#has-spouse"), false);
    expect(text("#result-qualifier")).toBe("（概算）");
  });

  it("配偶者の入力も保存され、開き直すと戻る", async () => {
    await withSpouse();
    await setChecked($("#spouse-elderly"), true);
    await typeYen(spouseIncome(), "500000");
    app.unmount();

    app = await open("deductions");

    expect($("#has-spouse").checked).toBe(true);
    expect($("#spouse-elderly").checked).toBe(true);
    expect($("#spouse-income").value).toBe("500,000");
    expect(amount("#spouse-deduction")).toBe(480_000);
  });
});

describe("画面をまたぐ", () => {
  it("読めない入力があると、別の画面に移っても「未確定」のまま。直すと「概算」に戻る", async () => {
    app = await open();
    await goTo("/income");
    const yen = () => rows("#incomes")[0].querySelector("yen-input");

    await typeYen(yen(), "-5000");
    await goTo("/paid");

    expect(text("#result-qualifier")).toBe("（未確定）");
    expect(text("#pending span")).toBe("売上（Web制作）の金額");
    // 最後に読めた金額（4,200,000）で計算した額を、「未確定」と断って出している
    expect(result()).toMatchObject({ "納める税金（未確定）": 59_700 });

    await goTo("/income");
    expect(yen().querySelector("input").value).toBe("-5000");        // 打ったまま残っている
    await typeYen(yen(), "5000");

    expect(text("#result-qualifier")).toBe("（概算）");
    expect($("#pending")).toBeNull();
  });

  it("途中の画面の URL を開いても、保存してあった入力で計算される", async () => {
    app = await open();
    await goTo("/deductions");
    await press("扶養親族の行を追加");
    const before = result();
    app.unmount();

    app = await open("deductions");                                  // ページを閉じて、途中の画面の URL を開き直した

    expect(text("wcs-outlet h2")).toBe("4. 所得控除");
    expect(rows("#dependents")).toHaveLength(1);
    expect(result()).toEqual(before);
    expect(result().納める税金).toBe(20_900);
  });
});
