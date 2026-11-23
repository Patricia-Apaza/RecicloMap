import { PrismaPg } from '@prisma/adapter-pg';
import { VERSION_TEXTOS_LEGALES } from '@reciclomap/shared';
import { PrismaClient } from '../src/generado/prisma/client.js';
import { ProgresoService } from '../src/modulos/juego/progreso.service.js';
import { NotificacionesService } from '../src/modulos/notificaciones/notificaciones.service.js';
import { completarOperacion } from '../src/modulos/operaciones/cierre.js';
import type { PrismaApi } from '../src/nucleo/base-datos/prisma.js';
import { urlPropietarioActual } from '../src/nucleo/base-datos/conexiones.js';
import { hashearContrasena } from '../src/nucleo/seguridad/contrasenas.js';
import {
  ADMIN,
  CIUDADES,
  ETIQUETAS,
  INSIGNIAS,
  MATERIALES,
  NEGOCIOS,
  NIVELES,
  ORIGEN,
  PARAMETROS,
  PLANTILLAS_DESAFIO,
  PREMIO_ENTREGA,
  PREMIOS,
  PUBLICACIONES,
  RECICLADOR,
  RECICLADORES_DEMO,
  ZONAS_JULIACA,
} from './datos-semilla.js';
import { exigirEntornoDeSemilla } from './entorno-semilla.js';
import { CANCELADAS, EN_CURSO, HISTORIAL } from './historial-semilla.js';

// Contraseña de prueba común a las cuentas de la semilla, tomada del archivo .env
const CLAVE_SEMILLA = process.env.SEMILLA_CLAVE ?? 'Prueba2026!';
let hashSemilla: Promise<string> | undefined;
const claveSemilla = () => (hashSemilla ??= hashearContrasena(CLAVE_SEMILLA));

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlPropietarioActual() }) });

const KM_POR_GRADO = 110.574;

function coordenadas(este: number, sur: number): { lat: number; lng: number } {
  const lat = ORIGEN.lat - sur / KM_POR_GRADO;
  const lng = ORIGEN.lng + este / (111.32 * Math.cos((ORIGEN.lat * Math.PI) / 180));
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

const hora = (texto: string): Date => new Date(`1970-01-01T${texto}:00.000Z`);
const haceDias = (dias: number): Date => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
const slug = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

function primerDiaDelMesEnLima(): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  return new Date(`${partes}-01T00:00:00.000Z`);
}

async function sembrarCatalogos(): Promise<void> {
  await prisma.ciudad.createMany({
    data: CIUDADES.map((c) => ({
      nombre: c.nombre,
      region: c.region,
      estado: c.activa ? 'ACTIVA' : 'PROXIMAMENTE',
      verificadoresAsignados: c.verificadores,
      preciosBaseCargados: c.precios,
    })),
  });
  const juliaca = await prisma.ciudad.findUniqueOrThrow({ where: { nombre: 'Juliaca' } });
  for (const zona of ZONAS_JULIACA) {
    const { lat, lng } = coordenadas(zona.este, zona.sur);
    await prisma.$executeRaw`
      INSERT INTO zona (ciudad_id, nombre, centro)
      VALUES (${juliaca.id}, ${zona.nombre}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)`;
  }

  await prisma.material.createMany({ data: MATERIALES.map((m, i) => ({ ...m, orden: i + 1 })) });
  await prisma.nivel.createMany({ data: NIVELES.map((n) => ({ ...n })) });
  await prisma.insignia.createMany({ data: INSIGNIAS.map((insignia, i) => ({ ...insignia, orden: i + 1 })) });
  await prisma.etiquetaCalificacion.createMany({
    data: (['NEGOCIO', 'RECICLADOR'] as const).flatMap((destino) =>
      ETIQUETAS[destino].map((nombre) => ({ destino, nombre, codigo: slug(nombre) })),
    ),
  });
  await prisma.parametro.createMany({ data: PARAMETROS.map((parametro) => ({ ...parametro })), skipDuplicates: true });
}

