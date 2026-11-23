'use strict';
// Devuelve un objeto que acepta cualquier acceso: las variables aleatorias de Postman no se usan en la colección
const vacio = new Proxy(function vacio() {}, { get: () => vacio, apply: () => '' });
module.exports = vacio;
