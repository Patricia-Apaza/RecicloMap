import { Injectable } from '@nestjs/common';
import {
  type CodigoMaterial,
  CODIGOS_MATERIAL,
  esquemaFiltrosMapa,
  type FiltrosMapa,
  type ModoRuta,
  NOMBRE_MATERIAL,
  type RadioKm,
} from '@reciclomap/shared';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import { hoyEnLima } from '../estadisticas/fechas.js';
import { type Apertura, aperturaCentro, aperturaMovil, type HorarioDia, horaTexto } from './apertura.js';
import { type FilaMapa, MapaRepositorio, type Punto } from './mapa.repositorio.js';
import { ordenar } from './ordenar.js';
import { enlaceDestino, RutasGoogle } from './rutas-google.js';
import { calcularSemaforo, semaforoConTexto } from './semaforo.js';

const MINIMO_CALIFICACIONES = 3;
const PESO_DEMANDA = { ALTA: 3, MEDIA: 2, BAJA: 1 } as const;
const DIA_MS = 86_400_000;

export type Referencia = { punto: Punto; origen: 'posicion' | 'zona' };

const precioTexto = (valor: number) => valor.toFixed(2);
const kilometros = (metros: number) => Math.round(metros / 100) / 10;

function calificacion(fila: Pick<FilaMapa, 'califProm' | 'califCant'>) {
  return fila.califCant >= MINIMO_CALIFICACIONES
    ? { promedio: Math.round(fila.califProm * 10) / 10, cantidad: fila.califCant, nuevo: false }
    : { promedio: null, cantidad: fila.califCant, nuevo: true };
}

@Injectable()
export class MapaService {
  constructor(
    private readonly repositorio: MapaRepositorio,
    private readonly rutas: RutasGoogle,
  ) {}

  async puntoDeReferencia(posicion: Punto | undefined, zonaId: number | undefined): Promise<Referencia> {
    if (posicion) return { punto: posicion, origen: 'posicion' };
    if (zonaId) {
      const centro = await this.repositorio.centroDeZona(zonaId);
      if (centro) return { punto: centro, origen: 'zona' };
    }
    throw new ErrorNegocio(
      'UBICACION_REQUERIDA',
      'Comparte tu ubicación aproximada o elige tu zona para calcular distancias.',
      400,
    );
  }

