// La semilla usa una contraseña conocida: solo se carga en desarrollo o en pruebas, nunca en producción
export function exigirEntornoDeSemilla(entorno: Record<string, string | undefined> = process.env): void {
  const nodo = (entorno.NODE_ENV ?? 'development').trim().toLowerCase();
  if (nodo !== 'development' && nodo !== 'test') {
    throw new Error(
      `Los datos semilla solo se cargan en desarrollo o pruebas (NODE_ENV=${nodo}). Tienen una contraseña conocida y no deben llegar a producción.`,
    );
  }
}
