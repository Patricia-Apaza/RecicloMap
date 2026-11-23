// Sustituto de Google Maps para las pruebas: dibuja marcadores y radio como elementos del DOM
(() => {
  const punto = (valor) => ({ lat: Number(valor.lat), lng: Number(valor.lng) });
  class LatLng {
    constructor(lat, lng) {
      this.latitud = lat;
      this.longitud = lng;
    }
    lat() {
      return this.latitud;
    }
    lng() {
      return this.longitud;
    }
    toJSON() {
      return { lat: this.latitud, lng: this.longitud };
    }
  }
  class Oyentes {
    constructor() {
      this.oyentes = {};
    }
    addListener(evento, funcion) {
      (this.oyentes[evento] ??= []).push(funcion);
      return { remove() {} };
    }
    emitir(evento, dato) {
      for (const funcion of this.oyentes[evento] ?? []) funcion(dato);
    }
  }
  class LatLngBounds {
    extend() {
      return this;
    }
  }
  class Map extends Oyentes {
    constructor(lienzo, opciones) {
      super();
      this.lienzo = lienzo;
      this.centro = punto(opciones.center);
      lienzo.dataset.mapaSimulado = 'si';
      lienzo.addEventListener('click', (evento) => {
        if (evento.target !== lienzo) return;
        this.emitir('click', { latLng: new LatLng(this.centro.lat, this.centro.lng) });
      });
    }
    setCenter(centro) {
      this.centro = punto(typeof centro.lat === 'function' ? centro.toJSON() : centro);
    }
    setZoom() {}
    fitBounds() {}
  }
  class Circle {
    constructor(opciones) {
      this.radio = opciones.radius;
      this.setMap(opciones.map);
    }
    setMap(mapa) {
      this.elemento?.remove();
      this.elemento = null;
      if (!mapa) return;
      this.elemento = document.createElement('span');
      this.elemento.dataset.radioMetros = String(this.radio);
      mapa.lienzo.appendChild(this.elemento);
    }
    getBounds() {
      return new LatLngBounds();
    }
  }
  class AdvancedMarkerElement extends Oyentes {
    constructor(opciones) {
      super();
      this.elemento = document.createElement('button');
      this.elemento.type = 'button';
      this.elemento.dataset.marcador = opciones.title ?? 'punto';
      this.elemento.textContent = opciones.title ?? '';
      this.elemento.addEventListener('click', () => this.emitir('click'));
      this.posicion = opciones.position ?? null;
      this.map = opciones.map ?? null;
    }
    set map(mapa) {
      this.mapa = mapa;
      if (mapa) mapa.lienzo.appendChild(this.elemento);
      else this.elemento.remove();
    }
    get map() {
      return this.mapa;
    }
    set position(valor) {
      this.posicion = valor;
    }
    get position() {
      return this.posicion;
    }
  }
  class PlaceAutocompleteElement extends HTMLElement {}
  customElements.define('gmp-place-autocomplete', PlaceAutocompleteElement);
  const maps = {
    Map,
    Circle,
    LatLng,
    LatLngBounds,
    marker: { AdvancedMarkerElement },
    places: { PlaceAutocompleteElement },
    importLibrary: async () => maps,
  };
  window.google = { maps };
  const callback = new URL(document.currentScript.src).searchParams.get('callback');
  if (callback && typeof window[callback] === 'function') window[callback]();
})();
