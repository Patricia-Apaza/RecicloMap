// La semilla usa una contraseña conocida: solo se carga en desarrollo o en pruebas, nunca en producción.
// Única excepción: la demostración a propósito, con una contraseña propia en SEMILLA_CLAVE (nunca la de ejemplo)
export function exigirEntornoDeSemilla(entorno: Record<string, string | undefined> = process.env): void {
  const nodo = (entorno.NODE_ENV ?? 'development').trim().toLowerCase();
  if (nodo === 'production' && entorno.MODO_DEMOSTRACION === 'true') {
    const clave = entorno.SEMILLA_CLAVE ?? '';
    if (clave.length < 10 || /^prueba2026!?$|^cambia_|^changeme$/i.test(clave)) {
      throw new Error(
        'La demostración necesita SEMILLA_CLAVE propia (10 caracteres o más, distinta de la de ejemplo).',
      );
    }
    return;
  }
  if (nodo !== 'development' && nodo !== 'test') {
    throw new Error(
      `Los datos semilla solo se cargan en desarrollo o pruebas (NODE_ENV=${nodo}). Tienen una contraseña conocida y no deben llegar a producción.`,
    );
  }
}
