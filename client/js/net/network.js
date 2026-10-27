// Conexión WebSocket con el servidor: autenticación con token, reconexión automática y ping.

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.token = null;
    this.connected = false;
    this.closedByUser = false;
    this.retries = 0;
    this.rtt = 0;
    this.onStatus = null; // (estado) => 'online' | 'reconnecting' | 'offline'
  }

  on(type, fn) { this.handlers.set(type, fn); }

  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  // Resuelve con el mensaje 'welcome'
  connect(token) {
    this.token = token;
    this.closedByUser = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url());
      this.ws = ws;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Tiempo de conexión agotado')); try { ws.close(); } catch { /* */ } } }, 12000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token }));
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') {
          this.connected = true; this.retries = 0;
          this.onStatus?.('online');
          this.startPing();
          if (!settled) { settled = true; clearTimeout(timer); resolve(m); return; }
        }
        if (m.t === 'auth_fail' && !settled) { settled = true; clearTimeout(timer); reject(Object.assign(new Error(m.m), { auth: true })); return; }
        if (m.t === 'pong') { this.rtt = performance.now() - m.c; return; }
        const h = this.handlers.get(m.t);
        if (h) { try { h(m); } catch (e) { console.error('[net] error en', m.t, e); } }
      };
      ws.onclose = (ev) => {
        this.connected = false;
        clearInterval(this.pingTimer);
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('No se pudo conectar al servidor')); return; }
        if (this.closedByUser || ev.code === 4001 || ev.code === 4003) { this.onStatus?.('offline', ev.code); return; }
        this.scheduleReconnect();
      };
      ws.onerror = () => { /* onclose se encarga */ };
    });
  }

  scheduleReconnect() {
    this.onStatus?.('reconnecting');
    const delay = Math.min(8000, 800 * 2 ** this.retries++);
    setTimeout(async () => {
      if (this.closedByUser) return;
      try {
        const welcome = await this.connect(this.token);
        this.handlers.get('welcome')?.(welcome);
      } catch (e) {
        if (e.auth) { this.onStatus?.('offline', 4001); return; }
        this.scheduleReconnect();
      }
    }, delay);
  }

  startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 5000);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.closedByUser = true;
    clearInterval(this.pingTimer);
    try { this.ws?.close(); } catch { /* */ }
  }
}

export async function apiAuth(kind, user, pass) {
  const r = await fetch(`/api/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, pass }) });
  let data = null;
  try { data = await r.json(); } catch { /* */ }
  if (!data) throw new Error('El servidor no respondió correctamente.');
  return data;
}
