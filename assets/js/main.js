/* ============================================================
   MAIN.JS — Toda la interactividad del sitio SEMAX
   ------------------------------------------------------------
   Vanilla JS, sin dependencias. Se ejecuta con `defer` para no
   bloquear el renderizado inicial.
   Organizado en bloques modulares dentro de una IIFE para no
   contaminar el scope global:
     1) Año dinámico del footer
     2) Nav (hamburguesa + estado scrolled)
     3) Reveal de elementos al hacer scroll (IntersectionObserver)
     4) Stagger automático de grids (delay incremental por hijo)
     5) Count-up animado de los stats numéricos
     6) Formulario de cotización (validación + envío a WhatsApp)
     7) Lightbox (galería + teclado + focus trap)
   ============================================================ */

(() => {
  'use strict';

  /* ─── 1) AÑO DINÁMICO ─────────────────────────────────────
     Inyecta el año actual en el <span id="year"> del footer.
     Evita tener que actualizar manualmente cada 1 de enero. */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();


  /* ─── 2) NAV: HAMBURGUESA Y SCROLL ────────────────────────
     • Click en hamburguesa → toggle clase .is-open en el menú
       y bloquea el scroll del body para que no se mueva atrás
     • Click en cualquier link del menú → cierra el menú
     • Scroll del usuario → agrega .is-scrolled al nav (que se
       compacta y cambia de estilo)
     ────────────────────────────────────────────────────────── */
  const nav  = document.getElementById('navbar');
  const hb   = document.getElementById('hamburger');
  const menu = document.getElementById('nav-menu');

  // Abrir/cerrar menú móvil
  hb?.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    hb.classList.toggle('is-open', open);
    hb.setAttribute('aria-expanded', String(open));     // Accesibilidad: comunica estado a lectores
    document.body.style.overflow = open ? 'hidden' : ''; // Bloquea scroll del body cuando está abierto
  });

  // Cerrar menú automáticamente al hacer click en cualquier link
  menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    menu.classList.remove('is-open');
    hb.classList.remove('is-open');
    hb.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }));

  // Compactar nav al scrollear más de 30px
  const onScroll = () => nav?.classList.toggle('is-scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });  // passive=true: mejor performance, no bloquea scroll
  onScroll();   // Ejecuta una vez al cargar por si la página se carga ya scrolleada


  /* ─── 3) REVEAL ON SCROLL ─────────────────────────────────
     IntersectionObserver es la API moderna para detectar cuándo
     un elemento entra en el viewport — sin necesidad de escuchar
     el evento scroll (que es costoso).
     Threshold 0.12 = se activa cuando el 12% del elemento es
     visible. Una vez animado, se deja de observar (unobserve).
     ────────────────────────────────────────────────────────── */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);    // Una vez animado, no nos interesa más
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => io.observe(el));


  /* ─── 4) STAGGER AUTOMÁTICO DE GRIDS ──────────────────────
     Los elementos con data-stagger en su contenedor reciben un
     transition-delay incremental (0s, 0.06s, 0.12s...) para que
     aparezcan en cascada, no todos al mismo tiempo. Más elegante.
     ────────────────────────────────────────────────────────── */
  document.querySelectorAll('[data-stagger]').forEach(grid => {
    [...grid.children].forEach((el, i) => {
      el.style.transitionDelay = (i * 0.06) + 's';
      el.classList.add('reveal');
      io.observe(el);
    });
  });


  /* ─── 5) COUNT-UP DE STATS ────────────────────────────────
     Los números del hero (24, 5, 100, 60) se animan desde 0 hasta
     su valor final cuando entran en pantalla. Easing cubic
     (1 - (1-p)³) para que arranque rápido y frene al final.
     ────────────────────────────────────────────────────────── */
  const countIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = el.dataset.count;           // Valor objetivo (ej. "24")
      const suffix = el.dataset.suffix || '';    // Sufijo (ej. "/7", "%", "m")
      const final = parseInt(target, 10);
      if (Number.isNaN(final)) { countIO.unobserve(el); return; }

      const duration = 1100;                     // ms totales de la animación
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);   // Progreso 0→1
        const eased = 1 - Math.pow(1 - p, 3);              // Curva ease-out cubic
        el.textContent = Math.round(final * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      countIO.unobserve(el);
    });
  }, { threshold: 0.4 });    // Threshold más alto: que se vea bien antes de empezar a contar

  document.querySelectorAll('[data-count]').forEach(el => countIO.observe(el));


  /* ─── 6) FORMULARIO DE COTIZACIÓN ─────────────────────────
     Flujo:
     1) Usuario llena el form y hace click en "Enviar Solicitud"
     2) JS valida que Nombre y Teléfono no estén vacíos
        - Si faltan: marca campo en rojo y enfoca el primero
     3) Construye un mensaje pre-llenado de WhatsApp con todos
        los datos y abre wa.me en pestaña nueva
     4) Muestra pantalla de éxito en el card
     NOTA: No envía a un backend — todo se canaliza por WhatsApp.
     Si más adelante quieren capturar leads, aquí se agregaría
     un fetch() a Formspree, EmailJS o un endpoint propio.
     ────────────────────────────────────────────────────────── */
  const form      = document.getElementById('cotizar-form');
  const formCard  = document.getElementById('form-card');
  const submitBtn = document.getElementById('form-submit');

  form?.addEventListener('submit', (ev) => {
    ev.preventDefault();                        // No queremos el submit nativo del navegador

    // Validación: nombre y teléfono son obligatorios
    const required = ['f-name', 'f-tel'];
    let valid = true;
    required.forEach(id => {
      const el  = document.getElementById(id);
      const grp = el.closest('.form-group');
      if (!el.value.trim()) { grp.classList.add('has-error'); valid = false; }
      else                  { grp.classList.remove('has-error'); }
    });

    if (!valid) {
      document.querySelector('.has-error input')?.focus();   // UX: enfoca el primer error
      return;
    }

    // Recolecta valores del form (helper para no repetir document.getElementById)
    const get = id => document.getElementById(id).value.trim();
    const name    = get('f-name');
    const tel     = get('f-tel');
    const empresa = get('f-empresa');
    const cap     = get('f-cap');
    const cis     = get('f-cisterna');
    const dir     = get('f-dir');
    const msg     = get('f-msg');

    // Loading state: deshabilita el botón y muestra spinner
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Enviando...';

    // Pequeño delay para que se vea el spinner (más natural que abrir WA instantáneo)
    setTimeout(() => {
      // %0A = salto de línea URL-encoded para WhatsApp
      // Construimos el mensaje con todos los datos opcionales que sí se llenaron
      const wa =
        `Hola, soy ${name}${empresa ? ' de ' + empresa : ''}.%0A` +
        `Me interesa cotizar una pipa de agua:` +
        `${cap ? '%0A• Capacidad: ' + cap : ''}` +
        `${cis ? '%0A• Cisterna: ' + cis : ''}` +
        `${dir ? '%0A• Entrega en: ' + dir : ''}` +
        `${msg ? '%0A• Nota: ' + msg : ''}` +
        `%0A%0AMi teléfono: ${tel}`;

      // 5215560670592 = +52 (1) 55 6067 0592 — formato internacional de WhatsApp Business
      window.open(`https://api.whatsapp.com/send?phone=5215560670592&text=${wa}`, '_blank');

      // Reemplaza el form con la pantalla de éxito (CSS controla el display)
      formCard.classList.add('is-success');
    }, 600);
  });

  // Al escribir en un campo con error, quita el estado de error
  form?.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => el.closest('.form-group')?.classList.remove('has-error'));
  });


  /* ─── 7) LIGHTBOX DE GALERÍA ──────────────────────────────
     Modal full-screen para ver las fotos de pipas en grande.
     Soporta:
     • Click en imagen → abrir
     • Click en X o en fondo → cerrar
     • Flechas ← → del teclado → navegar
     • Esc → cerrar
     • Tab → focus se queda atrapado dentro del modal (a11y)
     ────────────────────────────────────────────────────────── */
  const lb = document.getElementById('lightbox');
  if (lb) {
    const lbImg  = document.getElementById('lb-img');
    const lbCap  = document.getElementById('lb-cap');
    const lbCnt  = document.getElementById('lb-counter');

    // Convierte cada card [data-lb] en un item del lightbox
    const triggers = [...document.querySelectorAll('[data-lb]')];
    const items = triggers.map(el => {
      const img = el.querySelector('img');
      return { src: img.src, cap: img.alt };
    });

    let lbIdx = 0;
    let lastFocus = null;   // Para restaurar el foco al cerrar (a11y)

    // Refresca imagen + caption + contador "X / N"
    const update = () => {
      const it = items[lbIdx];
      if (!it) return;
      lbImg.src = it.src;
      lbImg.alt = it.cap;
      lbCap.textContent = it.cap;
      lbCnt.textContent = (lbIdx + 1) + ' / ' + items.length;
    };

    const open = (i) => {
      lbIdx = i;
      lastFocus = document.activeElement;       // Recuerda quién tenía el foco
      update();
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';  // Bloquea scroll del body
      lb.querySelector('.lb-close').focus();    // Mueve foco al botón cerrar
    };

    const close = () => {
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
      lastFocus?.focus();                       // Devuelve foco a la card que se abrió
    };

    // Navegación cíclica (después del último vuelve al primero y vice-versa)
    const next = () => { lbIdx = (lbIdx + 1) % items.length;             update(); };
    const prev = () => { lbIdx = (lbIdx - 1 + items.length) % items.length; update(); };

    // Click + teclado (Enter/Espacio) en cada card
    triggers.forEach((el, i) => {
      el.addEventListener('click', () => open(i));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
      });
    });

    // Botones del lightbox
    lb.querySelector('.lb-close')?.addEventListener('click', close);
    lb.querySelector('.lb-prev')?.addEventListener('click', prev);
    lb.querySelector('.lb-next')?.addEventListener('click', next);

    // Click en el fondo oscuro (no en la imagen) cierra
    lb.addEventListener('click', e => { if (e.target === lb) close(); });

    // Atajos de teclado solo cuando el lightbox está abierto
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;

      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft')  prev();

      // Focus-trap: Tab no debe salir del modal (accesibilidad)
      if (e.key === 'Tab') {
        const focusables = lb.querySelectorAll('button');
        const first = focusables[0];
        const last  = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    });
  }
})();
