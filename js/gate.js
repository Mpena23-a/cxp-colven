/* =====================================================================
   COLVEN · Pantalla de contraseña
   El panel queda difuminado y bloqueado hasta escribir la contraseña.
   La contraseña no está escrita aquí: solo su huella SHA-256.
   Para cambiarla, calcula la huella SHA-256 de la nueva contraseña y
   reemplaza el valor de HUELLA (ver README).
   ===================================================================== */
(function () {
  const HUELLA = 'bdf0693654b383007bfe4db4dc69c7ff540a92265b7196731b5e93c327cb8eee';
  const KEY = 'colven-cxp-acceso';
  const $ = s => document.querySelector(s);

  /* SHA-256 en JavaScript puro (funciona también al abrir el archivo sin servidor) */
  function sha256(ascii) {
    const rotr = (v, n) => (v >>> n) | (v << (32 - n));
    const K = [], H = [];
    let isComposite = {}, cand = 2, n = 0;
    while (n < 64) {
      if (!isComposite[cand]) {
        for (let i = cand * cand; i < 313; i += cand) isComposite[i] = 1;
        H[n] = (Math.pow(cand, 0.5) * 4294967296) | 0;
        K[n++] = (Math.pow(cand, 1 / 3) * 4294967296) | 0;
      }
      cand++;
    }
    const bytes = new TextEncoder().encode(ascii);
    const l = bytes.length * 8;
    const words = [];
    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    padded.set(bytes); padded[bytes.length] = 0x80;
    for (let i = 0; i < padded.length; i += 4) words.push((padded[i] << 24) | (padded[i + 1] << 16) | (padded[i + 2] << 8) | padded[i + 3]);
    words[words.length - 1] = l >>> 0;
    words[words.length - 2] = Math.floor(l / 4294967296);
    let hash = H.slice(0, 8);
    for (let j = 0; j < words.length; j += 16) {
      const w = words.slice(j, j + 16);
      const old = hash.slice(0);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        if (i >= 16) w[i] = (w[i - 16] + (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10))) | 0;
        const t1 = hash[7] + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + K[i] + w[i];
        const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
        hash.length = 8;
      }
      hash = hash.map((v, i) => (v + old[i]) | 0);
    }
    return hash.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function remembered() { try { return sessionStorage.getItem(KEY) === HUELLA; } catch (e) { return false; } }
  function remember() { try { sessionStorage.setItem(KEY, HUELLA); } catch (e) { /* sin almacenamiento */ } }

  function unlock(animated) {
    const gate = $('#gate'), app = $('#app');
    app.removeAttribute('inert');
    app.classList.remove('locked');
    if (animated) {
      gate.classList.add('out');
      setTimeout(() => { gate.hidden = true; }, 500);
    } else gate.hidden = true;
    document.body.classList.remove('gate-open');
    window.dispatchEvent(new Event('colven:unlocked'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 520);
  }

  function init() {
    if (remembered()) { unlock(false); return; }
    document.body.classList.add('gate-open');
    const input = $('#gatePass'), err = $('#gateErr'), card = $('.gate-card');
    setTimeout(() => input.focus(), 50);
    $('#gateEye').addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      $('#gateEye').setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      input.focus();
    });
    input.addEventListener('input', () => { err.textContent = ''; card.classList.remove('bad'); });
    $('#gateForm').addEventListener('submit', e => {
      e.preventDefault();
      if (sha256(input.value) === HUELLA) {
        remember();
        unlock(true);
      } else {
        err.textContent = 'Contraseña incorrecta. Inténtalo de nuevo.';
        card.classList.remove('bad'); void card.offsetWidth; card.classList.add('bad');
        input.select();
      }
    });
  }

  window.COLVEN_GATE = { isUnlocked: () => !$('#app').classList.contains('locked') };
  init();
})();
