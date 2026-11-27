/**
 * <yen-input> — 金額入力（12日目: 最小の金額欄）
 *
 * - `value` は常に 0 以上の整数の number（空欄は 0）。0 は空欄で表示する（placeholder の "0" が見える）ので、
 *   空欄にした欄に「0」が書き戻されない。
 * - wc-bindable を宣言しているので、@wcstack/state からは `data-wcs="value: path"` で両方向につながる。
 * - まだやらないこと: 桁区切り（13日目）。数字以外の文字は読み飛ばすだけで、欄には残る（14日目に直す）。
 *
 * 属性: placeholder / label（aria-label に転送）/ disabled
 *       input-id（内側の input の id。<label for> で結び付ける）
 *       describedby（内側の input の aria-describedby。補足を読み上げさせる）
 * プロパティ: value
 * イベント: "yen-input:value-changed"（detail: number）
 */

const TAG = "yen-input";

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

  constructor() {
    super();
    this.#input = document.createElement("input");
    this.#input.type = "text";
    this.#input.inputMode = "numeric";
    this.#input.autocomplete = "off";
    this.#input.addEventListener("input", () => this.#onInput());
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
    // 状態から来る値。文書につながる前に届くこともある（@wcstack/state は if: / for: の中身をバインドしてから挿入する）ので、
    // ここでは値を持つだけにして、欄に描くのは #render に任せる
    const next = Math.max(0, Math.floor(Number(v) || 0));
    // 同じ値の書き戻しでは、入力中の文字を消さない
    if (next === this.#value && this.#input.value !== "") return;
    this.#value = next;
    this.#render();
  }

  // 0 は空欄で表示する
  #render() {
    this.#input.value = this.#value === 0 ? "" : String(this.#value);
  }

  #onInput() {
    // 数字だけを読む（数字以外の文字は読み飛ばす）
    const digits = this.#input.value.replace(/\D/g, "");
    const next = digits === "" ? 0 : Number(digits);
    if (next !== this.#value) {
      this.#value = next;
      this.dispatchEvent(new CustomEvent(`${TAG}:value-changed`, { detail: next, bubbles: true }));
    }
  }

  focus() {
    this.#input.focus();
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, YenInput);
}
