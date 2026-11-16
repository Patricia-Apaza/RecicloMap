import { Injectable } from '@nestjs/common';
import { type CodigoMaterial, CODIGOS_MATERIAL, type RegistroNegocioCompleto } from '@reciclomap/shared';
import type { Prisma } from '../../generado/prisma/client.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

// Un pin a más de 40 km de toda zona de la ciudad es un error al tocar el mapa
const DISTANCIA_MAXIMA_CIUDAD_M = 40_000;

const hora = (texto: string) => new Date(`1970-01-01T${texto}:00.000Z`);

const horasMovil = (datos: RegistroNegocioCompleto) =>
  datos.tipo === 'MOVIL'
    ? { horaInicio: datos.horario.abre, horaFin: datos.horario.cierra }
    : { horaInicio: null, horaFin: null };

// Acceso a datos del negocio; la ubicación es geográfica y se escribe con SQL
@Injectable()
export class NegociosRepositorio {
  async crear(tx: Prisma.TransactionClient, usuarioId: string, datos: RegistroNegocioCompleto): Promise<string> {
    const esCentro = datos.tipo === 'CENTRO';
    const lat = esCentro ? (datos.ubicacion?.lat ?? null) : null;
    const lng = esCentro ? (datos.ubicacion?.lng ?? null) : null;
    const { horaInicio, horaFin } = horasMovil(datos);
    const filas = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO comprador (
        usuario_id, tipo, nombre_comercial, descripcion, direccion, zona_id, ubicacion, ubicacion_confirmada,
        telefono_negocio, whatsapp, vehiculo, hora_inicio, hora_fin, estado_verificacion, actualizado_en)
      VALUES (
        ${usuarioId}::uuid, ${datos.tipo}::comprador_tipo, ${datos.nombreComercial}, ${datos.descripcion ?? null},
        ${esCentro ? datos.direccion : null}, ${datos.zonaId},
        CASE
          WHEN ${lat}::float8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
          WHEN ${esCentro} THEN (SELECT centro FROM zona WHERE id = ${datos.zonaId})
        END,
        ${lat !== null},
        ${esCentro ? (datos.telefonoNegocio ?? null) : null}, ${datos.whatsapp},
        ${esCentro ? null : datos.vehiculo}::vehiculo, ${horaInicio}::time, ${horaFin}::time, 'EN_REVISION', now())
      RETURNING id`;
    const compradorId = filas[0]!.id;
    await this.guardarDetalle(tx, compradorId, usuarioId, datos);
    return compradorId;
  }

  async actualizar(
    tx: Prisma.TransactionClient,
    compradorId: string,
    usuarioId: string,
    datos: RegistroNegocioCompleto,
  ) {
    const esCentro = datos.tipo === 'CENTRO';
    const lat = esCentro ? (datos.ubicacion?.lat ?? null) : null;
    const lng = esCentro ? (datos.ubicacion?.lng ?? null) : null;
    const { horaInicio, horaFin } = horasMovil(datos);
    await tx.$executeRaw`
      UPDATE comprador SET
        nombre_comercial = ${datos.nombreComercial},
        descripcion = ${datos.descripcion ?? null},
        direccion = ${esCentro ? datos.direccion : null},
        zona_id = ${datos.zonaId},
        ubicacion = CASE
          WHEN ${lat}::float8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
          WHEN ${esCentro} THEN (SELECT centro FROM zona WHERE id = ${datos.zonaId})
        END,
        ubicacion_confirmada = ${lat !== null},
        hora_inicio = ${horaInicio}::time,
        hora_fin = ${horaFin}::time,
        telefono_negocio = ${esCentro ? (datos.telefonoNegocio ?? null) : null},
        whatsapp = ${datos.whatsapp},
        vehiculo = ${esCentro ? null : datos.vehiculo}::vehiculo,
        estado_verificacion = 'EN_REVISION',
        actualizado_en = now()
      WHERE id = ${compradorId}::uuid`;
    await tx.compradorHorario.deleteMany({ where: { compradorId } });
    await tx.compradorPago.deleteMany({ where: { compradorId } });
    await this.guardarDetalle(tx, compradorId, usuarioId, datos);
  }

  private async guardarDetalle(
    tx: Prisma.TransactionClient,
    compradorId: string,
    usuarioId: string,
    datos: RegistroNegocioCompleto,
  ): Promise<void> {
    // El comprador móvil declara su horario habitual sin días: no se inventan días
    const dias = datos.tipo === 'CENTRO' ? datos.horario.dias : [];
    await tx.compradorHorario.createMany({
      data: dias.map((dia) => ({
        compradorId,
        dia,
        abre: hora(datos.horario.abre),
        cierra: hora(datos.horario.cierra),
      })),
    });
    await tx.compradorPago.createMany({ data: datos.pagos.map((metodo) => ({ compradorId, metodo })) });
    await tx.compradorFoto.deleteMany({ where: { compradorId } });
    await tx.compradorFoto.createMany({
      data: datos.fotos.map((archivoId, orden) => ({ compradorId, archivoId, orden })),
    });

    await this.guardarPrecios(tx, compradorId, usuarioId, datos.precios);
  }

  // Única escritura de precios: registro, corrección y pantalla 43. El historial lo escribe la base
  async guardarPrecios(
    tx: Prisma.TransactionClient,
    compradorId: string,
    usuarioId: string,
    precios: RegistroNegocioCompleto['precios'],
  ): Promise<void> {
    const materiales = await tx.material.findMany({ select: { id: true, codigo: true } });
    const idDe = (codigo: CodigoMaterial) => materiales.find((material) => material.codigo === codigo)!.id;
    for (const codigo of CODIGOS_MATERIAL) {
      const precio = precios[codigo];
      const materialId = idDe(codigo);
      if (!precio) {
        await tx.precioMaterial.updateMany({ where: { compradorId, materialId }, data: { activo: false } });
        continue;
      }
      // El autor del precio siempre es el dueño del negocio: lo exige la base de datos
      const valores = {
        precioMin: precio.min,
        precioMax: precio.max,
        demanda: precio.demanda,
        activo: true,
        actualizadoEn: new Date(),
        actualizadoPorId: usuarioId,
      };
      await tx.precioMaterial.upsert({
        where: { compradorId_materialId: { compradorId, materialId } },
        create: { compradorId, materialId, ...valores },
        update: valores,
      });
    }
  }

  async exigirPinEnCiudad(
    db: Prisma.TransactionClient,
    ciudadId: number,
    punto: { lat: number; lng: number },
  ): Promise<void> {
    const dentro = await db.$queryRaw<{ cerca: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM zona
         WHERE ciudad_id = ${ciudadId}
           AND ST_DWithin(centro, ST_SetSRID(ST_MakePoint(${punto.lng}::float8, ${punto.lat}::float8), 4326)::geography, ${DISTANCIA_MAXIMA_CIUDAD_M})
      ) AS cerca`;
    if (!dentro[0]?.cerca) {
      throw new ErrorNegocio(
        'PIN_FUERA_DE_LA_CIUDAD',
        'El pin quedó fuera de tu ciudad. Revisa el lugar en el mapa.',
        422,
        [{ campo: 'ubicacion', mensaje: 'Coloca el pin en tu ciudad.' }],
      );
    }
  }
}