  // Pantallas 09 y 10: el semáforo compara los negocios que pasan los filtros y el radio (2.3)
  async buscar(filtros: FiltrosMapa, referencia: Referencia) {
    const [filas, diasAlDia] = await Promise.all([
      this.repositorio.opcionesCercanas(filtros.material, referencia.punto, filtros.radio),
      this.repositorio.diasPrecioAlDia(),
    ]);
    const { horarios, pagos } = await this.repositorio.horariosYPagos(filas.map((fila) => fila.id));
    const ahora = new Date();

    const candidatas = filas
      .map((fila) => ({
        fila,
        apertura: this.apertura(fila, horarios.get(fila.id) ?? []),
        pagos: pagos.get(fila.id) ?? [],
        antiguo: ahora.getTime() - fila.actualizadoEn.getTime() > diasAlDia * DIA_MS,
      }))
      .filter(({ fila, apertura, pagos: metodos, antiguo }) => {
        if (filtros.tipo !== 'todos' && fila.tipo !== (filtros.tipo === 'centro' ? 'CENTRO' : 'MOVIL')) return false;
        if (!filtros.pagos.every((metodo) => metodos.includes(metodo))) return false;
        if (filtros.demandaMinima && PESO_DEMANDA[fila.demanda] < PESO_DEMANDA[filtros.demandaMinima]) return false;
        // "Solo abiertos": el centro abierto ahora y el móvil marcado como Disponible
        if (
          filtros.soloAbiertos &&
          !(fila.tipo === 'CENTRO' ? apertura.abierto === true : fila.disponibilidad === 'DISPONIBLE')
        ) {
          return false;
        }
        if (filtros.soloAlDia && antiguo) return false;
        return true;
      });

    const semaforo = calcularSemaforo(candidatas.map(({ fila }) => ({ id: fila.id, min: fila.min, max: fila.max })));
    const ordenadas = ordenar(
      candidatas.map((candidata) => ({
        ...candidata,
        id: candidata.fila.id,
        esPro: candidata.fila.esPro,
        metros: candidata.fila.metros,
        medio: candidata.fila.min + candidata.fila.max,
        demanda: candidata.fila.demanda,
        calificacion: { promedio: candidata.fila.califProm, cantidad: candidata.fila.califCant },
      })),
      filtros.orden,
    );

    return {
      material: { codigo: filtros.material, nombre: NOMBRE_MATERIAL[filtros.material] },
      radioKm: filtros.radio,
      referencia: referencia.origen,
      comparadoEntre: candidatas.length,
      opciones: ordenadas.map((opcion) => ({
        id: opcion.fila.id,
        nombre: opcion.fila.nombre,
        tipo: opcion.fila.tipo,
        vehiculo: opcion.fila.vehiculo,
        esPro: opcion.fila.esPro,
        destacado: opcion.destacado,
        distanciaKm: kilometros(opcion.fila.metros),
        zona: opcion.fila.zona,
        posicion: { lat: opcion.fila.lat, lng: opcion.fila.lng },
        calificacion: calificacion(opcion.fila),
        estado: opcion.apertura,
        pagos: opcion.pagos,
        precio: {
          min: precioTexto(opcion.fila.min),
          max: precioTexto(opcion.fila.max),
          actualizadoEn: opcion.fila.actualizadoEn.toISOString(),
          antiguo: opcion.antiguo,
        },
        semaforo: semaforoConTexto(semaforo.get(opcion.fila.id) ?? 'SIN_COMPARACION', candidatas.length),
        demanda: opcion.fila.demanda,
      })),
    };
  }

  // Pantalla 15: cada material se compara con quienes lo compran dentro del radio, incluido este negocio
  async detalle(compradorId: string, radio: RadioKm, referencia: Referencia | null, elegido?: CodigoMaterial) {
    const [ficha, diasAlDia] = await Promise.all([
      this.repositorio.fichaPublica(compradorId),
      this.repositorio.diasPrecioAlDia(),
    ]);
    if (!ficha) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio en el mapa.', 404);
    const punto = referencia?.punto;
    const propias = await this.repositorio.materialesDe(compradorId, punto ?? { lat: 0, lng: 0 });
    if (propias.length === 0) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio en el mapa.', 404);
    const base = propias[0]!;
    const centro = punto ?? { lat: base.lat, lng: base.lng };
    // El radio crece hasta incluir al propio negocio si está más lejos que lo elegido
    const radioEfectivo = Math.max(radio, punto ? Math.ceil(base.metros / 1000) : 0);
    const { horarios, pagos } = await this.repositorio.horariosYPagos([compradorId]);
    const ahora = new Date();

    const materiales = await Promise.all(
      propias.map(async (fila) => {
        const conjunto = await this.repositorio.opcionesCercanas(fila.material, centro, radioEfectivo);
        const comparables = conjunto.some((otra) => otra.id === compradorId) ? conjunto : [...conjunto, fila];
        const semaforo = calcularSemaforo(comparables.map((otra) => ({ id: otra.id, min: otra.min, max: otra.max })));
        return {
          material: { codigo: fila.material, nombre: fila.materialNombre },
          elegido: fila.material === elegido,
          min: precioTexto(fila.min),
          max: precioTexto(fila.max),
          demanda: fila.demanda,
          actualizadoEn: fila.actualizadoEn.toISOString(),
          antiguo: ahora.getTime() - fila.actualizadoEn.getTime() > diasAlDia * DIA_MS,
          semaforo: semaforoConTexto(semaforo.get(compradorId) ?? 'SIN_COMPARACION', comparables.length),
        };
      }),
    );

    const horario = horarios.get(compradorId) ?? [];
    // La ruta del día solo se muestra si el móvil la publicó hoy; caduca sola al terminar el día en Lima
    const rutaVigente =
      base.tipo === 'MOVIL' && ficha.rutaPublicada && ficha.diaVigente?.toISOString().slice(0, 10) === hoyEnLima();
    return {
      id: compradorId,
      nombre: base.nombre,
      tipo: base.tipo,
      vehiculo: base.vehiculo,
      esPro: base.esPro,
      descripcion: ficha.descripcion,
      distanciaKm: punto ? kilometros(base.metros) : null,
      radioKm: radioEfectivo,
      // La dirección del centro es pública; del móvil solo se muestra su zona aproximada
      direccion: base.tipo === 'CENTRO' ? ficha.direccion : null,
      zona: ficha.zona?.nombre ?? base.zona,
      posicion: { lat: base.lat, lng: base.lng },
      telefono: base.tipo === 'CENTRO' ? ficha.telefonoNegocio : null,
      whatsapp: ficha.whatsapp,
      calificacion: calificacion(base),
      estado: this.apertura(base, horario),
      horario:
        base.tipo === 'CENTRO'
          ? { dias: horario, habitual: null }
          : {
              dias: [],
              habitual:
                ficha.horaInicio && ficha.horaFin
                  ? { abre: horaTexto(ficha.horaInicio), cierra: horaTexto(ficha.horaFin) }
                  : null,
            },
      pagos: pagos.get(compradorId) ?? [],
      rutaDelDia: rutaVigente
        ? ficha.paradas.map((p) => ({ zona: p.zona.nombre, desde: horaTexto(p.desde), hasta: horaTexto(p.hasta) }))
        : [],
      fotos: ficha.fotos.map((foto) => foto.archivoId),
      materiales,
    };
  }

