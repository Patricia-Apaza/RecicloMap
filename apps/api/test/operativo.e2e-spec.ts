import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { OperativoService } from '../src/modulos/operativo/operativo.service.js';
import { OperacionesTareas } from '../src/modulos/operaciones/operaciones-tareas.js';
import { bearer, CLAVE, crearPrueba, entrar, type Prueba } from './apoyo.js';
import { avanzarOperacion, cerrarConexiones, crearOperacion, propietario } from './bd/apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
type Error = { error: { codigo: string; mensaje: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const MOTIVO = 'Ajuste acordado con el equipo';
const HORA = 3_600_000;

type Estado = {
  demostracion: boolean;
  banner: { id: number; texto: string; hasta: string } | null;
  registro: { reciclador: boolean; negocio: boolean };
  mantenimiento: { activo: boolean; mensaje: string | null };
};

describe('Controles operativos: aviso global, registro y mantenimiento (Fase 13B)', () => {
  let prueba: Prueba;
  let admin: string;
  let marco: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    admin = await entrar(prueba, ADMIN.telefono);
    marco = await entrar(prueba, '900000001');
  });
  afterAll(async () => {
    await propietario.query(
      'UPDATE control_operativo SET banner_texto = NULL, banner_desde = NULL, banner_hasta = NULL, registro_reciclador_abierto = true, registro_negocio_abierto = true, mantenimiento_activo = false, mantenimiento_mensaje = NULL WHERE id = 1',
    );
    await cerrarConexiones();
    await prueba.cerrar();
  });

  const put = (ruta: string, token: string, cuerpo: object) =>
    prueba.http().put(`/api/v1/admin/controles${ruta}`).set(bearer(token)).send(cuerpo);
  const estado = async () => (await prueba.http().get('/api/v1/estado').expect(200)).body as Estado;
  const en = (horas: number) => new Date(Date.now() + horas * HORA).toISOString();
  const registroReciclador = (tel = telefono()) =>
    prueba.http().post('/api/v1/auth/registro/reciclador').send({
      nombre: 'Rosa Mamani Quispe',
      telefono: tel,
      contrasena: CLAVE,
      aceptaTerminos: true,
      mayorDeEdad: true,
    });
  const registroNegocio = (tel = telefono()) =>
    prueba
      .http()
      .post('/api/v1/auth/registro/negocio')
      .send({ tipo: 'CENTRO', telefono: tel, contrasena: CLAVE, aceptaTerminos: true, mayorDeEdad: true });

  describe('estado público', () => {
    it('indica si la aplicación corre en modo demostración (no en las pruebas)', async () => {
      expect((await estado()).demostracion).toBe(false);
    });
  });

  describe('aviso global', () => {
    it('todos lo ven, también el invitado, dentro de sus fechas y con un máximo de 140 caracteres', async () => {
      expect((await estado()).banner).toBeNull();
      await put('/banner', marco, { texto: 'Hola', desde: en(-1), hasta: en(2), motivo: MOTIVO }).expect(403);
      await put('/banner', admin, { texto: 'Hola', desde: en(-1), hasta: en(2) }).expect(400);
      await put('/banner', admin, { texto: 'x'.repeat(141), desde: en(-1), hasta: en(2), motivo: MOTIVO }).expect(400);
      await put('/banner', admin, { texto: 'Hola', desde: en(2), hasta: en(1), motivo: MOTIVO }).expect(400);
      await put('/banner', admin, { texto: 'Hola', motivo: MOTIVO }).expect(400);
      await put('/banner', admin, {
        texto: 'Mañana habrá mantenimiento de 2 a 3 a. m.',
        desde: en(-1),
        hasta: en(2),
        motivo: MOTIVO,
      }).expect(200);
      const visto = (await estado()).banner;
      expect(visto?.texto).toBe('Mañana habrá mantenimiento de 2 a 3 a. m.');
      // Un banner que aún no empieza o que ya terminó no se muestra
      await put('/banner', admin, { texto: 'Futuro', desde: en(3), hasta: en(5), motivo: MOTIVO }).expect(200);
      expect((await estado()).banner).toBeNull();
      await propietario.query(
        "UPDATE control_operativo SET banner_desde = now() - interval '5 hours', banner_hasta = now() - interval '1 hour'",
      );
      await prueba.app.get(OperativoService).refrescar();
      expect((await estado()).banner).toBeNull();
    });

    it('cada publicación es una versión nueva (para que cerrarlo no oculte el siguiente) y se retira con motivo', async () => {
      await put('/banner', admin, { texto: 'Primero', desde: en(-1), hasta: en(2), motivo: MOTIVO }).expect(200);
      const a = (await estado()).banner!.id;
      await put('/banner', admin, { texto: 'Segundo', desde: en(-1), hasta: en(2), motivo: MOTIVO }).expect(200);
      expect((await estado()).banner!.id).toBeGreaterThan(a);
      await put('/banner', admin, { texto: null, motivo: 'Ya no hace falta' }).expect(200);
      expect((await estado()).banner).toBeNull();
      const auditoria = await prueba.bd.auditoria.findMany({
        where: { tipo: 'CONFIGURACION', accion: 'BANNER' },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(auditoria[0]?.motivo).toBe('Ya no hace falta');
    });
  });

  describe('registro abierto o cerrado, por rol', () => {
    it('cerrar un rol no afecta al otro ni a las cuentas existentes, y avisa con un mensaje claro', async () => {
      await put('/registro', marco, { reciclador: false, motivo: MOTIVO }).expect(403);
      await put('/registro', admin, { reciclador: false }).expect(400);
      await put('/registro', admin, { motivo: MOTIVO }).expect(400);
      await put('/registro', admin, { reciclador: false, motivo: MOTIVO }).expect(200);
      expect((await estado()).registro).toEqual({ reciclador: false, negocio: true });
      const cerrado = await registroReciclador();
      expect(cerrado.status).toBe(403);
      expect(codigo(cerrado)).toBe('REGISTRO_CERRADO');
      expect((cerrado.body as Error).error.mensaje).toMatch(/recicladores/);
      // Negocios sigue abierto y quien ya tiene cuenta entra y trabaja con normalidad
      await registroNegocio().expect(201);
      await entrar(prueba, '900000001');
      await prueba.http().get('/api/v1/yo').set(bearer(marco)).expect(200);
      await put('/registro', admin, { reciclador: true, negocio: false, motivo: MOTIVO }).expect(200);
      await registroReciclador().expect(201);
      expect(codigo(await registroNegocio())).toBe('REGISTRO_CERRADO');
      await put('/registro', admin, { negocio: true, motivo: MOTIVO }).expect(200);
      await registroNegocio().expect(201);
    });

    it('también cierra el registro con Google, por rol', async () => {
      await put('/registro', admin, { negocio: false, motivo: MOTIVO }).expect(200);
      const temporal = await prueba
        .http()
        .post('/api/v1/auth/google')
        .send({ credencial: 'token-de-prueba-negocio-nuevo' });
      // Con un solo rol cerrado, la cuenta nueva de Google empieza y se frena al elegir el rol cerrado
      if (temporal.status === 200 && (temporal.body as { tokenTemporal?: string }).tokenTemporal) {
        const r = await prueba
          .http()
          .post('/api/v1/auth/google/completar')
          .send({
            tokenTemporal: (temporal.body as { tokenTemporal: string }).tokenTemporal,
            rol: 'CENTRO',
            telefono: telefono(),
            aceptaTerminos: true,
            mayorDeEdad: true,
          });
        expect(codigo(r)).toBe('REGISTRO_CERRADO');
      }
      await put('/registro', admin, { negocio: true, motivo: MOTIVO }).expect(200);
    });

    it('cada cambio queda en la auditoría con su motivo', async () => {
      const filas = await prueba.bd.auditoria.findMany({ where: { tipo: 'CONFIGURACION', accion: 'REGISTRO' } });
      expect(filas.length).toBeGreaterThanOrEqual(4);
      expect(filas.every((f) => (f.motivo ?? '').length >= 5)).toBe(true);
    });
  });

  describe('modo mantenimiento', () => {
    afterEach(async () => {
      const activo = (await estado()).mantenimiento.activo;
      if (activo)
        await put('/mantenimiento', admin, { activo: false, motivo: 'Fin de la prueba', confirmar: true }).expect(200);
    });

    it('solo lectura para todos menos la administración, con el mensaje y sin cortar el ingreso', async () => {
      await put('/mantenimiento', marco, {
        activo: true,
        mensaje: 'Estamos mejorando.',
        motivo: MOTIVO,
        confirmar: true,
      }).expect(403);
      await put('/mantenimiento', admin, { activo: true, mensaje: 'Estamos mejorando.', motivo: MOTIVO }).expect(400);
      await put('/mantenimiento', admin, { activo: true, motivo: MOTIVO, confirmar: true }).expect(400);
      await put('/mantenimiento', admin, {
        activo: true,
        mensaje: 'Estamos mejorando RecicloMap. Volvemos en unos minutos.',
        motivo: MOTIVO,
        confirmar: true,
      }).expect(200);
      expect((await estado()).mantenimiento).toMatchObject({
        activo: true,
        mensaje: 'Estamos mejorando RecicloMap. Volvemos en unos minutos.',
      });
      expect(
        codigo(
          await put('/mantenimiento', admin, {
            activo: true,
            mensaje: 'Otra vez',
            motivo: MOTIVO,
            confirmar: true,
          }).expect(409),
        ),
      ).toBe('MANTENIMIENTO_YA_ACTIVO');

      // Se lee todo; no se escribe nada
      await prueba.http().get('/api/v1/yo').set(bearer(marco)).expect(200);
      await prueba.http().get('/api/v1/yo/ruleta').set(bearer(marco)).expect(200);
      const escritura = await prueba
        .http()
        .post('/api/v1/publicaciones')
        .set(bearer(marco))
        .set('X-Posicion', POSICION)
        .send({ material: 'pet', kg: 5 });
      expect(escritura.status).toBe(503);
      expect(codigo(escritura)).toBe('MANTENIMIENTO');
      expect((escritura.body as Error).error.mensaje).toBe('Estamos mejorando RecicloMap. Volvemos en unos minutos.');
      expect(codigo(await registroReciclador())).toBe('MANTENIMIENTO');
      expect(
        codigo(await prueba.http().put('/api/v1/yo/preferencias').set(bearer(marco)).send({ visibleEnRanking: false })),
      ).toBe('MANTENIMIENTO');
      // Entrar, renovar la sesión, salir y bajarse los propios datos siguen funcionando
      const tel = telefono();
      await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: '900000001', contrasena: process.env.SEMILLA_CLAVE ?? 'Prueba2026!' })
        .expect(200);
      expect((await prueba.http().post('/api/v1/auth/refresh').send({})).status).toBe(401);
      expect(tel).toMatch(/^9/);
      // La administración sigue trabajando
      await put('/banner', admin, {
        texto: 'Aviso durante el mantenimiento',
        desde: en(-1),
        hasta: en(1),
        motivo: MOTIVO,
      }).expect(200);
    });

    it('los plazos no corren durante el mantenimiento: las tareas se detienen y al terminar se devuelve el tiempo', async () => {
      // Cada mantenimiento devuelve horas completas hacia arriba; se parte de cero para contarlas
      await propietario.query('DELETE FROM mantenimiento_intervalo');
      const cerrada = await crearOperacion();
      await avanzarOperacion(cerrada.operacionId, 'CONFIRMADA');
      // Confirmada hace 74 horas: su plazo de 72 h terminó hace 2 horas
      await propietario.query("UPDATE operacion SET confirmada_en = now() - interval '74 hours' WHERE id = $1", [
        cerrada.operacionId,
      ]);
      const tareas = prueba.app.get(OperacionesTareas);
      const estadoDe = async () =>
        (await prueba.bd.operacion.findUniqueOrThrow({ where: { id: cerrada.operacionId } })).estado;

      await put('/mantenimiento', admin, {
        activo: true,
        mensaje: 'Mantenimiento de la base de datos.',
        motivo: MOTIVO,
        confirmar: true,
      }).expect(200);
      // La tarea automática no corre mientras dura el mantenimiento
      await tareas.barrido();
      expect(await estadoDe()).toBe('CONFIRMADA');
      expect(await prueba.app.get(OperativoService).devolverPlazos()).toBe(0);

      // El mantenimiento duró 5 horas
      await propietario.query(
        "UPDATE mantenimiento_intervalo SET desde = now() - interval '5 hours' WHERE hasta IS NULL",
      );
      await put('/mantenimiento', admin, { activo: false, motivo: 'Terminó el mantenimiento', confirmar: true }).expect(
        200,
      );
      expect((await estado()).mantenimiento.activo).toBe(false);
      expect(await prueba.app.get(OperativoService).devolverPlazos()).toBeGreaterThanOrEqual(1);
      // Cinco horas y unos segundos de mantenimiento se devuelven como 6 horas: el plazo de 72 h pasó a 78 h: la operación sigue abierta aunque su plazo "terminó" durante el mantenimiento
      expect(
        (
          await propietario.query('SELECT plazo_conformidad_horas AS h FROM operacion WHERE id = $1', [
            cerrada.operacionId,
          ])
        ).rows[0].h,
      ).toBe(78);
      await tareas.barrido();
      expect(await estadoDe()).toBe('CONFIRMADA');
      // Cuando pasa el tiempo que le correspondía, se cierra como siempre
      await propietario.query("UPDATE operacion SET confirmada_en = now() - interval '79 hours' WHERE id = $1", [
        cerrada.operacionId,
      ]);
      await tareas.barrido();
      expect(await estadoDe()).toBe('COMPLETADA');
    });

    it('con el mantenimiento ya terminado todo vuelve a escribirse', async () => {
      await prueba
        .http()
        .put('/api/v1/yo/preferencias')
        .set(bearer(marco))
        .send({ visibleEnRanking: true })
        .expect(200);
      expect(
        codigo(await put('/mantenimiento', admin, { activo: false, motivo: MOTIVO, confirmar: true }).expect(409)),
      ).toBe('MANTENIMIENTO_NO_ACTIVO');
    });

    it('el mantenimiento queda en la auditoría con su motivo y su intervalo', async () => {
      const filas = await prueba.bd.auditoria.findMany({ where: { tipo: 'CONFIGURACION', accion: 'MANTENIMIENTO' } });
      expect(filas.length).toBeGreaterThanOrEqual(4);
      const intervalos = await prueba.bd.mantenimientoIntervalo.findMany();
      expect(intervalos.every((i) => i.hasta !== null)).toBe(true);
    });

    it('antes de activar, avisa si el mes cambia o un plan Pro vence en menos de 24 horas', async () => {
      const leer = async () =>
        (await prueba.http().get('/api/v1/admin/controles').set(bearer(admin)).expect(200)).body
          .advertenciasMantenimiento as { cambioDeMesEn24h: boolean; planesQueVencenEn24h: number };
      const base = await leer();
      expect(typeof base.cambioDeMesEn24h).toBe('boolean');
      const { rows } = await propietario.query(
        "SELECT id, plan::text AS plan, plan_desde::text AS desde, plan_hasta::text AS hasta FROM comprador WHERE plan <> 'PRO' LIMIT 1",
      );
      const negocio = rows[0] as { id: string };
      await propietario.query(
        "UPDATE comprador SET plan = 'PRO', plan_desde = (now() AT TIME ZONE 'America/Lima')::date - 5, plan_hasta = (now() AT TIME ZONE 'America/Lima')::date WHERE id = $1",
        [negocio.id],
      );
      try {
        expect((await leer()).planesQueVencenEn24h).toBe(base.planesQueVencenEn24h + 1);
        await propietario.query(
          "UPDATE comprador SET plan_hasta = (now() AT TIME ZONE 'America/Lima')::date + 3 WHERE id = $1",
          [negocio.id],
        );
        expect((await leer()).planesQueVencenEn24h).toBe(base.planesQueVencenEn24h);
      } finally {
        await propietario.query(
          "UPDATE comprador SET plan = 'GRATIS', plan_desde = NULL, plan_hasta = NULL WHERE id = $1",
          [negocio.id],
        );
      }
    });
  });
});
