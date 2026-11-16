import { Pool } from 'pg';
import { ORIGEN } from '../../prisma/datos-semilla.js';
import { nombreBd, urlBd } from '../../src/nucleo/base-datos/conexiones.js';

const baseDatos = nombreBd(true);

export const propietario = new Pool({ connectionString: urlBd('propietario', baseDatos), max: 3 });
export const api = new Pool({ connectionString: urlBd('api', baseDatos), max: 3 });
export const admin = new Pool({ connectionString: urlBd('admin', baseDatos), max: 3 });

export async function cerrarConexiones(): Promise<void> {
  await Promise.all([propietario.end(), api.end(), admin.end()]);
}

export const PERMISO_DENEGADO = '42501';
export const UNICO = '23505';
export const RESTRICCION = '23514';

export async function codigoDeError(accion: Promise<unknown>): Promise<string | undefined> {
  try {
    await accion;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? 'SIN_CODIGO';
  }
}

let correlativo = Math.floor(Math.random() * 9_000_000);
const telefonoNuevo = (): string => `98${String(++correlativo % 10_000_000).padStart(7, '0')}`;

export function coordenadas(este: number, sur: number): { lat: number; lng: number } {
  return {
    lat: ORIGEN.lat - sur / 110.574,
    lng: ORIGEN.lng + este / (111.32 * Math.cos((ORIGEN.lat * Math.PI) / 180)),
  };
}

async function uno<T>(sql: string, valores: unknown[] = []): Promise<T> {
  const resultado = await propietario.query(sql, valores);
  return resultado.rows[0] as T;
}

export async function ciudadJuliaca(): Promise<number> {
  return (await uno<{ id: number }>("SELECT id FROM ciudad WHERE nombre = 'Juliaca'")).id;
}

export async function material(codigo: string): Promise<number> {
  return (await uno<{ id: number }>('SELECT id FROM material WHERE codigo = $1', [codigo])).id;
}

export async function negocio(nombre: string): Promise<{ id: string; usuarioId: string }> {
  return uno('SELECT id, usuario_id AS "usuarioId" FROM comprador WHERE nombre_comercial = $1', [nombre]);
}

export async function administrador(): Promise<string> {
  return (await uno<{ id: string }>("SELECT id FROM usuario WHERE rol = 'ADMIN' LIMIT 1")).id;
}

export async function crearReciclador(): Promise<string> {
  const telefono = telefonoNuevo();
  const { id } = await uno<{ id: string }>(
    `INSERT INTO usuario (rol, nombre, telefono, ciudad_id, estado, actualizado_en)
     VALUES ('RECICLADOR', 'Reciclador de prueba', $1, $2, 'ACTIVO', now()) RETURNING id`,
    [telefono, await ciudadJuliaca()],
  );
  await propietario.query('INSERT INTO reciclador_perfil (usuario_id, codigo_invitacion) VALUES ($1, $2)', [
    id,
    `P-${telefono}`,
  ]);
  return id;
}

export async function crearPublicacion(
  recicladorId: string,
  opciones: { codigoMaterial?: string; kg?: number; este?: number; sur?: number } = {},
): Promise<string> {
  const { id } = await uno<{ id: string }>(
    `INSERT INTO publicacion (reciclador_id, material_id, cantidad_kg, ciudad_id, vence_en, actualizada_en)
     VALUES ($1, $2, $3, $4, now() + interval '7 days', now()) RETURNING id`,
    [recicladorId, await material(opciones.codigoMaterial ?? 'pet'), opciones.kg ?? 35, await ciudadJuliaca()],
  );
  const { lat, lng } = coordenadas(opciones.este ?? 0, opciones.sur ?? 0);
  await propietario.query(
    'INSERT INTO publicacion_ubicacion (publicacion_id, ubicacion) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)',
    [id, lng, lat],
  );
  return id;
}

export async function crearOferta(publicacionId: string, compradorId: string, precioKg = 2.5): Promise<string> {
  const { id } = await uno<{ id: string }>(
    `INSERT INTO oferta (publicacion_id, comprador_id, precio_kg, total, actualizada_en)
     VALUES ($1, $2, $3, 1, now()) RETURNING id`,
    [publicacionId, compradorId, precioKg],
  );
  await propietario.query("UPDATE publicacion SET estado = 'CON_OFERTAS' WHERE id = $1 AND estado = 'DISPONIBLE'", [
    publicacionId,
  ]);
  return id;
}

export async function crearOperacion(nombreNegocio = 'Acopio Titicaca'): Promise<{
  operacionId: string;
  publicacionId: string;
  ofertaId: string;
  recicladorId: string;
  compradorId: string;
  negocioUsuarioId: string;
}> {
  const recicladorId = await crearReciclador();
  const { id: compradorId, usuarioId: negocioUsuarioId } = await negocio(nombreNegocio);
  const publicacionId = await crearPublicacion(recicladorId);
  const ofertaId = await crearOferta(publicacionId, compradorId);
  await propietario.query("UPDATE oferta SET estado = 'ACEPTADA' WHERE id = $1", [ofertaId]);
  await propietario.query("UPDATE publicacion SET estado = 'EN_NEGOCIACION' WHERE id = $1", [publicacionId]);
  const { id: operacionId } = await uno<{ id: string }>(
    'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [publicacionId, ofertaId, recicladorId, compradorId],
  );
  return { operacionId, publicacionId, ofertaId, recicladorId, compradorId, negocioUsuarioId };
}

export async function avanzarOperacion(
  operacionId: string,
  hasta: 'ENTREGADA' | 'CONFIRMADA' | 'COMPLETADA',
): Promise<void> {
  await propietario.query("UPDATE operacion SET estado = 'EN_COORDINACION' WHERE id = $1", [operacionId]);
  await propietario.query("UPDATE operacion SET estado = 'ENTREGADA' WHERE id = $1", [operacionId]);
  if (hasta === 'ENTREGADA') return;
  await propietario.query("UPDATE operacion SET estado = 'CONFIRMADA', kg_final = 34, monto_final = 85 WHERE id = $1", [
    operacionId,
  ]);
  if (hasta === 'CONFIRMADA') return;
  await propietario.query("UPDATE operacion SET estado = 'COMPLETADA', completada_en = now() WHERE id = $1", [
    operacionId,
  ]);
}