  // Pantalla 18: mismo conjunto y mismo semáforo que el mapa con los filtros por defecto; ordenadas por valor
  async calcular(material: CodigoMaterial, kg: number, radio: RadioKm, referencia: Referencia) {
    const resultado = await this.buscar(esquemaFiltrosMapa.parse({ material, radio, orden: 'precio' }), referencia);
    const opciones = resultado.opciones
      .map((opcion) => {
        const min = Number(opcion.precio.min) * kg;
        const max = Number(opcion.precio.max) * kg;
        return { ...opcion, valor: { min: precioTexto(min), max: precioTexto(max) }, medio: (min + max) / 2 };
      })
      .sort((a, b) => b.medio - a.medio || a.distanciaKm - b.distanciaKm);
    const mejor = opciones[0] ?? null;
    return {
      material: resultado.material,
      kg,
      radioKm: radio,
      referencia: resultado.referencia,
      comparadoEntre: resultado.comparadoEntre,
      estimado: mejor
        ? { ...mejor.valor, negocio: mejor.nombre, distanciaKm: mejor.distanciaKm, tipo: mejor.tipo }
        : null,
      // 1 punto por kg al completar una operación (RN-12)
      puntos: Math.floor(kg),
      opciones: opciones.slice(0, 3).map(({ medio: _medio, ...opcion }) => opcion),
    };
  }

