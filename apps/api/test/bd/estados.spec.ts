import { cerrarConexiones, propietario } from './apoyo.js';

async function valores(tipo: string): Promise<string[]> {
  const resultado = await propietario.query<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1 ORDER BY e.enumsortorder`,
    [tipo],
  );
  return resultado.rows.map((fila) => fila.enumlabel);
}

describe('Estados definidos en la base de datos', () => {
  afterAll(cerrarConexiones);

  const esperados: Record<string, string[]> = {
    publicacion_estado: ['DISPONIBLE', 'CON_OFERTAS', 'EN_NEGOCIACION', 'FINALIZADA', 'CANCELADA', 'VENCIDA'],
    oferta_estado: ['PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'NO_SELECCIONADA', 'RETIRADA'],
    operacion_estado: ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA'],
    verificacion_estado: ['EN_REVISION', 'INFO_PEDIDA', 'APROBADO', 'RECHAZADO'],
    moderacion_estado: ['SOSPECHOSO', 'CORRECCION_PEDIDA', 'SUSPENDIDO'],
    reporte_estado: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA', 'RESUELTO', 'DESCARTADO'],
    registro_estado: ['PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'VENCIDO'],
    plan: ['GRATIS', 'PRO'],
    premio_ganado_estado: ['POR_RECLAMAR', 'RECLAMADO', 'ENTREGADO', 'VENCIDO', 'RENUNCIADO'],
    demanda: ['ALTA', 'MEDIA', 'BAJA'],
    tramo_distancia: ['menos de 1 km', '1–2 km', '2–5 km', 'más de 5 km'],
  };

  it.each(Object.entries(esperados))('%s tiene exactamente sus estados', async (tipo, estados) => {
    expect(await valores(tipo)).toEqual(estados);
  });

  it('la disputa de una operación es una marca aparte del estado', async () => {
    const resultado = await propietario.query(
      "SELECT data_type FROM information_schema.columns WHERE table_name = 'operacion' AND column_name = 'en_disputa'",
    );
    expect(resultado.rows[0]?.data_type).toBe('boolean');
  });
});
