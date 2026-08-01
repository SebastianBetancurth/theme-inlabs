/* ==========================================================================
   Motor del cart drawer ZZEN
   Ruta: assets/zzen-cart-drawer.js

   Hace cuatro cosas: anima la barra de desbloqueos, añade y retira los regalos
   automáticos, mete productos desde las recomendaciones sin recargar, y
   destapa el spinner de carga en cuanto se pulsa + o -.

   ---------------------------------------------------------------------------
   POR QUÉ ES UN CUSTOM ELEMENT Y NO UN SCRIPT SUELTO

   Dawn refresca el drawer reemplazando innerHTML: al añadir reescribe
   #CartDrawer, y al cambiar cantidades reescribe .drawer__inner. Cualquier
   cosa enganchada a un nodo interno muere en ese momento.

   Un custom element resuelve el problema de raíz: como <zzen-cart-engine>
   vive dentro de .drawer__inner, cada refresco lo destruye y construye uno
   nuevo, así que connectedCallback vuelve a ejecutarse solo. No hace falta
   MutationObserver, ni suscribirse al pub/sub de Dawn, ni volver a inicializar
   nada a mano. El HTML nuevo viene del servidor con los números ya calculados
   en Liquid, y el motor solo tiene que decidir si toca escribir en el carrito.

   Lo único que NO puede ir dentro del elemento son los listeners de las
   recomendaciones y de los botones de cantidad, porque esos nodos también se
   destruyen. Van por delegación sobre <cart-drawer>, que es el único que
   sobrevive a todo.
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     PARCHE A CART.JS

     resetQuantityInput busca solo #Quantity-N, que es el id de la página de
     carrito. En el drawer los inputs se llaman #Drawer-quantity-N, así que
     devuelve null y la línea siguiente revienta con "Cannot read properties
     of null". Se dispara al escribir un número que no pasa la validación,
     típicamente un 0 para vaciar la línea a mano.

     Es un fallo del propio Dawn, no de este drawer, pero se manifiesta aquí y
     el parche cabe en seis líneas: se añade el id del drawer como alternativa
     y se sale sin hacer nada si tampoco existe.

     cart.js declara CartItems con `class` en el ámbito global de un script
     clásico, así que la clase se ve por nombre pero NO cuelga de window. Se
     comprueba con typeof y todo va dentro de try por si algún día Dawn la
     convierte en módulo y deja de estar accesible.
  ------------------------------------------------------------------------ */
  try {
    if (typeof CartItems !== 'undefined' && CartItems.prototype.resetQuantityInput) {
      CartItems.prototype.resetQuantityInput = function (id) {
        const input =
          this.querySelector('#Quantity-' + id) || this.querySelector('#Drawer-quantity-' + id);
        if (!input) return;
        input.value = input.getAttribute('value');
        this.isEnterPressed = false;
      };
    }
  } catch (e) {
    /* Sin parche se pierde solo el reseteo del input tras un valor inválido. */
  }

  /* Compartido por TODAS las instancias del motor. Es la clave de que no haya
     dos escrituras del carrito en vuelo a la vez: cada re-render crea un
     elemento nuevo, pero el candado es del módulo, no del elemento. */
  let busy = false;

  /* Freno de emergencia. Si por una configuración imposible (dos hitos con el
     mismo umbral, un regalo que sube el importe por encima de su propio
     umbral) el motor entrara en bucle, esto lo corta en seco en lugar de
     dejarlo martilleando la API del carrito. */
  let passes = 0;
  let passesTimer = null;
  const MAX_PASSES = 8;

  /* Red de seguridad del spinner manual: ver showLineSpinner(). */
  const SPINNER_FALLBACK_MS = 5000;

  /* Regalos cuyo alta ha fallado (sin stock, variante borrada). No se
     reintentan en esta sesión: si no, cada cambio del carrito volvería a
     lanzar una petición condenada a fallar. */
  const failed = new Set();

  /* Último ancho de la barra, para poder animar desde el valor anterior. El
     DOM se reemplaza entero, así que la transición CSS no arrancaría sola:
     el elemento nuevo nace ya con su ancho final. */
  let lastFill = null;

  const drawer = () => document.querySelector('cart-drawer');
  const scroller = () => document.querySelector('cart-drawer-items');

  function countPass() {
    passes += 1;
    clearTimeout(passesTimer);
    passesTimer = setTimeout(() => {
      passes = 0;
    }, 4000);
    return passes <= MAX_PASSES;
  }

  async function post(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  function sectionsPayload() {
    return {
      sections: 'cart-drawer,cart-icon-bubble',
      sections_url: window.location.pathname,
    };
  }

  /* ------------------------------------------------------------------------
     SPINNER INMEDIATO AL PULSAR + O -

     El recorrido normal de Dawn es este:

       click  ->  quantity-input.js hace stepUp() y el número cambia YA
       +300ms ->  vence el debounce de CartItems (ON_CHANGE_DEBOUNCE_TIMER)
       +300ms ->  arranca el fetch y enableLoading() destapa el spinner

     O sea que durante 300 ms el número ya ha cambiado pero no hay ningún
     indicador de que se esté guardando nada. Se ve como si el spinner llegara
     tarde, porque llega tarde.

     Aquí se destapa el spinner en el propio click. enableLoading() volverá a
     quitarle la clase `hidden` cuando le toque, lo cual es inofensivo, y
     disableLoading() se la devuelve al terminar.

     El número no se puede congelar: validateQuantity() lee event.target.value
     cuando vence el debounce, así que revertirlo mandaría al carrito la
     cantidad vieja. Se atenúa con la clase is-updating, que es la señal de
     "pendiente de confirmar" sin tocar el dato.

     El temporizador de respaldo cubre el caso en que el cambio nunca llegue a
     dispararse (por ejemplo al chocar contra el máximo de la variante, donde
     stepUp no cambia el valor y no se emite ningún evento). Sin él, el
     spinner se quedaría girando para siempre.
  ------------------------------------------------------------------------ */
  function showLineSpinner(btn) {
    const line = btn.closest('.zsd-line');
    if (!line) return;

    const spinners = line.querySelectorAll('.loading__spinner');
    if (!spinners.length) return;

    const qty = btn.closest('quantity-input');

    spinners.forEach((sp) => sp.classList.remove('hidden'));
    if (qty) qty.classList.add('is-updating');

    clearTimeout(line.zzenSpinnerTimer);
    line.zzenSpinnerTimer = setTimeout(() => {
      spinners.forEach((sp) => sp.classList.add('hidden'));
      if (qty) qty.classList.remove('is-updating');
    }, SPINNER_FALLBACK_MS);
  }

  /* ------------------------------------------------------------------------
     Reemplazo de secciones.

     No se usa el renderContents de Dawn a propósito: ese método termina
     llamando a this.open(). Cuando el regalo se añade en segundo plano con el
     drawer cerrado (por ejemplo desde una página de colección), el carrito
     lateral se abriría de golpe sin que el visitante haya pedido nada. Aquí se
     hace el mismo intercambio pero sin tocar el estado abierto/cerrado.
  ------------------------------------------------------------------------ */
  function swap(sections) {
    if (!sections) return;

    const box = scroller();
    const keepScroll = box ? box.scrollTop : 0;

    const jobs = [
      { html: sections['cart-drawer'], target: '#CartDrawer', pick: '#CartDrawer' },
      { html: sections['cart-icon-bubble'], target: '#cart-icon-bubble', pick: '.shopify-section' },
    ];

    jobs.forEach(({ html, target, pick }) => {
      if (!html) return;
      const el = document.querySelector(target);
      if (!el) return;
      let fresh;
      try {
        fresh = new DOMParser().parseFromString(html, 'text/html').querySelector(pick);
      } catch (e) {
        return;
      }
      if (fresh) el.innerHTML = fresh.innerHTML;
    });

    /* Reescribir #CartDrawer destruye el velo y con él su listener de cierre.
       Dawn hace exactamente esto mismo al final de su renderContents. Si se
       olvida, el drawer deja de cerrarse al pulsar fuera y el visitante cree
       que la página se ha colgado. */
    const d = drawer();
    if (d) {
      const overlay = d.querySelector('#CartDrawer-Overlay');
      if (overlay) overlay.addEventListener('click', () => d.close());
    }

    const box2 = scroller();
    if (box2) box2.scrollTop = keepScroll;

    document.dispatchEvent(
      new CustomEvent('zzen:cart:rendered', { bubbles: true, detail: { sections } })
    );
  }

  /* ------------------------------------------------------------------------
     Añadir desde las recomendaciones
  ------------------------------------------------------------------------ */
  async function addReco(btn) {
    if (busy) return;
    const id = btn.dataset.zsdAdd;
    if (!id) return;

    const card = btn.closest('.zsd-reco__card');
    if (card) card.classList.add('is-loading');
    btn.disabled = true;
    busy = true;

    try {
      const data = await post((btn.dataset.addUrl || '/cart/add') + '.js', {
        id: id,
        quantity: 1,
        ...sectionsPayload(),
      });

      busy = false;

      if (data && data.status) {
        // Error de Shopify (sin stock, variante inválida). Se devuelve la
        // tarjeta a su estado normal en lugar de dejarla gris para siempre.
        if (card) card.classList.remove('is-loading');
        btn.disabled = false;
        return;
      }

      swap(data.sections);
    } catch (e) {
      busy = false;
      if (card) card.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------------
     Delegación sobre <cart-drawer>, el único nodo que sobrevive a los
     re-renders. Un solo listener para las dos cosas.
  ------------------------------------------------------------------------ */
  function bindDrawer() {
    const d = drawer();
    if (!d || d.zzenBound) return;
    d.zzenBound = true;

    d.addEventListener('click', (event) => {
      const addBtn = event.target.closest('[data-zsd-add]');
      if (addBtn) {
        event.preventDefault();
        addReco(addBtn);
        return;
      }

      const qtyBtn = event.target.closest('.zsd-qty__btn');
      if (qtyBtn && !qtyBtn.disabled) {
        showLineSpinner(qtyBtn);
      }
    });
  }

  /* ------------------------------------------------------------------------
     El motor
  ------------------------------------------------------------------------ */
  class ZzenCartEngine extends HTMLElement {
    connectedCallback() {
      bindDrawer();
      this.animateFill();
      this.runGifts();
    }

    animateFill() {
      const fill = this.querySelector('[data-zsd-fill]');
      if (!fill) return;

      const target = fill.style.width || '0px';

      if (lastFill !== null && lastFill !== target) {
        // Se planta el ancho anterior sin transición, y en el fotograma
        // siguiente se pone el nuevo: así el navegador tiene dos valores
        // distintos que interpolar y la barra se ve crecer.
        fill.style.transition = 'none';
        fill.style.width = lastFill;
        requestAnimationFrame(() => {
          fill.style.transition = '';
          requestAnimationFrame(() => {
            fill.style.width = target;
          });
        });
      }

      lastFill = target;
    }

    async runGifts() {
      if (busy) return;

      let rules = [];
      try {
        rules = JSON.parse(this.dataset.gifts || '[]');
      } catch (e) {
        return;
      }
      if (!rules.length) return;

      const qualifying = parseInt(this.dataset.qualifying, 10) || 0;
      const prop = this.dataset.giftProp || '_zzen_gift';

      const toAdd = rules.filter(
        (r) => qualifying >= r.threshold && !r.key && !failed.has(r.id)
      );
      const toRemove = rules.filter((r) => qualifying < r.threshold && r.key && r.remove);

      if (!toAdd.length && !toRemove.length) return;
      if (!countPass()) return;

      /* Una sola operación por pasada, y siempre retirar antes que añadir.
         Al terminar, el re-render construye un motor nuevo que vuelve a
         comprobar y sigue con la siguiente si queda alguna. Encadenarlas en un
         bucle aquí sería más rápido pero abriría la puerta a dos peticiones
         simultáneas al carrito, que es la receta para cantidades duplicadas. */
      busy = true;

      try {
        if (toRemove.length) {
          const rule = toRemove[0];
          const data = await post((this.dataset.cartChangeUrl || '/cart/change') + '.js', {
            id: rule.key,
            quantity: 0,
            ...sectionsPayload(),
          });
          busy = false;
          swap(data.sections);
          return;
        }

        const rule = toAdd[0];
        const properties = {};
        properties[prop] = rule.id;

        const data = await post((this.dataset.cartAddUrl || '/cart/add') + '.js', {
          id: rule.variant,
          quantity: 1,
          properties: properties,
          ...sectionsPayload(),
        });

        busy = false;

        if (data && data.status) {
          // El regalo no se puede añadir. Se marca para no reintentarlo y se
          // sigue: que falte un detalle promocional no debe impedir comprar.
          failed.add(rule.id);
          return;
        }

        swap(data.sections);
      } catch (e) {
        busy = false;
      }
    }
  }

  if (!customElements.get('zzen-cart-engine')) {
    customElements.define('zzen-cart-engine', ZzenCartEngine);
  }
})();