  // Pantalla 20: el semáforo se calcula solo entre los elegidos, material por material
  async comparar(ids: string[], referencia: Referencia | null) {
    const punto = referencia?.punto ?? { lat: 0, lng: 0 };
    const filas = (await Promise.all(ids.map((id) => this.repositorio.materialesDe(id, punto)))).filter(
      (f) => f.length > 0,
    );
    if (filas.length < 2) {
      throw new ErrorNegocio(
        'COMPARAR_INSUFICIENTE',
        'Elige al menos 2 negocios visibles en el mapa para comparar.',
        422,
      );
    }
    const elegidos = filas.map((f) => f[0]!.id);
    const [{ horarios, pagos }, diasAlDia] = await Promise.all([
      this.repositorio.horariosYPagos(elegidos),
      this.repositorio.diasPrecioAlDia(),
    ]);
    const ahora = Date.now();
    const materiales = CODIGOS_MATERIAL.filter((codigo) => filas.some((f) => f.some((m) => m.material === codigo))).map(
      (codigo) => {
        const conjunto = filas.flatMap((f) => f.filter((m) => m.material === codigo));
        const semaforo = calcularSemaforo(conjunto.map((m) => ({ id: m.id, min: m.min, max: m.max })));
        return {
          material: { codigo, nombre: NOMBRE_MATERIAL[codigo] },
          precios: Object.fromEntries(
            conjunto.map((m) => [
              m.id,
              {
                min: precioTexto(m.min),
                max: precioTexto(m.max),
                demanda: m.demanda,
                actualizadoEn: m.actualizadoEn.toISOString(),
                antiguo: ahora - m.actualizadoEn.getTime() > diasAlDia * DIA_MS,
                semaforo: semaforoConTexto(semaforo.get(m.id) ?? 'SIN_COMPARACION', conjunto.length),
              },
            ]),
          ),
        };
      },
    );
    return {
      negocios: filas.map((f) => {
        const base = f[0]!;
        const horario = horarios.get(base.id) ?? [];
        return {
          id: base.id,
          nombre: base.nombre,
          tipo: base.tipo,
          vehiculo: base.vehiculo,
          esPro: base.esPro,
          distanciaKm: referencia ? kilometros(base.metros) : null,
          calificacion: calificacion(base),
          estado: this.apertura(base, horario),
          horario,
          pagos: pagos.get(base.id) ?? [],
        };
      }),
      materiales,
    };
  }

  // Pantalla 21 (RN-17): el negocio no recibe aviso ni identidad; solo suma al conteo de solicitudes
  async solicitarLlegada(compradorId: string, material: CodigoMaterial | null) {
    const destino = await this.destino(compradorId);
    await this.repositorio.registrarLlegada(compradorId, material);
    return { ...destino, enlace: enlaceDestino(destino.posicion), rutaDisponible: this.rutas.disponible };
  }

  // El trazo lo pide el servidor con el origen redondeado; sin clave, solo queda el enlace
  async ruta(compradorId: string, modo: ModoRuta, referencia: Referencia) {
    const destino = await this.destino(compradorId);
    const ruta = await this.rutas.calcular(referencia.punto, destino.posicion, modo);
    return {
      destino,
      enlace: enlaceDestino(destino.posicion),
      modo,
      ruta: ruta
        ? {
            distanciaKm: Math.round(ruta.distanciaMetros / 100) / 10,
            minutos: Math.max(1, Math.round(ruta.duracionSegundos / 60)),
            trazo: ruta.trazo,
            pasos: ruta.pasos,
          }
        : null,
    };
  }

  private async destino(compradorId: string) {
    const [ficha, propias] = await Promise.all([
      this.repositorio.fichaPublica(compradorId),
      this.repositorio.materialesDe(compradorId, { lat: 0, lng: 0 }),
    ]);
    const base = propias[0];
    if (!ficha || !base) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos ese negocio en el mapa.', 404);
    return {
      id: compradorId,
      nombre: base.nombre,
      tipo: base.tipo,
      // Del centro, su dirección pública; del móvil, solo su zona de trabajo
      direccion: base.tipo === 'CENTRO' ? ficha.direccion : null,
      zona: ficha.zona?.nombre ?? base.zona,
      posicion: { lat: base.lat, lng: base.lng },
    };
  }

  private apertura(fila: Pick<FilaMapa, 'tipo' | 'disponibilidad'>, horario: HorarioDia[]): Apertura {
    return fila.tipo === 'CENTRO' ? aperturaCentro(horario) : aperturaMovil(fila.disponibilidad);
  }
}
