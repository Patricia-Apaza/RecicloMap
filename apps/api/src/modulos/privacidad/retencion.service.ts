import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RETENCION_DIAS } from '@reciclomap/shared';
import { PrismaApi } from '../../nucleo/base-datos/prisma.js';
import { EliminacionService } from './eliminacion.service.js';
import { enMantenimiento } from '../operativo/modo-mantenimiento.js';

const DIA_MS = 86_400_000;
const antes = (ahora: Date, dias: number) => new Date(ahora.getTime() - dias * DIA_MS);
const hoyEnLima = (ahora: Date) =>
  new Date(`${ahora.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })}T00:00:00.000Z`);

export type ResultadoDepuracion = Record<string, number>;

// Depura lo que ya cumplió su plazo; nunca toca datos vigentes ni las tablas de solo agregar
@Injectable()
export class RetencionService {
  private readonly registro = new Logger('Retención');

  constructor(
    private readonly prisma: PrismaApi,
    private readonly eliminacion: EliminacionService,
  ) {}

  @Cron('0 3 * * *', { name: 'privacidad-retencion', timeZone: 'America/Lima' })
  async tareaDiaria(): Promise<void> {
    if (enMantenimiento()) return;
    try {
      const r = await this.depurar();
      this.registro.log(`Depuración: ${JSON.stringify(r)}`);
    } catch (error) {
      this.registro.error(`No se pudo depurar: ${String(error)}`);
    }
  }

  async depurar(ahora = new Date()): Promise<ResultadoDepuracion> {
    const hoy = hoyEnLima(ahora);
    const [codigos, sesiones, leidas, sinLeer, visitas, llegadas, espera] = await Promise.all([
      this.prisma.codigoVerificacion.deleteMany({
        where: {
          OR: [
            { usadoEn: { lt: antes(ahora, RETENCION_DIAS.codigosUsados) } },
            { expiraEn: { lt: antes(ahora, RETENCION_DIAS.codigosVencidos) } },
          ],
        },
      }),
      this.prisma.sesion.deleteMany({
        where: {
          OR: [
            { expiraEn: { lt: antes(ahora, RETENCION_DIAS.sesionesVencidas) } },
            { revocadaEn: { lt: antes(ahora, RETENCION_DIAS.sesionesVencidas) } },
          ],
        },
      }),
      this.prisma.notificacion.deleteMany({
        where: { leidaEn: { lt: antes(ahora, RETENCION_DIAS.notificacionesLeidas) } },
      }),
      this.prisma.notificacion.deleteMany({
        where: { leidaEn: null, creadaEn: { lt: antes(ahora, RETENCION_DIAS.notificacionesSinLeer) } },
      }),
      this.prisma.eventoVisita.deleteMany({ where: { fecha: { lt: antes(hoy, RETENCION_DIAS.visitas) } } }),
      this.prisma.solicitudLlegada.deleteMany({
        where: { fecha: { lt: antes(hoy, RETENCION_DIAS.solicitudesLlegada) } },
      }),
      this.prisma.listaEsperaCiudad.deleteMany({
        where: { avisadaEn: { lt: antes(ahora, RETENCION_DIAS.listaEsperaAvisada) } },
      }),
    ]);

    const parametro = await this.prisma.parametro.findUnique({ where: { clave: 'retencion_coordinacion_meses' } });
    const meses = Number(parametro?.valor) > 0 ? Number(parametro?.valor) : 24;
    const limite = new Date(ahora);
    limite.setUTCMonth(limite.getUTCMonth() - meses);
    const coordinaciones = await this.prisma.$executeRaw`
      UPDATE coordinacion c SET referencia = CASE WHEN c.tipo = 'REFERENCIA' THEN 'Dato eliminado' ELSE NULL END, pin = NULL, mensaje = NULL
        FROM operacion o
       WHERE o.id = c.operacion_id AND o.estado IN ('COMPLETADA', 'CANCELADA')
         AND COALESCE(o.completada_en, o.cancelada_en) < ${limite}
         AND (c.referencia IS DISTINCT FROM 'Dato eliminado' OR c.pin IS NOT NULL OR c.mensaje IS NOT NULL)`;

    // Archivos que ninguna foto usa y llevan más de una semana: el almacén los borra después
    const huerfanos = await this.prisma.$executeRaw`
      INSERT INTO archivo_por_borrar (clave, clave_miniatura)
      SELECT a.clave, a.clave_miniatura FROM archivo a
       WHERE a.creado_en < ${antes(ahora, RETENCION_DIAS.archivosHuerfanos)}
         AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.foto_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM comprador_foto f WHERE f.archivo_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM publicacion_foto f WHERE f.archivo_id = a.id)`;
    await this.prisma.$executeRaw`
      DELETE FROM archivo a
       WHERE a.creado_en < ${antes(ahora, RETENCION_DIAS.archivosHuerfanos)}
         AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.foto_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM comprador_foto f WHERE f.archivo_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM publicacion_foto f WHERE f.archivo_id = a.id)`;
    const borrados = await this.eliminacion.vaciarArchivosPorBorrar();

    return {
      codigos: codigos.count,
      sesiones: sesiones.count,
      notificacionesLeidas: leidas.count,
      notificacionesSinLeer: sinLeer.count,
      visitas: visitas.count,
      solicitudesLlegada: llegadas.count,
      listaEspera: espera.count,
      coordinaciones,
      archivosHuerfanos: huerfanos,
      archivosBorrados: borrados,
    };
  }
}
