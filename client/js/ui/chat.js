// Chat de texto. Los mensajes se muestran como texto plano (nunca HTML) para evitar inyecciones.

export class Chat {
  constructor({ onSend, onOpenChange }) {
    this.log = document.getElementById('chat-log');
    this.form = document.getElementById('chat-form');
    this.input = document.getElementById('chat-input');
    this.onSend = onSend;
    this.onOpenChange = onOpenChange;
    this.isOpen = false;
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = this.input.value.trim();
      if (v) this.onSend(v);
      this.input.value = '';
      this.close();
    });
    document.getElementById('chat-close').addEventListener('click', () => this.close());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); e.stopPropagation(); });
  }

  add({ n, c, m, sys }) {
    const d = document.createElement('div');
    d.className = 'msg' + (sys ? ' sys' : '');
    if (n) {
      const b = document.createElement('b');
      b.textContent = n + ': ';
      b.style.color = c || '#fff';
      d.appendChild(b);
    }
    d.appendChild(document.createTextNode(m));
    this.log.appendChild(d);
    while (this.log.children.length > 7) this.log.firstChild.remove();
    setTimeout(() => d.classList.add('faded'), 12000);
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.form.classList.remove('hidden');
    this.log.classList.add('open');
    this.onOpenChange?.(true);
    setTimeout(() => this.input.focus(), 30);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.input.blur();
    this.form.classList.add('hidden');
    this.log.classList.remove('open');
    this.onOpenChange?.(false);
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
}
