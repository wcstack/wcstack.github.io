// <product-card> draws one product: the row the page mounts on it (data-wcs="state: .").
// "Add to cart" is the page's business, so the card only says it was pressed.
class ProductCard extends HTMLElement {
  state = {
    add: () => {
      this.dispatchEvent(new CustomEvent("add-to-cart", { bubbles: true }));
    },
  };

  connectedCallback() {
    // The router takes the catalog out and puts the same cards back: keep what is there.
    if (this.hasChildNodes()) return;
    this.innerHTML = `
      <wcs-state bind-component="state"></wcs-state>
      <article class="card" data-wcs="class.sold-out: stock|eq(0)">
        <div class="card-icon" data-wcs="textContent: icon"></div>
        <h3><a data-wcs="attr.href: href; textContent: name"></a></h3>
        <p data-wcs="textContent: description"></p>
        <p class="price">$<span data-wcs="textContent: price|toFixed(2)"></span></p>
        <p class="badge" data-wcs="hidden: stock|ne(0)">Sold out</p>
        <button type="button" data-wcs="onclick: add; disabled: stock|eq(0)">Add to cart</button>
      </article>
    `;
  }
}
customElements.define("product-card", ProductCard);
