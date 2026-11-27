/**
 * <yen-input> — 金額入力（15日目: 採用していない入力を draft として外に出す）
 *
 * - `value` は常に 0 以上の整数の number（空欄は 0）。表示は "1,234,567" のように 3 桁カンマ区切りで、
 *   0 は空欄（placeholder の "0" が見える）。
 * - 入力中も整形し、キャレットは「カーソルより左の数字の個数」で戻す。全角数字・全角カンマは半角として扱う。
 * - 金額として正しくない入力（マイナス・小数・数字以外の文字・999,999,999,999 円超）は、黙って別の金額に変えない。
 *   入力したまま残してエラーを表示し、`value` は直前の正しい金額のまま（計算に採用しない）。
 * - 12/15: 採用していない入力の文字列は `draft` として外に出す（正しい入力のときは ""）。`draft` は入力でもあるので、
 *   状態に持たせてつなげば、要素が作り直されても・再読み込みしても、未採用の入力が要素と一緒に消えない。
 *   状態から "" を書くと、未採用の入力を破棄して `value` を表示する。
 * - IME の変換中は検証も整形もしない（確定したときに行う）。
 *
 * 属性: placeholder / label（aria-label に転送）/ disabled
 *       input-id（内側の input の id。<label for> で結び付ける）
 *       describedby（内側の input の aria-describedby に足す id。補足を読み上げさせる）
 *       invalid（入力が正しくない間だけ要素に付く。読み取り専用の目印）
 * プロパティ: value / draft / formatted / invalid / validationMessage
 * イベント: "yen-input:value-changed"（detail: number）, "yen-input:draft-changed"（detail: string）,
 *           "change"（フォーカスが外れたとき、フォーカスを得た時点から value か draft が変わっていれば）
 */

const TAG = "yen-input";
const MAX_DIGITS = 12;                         // 999,999,999,999 円まで（Number.MAX_SAFE_INTEGER の範囲内）
const MAX_VALUE = 10 ** MAX_DIGITS - 1;

const FULLWIDTH_DIGITS = /[０-９]/g;
const toHalfWidth = (text) => text.replace(FULLWIDTH_DIGITS, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
// マイナス記号の候補（半角ハイフン・全角ハイフン・マイナス記号・ハイフン・IME の長音「ー」）
const MINUS = /[-－−‐ー]/;
const DECIMAL_POINT = /[.．]/;
const SEPARATORS = /[,，]/g;
const stripLeadingZeros = (digits) => digits.replace(/^0+(?=\d)/, "");
const format = (digits) => (digits === "" ? "" : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","));

/**
 * 入力文字列を金額として読む。
 * @returns {{ digits: string, error: "" } | { digits: null, error: string }}
 *   digits: 先頭の 0 を除いた数字列（空欄は ""）
 */
export function parseYen(raw) {
  const text = toHalfWidth(String(raw ?? "")).trim();
  if (MINUS.test(text)) return { digits: null, error: "マイナスの金額は入力できません" };
  if (DECIMAL_POINT.test(text)) return { digits: null, error: "小数は入力できません（円単位の整数で入力してください）" };
  const body = text.replace(SEPARATORS, "");
  if (/\D/.test(body)) return { digits: null, error: "数字以外の文字が含まれています" };
  const digits = stripLeadingZeros(body);
  if (digits.length > MAX_DIGITS) return { digits: null, error: "999,999,999,999 円を超える金額は入力できません" };
  return { digits, error: "" };
}

let messageSeq = 0;

export class YenInput extends HTMLElement {
  // wc-bindable の宣言。value と draft を、出力（properties）と入力（inputs）の両方に宣言すると、
  // @wcstack/state から data-wcs="value: path; draft: draftPath" で両方向につながる。
  // イベントの detail は値そのもの（wc-bindable の既定は event.detail を読むので、getter は書かない）
  static wcBindable = {
    protocol: "wc-bindable",
    version: 1,
    properties: [
      { name: "value", event: `${TAG}:value-changed` },
      { name: "draft", event: `${TAG}:draft-changed` },
    ],
    inputs: [{ name: "value" }, { name: "draft" }],
    commands: [],
  };

  static get observedAttributes() {
    return ["placeholder", "label", "disabled", "input-id", "describedby"];
  }

  #input = null;
  #message = null;
  #value = 0;
  #draft = "";       // 採用していない入力（正しい入力なら ""）
  #error = "";
  #atFocus = null;   // フォーカスを得た時点の { value, draft }（change を出すかの判定）

  constructor() {
    super();
    this.#input = document.createElement("input");
    this.#input.type = "text";
    this.#input.inputMode = "numeric";
    this.#input.autocomplete = "off";
    // エラー文は常に置いておき（空なら見えない）、読み上げのために入力欄と関連付ける（#syncAttributes）
    this.#message = document.createElement("span");
    this.#message.className = `${TAG}-error`;
    this.#message.id = `${TAG}-message-${++messageSeq}`;
    this.#message.setAttribute("aria-live", "polite");

    this.#input.addEventListener("input", (e) => { if (!e.isComposing) this.#onInput(); });
    this.#input.addEventListener("compositionend", () => this.#onInput());
    this.#input.addEventListener("blur", () => this.#onBlur());
    this.#input.addEventListener("focus", () => this.#onFocus());
    // 内側の input の change は外へ出さない（この要素が、value か draft が変わったときに自分で出す）
    this.#input.addEventListener("change", (e) => e.stopPropagation());
  }