async function sembrarJuego(): Promise<void> {
  const materiales = await prisma.material.findMany();
  const idMaterial = (codigo: string | null): number | null =>
    codigo ? materiales.find((m) => m.codigo === codigo)!.id : null;

  const mes = primerDiaDelMesEnLima();
  for (const plantilla of PLANTILLAS_DESAFIO) {
    const { material, ...datos } = plantilla;
    const creada = await prisma.plantillaDesafio.create({ data: { ...datos, materialId: idMaterial(material) } });
    await prisma.desafio.create({
      data: { plantillaId: creada.id, mes, meta: creada.meta, puntos: creada.puntos, esMetaMes: creada.esMetaMes },
    });
  }

  await prisma.premio.createMany({
    data: PREMIOS.map((premio, i) => ({
      nombre: premio.nombre,
      tipo: premio.tipo,
      puntos: premio.puntos,
      probabilidad: premio.probabilidad,
      stock: premio.stock,
      patrocinado: premio.patrocinador !== null,
      patrocinador: premio.patrocinador,
      puntoEntrega: premio.tipo === 'OBJETO' ? PREMIO_ENTREGA.punto : null,
      vigenciaCanjeDias: premio.tipo === 'OBJETO' ? PREMIO_ENTREGA.vigenciaDias : null,
      orden: i + 1,
    })),
  });
  const premios = await prisma.premio.findMany({ orderBy: { orden: 'asc' } });
  await prisma.ruletaConfiguracion.create({
    data: {
      premios: premios.map((x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, probabilidad: Number(x.probabilidad) })),
    },
  });
}

