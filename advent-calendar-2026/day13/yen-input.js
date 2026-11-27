/**
 * <yen-input> — 金額入力（13日目: 入力中にカンマで区切り、キャレットを保つ）
 *
 * - `value` は常に 0 以上の整数の number（空欄は 0）。0 は空欄で表示する（placeholder の "0" が見える）。
 * - 12/13: 表示は "1,234,567" のように 3 桁カンマ区切り。入力中も整形し、キャレットは
 *   「カーソルより左の数字の個数」で戻す。全角数字は半角として扱う。
 * - IME の変換中は整形しない（確定したときに行う）。
 * - 数字以外の文字は捨てる（14日目に、黙って捨てない形に直す）。
 *
 * 属性: placeholder / label（aria-label に転送）/ disabled
 *       input-id（内側の input の id。<label for> で結び付ける）
 *       describedby（内側の input の aria-describedby。補足を読み上げさせる）
 * プロパティ: value / formatted
 * イベント: "yen-input:value-changed"（detail: number）,
 *           "change"（フォーカスが外れたとき、フォーカスを得た時点から value が変わっていれば）
 */

const TAG = "yen-input";

const FULLWIDTH_DIGITS = /[０-９]/g;
const toHalfWidth = (text) => text.replace(FULLWIDTH_DIGITS, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const stripLeadingZeros = (digits) => digits.replace(/^0+(?=\d)/, "");
const format = (digits) => (digits === "" ? "" : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","));

/** 入力文字列から数字だけを読む（全角数字は半角に、先頭の 0 は除く。空欄は ""） */
const readDigits = (raw) => stripLeadingZeros(toHalfWidth(raw).replace(/\D/g, ""));

export class YenInput extends HTMLElement {
  // wc-bindable の宣言。value を、出力（properties）と入力（inputs）の両方に宣言すると、
  // @wcstack/state から data-wcs="value: path" で両方向につながる。
  // イベントの detail は値そのもの（wc-bindable の既定は event.detail を読むので、getter は書かない）
  static wcBindable = {
    protocol: "wc-bindable",
    version: 1,
    properties: [{ name: "value", event: `${TAG}:value-changed` }],
    inputs: [{ name: "value" }],
    commands: [],
  };

  static get observedAttributes() {
    return ["placeholder", "label", "disabled", "input-id", "describedby"];
  }

  #input = null;
  #value = 0;
  #atFocus = null;   // フォーカスを得た時点の { value }（change を出すかの判定）

  constructor() {
    super();
    this.#input = document.createElement("input");
    this.#input.type = "text";
    this.#input.inputMode = "numeric";
    this.#input.autocomplete = "off";

    this.#input.addEventListener("input", (e) => { if (!e.isComposing) this.#onInput(); });
    this.#input.addEventListener("compositionend", () => this.#onInput());
    this.#input.addEventListener("blur", () => this.#onBlur());
    this.#input.addEventListener("focus", () => this.#onFocus());
    // 内側の input の change は外へ出さない（この要素が、value が変わったときに自分で出す）
    this.#input.addEventListener("change", (e) => e.stopPropagation());
  }

  connectedCallback() {
    // 要素の定義（アップグレード）より前にインスタンスへ直接代入された値を拾い直す
    // （自前のプロパティが setter を隠しているので、消してから setter 経由で入れ直す）
    if (Object.prototype.hasOwnProperty.call(this, "value")) {
      const v = this.value;
      delete this.value;
      this.value = v;
    }
    if (!this.#input.isConnected) {
      this.append(this.#input);
      this.#syncAttributes();
      this.#render();
    }
  }

  attributeChangedCallback() {
    this.#syncAttributes();
  }

  #syncAttributes() {
    const input = this.#input;
    input.placeholder = this.getAttribute("placeholder") ?? "0";
    const label = this.getAttribute("label");
    if (label !== null) input.setAttribute("aria-label", label);
    else input.removeAttribute("aria-label");
    input.disabled = this.hasAttribute("disabled");
    const inputId = this.getAttribute("input-id");
    if (inputId) input.id = inputId;
    else input.removeAttribute("id");
    const describedBy = this.getAttribute("describedby");
    if (describedBy) input.setAttribute("aria-describedby", describedBy);
    else input.removeAttribute("aria-describedby");
  }

  /** number としての値 */
  get value() {
    return this.#value;
  }
  set value(v) {
    // 状態から来る値
    const next = Math.max(0, Math.floor(Number(v) || 0));
    // 同じ値の書き戻しでは、入力中の文字を消さない
    if (next === this.#value && this.#input.value !== "") return;
    this.#value = next;
    // 入力中（フォーカス中）に状態から同じ値が戻ってくる場合はキャレットを壊さない
    if (document.activeElement === this.#input && readDigits(this.#input.value) === String(next)) return;
    this.#render();
  }

  /** 表示用の文字列（0 は空欄） */
  get formatted() {
    return this.#value === 0 ? "" : format(String(this.#value));
  }

  #render() {
    this.#input.value = this.formatted;
  }

  #onInput() {
    const input = this.#input;
    const raw = input.value;
    const digits = readDigits(raw);

    const caret = input.selectionStart ?? raw.length;
    // キャレットより左にある「数字」のうち整形後に残るものの個数を数え、整形後に同じ個数の数字の右へ戻す。
    // 消える先頭の 0 は数字の並びの先頭にあるので、キャレットより左の個数から引く（0 未満にはしない）。
    // （左側だけを取り出して先頭の 0 を消す方法では、"00" が "0" になって 1 桁残り、"00|12" が "|12" ではなく "1|2" になってしまう）
    const leadingZeros = toHalfWidth(raw).replace(/\D/g, "").length - digits.length;
    const digitsBeforeCaret = Math.max(0, toHalfWidth(raw.slice(0, caret)).replace(/\D/g, "").length - leadingZeros);
    const text = format(digits);
    input.value = text;
    let pos = 0;
    let seen = 0;
    while (pos < text.length && seen < digitsBeforeCaret) {
      if (/\d/.test(text[pos])) seen++;
      pos++;
    }
    input.setSelectionRange(pos, pos);

    const next = digits === "" ? 0 : Number(digits);
    if (next !== this.#value) {
      this.#value = next;
      this.dispatchEvent(new CustomEvent(`${TAG}:value-changed`, { detail: next, bubbles: true }));
    }
  }

  #onFocus() {
    this.#atFocus = { value: this.#value };
    this.#input.select();
  }

  #onBlur() {
    this.#render();
    // ネイティブの change と同じく、変わったときだけ知らせる
    const before = this.#atFocus;
    this.#atFocus = null;
    if (before && before.value === this.#value) return;
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  focus() {
    this.#input.focus();
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, YenInput);
}