  connectedCallback() {
    // 要素の定義（アップグレード）より前にインスタンスへ直接代入された値を拾い直す
    // （自前のプロパティが setter を隠しているので、消してから setter 経由で入れ直す）
    for (const name of ["value", "draft"]) {
      if (Object.prototype.hasOwnProperty.call(this, name)) {
        const v = this[name];
        delete this[name];
        this[name] = v;
      }
    }
    if (!this.#input.isConnected) {
      this.append(this.#input, this.#message);
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
    // 補足（describedby）を先に、エラー文を後に読み上げる
    const describedBy = [this.getAttribute("describedby"), this.#message.id].filter(Boolean).join(" ");
    input.setAttribute("aria-describedby", describedBy);
  }

  /** number としての値。入力が正しくない間は、直前の正しい値のまま。 */
  get value() {
    return this.#value;
  }
  set value(v) {
    // 状態から来る値。念のため範囲外は丸める
    const next = Math.min(MAX_VALUE, Math.max(0, Math.floor(Number(v) || 0)));
    // 同じ値の書き戻しでは、入力中の文字を消さない
    if (next === this.#value && this.#input.value !== "") return;
    this.#value = next;
    // 採用していない入力があれば、それを表示したまま（破棄するのは draft への "" の書き込み）
    if (this.#draft !== "") return;
    // 入力中（フォーカス中）に状態から同じ値が戻ってくる場合はキャレットを壊さない
    if (document.activeElement === this.#input && parseYen(this.#input.value).digits === String(next)) return;
    this.#render();
  }

  /**
   * 採用していない入力の文字列（正しい入力なら ""）。
   * 書き込むと: 空でない文字列 → その文字列をエラー付きで表示（value は変えない）/ "" → 破棄して value を表示。
   */
  get draft() {
    return this.#draft;
  }
  set draft(v) {
    const next = typeof v === "string" ? v : "";
    if (next === this.#draft) return;
    this.#draft = next;
    if (next === "") {
      this.#setError("");
      this.#render();
      return;
    }
    // 状態から届いた未採用の入力（要素の作り直し・再読み込み）。正しい金額の文字列でも自動では採用しない
    const { error } = parseYen(next);
    this.#setError(error || "この入力はまだ計算に採用されていません");
    if (this.#input.value !== next) this.#input.value = next;
  }

  /** 表示用の文字列（0 は空欄） */
  get formatted() {
    return this.#value === 0 ? "" : format(String(this.#value));
  }

  /** 入力が正しくないか（エラー表示中か） */
  get invalid() {
    return this.#error !== "";
  }

  /** エラーの文言（正しい入力なら ""） */
  get validationMessage() {
    return this.#error;
  }

  // 表示: 採用していない入力があればそれを（黙って値の表示に戻さない）、なければ整形した値。
  // 文書につながる前に value / draft が届くことがある（@wcstack/state は if: / for: の中身をバインドしてから挿入する）ので、
  // connectedCallback で描くときも draft を優先する
  #render() {
    if (this.#draft !== "") {
      this.#input.value = this.#draft;
      return;
    }
    this.#input.value = this.formatted;
  }

  #setDraft(text) {
    if (text === this.#draft) return;
    this.#draft = text;
    this.dispatchEvent(new CustomEvent(`${TAG}:draft-changed`, { detail: text, bubbles: true }));
  }

  #setError(message) {
    this.#error = message;
    this.#message.textContent = message;
    if (message) this.#input.setAttribute("aria-invalid", "true");
    else this.#input.removeAttribute("aria-invalid");
    this.toggleAttribute("invalid", message !== "");
  }

  #onInput() {
    const input = this.#input;
    const raw = input.value;
    const { digits, error } = parseYen(raw);
    if (error) {
      // 整形も採用もしない。入力したまま残し、直すまでエラーを出す。未採用の文字列は draft として外へ知らせる
      this.#setError(error);
      this.#setDraft(raw);
      return;
    }
    this.#setError("");
    this.#setDraft("");

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
    this.#atFocus = { value: this.#value, draft: this.#draft };
    this.#input.select();
  }

  #onBlur() {
    // 正しくない入力はフォーカスが外れても残す（黙って直前の値に戻さない）
    if (!this.invalid) this.#render();
    // ネイティブの change と同じく、変わったときだけ知らせる
    const before = this.#atFocus;
    this.#atFocus = null;
    if (before && before.value === this.#value && before.draft === this.#draft) return;
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  focus() {
    this.#input.focus();
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, YenInput);
}
