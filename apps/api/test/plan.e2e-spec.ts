import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { PlanService } from '../src/modulos/plan/plan.service.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
type Error = { error: { codigo: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const DIA_MS = 86_400_000;
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const sumarDias = (fecha: string, dias: number) =>
  new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * DIA_MS).toISOString().slice(0, 10);

type Plan = {
  plan: 'GRATIS' | 'PRO';
  estado: 'GRATIS' | 'SOLICITADO' | 'PRO';
  desde: string | null;
  hasta: string | null;
  venceEnDias: number | null;
  solicitud: { id: string; mensaje: string | null } | null;
  puedeSolicitar: boolean;
  impedimento: { codigo: string } | null;
  historial: Array<{ accion: string }>;
  solicitudes: Array<{ estado: string; motivoDecision: string | null }>;
};
type Cola = {
  datos: Array<{
    id: string;
    estado: string;
    mensaje: string | null;
    negocio: { id: string; nombre: string; plan: string };
  }>;
};
type Opcion = {
  id: string;
  nombre: string;
  esPro: boolean;
  destacado: boolean;
  distanciaKm: number;
  demanda: string;
  precio: { min: string; max: string };
  semaforo: { clave: string; texto: string };
};

describe('Plan Pro: solicitud, activación del administrador y efectos (Fase 11)', () => {
  let prueba: Prueba;
  let admin: string;
  let eco: string; // centro Gratis
  let camion: string; // móvil Gratis
  let titicaca: string; // centro Pro
  let sinVerificar: string; // Acopio Los Pinos
  let ecoId: string;
  let camionId: string;
  let titicacaId: string;
  let marco: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    admin = await entrar(prueba, ADMIN.telefono);
    eco = await entrar(prueba, '900000012');
    camion = await entrar(prueba, '900000022');
    titicaca = await entrar(prueba, '900000011');
    sinVerificar = await entrar(prueba, '900000016');
    marco = await entrar(prueba, '900000001');
    const id = async (nombre: string) =>
      (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: nombre } })).id;
    ecoId = await id('EcoAcopio Juliaca');
    camionId = await id('Camión Los Andes');
    titicacaId = await id('Acopio Titicaca');
  });
  afterAll(async () => {
    await restaurar(ecoId);
    await restaurar(camionId);
    await prueba.cerrar();
  });

  const get = (ruta: string, token: string) => prueba.http().get(`/api/v1${ruta}`).set(bearer(token));
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const del = (ruta: string, token: string) => prueba.http().delete(`/api/v1${ruta}`).set(bearer(token));
  const plan = async (token: string) => (await get('/mi-negocio/plan', token).expect(200)).body as Plan;
  const cola = async (estado = 'pendientes') =>
    (await get(`/admin/plan/solicitudes?estado=${estado}`, admin).expect(200)).body as Cola;
  const solicitudDe = async (negocioId: string, estado = 'pendientes') =>
    (await cola(estado)).datos.find((s) => s.negocio.id === negocioId);
  const notificaciones = (usuarioId: string, titulo: string) =>
    prueba.bd.notificacion.count({ where: { usuarioId, titulo: { contains: titulo } } });
  const usuarioDe = async (compradorId: string) =>
    (await prueba.bd.comprador.findUniqueOrThrow({ where: { id: compradorId } })).usuarioId;

  // Deja al negocio como estaba: Gratis, sin fechas ni solicitudes pendientes
  async function restaurar(compradorId: string) {
    await prueba.bd.solicitudPlan.updateMany({
      where: { compradorId, estado: 'PENDIENTE' },
      data: { estado: 'CANCELADA' },
    });
    await prueba.bd.comprador.update({
      where: { id: compradorId },
      data: { plan: 'GRATIS', planDesde: null, planHasta: null, planAvisoEn: null },
    });
  }
  const hacerPro = (compradorId: string, desde: string, hasta: string) =>
    prueba.bd.comprador.update({
      where: { id: compradorId },
      data: {
        plan: 'PRO',
        planDesde: new Date(`${desde}T00:00:00Z`),
        planHasta: new Date(`${hasta}T00:00:00Z`),
        planAvisoEn: null,
      },
    });
  const activarPorAdmin = (compradorId: string, hasta = sumarDias(hoyLima(), 60), motivo = 'Activación de prueba') =>
    post(`/admin/plan/negocios/${compradorId}/activar`, admin, { desde: hoyLima(), hasta, motivo });

  describe('el negocio ve su plan y pide Pro', () => {
    it('un negocio Gratis ve su estado, sus beneficios y que puede solicitar; sin precios ni cobros', async () => {
      const p = await plan(eco);
      expect(p).toMatchObject({
        plan: 'GRATIS',
        estado: 'GRATIS',
        desde: null,
        hasta: null,
        puedeSolicitar: true,
        impedimento: null,
      });
      const texto = JSON.stringify(await get('/mi-negocio/plan', eco).then((r) => r.body));
      expect(texto).not.toMatch(/S\/|soles|precioPlan|monto|pago|cobro/i);
      expect(texto).toContain('90 días');
    });

    it('solicita con un mensaje opcional, una sola a la vez, y se avisa al negocio y a la administración', async () => {
      await restaurar(ecoId);
      const antesAdmin = await notificaciones(
        (await prueba.bd.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } })).id,
        'Nueva solicitud del plan Pro',
      );
      const r = await post('/mi-negocio/plan/solicitud', eco, {
        mensaje: 'Quiero ver las estadísticas de 90 días.',
      }).expect(201);
      expect(r.body).toMatchObject({ estado: 'PENDIENTE' });
      expect(await plan(eco)).toMatchObject({ estado: 'SOLICITADO', plan: 'GRATIS', puedeSolicitar: false });
      expect((await plan(eco)).impedimento).toMatchObject({ codigo: 'SOLICITUD_PENDIENTE' });
      expect(codigo(await post('/mi-negocio/plan/solicitud', eco, {}).expect(409))).toBe('SOLICITUD_PENDIENTE');
      expect(await notificaciones(await usuarioDe(ecoId), 'Recibimos tu solicitud')).toBeGreaterThanOrEqual(1);
      const admins = await prueba.bd.usuario.findMany({ where: { rol: 'ADMIN' } });
      expect(await notificaciones(admins[0]!.id, 'Nueva solicitud del plan Pro')).toBe(antesAdmin + 1);
      expect(await solicitudDe(ecoId)).toMatchObject({ mensaje: 'Quiero ver las estadísticas de 90 días.' });
    });

    it('el mensaje tiene máximo 200 caracteres', async () => {
      await restaurar(ecoId);
      await post('/mi-negocio/plan/solicitud', eco, { mensaje: 'x'.repeat(201) }).expect(400);
    });

    it('la cancela mientras está en revisión y puede volver a pedir', async () => {
      await restaurar(ecoId);
      await post('/mi-negocio/plan/solicitud', eco, {}).expect(201);
      await del('/mi-negocio/plan/solicitud', eco).expect(204);
      expect(await plan(eco)).toMatchObject({ estado: 'GRATIS', puedeSolicitar: true });
      expect(codigo(await del('/mi-negocio/plan/solicitud', eco).expect(404))).toBe('NO_ENCONTRADO');
      expect((await plan(eco)).solicitudes[0]).toMatchObject({ estado: 'CANCELADA' });
      await post('/mi-negocio/plan/solicitud', eco, {}).expect(201);
      await restaurar(ecoId);
    });

    it('un negocio sin verificar o suspendido no puede pedir Pro', async () => {
      expect((await plan(sinVerificar)).impedimento).toMatchObject({ codigo: 'NEGOCIO_NO_VERIFICADO' });
      expect(codigo(await post('/mi-negocio/plan/solicitud', sinVerificar, {}).expect(403))).toBe(
        'NEGOCIO_NO_VERIFICADO',
      );

      const triciclo = await entrar(prueba, '900000023');
      const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: '900000023' } });
      await prueba.bd.usuario.update({
        where: { id: usuario.id },
        data: { estado: 'SUSPENDIDO', motivoSuspension: 'Prueba de suspensión' },
      });
      try {
        const r = await post('/mi-negocio/plan/solicitud', triciclo, {});
        expect([403]).toContain(r.status);
        expect(['CUENTA_SUSPENDIDA']).toContain(codigo(r));
      } finally {
        await prueba.bd.usuario.update({
          where: { id: usuario.id },
          data: { estado: 'ACTIVO', motivoSuspension: null },
        });
      }
    });

    it('un reciclador no usa el plan y sin sesión no se entra', async () => {
      await get('/mi-negocio/plan', marco).expect(403);
      await post('/mi-negocio/plan/solicitud', marco, {}).expect(403);
      await prueba.http().get('/api/v1/mi-negocio/plan').expect(401);
    });

    it('un negocio no usa los endpoints de administración', async () => {
      await get('/admin/plan/solicitudes', eco).expect(403);
      await post(`/admin/plan/negocios/${ecoId}/activar`, eco, {
        desde: hoyLima(),
        hasta: sumarDias(hoyLima(), 30),
        motivo: 'Me lo doy yo',
      }).expect(403);
      expect((await plan(eco)).plan).toBe('GRATIS');
    });
  });

  describe('la administración decide con fechas, motivo y auditoría', () => {
    it('rechaza con motivo obligatorio, avisa al negocio y no se puede resolver dos veces', async () => {
      await restaurar(ecoId);
      await post('/mi-negocio/plan/solicitud', eco, {}).expect(201);
      const s = (await solicitudDe(ecoId))!;
      await post(`/admin/plan/solicitudes/${s.id}/rechazar`, admin, { motivo: 'no' }).expect(400);
      await post(`/admin/plan/solicitudes/${s.id}/rechazar`, admin, { motivo: 'Aún no cumple los requisitos' }).expect(
        200,
      );
      expect(
        codigo(
          await post(`/admin/plan/solicitudes/${s.id}/rechazar`, admin, { motivo: 'Otra vez el motivo' }).expect(409),
        ),
      ).toBe('SOLICITUD_YA_RESUELTA');
      expect(await notificaciones(await usuarioDe(ecoId), 'No aprobamos tu solicitud')).toBeGreaterThanOrEqual(1);
      const p = await plan(eco);
      expect(p).toMatchObject({ estado: 'GRATIS', plan: 'GRATIS' });
      expect(p.solicitudes[0]).toMatchObject({ estado: 'RECHAZADA', motivoDecision: 'Aún no cumple los requisitos' });
      const auditoria = await prueba.bd.auditoria.findFirstOrThrow({
        where: { entidadId: s.id, accion: 'RECHAZAR_SOLICITUD_PRO' },
      });
      expect(auditoria).toMatchObject({ tipo: 'PLAN', motivo: 'Aún no cumple los requisitos' });
      // El negocio ya no puede cancelar lo que se resolvió
      expect(codigo(await del('/mi-negocio/plan/solicitud', eco).expect(404))).toBe('NO_ENCONTRADO');
    });

    it('aprueba con fechas: el plan queda vigente, con historial, auditoría y aviso, y nada más del negocio cambia', async () => {
      await restaurar(ecoId);
      await post('/mi-negocio/plan/solicitud', eco, {}).expect(201);
      const s = (await solicitudDe(ecoId))!;
      const antes = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: ecoId } });
      const hasta = sumarDias(hoyLima(), 60);
      // Fechas inválidas y sin motivo
      await post(`/admin/plan/solicitudes/${s.id}/aprobar`, admin, {
        desde: sumarDias(hoyLima(), -30),
        hasta: sumarDias(hoyLima(), -1),
        motivo: 'Fin en el pasado',
      }).expect(422);
      await post(`/admin/plan/solicitudes/${s.id}/aprobar`, admin, {
        desde: hoyLima(),
        hasta: sumarDias(hoyLima(), -1),
        motivo: 'x',
      }).expect(400);
      await post(`/admin/plan/solicitudes/${s.id}/aprobar`, admin, {
        desde: sumarDias(hoyLima(), 10),
        hasta: hoyLima(),
        motivo: 'Fin antes del inicio',
      }).expect(400);
      expect((await plan(eco)).plan).toBe('GRATIS');

      await post(`/admin/plan/solicitudes/${s.id}/aprobar`, admin, {
        desde: hoyLima(),
        hasta,
        motivo: 'Negocio verificado con buen historial',
      }).expect(200);
      const p = await plan(eco);
      expect(p).toMatchObject({ plan: 'PRO', estado: 'PRO', desde: hoyLima(), hasta, venceEnDias: 60 });
      expect(p.historial[0]).toMatchObject({ accion: 'ACTIVADO' });
      expect(p.solicitudes[0]).toMatchObject({ estado: 'APROBADA' });
      expect(await notificaciones(await usuarioDe(ecoId), 'Tu plan Pro está activo')).toBeGreaterThanOrEqual(1);
      const auditoria = await prueba.bd.auditoria.findFirstOrThrow({
        where: { entidadId: ecoId, accion: 'APROBAR_SOLICITUD_PRO' },
      });
      expect(auditoria).toMatchObject({ tipo: 'PLAN', motivo: 'Negocio verificado con buen historial' });
      expect(auditoria.despues).toMatchObject({ plan: 'PRO', desde: hoyLima(), hasta });

      // La administración solo tocó el plan y sus fechas
      const despues = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: ecoId } });
      const { plan: _p, planDesde: _d, planHasta: _h, planAvisoEn: _a, actualizadoEn: _u, ...restoAntes } = antes;
      const {
        plan: _p2,
        planDesde: _d2,
        planHasta: _h2,
        planAvisoEn: _a2,
        actualizadoEn: _u2,
        ...restoDespues
      } = despues;
      expect(restoDespues).toEqual(restoAntes);
      expect(
        await prueba.bd.precioMaterial.count({
          where: { compradorId: ecoId, actualizadoPorId: { not: despues.usuarioId } },
        }),
      ).toBe(0);
    });

    it('con un Pro vigente lejos de su fin no se puede pedir otra vez; cerca del fin sí, para renovar', async () => {
      expect(codigo(await post('/mi-negocio/plan/solicitud', eco, {}).expect(409))).toBe('PLAN_VIGENTE');
      await hacerPro(ecoId, sumarDias(hoyLima(), -80), sumarDias(hoyLima(), 5));
      expect((await plan(eco)).puedeSolicitar).toBe(true);
      await post('/mi-negocio/plan/solicitud', eco, { mensaje: 'Quiero renovar' }).expect(201);
      const s = (await solicitudDe(ecoId))!;
      await post(`/admin/plan/solicitudes/${s.id}/aprobar`, admin, {
        desde: hoyLima(),
        hasta: sumarDias(hoyLima(), 90),
        motivo: 'Renovación aprobada',
      }).expect(200);
      expect(await plan(eco)).toMatchObject({ plan: 'PRO', venceEnDias: 90 });
    });

    it('activa y desactiva Pro por su cuenta, con motivo y auditoría; una solicitud pendiente queda aprobada', async () => {
      await restaurar(camionId);
      await post('/mi-negocio/plan/solicitud', camion, {}).expect(201);
      await post(`/admin/plan/negocios/${camionId}/activar`, admin, {
        desde: hoyLima(),
        hasta: sumarDias(hoyLima(), 30),
        motivo: '',
      }).expect(400);
      await activarPorAdmin(camionId, sumarDias(hoyLima(), 30), 'Activado a pedido del negocio').expect(200);
      expect(await plan(camion)).toMatchObject({ plan: 'PRO', estado: 'PRO' });
      expect((await plan(camion)).solicitudes[0]).toMatchObject({ estado: 'APROBADA' });
      expect(
        codigo(await post(`/admin/plan/negocios/${camionId}/desactivar`, admin, { motivo: 'no' }).expect(400)),
      ).toBeDefined();
      await post(`/admin/plan/negocios/${camionId}/desactivar`, admin, { motivo: 'Pedido del negocio' }).expect(200);
      expect(await plan(camion)).toMatchObject({ plan: 'GRATIS' });
      expect((await plan(camion)).historial.map((h) => h.accion).slice(0, 2)).toEqual(['DESACTIVADO', 'ACTIVADO']);
      expect(
        codigo(
          await post(`/admin/plan/negocios/${camionId}/desactivar`, admin, { motivo: 'Otra vez el motivo' }).expect(
            409,
          ),
        ),
      ).toBe('PLAN_NO_ACTIVO');
      expect(await prueba.bd.auditoria.count({ where: { entidadId: camionId, tipo: 'PLAN' } })).toBeGreaterThanOrEqual(
        2,
      );
      const historial = (await get(`/admin/plan/negocios/${camionId}/historial`, admin).expect(200)).body as {
        datos: Array<{ motivo: string }>;
      };
      expect(historial.datos[0]!.motivo).toBe('Pedido del negocio');
    });

    it('no se activa Pro a un negocio sin verificar ni suspendido', async () => {
      const pinos = await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Los Pinos' } });
      expect(codigo(await activarPorAdmin(pinos.id).expect(409))).toBe('NEGOCIO_NO_VERIFICADO');
      expect(codigo(await activarPorAdmin('00000000-0000-4000-8000-000000000000').expect(404))).toBe('NO_ENCONTRADO');
    });

    it('la cola y la búsqueda de negocios solo ve la administración y trae lo necesario', async () => {
      const negocios = (await get('/admin/plan/negocios?q=titicaca', admin).expect(200)).body as {
        datos: Array<{ nombre: string; plan: string; verificado: boolean }>;
      };
      expect(negocios.datos[0]).toMatchObject({ nombre: 'Acopio Titicaca', plan: 'PRO', verificado: true });
      await get('/admin/plan/negocios', marco).expect(403);
    });
  });

  describe('lo que cambia con Pro, y lo que no', () => {
    const buscar = async (orden: string, token = marco) =>
      (
        (await get(`/compradores?material=pet&radio=20&orden=${orden}`, token).set('X-Posicion', POSICION).expect(200))
          .body as { opciones: Opcion[] }
      ).opciones;
    const ids = (lista: Opcion[]) => lista.map((o) => o.id);
    const foto = (lista: Opcion[]) =>
      lista.map((o) => ({ id: o.id, precio: o.precio, demanda: o.demanda, semaforo: o.semaforo }));

    it('cambiar el plan de un negocio no cambia su semáforo, su precio ni su demanda', async () => {
      await restaurar(ecoId);
      const gratis = await buscar('precio');
      const ficha = async () =>
        (
          (await get(`/compradores/${ecoId}?material=pet&radio=20`, marco).set('X-Posicion', POSICION).expect(200))
            .body as {
            materiales: Array<{ material: { codigo: string }; semaforo: unknown; precio: unknown; demanda: unknown }>;
          }
        ).materiales;
      const fichaGratis = await ficha();
      await hacerPro(ecoId, sumarDias(hoyLima(), -1), sumarDias(hoyLima(), 30));
      try {
        const pro = await buscar('precio');
        expect(foto(pro)).toEqual(foto(gratis));
        // La ficha pública: mismo semáforo, mismo precio y misma demanda por material
        expect(await ficha()).toEqual(fichaGratis);
        expect(fichaGratis.length).toBeGreaterThan(0);
      } finally {
        await restaurar(ecoId);
      }
    });

    it('los demás órdenes ignoran el plan por completo y solo "Recomendado" muestra "Destacado"', async () => {
      await restaurar(ecoId);
      const sinPlan = {
        precio: await buscar('precio'),
        cercania: await buscar('cercania'),
        demanda: await buscar('demanda'),
        calificacion: await buscar('calificacion'),
      };
      await hacerPro(ecoId, sumarDias(hoyLima(), -1), sumarDias(hoyLima(), 30));
      await hacerPro(camionId, sumarDias(hoyLima(), -1), sumarDias(hoyLima(), 30));
      try {
        for (const orden of ['precio', 'cercania', 'demanda', 'calificacion'] as const) {
          const conPlan = await buscar(orden);
          expect(ids(conPlan)).toEqual(ids(sinPlan[orden]));
          expect(conPlan.some((o) => o.destacado)).toBe(false);
        }
        const recomendado = await buscar('recomendado');
        expect(recomendado.every((o) => o.destacado === o.esPro)).toBe(true);
        expect(recomendado.find((o) => o.id === ecoId)?.destacado).toBe(true);
      } finally {
        await restaurar(ecoId);
        await restaurar(camionId);
      }
    });

    it('en "Recomendado" la ventaja del Pro es limitada: solo adelanta a quien está dentro del margen', async () => {
      await restaurar(ecoId);
      const sinPlan = await buscar('recomendado');
      expect(sinPlan.some((o) => o.destacado && o.id === ecoId)).toBe(false);
      await hacerPro(ecoId, sumarDias(hoyLima(), -1), sumarDias(hoyLima(), 30));
      try {
        const lista = await buscar('recomendado');
        const margenKm = 0.5;
        // Ningún Pro pasó delante de alguien más cercano que (su distancia - margen); la distancia se redondea a 0,1 km
        for (let i = 0; i < lista.length; i += 1) {
          for (let j = i + 1; j < lista.length; j += 1) {
            const antes = lista[i]!;
            const despues = lista[j]!;
            const ventaja = antes.esPro && !despues.esPro ? margenKm : 0;
            const ventajaContraria = !antes.esPro && despues.esPro ? margenKm : 0;
            expect(antes.distanciaKm - ventaja).toBeLessThanOrEqual(despues.distanciaKm - ventajaContraria + 0.15);
          }
        }
      } finally {
        await restaurar(ecoId);
      }
    });

    it('un negocio Gratis no recibe datos Pro y uno Pro sí, mientras esté vigente', async () => {
      const estadisticas = async (token: string, dias = 90) =>
        (await get(`/mi-negocio/estadisticas?periodo=${dias}`, token).expect(200)).body as Record<string, unknown>;
      await restaurar(ecoId);
      expect(await estadisticas(eco)).toMatchObject({ plan: 'GRATIS', requierePro: true });
      expect((await estadisticas(eco, 30)).horasConMasVisitas).toEqual({ requierePro: true });
      await hacerPro(ecoId, sumarDias(hoyLima(), -1), sumarDias(hoyLima(), 30));
      try {
        const pro = await estadisticas(eco);
        expect(pro).toMatchObject({ plan: 'PRO' });
        expect(pro.requierePro).toBeUndefined();
        expect(Array.isArray((await estadisticas(eco, 30)).horasConMasVisitas)).toBe(true);
      } finally {
        await restaurar(ecoId);
      }
      expect((await estadisticas(titicaca, 30)).plan).toBe('PRO');
      expect(titicacaId).toBeDefined();
    });
  });

  describe('vencimiento en hora de Lima y avisos', () => {
    it('el último día del plan sigue vigente y al día siguiente ya es Gratis, sin esperar a ninguna tarea', async () => {
      await hacerPro(camionId, sumarDias(hoyLima(), -30), hoyLima());
      expect(await plan(camion)).toMatchObject({ plan: 'PRO', venceEnDias: 0 });
      await hacerPro(camionId, sumarDias(hoyLima(), -31), sumarDias(hoyLima(), -1));
      const p = await plan(camion);
      expect(p).toMatchObject({ plan: 'GRATIS', desde: null, hasta: null });
      const stats = (await get('/mi-negocio/estadisticas?periodo=90', camion).expect(200)).body as {
        requierePro?: boolean;
      };
      expect(stats.requierePro).toBe(true);
    });

    it('la tarea de vencimiento deja al negocio en Gratis una sola vez, con su historial y su aviso, sin perder datos', async () => {
      await hacerPro(camionId, sumarDias(hoyLima(), -31), sumarDias(hoyLima(), -1));
      const antes = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: camionId } });
      const servicio = prueba.app.get(PlanService);
      expect(await servicio.vencerPlanes()).toBeGreaterThanOrEqual(1);
      expect(await servicio.vencerPlanes()).toBe(0);
      const despues = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: camionId } });
      expect(despues.plan).toBe('GRATIS');
      expect(despues.nombreComercial).toBe(antes.nombreComercial);
      expect(despues.planHasta).toEqual(antes.planHasta);
      const usuarioId = await usuarioDe(camionId);
      expect(await notificaciones(usuarioId, 'Tu plan Pro venció')).toBe(1);
      expect(
        await prueba.bd.planHistorial.count({ where: { compradorId: camionId, accion: 'VENCIDO' } }),
      ).toBeGreaterThanOrEqual(1);
      expect((await plan(camion)).historial[0]).toMatchObject({ accion: 'VENCIDO' });
      // Puede pedir Pro de nuevo, sin penalización
      expect((await plan(camion)).puedeSolicitar).toBe(true);
    });

    it('avisa una sola vez cuando faltan 7 días o menos (parámetro editable)', async () => {
      await hacerPro(camionId, sumarDias(hoyLima(), -20), sumarDias(hoyLima(), 20));
      const servicio = prueba.app.get(PlanService);
      await servicio.avisarPorVencer();
      expect(await notificaciones(await usuarioDe(camionId), 'vence en')).toBe(0);

      await hacerPro(camionId, sumarDias(hoyLima(), -20), sumarDias(hoyLima(), 7));
      await servicio.avisarPorVencer();
      await servicio.avisarPorVencer();
      const avisos = await prueba.bd.notificacion.findMany({
        where: { usuarioId: await usuarioDe(camionId), titulo: { contains: 'vence en' } },
      });
      expect(avisos).toHaveLength(1);
      expect(avisos[0]!.titulo).toBe('Tu plan Pro vence en 7 días');

      await prueba.bd.parametro.update({ where: { clave: 'plan_aviso_vence_dias' }, data: { valor: '3' } });
      try {
        await hacerPro(ecoId, sumarDias(hoyLima(), -20), sumarDias(hoyLima(), 5));
        await servicio.avisarPorVencer();
        expect(await notificaciones(await usuarioDe(ecoId), 'vence en')).toBe(0);
        await hacerPro(ecoId, sumarDias(hoyLima(), -20), sumarDias(hoyLima(), 3));
        await servicio.avisarPorVencer();
        expect(await notificaciones(await usuarioDe(ecoId), 'vence en')).toBe(1);
      } finally {
        await prueba.bd.parametro.update({ where: { clave: 'plan_aviso_vence_dias' }, data: { valor: '7' } });
        await restaurar(ecoId);
        await restaurar(camionId);
      }
    });

    it('un reciclador no recibe nada del plan', async () => {
      const r = await nuevoReciclador(prueba, '911000098');
      await get('/mi-negocio/plan', r).expect(403);
    });
  });
});
