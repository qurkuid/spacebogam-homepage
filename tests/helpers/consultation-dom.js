const canvasScales = [];

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
  }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { this.listeners.click?.({ preventDefault() {} }); }
  input(value) { this.value = value; this.listeners.input?.({}); }
  change(value) { if (this.type === 'checkbox') this.checked = value; else this.value = value; this.listeners.change?.({}); }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.({}); }
  focus() {}
  getContext() { return { fillRect() {}, translate() {}, scale(x, y) { canvasScales.push([x, y]); }, drawImage() {} }; }
  toBlob(callback, type) { callback(new Blob(['flipped-image'], { type })); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const match = node => selector === 'input' ? node.tag === 'input'
      : selector === '.input-row input' ? node.tag === 'input' && node.parent?.className === 'input-row'
        : node.className === selector.slice(1);
    const result = [];
    const visit = node => node.children.forEach(child => { if (match(child)) result.push(child); visit(child); });
    visit(this);
    return result;
  }
}

module.exports = { Element, canvasScales };
