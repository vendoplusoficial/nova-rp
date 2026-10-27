// Arranque: inicio de sesión, botón "JUGAR EN PANTALLA COMPLETA", carga y orientación.

import { Settings, safeGet, safeSet, safeDel } from './settings.js';
import { Audio } from './engine/audio.js';
import { apiAuth } from './net/network.js';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'novarp.session.v1';

const settings = new Settings();
const audio = new Audio(settings);
let session = null;
let game = null;

// Precarga del motor (Three.js y el juego) mientras el jugador inicia sesión
const gameModule = import('./game.js');
gameModule.catch((e) => showError('No se pudo cargar el juego: ' + e.message + '. ¿Ejecutaste "npm install"?'));

const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

// ---------- bloquear gestos del navegador (scroll, zoom, menú) ----------
const allowTouch = (t) => t && t.closest && (t.closest('.allow-touch') || t.closest('.screen') || t.tagName === 'INPUT' || t.tagName === 'SELECT');
document.addEventListener('touchmove', (e) => { if (!allowTouch(e.target)) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => { if (!allowTouch(e.target)) e.preventDefault(); });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  const t = e.target;
  const interactive = t && t.closest && t.closest('button, input, select, label, form, .panel, .screen, #minimap');
  if (now - lastTouchEnd < 300 && !interactive) e.preventDefault(); // evita zoom por doble toque
  lastTouchEnd = now;
}, { passive: false });

// ---------- pantallas ----------
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  $('screens').classList.toggle('hidden', !id);
}
function showError(msg) { $('login-error').textContent = msg || ''; }

function loadSession() {
  try { const s = JSON.parse(safeGet(TOKEN_KEY) || 'null'); if (s && s.token && s.name) return s; } catch { /* */ }
  return null;
}

function initLogin() {
  const saved = loadSession();
  if (saved) {
    $('resume-box').classList.remove('hidden');
    $('cred-box').classList.add('hidden');
    $('resume-name').textContent = saved.name;
  }
  $('btn-resume').addEventListener('click', () => { session = saved; goPlayScreen(); });
  $('btn-switch').addEventListener('click', () => {
    safeDel(TOKEN_KEY);
    $('resume-box').classList.add('hidden');
    $('cred-box').classList.remove('hidden');
  });
  $('login-form').addEventListener('submit', (e) => { e.preventDefault(); auth('login'); });
  $('btn-register').addEventListener('click', () => auth('register'));
  fetch('/api/status').then((r) => r.json()).then((s) => {
    $('server-status').textContent = `Servidor en línea · ${s.players}/${s.max} jugadores`;
    if (s.libs && !s.libs.three) showError('Falta Three.js en el servidor. Ejecuta "npm install" y reinicia.');
  }).catch(() => { $('server-status').textContent = 'Servidor no disponible'; });
}

async function auth(kind) {
  const user = $('in-user').value.trim(), pass = $('in-pass').value;
  showError('');
  if (!user || !pass) { showError('Escribe usuario y contraseña.'); return; }
  $('btn-login').disabled = $('btn-register').disabled = true;
  try {
    const r = await apiAuth(kind, user, pass);
    if (!r.ok) { showError(r.error || 'Error'); return; }
    session = { token: r.token, name: r.name };
    safeSet(TOKEN_KEY, JSON.stringify(session));
    goPlayScreen();
  } catch (e) {
    showError('No se pudo contactar al servidor.');
  } finally {
    $('btn-login').disabled = $('btn-register').disabled = false;
  }
}

function goPlayScreen() {
  $('play-name').textContent = session.name;
  $('ios-tip').classList.toggle('hidden', !(isIOS && !isStandalone));
  if (isIOS && !document.documentElement.requestFullscreen) $('btn-fullscreen-play').textContent = 'JUGAR';
  showScreen('screen-play');
}

async function requestFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch { /* el navegador no lo permite: seguimos sin pantalla completa */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* no soportado */ }
}

async function startGame(fullscreen) {
  audio.unlock();
  if (fullscreen) await requestFullscreen();
  showScreen('screen-loading');
  const bar = $('load-bar'), txt = $('load-text');
  const progress = (p, t) => { bar.style.width = Math.round(p * 100) + '%'; if (t) txt.textContent = t; };
  try {
    progress(0.02, 'Cargando motor 3D…');
    const { Game } = await gameModule;
    game = new Game({ settings, audio, session, onLogout: logout, requestFullscreen });
    window.__novarp = game; // acceso desde la consola del navegador para depurar
    await game.init(progress);
    showScreen(null);
    game.start();
    updateOrientation();
  } catch (e) {
    console.error(e);
    if (e.auth) { safeDel(TOKEN_KEY); location.reload(); return; }
    showScreen('screen-login');
    $('resume-box').classList.add('hidden');
    $('cred-box').classList.remove('hidden');
    showError((e && e.message) || 'Error al iniciar el juego.');
  }
}

function logout(msg) {
  safeDel(TOKEN_KEY);
  if (msg) alert(msg);
  location.reload();
}

function updateOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotate').classList.toggle('hidden', !(game && game.running && portrait && isTouch));
}
window.addEventListener('resize', updateOrientation);
window.addEventListener('orientationchange', () => setTimeout(updateOrientation, 200));

$('btn-fullscreen-play').addEventListener('click', () => startGame(true));
$('btn-window-play').addEventListener('click', () => startGame(false));

// PWA: el service worker solo funciona en HTTPS o localhost
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

initLogin();
showScreen('screen-login');
