import { vi } from 'vitest';
import { ORIGEN } from '../prisma/datos-semilla.js';
import { NotificacionesService } from '../src/modulos/notificaciones/notificaciones.service.js';
import { OperacionesService } from '../src/modulos/operaciones/operaciones.service.js';
import { OperacionesTareas } from '../src/modulos/operaciones/operaciones-tareas.js';
import { PrismaAdmin } from '../src/nucleo/base-datos/prisma.js';
import { ADMIN } from '../prisma/datos-semilla.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
const HORA_MS = 3_600_000;
type Error = { error: { codigo: string } };
type Detalle = {
  id: string;
  estado: string;
  enDisputa: boolean;
  acciones: string[];
  kgFinal: number | null;
  montoFinal: string | null;
  contraparte: { nombre: string; whatsapp: string; direccion: string | null };
  coordinacion: { tipo: string; direccionDelLocal: string | null; referencia: string | null } | null;
  incidencia: { estado: string; motivo: string } | null;
  puntosGanados?: number;
  cancelacion: { por: string } | null;
};
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;

describe('Operaciones y calificaciones (Fase 7)', () => {
  let prueba: Prueba;
  let reciclador: string;
  let recicladorId: string;
  let titicaca: string;
  let ruben: string;
  let admin: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    reciclador = await nuevoReciclador(prueba, '947000001', 'Rosa Mamani Quispe');
    recicladorId = (await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: '947000001' } })).id;
    titicaca = await entrar(prueba, '900000011');
    ruben = await entrar(prueba, '900000021');
    admin = await entrar(prueba, ADMIN.telefono);
  });
  afterAll(() => prueba.cerrar());

  const http = () => prueba.http();
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const detalle = async (id: string, token: string) =>
    (await http().get(`/api/v1/operaciones/${id}`).set(bearer(token)).expect(200)).body as Detalle;

  // Publicar, ofertar y aceptar: deja una operación en ACEPTADA
  async function aceptada(negocio: string, kg = 20, material = 'pet', precioKg = 2.5) {
    const publicacion = (
      await post('/publicaciones', reciclador, { material, kg }).set('X-Posicion', POSICION).expect(201)
    ).body as { publicacion: { id: string } };
    const oferta = (
      await post(`/negocio/publicaciones/${publicacion.publicacion.id}/ofertas`, negocio, { precioKg }).expect(201)
    ).body as { id: string };
    const { operacionId } = (await post(`/ofertas/${oferta.id}/aceptar`, reciclador).expect(200)).body as {
      operacionId: string;
    };
    return { operacionId, publicacionId: publicacion.publicacion.id };
  }

  async function hastaConfirmada(negocio: string, kg = 20, kgRecibidos = kg) {
    const op = await aceptada(negocio, kg);
    await post(`/operaciones/${op.operacionId}/coordinar`, reciclador, {
      tipo: 'REFERENCIA',
      referencia: 'Frente al mercado',
    }).expect(200);
    await post(`/operaciones/${op.operacionId}/entregar`, reciclador).expect(200);
    await post(`/operaciones/${op.operacionId}/confirmar`, negocio, { kgRecibidos }).expect(200);
    return op;
  }

  const notificaciones = async (token: string) =>
    (
      (await http().get('/api/v1/notificaciones').set(bearer(token)).expect(200)).body as {
        datos: Array<{ titulo: string; mensaje: string }>;
      }
    ).datos;

  describe('flujo completo (25, 26, 27)', () => {
    it('publicar → ofertar → aceptar → coordinar → entregar → confirmar → conforme → calificar', async () => {
      const { operacionId, publicacionId } = await aceptada(titicaca, 30, 'metal', 2.6);
      let vista = await detalle(operacionId, reciclador);
      expect(vista).toMatchObject({ estado: 'ACEPTADA', acciones: ['coordinar', 'cancelar', 'reportarProblema'] });
      expect(vista.contraparte.direccion).toBeTruthy();
      expect((await detalle(operacionId, titicaca)).acciones).toEqual(['cancelar', 'reportarProblema']);

      // El negocio no define el punto ni marca la entrega; el reciclador no escribe kilos (C9)
      await post(`/operaciones/${operacionId}/coordinar`, titicaca, { tipo: 'LOCAL_DEL_CENTRO' }).expect(403);
      await post(`/operaciones/${operacionId}/entregar`, reciclador).expect(409);
      await post(`/operaciones/${operacionId}/coordinar`, reciclador, { tipo: 'REFERENCIA', referencia: 'x' }).expect(
        400,
      );
      const manana = new Date(Date.now() + 24 * HORA_MS).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
      vista = (
        await post(`/operaciones/${operacionId}/coordinar`, reciclador, {
          tipo: 'LOCAL_DEL_CENTRO',
          dia: manana,
          franja: 'TARDE',
        }).expect(200)
      ).body as Detalle;
      expect(vista).toMatchObject({ estado: 'EN_COORDINACION' });
      expect(vista.coordinacion?.direccionDelLocal).toBe('Jr. Moquegua 450, Juliaca');
      expect((await notificaciones(titicaca)).some((n) => n.titulo === 'Punto de encuentro para tu Metales')).toBe(
        true,
      );

      await post(`/operaciones/${operacionId}/entregar`, reciclador).expect(200);
      await post(`/operaciones/${operacionId}/confirmar`, reciclador, { kgRecibidos: 30 }).expect(403);
      await post(`/operaciones/${operacionId}/confirmar`, titicaca, {}).expect(400);
      vista = (await post(`/operaciones/${operacionId}/confirmar`, titicaca, { kgRecibidos: '28,5' }).expect(200))
        .body as Detalle;
      expect(vista).toMatchObject({ estado: 'CONFIRMADA', kgFinal: 28.5, montoFinal: '74.10' });
      expect((await detalle(operacionId, reciclador)).acciones).toEqual(['conforme', 'noConforme', 'reportarProblema']);

      const antes = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: recicladorId } });
      const cierre = (await post(`/operaciones/${operacionId}/conforme`, reciclador).expect(200)).body as Detalle;
      expect(cierre).toMatchObject({
        estado: 'COMPLETADA',
        puntosGanados: 28,
        acciones: ['calificar', 'reportarProblema'],
      });
      const despues = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: recicladorId } });
      expect(Number(despues.kgTotal) - Number(antes.kgTotal)).toBe(28.5);
      expect(despues.puntos - antes.puntos).toBe(28);
      expect(despues.operacionesCompletadas - antes.operacionesCompletadas).toBe(1);
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id: publicacionId } })).estado).toBe(
        'FINALIZADA',
      );
      expect(await prueba.bd.movimientoPuntos.count({ where: { operacionId } })).toBe(1);
      expect(
        await prueba.bd.eventoDominio.count({ where: { tipo: 'OPERACION_COMPLETADA', entidadId: operacionId } }),
      ).toBe(1);
      expect(
        (await notificaciones(reciclador)).some(
          (n) => n.mensaje === 'Se cerró tu entrega de 28.5 kg de Metales: +28 puntos.',
        ),
      ).toBe(true);

      // Calificaciones en ambas direcciones, una por autor y operación
      await post(`/operaciones/${operacionId}/calificacion`, reciclador, {
        estrellas: 5,
        etiquetas: ['material_limpio'],
      }).expect(422);
      await post(`/operaciones/${operacionId}/calificacion`, reciclador, {
        estrellas: 5,
        etiquetas: ['pago_lo_acordado', 'peso_frente_a_mi'],
        comentario: 'Pesaron frente a mí.',
      }).expect(200);
      expect(
        codigo(await post(`/operaciones/${operacionId}/calificacion`, reciclador, { estrellas: 4 }).expect(409)),
      ).toBe('YA_CALIFICADA');
      await post(`/operaciones/${operacionId}/calificacion`, titicaca, {
        estrellas: 4,
        etiquetas: ['material_limpio'],
      }).expect(200);
      expect((await detalle(operacionId, titicaca)).acciones).toEqual(['reportarProblema']);
    });

    it('el pago ocurre fuera de RecicloMap: no hay campos ni rutas para cobrar', async () => {
      const { operacionId } = await aceptada(titicaca);
      const vista = await detalle(operacionId, reciclador);
      expect(Object.keys(vista).join(' ')).not.toMatch(/pago|cobro|tarjeta|yape|plin|transferencia/i);
      for (const ruta of ['pagar', 'pago', 'cobrar']) {
        await post(`/operaciones/${operacionId}/${ruta}`, titicaca, {}).expect(404);
      }
    });

    it('no se califica antes de completar; un tercero no ve ni actúa sobre la operación', async () => {
      const { operacionId } = await aceptada(titicaca);
      expect(
        codigo(await post(`/operaciones/${operacionId}/calificacion`, reciclador, { estrellas: 5 }).expect(409)),
      ).toBe('OPERACION_NO_COMPLETADA');
      await http().get(`/api/v1/operaciones/${operacionId}`).set(bearer(ruben)).expect(404);
      await post(`/operaciones/${operacionId}/cancelar`, ruben, { motivo: 'Prueba ajena' }).expect(404);
    });

    it('con un comprador móvil no se elige "En el local del centro"; el pin debe estar en la ciudad', async () => {
      const { operacionId } = await aceptada(ruben);
      expect(
        codigo(
          await post(`/operaciones/${operacionId}/coordinar`, reciclador, { tipo: 'LOCAL_DEL_CENTRO' }).expect(422),
        ),
      ).toBe('SIN_LOCAL');
      const lejos = await post(`/operaciones/${operacionId}/coordinar`, reciclador, {
        tipo: 'REFERENCIA',
        referencia: 'Plaza de Lima',
        pin: { lat: -12.05, lng: -77.04 },
      }).expect(422);
      expect(codigo(lejos)).toBe('PIN_FUERA_DE_LA_CIUDAD');
      expect(
        codigo(
          await post(`/operaciones/${operacionId}/coordinar`, reciclador, {
            tipo: 'REFERENCIA',
            referencia: 'Frente al mercado',
            dia: '2020-01-01',
          }).expect(422),
        ),
      ).toBe('DIA_NO_VALIDO');
      const conPin = (
        await post(`/operaciones/${operacionId}/coordinar`, reciclador, {
          tipo: 'REFERENCIA',
          referencia: 'Esquina del parque',
          pin: { lat: -15.494, lng: -70.13 },
        }).expect(200)
      ).body as Detalle & { coordinacion: { pin: { lat: number } } };
      expect(conPin.coordinacion.pin.lat).toBeCloseTo(-15.494, 3);
    });
  });

  describe('cierre atómico', () => {
    it('conformidad manual y cierre automático a la vez: los puntos se otorgan una sola vez', async () => {
      const { operacionId } = await hastaConfirmada(titicaca, 15);
      await prueba.bd.operacion.update({
        where: { id: operacionId },
        data: { confirmadaEn: new Date(Date.now() - 73 * HORA_MS) },
      });
      const servicio = prueba.app.get(OperacionesService);
      const resultados = await Promise.allSettled([
        post(`/operaciones/${operacionId}/conforme`, reciclador),
        servicio.cerrarPorPlazo(operacionId),
      ]);
      expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await prueba.bd.movimientoPuntos.count({ where: { operacionId } })).toBe(1);
      expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } })).estado).toBe('COMPLETADA');
    });

    it('un fallo a mitad del cierre no deja puntos sin operación completada', async () => {
      const { operacionId } = await hastaConfirmada(titicaca, 12);
      const notificacionesServicio = prueba.app.get(NotificacionesService);
      const original = notificacionesServicio.crear.bind(notificacionesServicio);
      const espia = vi.spyOn(notificacionesServicio, 'crear').mockImplementation(async (cliente, aviso) => {
        if (aviso.titulo.startsWith('Operación completada')) throw new Error('Falla simulada');
        return original(cliente, aviso);
      });
      try {
        await post(`/operaciones/${operacionId}/conforme`, reciclador).expect(500);
      } finally {
        espia.mockRestore();
      }
      expect(await prueba.bd.movimientoPuntos.count({ where: { operacionId } })).toBe(0);
      expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } })).estado).toBe('CONFIRMADA');
      await post(`/operaciones/${operacionId}/conforme`, reciclador).expect(200);
    });

    it('cada 500 puntos por reciclaje se gana un giro', async () => {
      const antes = await prueba.bd.giro.count({ where: { usuarioId: recicladorId } });
      const perfil = await prueba.bd.recicladorPerfil.findUniqueOrThrow({ where: { usuarioId: recicladorId } });
      const faltan = 500 - (perfil.puntosReciclaje % 500);
      const { operacionId } = await hastaConfirmada(titicaca, faltan);
      await post(`/operaciones/${operacionId}/conforme`, reciclador).expect(200);
      expect(await prueba.bd.giro.count({ where: { usuarioId: recicladorId, origen: 'PUNTOS' } })).toBe(antes + 1);
    });
  });

  describe('plazos de 72 h', () => {
    it('en CONFIRMADA sin respuesta se completa sola y se avisa', async () => {
      const { operacionId } = await hastaConfirmada(titicaca, 10);
      const tareas = prueba.app.get(OperacionesTareas);
      expect(await tareas.cerrarVencidas()).toBe(0);
      await prueba.bd.operacion.update({
        where: { id: operacionId },
        data: { confirmadaEn: new Date(Date.now() - 73 * HORA_MS) },
      });
      expect(await tareas.cerrarVencidas()).toBeGreaterThanOrEqual(1);
      expect(await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } })).toMatchObject({
        estado: 'COMPLETADA',
        completadaPorPlazo: true,
      });
      expect(
        (await notificaciones(reciclador)).some((n) => n.mensaje.includes('se completó al cumplirse 72 horas')),
      ).toBe(true);
    });

    it('en ENTREGADA sin confirmar se avisa una vez y habilita la incidencia; no se cierra sola', async () => {
      const { operacionId } = await aceptada(titicaca, 14);
      await post(`/operaciones/${operacionId}/coordinar`, reciclador, { tipo: 'LOCAL_DEL_CENTRO' }).expect(200);
      await post(`/operaciones/${operacionId}/entregar`, reciclador).expect(200);
      expect(
        codigo(
          await post(`/operaciones/${operacionId}/incidencia`, reciclador, {
            detalle: 'No confirman la recepción.',
          }).expect(409),
        ),
      ).toBe('INCIDENCIA_NO_DISPONIBLE');
      await prueba.bd.operacion.update({
        where: { id: operacionId },
        data: { entregadaEn: new Date(Date.now() - 73 * HORA_MS) },
      });
      const tareas = prueba.app.get(OperacionesTareas);
      await tareas.avisarSinConfirmar();
      await tareas.avisarSinConfirmar();
      const avisos = (await notificaciones(titicaca)).filter((n) => n.titulo === 'Entrega de PET sin confirmar');
      expect(avisos.length).toBeGreaterThanOrEqual(1);
      expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } })).estado).toBe('ENTREGADA');
      expect((await detalle(operacionId, reciclador)).acciones).toContain('abrirIncidencia');
      const conIncidencia = (
        await post(`/operaciones/${operacionId}/incidencia`, reciclador, {
          detalle: 'No confirman la recepción.',
        }).expect(200)
      ).body as Detalle;
      expect(conIncidencia).toMatchObject({
        enDisputa: true,
        incidencia: { motivo: 'NO_CONFIRMA', estado: 'PENDIENTE' },
      });
      // El negocio confirma con los kilos y la incidencia queda resuelta
      await post(`/operaciones/${operacionId}/confirmar`, titicaca, { kgRecibidos: 14 }).expect(200);
      expect(await detalle(operacionId, reciclador)).toMatchObject({
        enDisputa: false,
        incidencia: { estado: 'RESUELTO' },
      });
    });
  });

  describe('cancelación', () => {
    it('si la cancela el negocio, el reciclador ve "Volver a publicar"; después de entregar no se cancela', async () => {
      const { operacionId, publicacionId } = await aceptada(titicaca);
      await post(`/operaciones/${operacionId}/cancelar`, titicaca, { motivo: '' }).expect(400);
      const cancelada = (
        await post(`/operaciones/${operacionId}/cancelar`, titicaca, { motivo: 'No llegamos a un acuerdo' }).expect(200)
      ).body as Detalle;
      expect(cancelada.cancelacion).toEqual({ motivo: 'No llegamos a un acuerdo', por: 'NEGOCIO' });
      expect((await detalle(operacionId, reciclador)).acciones).toContain('volverAPublicar');
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id: publicacionId } })).estado).toBe(
        'CANCELADA',
      );
      expect(
        (await notificaciones(reciclador)).some((n) => n.mensaje.endsWith('Motivo: No llegamos a un acuerdo.')),
      ).toBe(true);
      await post(`/publicaciones/${publicacionId}/duplicar`, reciclador).set('X-Posicion', POSICION).expect(201);

      const entregada = await aceptada(titicaca);
      await post(`/operaciones/${entregada.operacionId}/coordinar`, reciclador, { tipo: 'LOCAL_DEL_CENTRO' }).expect(
        200,
      );
      await post(`/operaciones/${entregada.operacionId}/entregar`, reciclador).expect(200);
      expect(
        codigo(
          await post(`/operaciones/${entregada.operacionId}/cancelar`, reciclador, { motivo: 'Cambié de idea' }).expect(
            409,
          ),
        ),
      ).toBe('OPERACION_NO_CANCELABLE');
    });
  });

  describe('"No conforme" e incidencias del administrador (S4)', () => {
    const incidencias = async () =>
      (
        (await http().get('/api/v1/admin/incidencias').set(bearer(admin)).expect(200)).body as {
          datos: Array<{ id: string; operacion: { id: string }; decisiones: string[] }>;
        }
      ).datos;

    it('pedir corrección: el negocio corrige los kilos y vuelve a correr el plazo', async () => {
      const { operacionId } = await hastaConfirmada(titicaca, 18, 12);
      await post(`/operaciones/${operacionId}/no-conforme`, reciclador, {
        detalle: 'Entregué 18 kg y confirmaron 12 kg.',
      }).expect(200);
      expect((await detalle(operacionId, reciclador)).acciones).toEqual(['reportarProblema']);
      const incidencia = (await incidencias()).find((i) => i.operacion.id === operacionId)!;
      expect(incidencia.decisiones).toEqual(['PEDIR_CORRECCION', 'CERRAR_CON_KILOS_VIGENTES', 'ANULAR']);
      await post(`/admin/incidencias/${incidencia.id}/resolver`, reciclador, {
        decision: 'ANULAR',
        motivo: 'Intento ajeno',
      }).expect(403);
      await post(`/admin/incidencias/${incidencia.id}/resolver`, admin, {
        decision: 'PEDIR_CORRECCION',
        motivo: 'Revisa la báscula, por favor.',
      }).expect(200);
      expect((await detalle(operacionId, titicaca)).acciones).toEqual(['corregirKilos', 'reportarProblema']);
      const corregida = (await post(`/operaciones/${operacionId}/confirmar`, titicaca, { kgRecibidos: 18 }).expect(200))
        .body as Detalle;
      expect(corregida).toMatchObject({ kgFinal: 18, enDisputa: false, incidencia: { estado: 'RESUELTO' } });
      expect((await detalle(operacionId, reciclador)).acciones).toEqual(['conforme', 'noConforme', 'reportarProblema']);
      expect(await prueba.bd.auditoria.count({ where: { entidadId: operacionId, tipo: 'REPORTES' } })).toBe(1);
    });

    it('cerrar con los kilos vigentes da los puntos; anular no da ninguno; todo queda auditado', async () => {
      const cerrar = await hastaConfirmada(titicaca, 16, 15);
      await post(`/operaciones/${cerrar.operacionId}/no-conforme`, reciclador, { detalle: 'Faltó un kilo.' }).expect(
        200,
      );
      const anular = await hastaConfirmada(titicaca, 16, 9);
      await post(`/operaciones/${anular.operacionId}/no-conforme`, reciclador, { detalle: 'Faltan 7 kilos.' }).expect(
        200,
      );
      const lista = await incidencias();
      const deCerrar = lista.find((i) => i.operacion.id === cerrar.operacionId)!;
      const deAnular = lista.find((i) => i.operacion.id === anular.operacionId)!;
      await post(`/admin/incidencias/${deCerrar.id}/resolver`, admin, {
        decision: 'CERRAR_CON_KILOS_VIGENTES',
        motivo: 'La foto de la báscula muestra 15 kg.',
      }).expect(200);
      await post(`/admin/incidencias/${deAnular.id}/resolver`, admin, {
        decision: 'ANULAR',
        motivo: 'Las partes no se pusieron de acuerdo.',
      }).expect(200);
      await post(`/admin/incidencias/${deAnular.id}/resolver`, admin, {
        decision: 'ANULAR',
        motivo: 'Otra vez',
      }).expect(409);
      expect(await prueba.bd.operacion.findUniqueOrThrow({ where: { id: cerrar.operacionId } })).toMatchObject({
        estado: 'COMPLETADA',
      });
      expect(await prueba.bd.movimientoPuntos.count({ where: { operacionId: cerrar.operacionId } })).toBe(1);
      expect(await prueba.bd.operacion.findUniqueOrThrow({ where: { id: anular.operacionId } })).toMatchObject({
        estado: 'CANCELADA',
      });
      expect(await prueba.bd.movimientoPuntos.count({ where: { operacionId: anular.operacionId } })).toBe(0);
      expect(
        await prueba.bd.auditoria.count({ where: { entidadId: { in: [cerrar.operacionId, anular.operacionId] } } }),
      ).toBe(2);
    });

    it('el administrador no puede escribir kilos, montos ni reseñas, ni siquiera en la base de datos', async () => {
      const { operacionId } = await hastaConfirmada(titicaca, 11);
      const bdAdmin = prueba.app.get(PrismaAdmin);
      await expect(
        bdAdmin.$executeRaw`UPDATE operacion SET kg_final = 1 WHERE id = ${operacionId}::uuid`,
      ).rejects.toThrow(/permission denied/);
      await expect(
        bdAdmin.$executeRaw`UPDATE operacion SET monto_final = 1 WHERE id = ${operacionId}::uuid`,
      ).rejects.toThrow(/permission denied/);
      await expect(
        bdAdmin.$executeRaw`INSERT INTO calificacion (operacion_id, autor_id, destino_id, estrellas) SELECT id, reciclador_id, reciclador_id, 5 FROM operacion LIMIT 1`,
      ).rejects.toThrow(/permission denied/);
      await expect(bdAdmin.$executeRaw`UPDATE calificacion SET estrellas = 1`).rejects.toThrow(/permission denied/);
      await http().get(`/api/v1/operaciones/${operacionId}`).set(bearer(admin)).expect(403);
      await post(`/operaciones/${operacionId}/confirmar`, admin, { kgRecibidos: 1 }).expect(403);
    });
  });

  describe('reseñas (17, 48), historiales (28, 51, 54) y notificaciones (32)', () => {
    it('las reseñas del negocio son públicas con "Nombre I."; el negocio responde una vez; se pueden reportar', async () => {
      const negocio = await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } });
      const publicas = (await http().get(`/api/v1/negocios/${negocio.id}/resenas`).expect(200)).body as {
        resumen: { promedio: string | null; nuevo: boolean; distribucion: unknown[] };
        datos: Array<{ id: string; autor: string; respuesta: unknown }>;
      };
      expect(publicas.resumen.nuevo).toBe(false);
      expect(publicas.resumen.distribucion).toHaveLength(5);
      const mia = publicas.datos.find((r) => r.autor === 'Rosa M.')!;
      expect(mia).toBeDefined();
      expect(JSON.stringify(publicas)).not.toContain('Mamani');

      await post(`/resenas/${mia.id}/respuesta`, reciclador, { texto: 'Hola' }).expect(403);
      await post(`/resenas/${mia.id}/respuesta`, ruben, { texto: 'No es mía' }).expect(404);
      await post(`/resenas/${mia.id}/respuesta`, titicaca, { texto: 'Gracias por venir.' }).expect(200);
      expect(codigo(await post(`/resenas/${mia.id}/respuesta`, titicaca, { texto: 'Otra vez' }).expect(409))).toBe(
        'YA_RESPONDIDA',
      );

      await post(`/resenas/${mia.id}/reportes`, titicaca, { detalle: 'No corresponde.' }).expect(200);
      expect(codigo(await post(`/resenas/${mia.id}/reportes`, titicaca, {}).expect(409))).toBe('YA_REPORTADA');
      expect(codigo(await post(`/resenas/${mia.id}/reportes`, reciclador, {}).expect(422))).toBe('RESENA_PROPIA');
      expect(await prueba.bd.reporte.count({ where: { tipo: 'RESENA', calificacionId: mia.id } })).toBe(1);

      const recibidas = (
        await http().get('/api/v1/mi-negocio/resenas?filtro=sin-responder').set(bearer(titicaca)).expect(200)
      ).body as {
        datos: Array<{ id: string }>;
      };
      expect(recibidas.datos.map((r) => r.id)).not.toContain(mia.id);
      const nuevo = await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Ilave Móvil' } });
      const sinResenas = (await http().get(`/api/v1/negocios/${nuevo.id}/resenas`).expect(200)).body as {
        resumen: { nuevo: boolean; promedio: null };
      };
      expect(sinResenas.resumen).toMatchObject({ nuevo: true, promedio: null });
    });

    it('historial con indicadores y exportación CSV, sin datos de calle del reciclador', async () => {
      const propio = (await http().get('/api/v1/operaciones?estado=completadas').set(bearer(reciclador)).expect(200))
        .body as {
        rol: string;
        indicadores: { puntos: number };
        datos: Array<{ estado: string; puntos: number }>;
      };
      expect(propio.rol).toBe('RECICLADOR');
      expect(propio.datos.every((o) => o.estado === 'COMPLETADA')).toBe(true);
      expect(propio.indicadores.puntos).toBe(propio.datos.reduce((s, o) => s + o.puntos, 0));
      const csv = await http().get('/api/v1/operaciones/exportar').set(bearer(reciclador)).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.startsWith('﻿Fecha,Material,Kg,Comprador')).toBe(true);

      const compras = (await http().get('/api/v1/negocio/compras').set(bearer(ruben)).expect(200)).body as object;
      expect(JSON.stringify(compras)).not.toMatch(/Mamani|947000001|Jr\.|Av\./);
    });

    it('preferencias por grupo; las de una operación propia no se apagan', async () => {
      const otra = await nuevoReciclador(prueba, '947000002', 'Pedro Condori');
      await http().put('/api/v1/notificaciones/preferencias').set(bearer(otra)).send({ ofertas: false }).expect(200);
      const preferencias = (await http().get('/api/v1/notificaciones/preferencias').set(bearer(otra)).expect(200)).body;
      expect(preferencias).toMatchObject({ ofertas: false, operaciones: true });
      const publicacion = (
        (await post('/publicaciones', otra, { material: 'pet', kg: 10 }).set('X-Posicion', POSICION).expect(201))
          .body as {
          publicacion: { id: string };
        }
      ).publicacion.id;
      const oferta = (
        (await post(`/negocio/publicaciones/${publicacion}/ofertas`, titicaca, { precioKg: 2 }).expect(201)).body as {
          id: string;
        }
      ).id;
      expect((await notificaciones(otra)).some((n) => n.titulo.startsWith('Nueva oferta'))).toBe(false);
      const { operacionId } = (await post(`/ofertas/${oferta}/aceptar`, otra).expect(200)).body as {
        operacionId: string;
      };
      await post(`/operaciones/${operacionId}/cancelar`, titicaca, { motivo: 'Cambió la cantidad de material' }).expect(
        200,
      );
      const filtradas = (await http().get('/api/v1/notificaciones?filtro=operaciones').set(bearer(otra)).expect(200))
        .body as {
        datos: Array<{ tipo: string }>;
      };
      expect(filtradas.datos.length).toBeGreaterThan(0);
      expect(filtradas.datos.every((n) => ['OPERACION', 'CONFIRMACION'].includes(n.tipo))).toBe(true);
      await http()
        .post('/api/v1/notificaciones/push')
        .set(bearer(otra))
        .send({ endpoint: 'http://inseguro.test', keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(10) } })
        .expect(400);
    });
  });
});