async function sembrarNegocios(ciudadId: number): Promise<void> {
  const materiales = await prisma.material.findMany();
  const zonas = await prisma.zona.findMany({ select: { id: true, nombre: true } });
  const hoy = new Date();

  for (const negocio of NEGOCIOS) {
    const zonaId = zonas.find((z) => z.nombre === negocio.zona)!.id;
    const usuario = await prisma.usuario.create({
      data: {
        rol: negocio.tipo === 'CENTRO' ? 'CENTRO' : 'COMPRADOR_MOVIL',
        nombre: negocio.nombre,
        telefono: negocio.telefono,
        telefonoVerificadoEn: hoy,
        correo: negocio.correo,
        ciudadId,
        estado: 'ACTIVO',
        hashContrasena: await claveSemilla(),
        preferencia: { create: {} },
      },
    });

    const { lat, lng } = coordenadas(negocio.este, negocio.sur);
    const esCentro = negocio.tipo === 'CENTRO';
    const filas = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO comprador (
        usuario_id, tipo, nombre_comercial, direccion, zona_id, ubicacion, ubicacion_confirmada, hora_inicio, hora_fin,
        telefono_negocio, whatsapp, vehiculo, plan, plan_desde, plan_hasta, estado_verificacion, disponibilidad)
      VALUES (
        ${usuario.id}::uuid, ${negocio.tipo}::comprador_tipo, ${negocio.nombre}, ${negocio.direccion ?? null}, ${zonaId},
        CASE WHEN ${esCentro} THEN ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography END, ${esCentro},
        CASE WHEN ${esCentro} THEN NULL ELSE ${negocio.abre}::time END,
        CASE WHEN ${esCentro} THEN NULL ELSE ${negocio.cierra}::time END,
        ${negocio.telefono}, ${negocio.telefono}, ${negocio.vehiculo ?? null}::vehiculo,
        ${negocio.pro ? 'PRO' : 'GRATIS'}::plan,
        CASE WHEN ${negocio.pro} THEN CURRENT_DATE - 30 END,
        CASE WHEN ${negocio.pro} THEN CURRENT_DATE + 335 END,
        ${negocio.verificacion?.estado ?? 'APROBADO'}::verificacion_estado, ${negocio.disponibilidad ?? 'DISPONIBLE'}::disponibilidad)
      RETURNING id`;
    const compradorId = filas[0]!.id;

    await prisma.verificacion.create({
      data: negocio.verificacion
        ? {
            compradorId,
            tipo: 'REGISTRO',
            estado: negocio.verificacion.estado,
            motivo: negocio.verificacion.motivo,
            mensaje: negocio.verificacion.mensaje,
            creadaEn: haceDias(negocio.verificacion.estado === 'INFO_PEDIDA' ? 2 : 0),
          }
        : { compradorId, tipo: 'REGISTRO', estado: 'APROBADO', resueltaEn: hoy },
    });
    // El móvil no declara días ni pagos en la 06: se muestran como "No indicado"
    if (esCentro) {
      await prisma.compradorHorario.createMany({
        data: [1, 2, 3, 4, 5, 6].map((dia) => ({
          compradorId,
          dia,
          abre: hora(negocio.abre),
          cierra: hora(negocio.cierra),
        })),
      });
      await prisma.compradorPago.createMany({ data: negocio.pagos.map((metodo) => ({ compradorId, metodo })) });
    }

    for (const [codigo, precio] of Object.entries(negocio.precios)) {
      await prisma.precioMaterial.create({
        data: {
          compradorId,
          materialId: materiales.find((m) => m.codigo === codigo)!.id,
          precioMin: precio.min,
          precioMax: precio.max,
          demanda: precio.demanda,
          actualizadoEn: haceDias(precio.diasSinActualizar),
          actualizadoPorId: usuario.id,
        },
      });
    }
  }
}

async function sembrarPersonas(ciudadId: number): Promise<void> {
  const hoy = new Date();
  const zona = await prisma.zona.findFirstOrThrow({ where: { nombre: RECICLADOR.zona } });
  const materiales = await prisma.material.findMany({ where: { codigo: { in: RECICLADOR.materiales } } });
  await prisma.usuario.create({
    data: {
      rol: 'RECICLADOR',
      nombre: RECICLADOR.nombre,
      telefono: RECICLADOR.telefono,
      telefonoVerificadoEn: hoy,
      correo: RECICLADOR.correo,
      ciudadId,
      estado: 'ACTIVO',
      hashContrasena: await claveSemilla(),
      preferencia: { create: {} },
      perfilReciclador: {
        create: {
          zonaId: zona.id,
          // Kilos, puntos, nivel y calificación salen del historial de operaciones (sembrarHistorial)
          nivelId: 1,
          rachaSemanas: RECICLADOR.rachaSemanas,
          codigoInvitacion: RECICLADOR.codigoInvitacion,
        },
      },
      materiales: { create: materiales.map((m) => ({ materialId: m.id })) },
    },
  });

  await prisma.usuario.create({
    data: {
      rol: 'ADMIN',
      nombre: ADMIN.nombre,
      telefono: ADMIN.telefono,
      telefonoVerificadoEn: hoy,
      correo: ADMIN.correo,
      ciudadId,
      estado: 'ACTIVO',
      hashContrasena: await claveSemilla(),
      preferencia: { create: {} },
    },
  });
}

async function sembrarPublicaciones(ciudadId: number): Promise<void> {
  const hoy = new Date();
  const zona = await prisma.zona.findFirstOrThrow({ where: { nombre: RECICLADOR.zona } });
  for (const demo of RECICLADORES_DEMO) {
    await prisma.usuario.create({
      data: {
        rol: 'RECICLADOR',
        nombre: demo.nombre,
        telefono: demo.telefono,
        telefonoVerificadoEn: hoy,
        ciudadId,
        estado: 'ACTIVO',
        hashContrasena: await claveSemilla(),
        preferencia: { create: {} },
        perfilReciclador: {
          create: {
            zonaId: zona.id,
            nivelId: 1,
            codigoInvitacion: demo.codigo,
          },
        },
      },
    });
  }

  for (const pub of PUBLICACIONES) {
    const reciclador = await prisma.usuario.findUniqueOrThrow({ where: { telefono: pub.telefono } });
    const material = await prisma.material.findUniqueOrThrow({ where: { codigo: pub.material } });
    const creadaEn = haceDias(pub.haceDias);
    const venceEn = new Date(creadaEn.getTime() + 7 * 24 * 60 * 60 * 1000);
    const publicacion = await prisma.publicacion.create({
      data: {
        recicladorId: reciclador.id,
        materialId: material.id,
        cantidadKg: pub.kg,
        precioEsperado: pub.precioEsperado ?? null,
        nota: pub.nota ?? null,
        ciudadId,
        estado: pub.estado,
        motivoCancelacion: pub.motivo ?? null,
        canceladaPorId: pub.estado === 'CANCELADA' ? reciclador.id : null,
        creadaEn,
        venceEn,
      },
    });
    const { lat, lng } = coordenadas(pub.este, pub.sur);
    await prisma.$executeRaw`
      INSERT INTO publicacion_ubicacion (publicacion_id, ubicacion, origen)
      VALUES (${publicacion.id}::uuid, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 'GPS')`;

    let aceptada: { id: string; compradorId: string } | null = null;
    for (const [orden, oferta] of (pub.ofertas ?? []).entries()) {
      const negocio = await prisma.comprador.findFirstOrThrow({ where: { nombreComercial: oferta.negocio } });
      const estado = oferta.estado ?? 'PENDIENTE';
      const creada = new Date(creadaEn.getTime() + (orden + 1) * 3 * 60 * 60 * 1000);
      const fila = await prisma.oferta.create({
        data: {
          publicacionId: publicacion.id,
          compradorId: negocio.id,
          precioKg: oferta.precioKg,
          total: Math.round(oferta.precioKg * pub.kg * 100) / 100,
          mensaje: oferta.mensaje,
          estado,
          creadaEn: creada,
          resueltaEn: estado === 'PENDIENTE' ? null : haceDias(pub.haceDias - 1),
        },
      });
      if (estado === 'ACEPTADA') aceptada = { id: fila.id, compradorId: negocio.id };
    }
    if (aceptada) {
      const ofertas = pub.ofertas ?? [];
      const elegida = ofertas.find((o) => o.estado === 'ACEPTADA')!;
      await prisma.operacion.create({
        data: {
          publicacionId: publicacion.id,
          ofertaId: aceptada.id,
          recicladorId: reciclador.id,
          compradorId: aceptada.compradorId,
          ofertasAlAceptar: ofertas.length,
          aceptoMayorTotal: ofertas.length >= 2 && ofertas.every((o) => o.precioKg <= elegida.precioKg),
          creadaEn: haceDias(pub.haceDias - 1),
        },
      });
    }
  }
}

type BaseOperacion = { telefono: string; negocio: string; material: string; kg: number; precioKg: number };
type EstadoSemilla = 'CONFIRMADA' | 'ENTREGADA' | 'CANCELADA';
const HORA = 60 * 60 * 1000;

// Crea publicación, oferta aceptada y operación con fechas coherentes hacia atrás desde "fin"
async function nuevaOperacion(
  ciudadId: number,
  base: BaseOperacion,
  fin: Date,
  estado: EstadoSemilla,
  extra: { kgFinal?: number; motivo?: string; porNegocio?: boolean } = {},
) {
  const reciclador = await prisma.usuario.findUniqueOrThrow({ where: { telefono: base.telefono } });
  const negocio = await prisma.comprador.findFirstOrThrow({ where: { nombreComercial: base.negocio } });
  const material = await prisma.material.findUniqueOrThrow({ where: { codigo: base.material } });
  const creada = new Date(fin.getTime() - 48 * HORA);
  const publicacion = await prisma.publicacion.create({
    data: {
      recicladorId: reciclador.id,
      materialId: material.id,
      cantidadKg: base.kg,
      ciudadId,
      estado: estado === 'CANCELADA' ? 'CANCELADA' : 'EN_NEGOCIACION',
      motivoCancelacion: estado === 'CANCELADA' ? `Operación cancelada: ${extra.motivo}` : null,
      canceladaPorId: estado === 'CANCELADA' ? (extra.porNegocio ? negocio.usuarioId : reciclador.id) : null,
      creadaEn: creada,
      venceEn: new Date(creada.getTime() + 7 * 24 * HORA),
    },
  });
  const { lat, lng } = coordenadas(0.4, 0.6);
  await prisma.$executeRaw`
    INSERT INTO publicacion_ubicacion (publicacion_id, ubicacion, origen)
    VALUES (${publicacion.id}::uuid, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 'ZONA')`;
  const oferta = await prisma.oferta.create({
    data: {
      publicacionId: publicacion.id,
      compradorId: negocio.id,
      precioKg: base.precioKg,
      total: Math.round(base.precioKg * base.kg * 100) / 100,
      estado: 'ACEPTADA',
      creadaEn: new Date(creada.getTime() + 4 * HORA),
      resueltaEn: new Date(creada.getTime() + 8 * HORA),
    },
  });
  const aceptada = new Date(creada.getTime() + 8 * HORA);
  const coordinada = new Date(aceptada.getTime() + 2 * HORA);
  const kgFinal = extra.kgFinal ?? base.kg;
  const operacion = await prisma.operacion.create({
    data: {
      publicacionId: publicacion.id,
      ofertaId: oferta.id,
      recicladorId: reciclador.id,
      compradorId: negocio.id,
      estado: estado === 'CANCELADA' ? 'CANCELADA' : estado,
      creadaEn: aceptada,
      coordinadaEn: estado === 'CANCELADA' ? null : coordinada,
      entregadaEn: estado === 'CANCELADA' ? null : new Date(fin.getTime() - 3 * HORA),
      confirmadaEn: estado === 'CONFIRMADA' ? new Date(fin.getTime() - 1 * HORA) : null,
      kgFinal: estado === 'CONFIRMADA' ? kgFinal : null,
      montoFinal: estado === 'CONFIRMADA' ? Math.round(kgFinal * base.precioKg * 100) / 100 : null,
      motivoCancelacion: estado === 'CANCELADA' ? extra.motivo : null,
      canceladaPorId: estado === 'CANCELADA' ? (extra.porNegocio ? negocio.usuarioId : reciclador.id) : null,
      canceladaEn: estado === 'CANCELADA' ? fin : null,
    },
  });
  if (estado !== 'CANCELADA') {
    await prisma.coordinacion.create({
      data:
        negocio.tipo === 'CENTRO'
          ? { operacionId: operacion.id, tipo: 'LOCAL_DEL_CENTRO', definidaEn: coordinada }
          : {
              operacionId: operacion.id,
              tipo: 'REFERENCIA',
              referencia: 'Frente al mercado del barrio',
              definidaEn: coordinada,
            },
    });
  }
  return { operacionId: operacion.id, recicladorId: reciclador.id, negocioUsuarioId: negocio.usuarioId };
}

async function calificar(
  operacionId: string,
  autorId: string,
  destinoId: string,
  destino: 'NEGOCIO' | 'RECICLADOR',
  [estrellas, codigos, comentario]: [number, string[], string?],
  fecha: Date,
): Promise<string> {
  const etiquetas = await prisma.etiquetaCalificacion.findMany({ where: { destino, codigo: { in: codigos } } });
  if (etiquetas.length !== codigos.length) throw new Error(`Etiqueta desconocida en ${codigos.join(', ')}`);
  const calificacion = await prisma.calificacion.create({
    data: {
      operacionId,
      autorId,
      destinoId,
      estrellas,
      comentario: comentario ?? null,
      creadaEn: fecha,
      etiquetas: { create: etiquetas.map((etiqueta) => ({ etiquetaId: etiqueta.id })) },
    },
  });
  return calificacion.id;
}

// D2: el historial se construye con el mismo cierre que usa la API, así ningún total queda escrito a mano
// Las cuentas de muestra ya aceptaron los textos vigentes y declararon ser mayores de edad
async function sembrarConsentimientos(): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO consentimiento (usuario_id, tipo, version)
    SELECT u.id, t.tipo::tipo_consentimiento, ${VERSION_TEXTOS_LEGALES}
      FROM usuario u CROSS JOIN (VALUES ('TERMINOS'), ('PRIVACIDAD'), ('MAYOR_EDAD')) AS t(tipo)
    ON CONFLICT DO NOTHING`;
}

async function sembrarHistorial(ciudadId: number): Promise<void> {
  for (const historica of HISTORIAL) {
    const fin = haceDias(historica.haceDias);
    const { operacionId, recicladorId, negocioUsuarioId } = await nuevaOperacion(
      ciudadId,
      historica,
      fin,
      'CONFIRMADA',
    );
    await prisma.$transaction((tx) => completarOperacion(tx, operacionId, { porPlazo: false, ahora: fin }));
    const alNegocio = await calificar(operacionId, recicladorId, negocioUsuarioId, 'NEGOCIO', historica.alNegocio, fin);
    await calificar(operacionId, negocioUsuarioId, recicladorId, 'RECICLADOR', historica.alReciclador, fin);
    if (historica.respuesta) {
      await prisma.respuestaCalificacion.create({
        data: { calificacionId: alNegocio, texto: historica.respuesta, creadaEn: new Date(fin.getTime() + 5 * HORA) },
      });
    }
  }
  for (const cancelada of CANCELADAS) {
    await nuevaOperacion(ciudadId, cancelada, haceDias(cancelada.haceDias), 'CANCELADA', {
      motivo: cancelada.motivo,
      porNegocio: cancelada.porNegocio,
    });
  }
  for (const enCurso of EN_CURSO) {
    await nuevaOperacion(ciudadId, enCurso, new Date(Date.now() - enCurso.horas * HORA), enCurso.estado, {
      kgFinal: enCurso.kgFinal,
    });
  }
}

// Entregas directas por confirmar y el progreso (insignias y desafíos) calculado con los datos reales, sin avisos
async function sembrarProgreso(): Promise<void> {
  const negocio = await prisma.comprador.findFirstOrThrow({
    where: { nombreComercial: 'Acopio Titicaca' },
    select: { id: true },
  });
  const materiales = await prisma.material.findMany({ select: { id: true, codigo: true } });
  const idMaterial = (codigo: string) => materiales.find((m) => m.codigo === codigo)!.id;
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const pendientes = [
    { telefono: RECICLADOR.telefono, material: 'carton', kg: 15 },
    { telefono: RECICLADORES_DEMO[0]!.telefono, material: 'pet', kg: 20 },
  ];
  for (const pendiente of pendientes) {
    const reciclador = await prisma.usuario.findUniqueOrThrow({ where: { telefono: pendiente.telefono } });
    await prisma.registroReciclaje.create({
      data: {
        recicladorId: reciclador.id,
        compradorId: negocio.id,
        materialId: idMaterial(pendiente.material),
        kg: pendiente.kg,
        fecha: new Date(`${hoy}T00:00:00Z`),
        venceEn: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      },
    });
  }
  const progreso = new ProgresoService(
    prisma as unknown as PrismaApi,
    new NotificacionesService(prisma as unknown as PrismaApi),
  );
  const recicladores = await prisma.usuario.findMany({ where: { rol: 'RECICLADOR' }, select: { id: true } });
  for (const { id } of recicladores) await progreso.evaluar(id, { silencioso: true });
}

// Visitas, solicitudes de llegada, avisos y el día de un comprador móvil para los paneles (41, 46, 50, 53, 56)
async function sembrarPaneles(): Promise<void> {
  const { createHash } = await import('node:crypto');
  const ids = async (nombre: string) =>
    (await prisma.comprador.findFirstOrThrow({ where: { nombreComercial: nombre }, select: { id: true } })).id;
  const materiales = await prisma.material.findMany({ select: { id: true, codigo: true } });
  const materialId = (codigo: string) => materiales.find((m) => m.codigo === codigo)!.id;
  const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const fechaHace = (dias: number) => new Date(new Date(`${hoyLima}T12:00:00Z`).getTime() - dias * 86_400_000);
  const pesos = ['pet', 'pet', 'pet', 'carton', 'carton', 'metal', 'papel', 'plastico'];
  const visitas: Array<{ compradorId: string; materialId: number; fecha: Date; hora: number; visitante: string }> = [];
  const lotes: Array<[string, number]> = [
    ['Acopio Titicaca', 70],
    ['Compras Rubén', 36],
    ['EcoAcopio Juliaca', 18],
    ['Acopio Cerro Colorado', 14],
  ];
  for (const [nombre, cantidad] of lotes) {
    const compradorId = await ids(nombre);
    for (let i = 0; i < cantidad; i++) {
      const dias = (i * 7 + (i % 5)) % 60;
      visitas.push({
        compradorId,
        materialId: materialId(pesos[i % pesos.length]!),
        fecha: fechaHace(dias),
        hora: 7 + ((i * 5) % 12),
        visitante: createHash('sha256').update(`semilla|${nombre}|${i}`).digest('hex'),
      });
    }
  }
  await prisma.eventoVisita.createMany({ data: visitas, skipDuplicates: true });
  const llegadas: Array<{ compradorId: string; materialId: number; fecha: Date; creadaEn: Date }> = [];
  for (const [nombre, cantidad] of [
    ['Acopio Titicaca', 14],
    ['Compras Rubén', 6],
  ] as Array<[string, number]>) {
    const compradorId = await ids(nombre);
    for (let i = 0; i < cantidad; i++) {
      const dias = (i * 3) % 28;
      llegadas.push({
        compradorId,
        materialId: materialId(pesos[(i + 2) % pesos.length]!),
        fecha: fechaHace(dias),
        creadaEn: new Date(fechaHace(dias).getTime() - (i % 6) * 3_600_000),
      });
    }
  }
  await prisma.solicitudLlegada.createMany({ data: llegadas });

  const dia = new Date(`${hoyLima}T00:00:00Z`);
  const titicaca = await ids('Acopio Titicaca');
  const ruben = await ids('Compras Rubén');
  await prisma.aviso.createMany({
    data: [
      {
        compradorId: titicaca,
        tipo: 'NECESIDAD',
        titulo: 'Compramos PET limpio todo el mes',
        mensaje: 'Sin mínimo de kilos. Trae tus botellas sin tapa.',
        vigenteHasta: new Date(dia.getTime() + 9 * 86_400_000),
      },
      {
        compradorId: titicaca,
        tipo: 'PROMOCION',
        titulo: 'Doble punto por cartón los sábados',
        mensaje: 'Cartón seco y aplastado.',
        vigenteHasta: new Date(dia.getTime() + 4 * 86_400_000),
      },
      {
        compradorId: ruben,
        tipo: 'ANUNCIO',
        titulo: 'Esta semana paso por Santa Rosa',
        mensaje: 'Escríbeme para coordinar el recojo.',
        vigenteHasta: new Date(dia.getTime() + 3 * 86_400_000),
      },
    ],
  });

  // Los compradores móviles «En ruta» de la semilla lo están hoy; mañana vuelven solos a Disponible
  await prisma.$executeRaw`UPDATE comprador SET dia_vigente = ${hoyLima}::date WHERE disponibilidad = 'EN_RUTA'`;
  const enRuta = await prisma.comprador.findFirst({
    where: { disponibilidad: 'EN_RUTA' },
    select: { id: true, usuario: { select: { ciudadId: true } } },
  });
  if (enRuta) {
    const zonas = await prisma.zona.findMany({
      where: { ciudadId: enRuta.usuario.ciudadId },
      orderBy: { id: 'asc' },
      take: 2,
      select: { id: true },
    });
    await prisma.paradaRuta.createMany({
      data: zonas.map((zona, orden) => ({
        compradorId: enRuta.id,
        zonaId: zona.id,
        desde: new Date(`1970-01-01T${orden === 0 ? '08:00' : '11:00'}:00.000Z`),
        hasta: new Date(`1970-01-01T${orden === 0 ? '10:30' : '13:30'}:00.000Z`),
        orden,
      })),
    });
    await prisma.comprador.update({ where: { id: enRuta.id }, data: { rutaPublicada: true } });
  }
}

// Reportes de muestra para las pantallas 49, 60 y 61: el negocio nunca ve quién los envió
async function sembrarReportes(): Promise<void> {
  const usuario = (telefono: string) => prisma.usuario.findUniqueOrThrow({ where: { telefono }, select: { id: true } });
  const negocio = (nombre: string) =>
    prisma.comprador.findFirstOrThrow({ where: { nombreComercial: nombre }, select: { id: true, usuarioId: true } });
  const lucia = await usuario('900000002');
  const julio = await usuario('900000003');
  const cerro = await negocio('Acopio Cerro Colorado');
  const punoSur = await negocio('Recicla Puno Sur');
  const ruben = await negocio('Compras Rubén');
  const papel = await prisma.material.findUniqueOrThrow({ where: { codigo: 'papel' }, select: { id: true } });
  await prisma.reporte.createMany({
    data: [
      {
        tipo: 'NEGOCIO',
        autorId: lucia.id,
        compradorId: cerro.id,
        materialId: papel.id,
        motivo: 'PRECIO',
        precioVisto: 0.3,
        detalle: 'Dicen que pagan menos de lo publicado por el papel.',
        creadoEn: new Date(Date.now() - HORA),
      },
      {
        tipo: 'NEGOCIO',
        autorId: julio.id,
        compradorId: punoSur.id,
        motivo: 'CERRADO',
        detalle: 'Fui a las 4 pm y estaba cerrado.',
        creadoEn: new Date(Date.now() - 3 * HORA),
      },
    ],
  });
  const resenas = await prisma.calificacion.findMany({
    where: { destinoId: ruben.usuarioId },
    orderBy: [{ estrellas: 'asc' }, { creadaEn: 'desc' }],
    take: 2,
    select: { id: true },
  });
  for (const resena of resenas) {
    await prisma.reporte.create({
      data: {
        tipo: 'RESENA',
        autorId: ruben.usuarioId,
        calificacionId: resena.id,
        motivo: 'RESENA_INAPROPIADA',
        detalle: 'La reseña dice algo que no pasó.',
      },
    });
  }
}

async function sembrar(): Promise<void> {
  exigirEntornoDeSemilla();
  if ((await prisma.ciudad.count()) > 0) {
    throw new Error('La base de datos ya tiene datos. Para empezar de cero ejecuta: pnpm db:reiniciar');
  }
  await sembrarCatalogos();
  await sembrarJuego();
  const juliaca = await prisma.ciudad.findUniqueOrThrow({ where: { nombre: 'Juliaca' } });
  await sembrarNegocios(juliaca.id);
  await sembrarPersonas(juliaca.id);
  await sembrarPublicaciones(juliaca.id);
  await sembrarHistorial(juliaca.id);
  await sembrarConsentimientos();
  await sembrarReportes();
  await sembrarPaneles();
  await sembrarProgreso();
  console.log(
    'Datos semilla cargados: Juliaca con 5 centros y 5 compradores móviles verificados, 2 centros por verificar, un reciclador de ejemplo, 9 publicaciones abiertas, 36 operaciones con sus calificaciones reportes, visitas, avisos y una ruta de muestra.',
  );
}

sembrar()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
