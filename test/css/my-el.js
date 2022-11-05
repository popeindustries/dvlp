import styles from './adopted-styles.css' assert { type: 'css' };

const html = String.raw;

class MyEl extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [styles];
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = html`<h1>Some Title</h1></h1><div>Some Text</div>`;
  }
}

customElements.define('my-el', MyEl);
