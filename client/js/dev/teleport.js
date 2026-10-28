// ⚠ SOLO DESARROLLO: botón para teletransportarse entre Puerto Nova, Ciudad Montañosa y Ciudad Desértica.
// El botón solo aparece si el servidor lo permite (mensaje 'dev'); el servidor elige el punto seguro.
// Para quitarlo: borra este archivo, server/devTeleport.js y las líneas marcadas "DEV-TP".

export function installDevTeleport(game) {
  const n = game.net;
  let root = null;

  n.on('dev', (m) => {
    if (root || !Array.isArray(m.dests)) return;
    root = buildUi(m.dests, (id) => n.send({ t: 'dev_tp', to: id }));
    document.getElementById('hud').appendChild(root);
  });

  n.on('dev_tp', (m) => {
    const p = game.player;
    if (!p) return;
    p.teleport(m.x, m.y, m.z);
    p.facing = m.ry || 0;
    game.cam?.reset(m.x, m.y, m.z, p.facing);
    game.input?.releaseAll();
    game.hud?.toast(`Teletransporte (desarrollo): ${m.name}`, true);
  });
}

function buildUi(dests, go) {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;z-index:4;top:calc(10px + var(--safe-t));left:calc(var(--mm, 118px) + 22px + var(--safe-l));display:flex;flex-direction:column;gap:6px;align-items:flex-start;pointer-events:auto;';
  const btnCss = 'font:600 12px system-ui,sans-serif;color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:6px 10px;cursor:pointer;';
  const toggle = document.createElement('button');
  toggle.textContent = 'DEV · Viajar';
  toggle.style.cssText = btnCss + 'background:rgba(183,28,28,.85);';
  const list = document.createElement('div');
  list.style.cssText = 'display:none;flex-direction:column;gap:6px;background:rgba(10,14,18,.85);padding:8px;border-radius:10px;';
  for (const d of dests) {
    const b = document.createElement('button');
    b.textContent = d.name;
    b.style.cssText = btnCss + 'background:rgba(40,60,80,.95);text-align:left;';
    b.addEventListener('click', () => { list.style.display = 'none'; go(d.id); });
    list.appendChild(b);
  }
  toggle.addEventListener('click', () => { list.style.display = list.style.display === 'none' ? 'flex' : 'none'; });
  // que los toques en el panel no lleguen a los controles del juego
  for (const ev of ['pointerdown', 'touchstart']) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  root.append(toggle, list);
  return root;
}
