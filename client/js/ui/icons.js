// Íconos SVG en línea (sin descargas extra). Trazo blanco, estilo minimalista.

const s = (body, fill = 'none') =>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  fire: s('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  aim: s('<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><circle cx="12" cy="12" r="2.5"/>'),
  jump: s('<path d="M12 19V6M6 11l6-6 6 6"/><path d="M5 21h14"/>'),
  crouch: s('<path d="M12 5v11M6 11l6 6 6-6"/><path d="M5 21h14"/>'),
  sprint: s('<path d="M5 17l5-5-5-5M12 17l5-5-5-5"/>'),
  reload: s('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>'),
  accel: s('<path d="M12 4l7 9h-4v7H9v-7H5z"/>'),
  brake: s('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  boost: s('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  exit: s('<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
  interact: s('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4.5a1.5 1.5 0 0 1 3 0V12M14 6.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.8-2.4L3 14.5a1.5 1.5 0 0 1 2.4-1.8L8 15"/>'),
  chat: s('<path d="M4 5h16v11H9l-5 4z"/>'),
  bike: s('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h6l2 7M10 9l3 7M14 6h3"/>'),
  inv: s('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  settings: s('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  map: s('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
};

export function applyIcons(root) {
  root.querySelectorAll('[data-btn]').forEach((el) => {
    const id = el.dataset.btn;
    if (id === 'interact') { el.querySelector('.pill-icon').innerHTML = ICONS.interact; return; }
    if (ICONS[id]) el.innerHTML = ICONS[id];
  });
  root.querySelectorAll('.tb[data-ui]').forEach((el) => { const id = el.dataset.ui; if (ICONS[id]) el.innerHTML = ICONS[id]; });
}
