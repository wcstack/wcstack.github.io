// <yen-input> のテスト。ブラウザは使わず、happy-dom の上で動かす。
import { beforeEach, describe, expect, it } from "vitest";
// 読み込むと <yen-input> が登録される。parseYen は、文字列を金額として読む関数
import { parseYen } from "../yen-input.js";

// ---- 要素を動かす道具 ----

/** 新しい <yen-input> を文書に置き、出したイベントを記録する */
function setup() {
  const element = document.createElement("yen-input");
  const events = { value: [], draft: [], change: 0 };
  element.addEventListener("yen-input:value-changed", (e) => events.value.push(e.detail));
  element.addEventListener("yen-input:draft-changed", (e) => events.draft.push(e.detail));
  element.addEventListener("change", () => events.change++);
  document.body.append(element);
  return { element, input: element.querySelector("input"), message: element.querySelector(".yen-input-error"), events };
}

/** 利用者が欄の文字を text にした（caret はキャレットの位置。既定は末尾） */
function edit(input, text, caret = text.length) {
  input.value = text;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event("input"));
}

/** 貼り付けのように、文字列が一度に入った: 欄が変わる前に beforeinput が届き、続いて input が届く */
function insertAtOnce(input, text, inputType = "insertFromPaste") {
  input.dispatchEvent(Object.assign(new Event("beforeinput"), { inputType, data: text, isComposing: false }));
  edit(input, text);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

// ---- 金額として読む関数 ----

describe("parseYen", () => {
  const read = (digits) => ({ digits, error: "" });

  it("金額として読める文字列は、数字の並びを返す", () => {
    expect(parseYen("")).toEqual(read(""));                       // 空欄
    expect(parseYen("1000")).toEqual(read("1000"));
    expect(parseYen("1,000")).toEqual(read("1000"));              // カンマは区切りとして読み飛ばす
    expect(parseYen("１２，３４５")).toEqual(read("12345"));      // 全角の数字とカンマ
    expect(parseYen("  5000 ")).toEqual(read("5000"));            // 前後の空白
    expect(parseYen("007")).toEqual(read("7"));                   // 先頭の 0
    expect(parseYen("999999999999")).toEqual(read("999999999999"));   // 上限ちょうど
  });

  it("読めない文字列は、数字の並びを返さず、理由を返す", () => {
    expect(parseYen("-1,000")).toEqual({ digits: null, error: "マイナスの金額は入力できません" });
    expect(parseYen("－１０００").error).toMatch(/マイナス/);     // 全角のハイフン
    expect(parseYen("ー1000").error).toMatch(/マイナス/);         // 日本語入力の長音
    expect(parseYen("1234.56").error).toMatch(/小数/);
    expect(parseYen("1000円").error).toMatch(/数字以外/);
    expect(parseYen("1e5").error).toMatch(/数字以外/);
    expect(parseYen("1234567890123").error).toMatch(/999,999,999,999/);   // 13 桁
  });

  it("strictSeparators を付けたときだけ、カンマが 3 桁ごとかを確かめる", () => {
    const strict = { strictSeparators: true };
    expect(parseYen("1,0000")).toEqual(read("10000"));            // 付けなければ、位置を問わない
    expect(parseYen("1,000,000", strict)).toEqual(read("1000000"));
    expect(parseYen("12000", strict)).toEqual(read("12000"));     // カンマがなければ問わない
    expect(parseYen("1,0000", strict).error).toMatch(/カンマの位置/);
    expect(parseYen("10,00", strict).error).toMatch(/カンマの位置/);
    expect(parseYen("-1,0000", strict).error).toMatch(/マイナス/);   // ほかの理由が先
  });
});

// ---- 要素の振る舞い ----

describe("<yen-input>: 表示とキャレット", () => {
  it("受け取った値を 3 桁区切りで表示する。0 は空欄", () => {
    const { element, input } = setup();
    expect(input.value).toBe("");

    element.value = 4200000;
    expect(input.value).toBe("4,200,000");

    element.value = 0;
    expect(input.value).toBe("");
  });

  it("打つたびに区切り直し、キャレットを同じ数字の右に戻す", () => {
    const { element, input, events } = setup();

    edit(input, "12345", 3);                      // 「123|45」
    expect(input.value).toBe("12,345");
    expect(input.selectionStart).toBe(4);         // 「12,3|45」
    expect(element.value).toBe(12345);
    expect(events.value).toEqual([12345]);

    edit(input, "1,2934,567", 4);                 // 「1,29|34,567」: 区切り済みの欄の途中に 9 を足した
    expect(input.value).toBe("12,934,567");
    expect(input.selectionStart).toBe(4);         // 「12,9|34,567」
  });

  it("先頭の 0 が消えた分だけ、キャレットを左に寄せる", () => {
    const { input } = setup();
    const after = (text, caret) => {
      edit(input, text, caret);
      return [input.value, input.selectionStart];
    };

    expect(after("0012", 2)).toEqual(["12", 0]);        // 「00|12」→「|12」
    expect(after("0012", 3)).toEqual(["12", 1]);        // 「001|2」→「1|2」
    expect(after("01234", 3)).toEqual(["1,234", 3]);    // 「012|34」→「1,2|34」
  });
});

describe("<yen-input>: 読めない入力", () => {
  it("打ったまま残してエラーを示し、値は変えずに、draft として知らせる", () => {
    const { element, input, message, events } = setup();
    edit(input, "5000");

    edit(input, "-5000");

    expect(input.value).toBe("-5000");                               // 別の金額に変えない
    expect(message.textContent).toBe("マイナスの金額は入力できません");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(element.hasAttribute("invalid")).toBe(true);
    expect(element.value).toBe(5000);                                // 最後に読めた金額のまま
    expect(element.draft).toBe("-5000");
    expect(events.value).toEqual([5000]);                            // 値が変わったという知らせは出ない
    expect(events.draft).toEqual(["-5000"]);
  });

  it("読める金額に直すと、エラーが消えて採用される", () => {
    const { element, input, message, events } = setup();
    edit(input, "12.5");
    expect(message.textContent).toMatch(/小数/);

    edit(input, "125");

    expect(message.textContent).toBe("");
    expect(element.hasAttribute("invalid")).toBe(false);
    expect(element.value).toBe(125);
    expect(element.draft).toBe("");
    expect(events.draft).toEqual(["12.5", ""]);
  });

  it("フォーカスが外れても、読めない入力は残る", () => {
    const { input } = setup();
    edit(input, "1000円");

    input.dispatchEvent(new Event("blur"));

    expect(input.value).toBe("1000円");
  });

  it("外から draft に空の文字列を書くと、読めない入力を捨てて、金額の表示に戻る", () => {
    const { element, input, message } = setup();
    edit(input, "4200000");
    edit(input, "-1");

    element.draft = "";

    expect(input.value).toBe("4,200,000");
    expect(message.textContent).toBe("");
  });

  it("文書に置かれる前に value と draft が届いても、draft のほうを表示する", () => {
    const element = document.createElement("yen-input");
    element.value = 4200000;
    element.draft = "-5000";

    document.body.append(element);

    expect(element.querySelector("input").value).toBe("-5000");
    expect(element.querySelector(".yen-input-error").textContent).toBe("マイナスの金額は入力できません");
    expect(element.value).toBe(4200000);
  });
});

describe("<yen-input>: 一度に入った文字列とIME", () => {
  it("一度に入った文字列のカンマは、3 桁ごとでなければ採用しない", () => {
    const { element, input, message } = setup();
    edit(input, "4200000");

    insertAtOnce(input, "1,0000");
    expect(input.value).toBe("1,0000");
    expect(message.textContent).toMatch(/カンマの位置/);
    expect(element.value).toBe(4200000);

    insertAtOnce(input, "1,000,000");
    expect(input.value).toBe("1,000,000");
    expect(message.textContent).toBe("");
    expect(element.value).toBe(1000000);
  });

  it("1 文字ずつ打ってずれたカンマは問わない", () => {
    const { element, input, message } = setup();

    edit(input, "1,0000");

    expect(input.value).toBe("10,000");
    expect(message.textContent).toBe("");
    expect(element.value).toBe(10000);
  });

  it("採用されるまでは、カンマの位置を確かめ続ける", () => {
    const { element, input, message } = setup();
    insertAtOnce(input, "1,0000");

    edit(input, "1,00000");                       // 末尾に 0 を足しても、3 桁ごとではない
    expect(message.textContent).toMatch(/カンマの位置/);

    edit(input, "100000");                        // カンマを消した
    expect(input.value).toBe("100,000");
    expect(element.value).toBe(100000);
  });

  it("IMEの変換中は何もせず、確定したときに処理する", () => {
    const { element, input } = setup();

    input.value = "１２３４";
    input.dispatchEvent(Object.assign(new Event("input"), { isComposing: true }));
    expect(input.value).toBe("１２３４");        // 変換中の欄は書き換えない
    expect(element.value).toBe(0);

    input.dispatchEvent(Object.assign(new Event("compositionend"), { data: "１２３４" }));
    expect(input.value).toBe("1,234");
    expect(element.value).toBe(1234);
  });

  it("IMEの確定で、input と compositionend のどちらが先に届いても、同じ判断になる", () => {
    const commit = (text) => Object.assign(new Event("beforeinput"), { inputType: "insertFromComposition", data: text, isComposing: false });
    const end = (text) => Object.assign(new Event("compositionend"), { data: text });

    // 順番 A: beforeinput → input → compositionend
    const a = setup();
    a.input.dispatchEvent(commit("１，００００"));
    a.input.value = "１，００００";
    a.input.dispatchEvent(new Event("input"));
    a.input.dispatchEvent(end("１，００００"));

    // 順番 B: beforeinput → compositionend → input
    const b = setup();
    b.input.dispatchEvent(commit("１，００００"));
    b.input.value = "１，００００";
    b.input.dispatchEvent(end("１，００００"));
    b.input.dispatchEvent(new Event("input"));

    for (const { element, message } of [a, b]) {
      expect(message.textContent).toMatch(/カンマの位置/);
      expect(element.value).toBe(0);
      expect(element.draft).toBe("１，００００");
    }
  });
});
