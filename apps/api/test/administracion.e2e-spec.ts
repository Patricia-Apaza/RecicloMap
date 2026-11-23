import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba, zonaDeJuliaca } from './apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
type Error = { error: { codigo: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

type Ficha = {
  id: string;
  estado: string;
  motivoSuspension: string | null;
  telefono: string;
  correo: string | null;
  actividad: { operacionesEnCurso: number; publicacionesAbiertas: number; ofertasPendientes: number };
  operacionesEnCurso: Array<{ id: string; estado: string; otraParte: string }>;
  historialDeSituacion: Array<{ accion: string; motivo: string }>;
};
type Lista = {
  resumen: { total: number; activos: number; suspendidos: number; pendientes: number };
  total: number;
  datos: Array<{ id: string; nombre: string; rol: string; estado: string }>;
};

describe('Administración: usuarios, avisos, cambios de dirección, auditoría y panel (Fase 12A)', () => {
  let prueba: Prueba;
  let admin: string;
  let titicaca: string;
  let eco: string;
  let marco: string;
  let titicacaId: string;
  let ecoId: string;
  let adminId: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    admin = await entrar(prueba, ADMIN.telefono);
    titicaca = await entrar(prueba, '900000011');
    eco = await entrar(prueba, '900000012');
    marco = await entrar(prueba, '900000001');
    titicacaId = (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } })).id;
    ecoId = (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'EcoAcopio Juliaca' } })).id;
    adminId = (await prueba.bd.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } })).id;
  });
  afterAll(async () => {
    await prueba.cerrar();
  });

  const get = (ruta: string, token: string) => prueba.http().get(`/api/v1${ruta}`).set(bearer(token));
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const ficha = async (id: string) => (await get(`/admin/usuarios/${id}`, admin).expect(200)).body as Ficha;
  const notificaciones = (usuarioId: string, titulo: string) =>
    prueba.bd.notificacion.count({ where: { usuarioId, titulo: { contains: titulo } } });
  const suspender = (
    id: string,
    cuerpo: object = { motivo: 'Información falsa', nota: 'Dos negocios lo confirmaron', confirmar: true },
  ) => post(`/admin/usuarios/${id}/suspender`, admin, cuerpo);
  const reactivar = (id: string, cuerpo: object = { motivo: 'Aclaró lo ocurrido', confirmar: true }) =>
    post(`/admin/usuarios/${id}/reactivar`, admin, cuerpo);

  async function recicladorNuevo() {
    const tel = telefono();
    const token = await nuevoReciclador(prueba, tel, 'Rosa Mamani Quispe');
    const u = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
    return { token, id: u.id, telefono: tel };
  }
  const publicar = async (token: string, kg = 20) =>
    (
      (await post('/publicaciones', token, { material: 'pet', kg }).set('X-Posicion', POSICION).expect(201)).body as {
        publicacion: { id: string };
      }
    ).publicacion.id;
  const ofertar = async (publicacionId: string, token = titicaca) =>
    (
      (await post(`/negocio/publicaciones/${publicacionId}/ofertas`, token, { precioKg: 2.5 }).expect(201)).body as {
        id: string;
      }
    ).id;
  const visiblesParaTiticaca = async () =>
    ((await get('/negocio/publicaciones', titicaca).expect(200)).body as { datos: Array<{ id: string }> }).datos.map(
      (p) => p.id,
    );

  describe('usuarios (59)', () => {
    it('solo la administración los ve; filtra por rol, situación, ciudad y búsqueda; el resumen coincide con la base', async () => {
      await get('/admin/usuarios', marco).expect(403);
      await get('/admin/usuarios', titicaca).expect(403);
      await prueba.http().get('/api/v1/admin/usuarios').expect(401);
      const todos = (await get('/admin/usuarios', admin).expect(200)).body as Lista;
      expect(todos.resumen.total).toBe(await prueba.bd.usuario.count({ where: { estado: { not: 'ELIMINADO' } } }));
      expect(todos.resumen.activos).toBe(await prueba.bd.usuario.count({ where: { estado: 'ACTIVO' } }));
      const centros = (await get('/admin/usuarios?rol=CENTRO', admin).expect(200)).body as Lista;
      expect(centros.datos.every((u) => u.rol === 'CENTRO')).toBe(true);
      expect(centros.total).toBe(
        await prueba.bd.usuario.count({ where: { rol: 'CENTRO', estado: { not: 'ELIMINADO' } } }),
      );
      const buscado = (await get('/admin/usuarios?q=titicaca', admin).expect(200)).body as Lista;
      expect(buscado.datos.some((u) => u.nombre === 'Acopio Titicaca')).toBe(true);
      const porTelefono = (await get('/admin/usuarios?q=900000001', admin).expect(200)).body as Lista;
      expect(porTelefono.datos.length).toBeGreaterThanOrEqual(1);
      const ciudad = (await prueba.bd.ciudad.findFirstOrThrow({ where: { estado: 'ACTIVA' } })).id;
      expect(((await get(`/admin/usuarios?ciudad=${ciudad}`, admin).expect(200)).body as Lista).total).toBeGreaterThan(
        0,
      );
      await get('/admin/usuarios?rol=OTRO', admin).expect(400);
      await get('/admin/usuarios?situacion=sin-sentido', admin).expect(400);
    });

    it('la ficha trae nombre, correo, teléfono, ciudad, situación y actividad; nunca ubicación ni contraseña', async () => {
      const r = await recicladorNuevo();
      const f = await ficha(r.id);
      expect(f).toMatchObject({ estado: 'ACTIVO', telefono: r.telefono });
      const texto = JSON.stringify(f);
      expect(texto).not.toMatch(/ubicacion|contrasena|hash|token|latitud|longitud|"lat"|"lng"|sesion|codigo/i);
      const negocio = JSON.stringify(
        await ficha(
          titicacaId.length
            ? (await prueba.bd.comprador.findUniqueOrThrow({ where: { id: titicacaId } })).usuarioId
            : '',
        ),
      );
      expect(negocio).not.toMatch(/ubicacion|contrasena|hash|token|"lat"|"lng"/i);
      await get('/admin/usuarios/00000000-0000-4000-8000-000000000000', admin).expect(404);
    });

    it('el administrador no tiene forma de editar ni eliminar una cuenta', async () => {
      const r = await recicladorNuevo();
      for (const metodo of ['patch', 'put', 'delete'] as const) {
        const respuesta = await prueba
          .http()
          [metodo](`/api/v1/admin/usuarios/${r.id}`)
          .set(bearer(admin))
          .send({ nombre: 'Otro' });
        expect([404, 405]).toContain(respuesta.status);
      }
      expect((await prueba.bd.usuario.findUniqueOrThrow({ where: { id: r.id } })).nombre).toBe('Rosa Mamani Quispe');
    });
  });

  describe('suspender y reactivar', () => {
    it('exige motivo de la lista, nota y confirmación; no suspende administradores ni a quien ya está suspendido', async () => {
      const r = await recicladorNuevo();
      await suspender(r.id, { motivo: 'Información falsa', nota: 'Lo confirmaron dos negocios' }).expect(400);
      await suspender(r.id, {
        motivo: 'Información falsa',
        nota: 'Lo confirmaron dos negocios',
        confirmar: false,
      }).expect(400);
      await suspender(r.id, { motivo: 'Me cae mal', nota: 'Lo confirmaron dos negocios', confirmar: true }).expect(400);
      await suspender(r.id, { motivo: 'Información falsa', nota: 'no', confirmar: true }).expect(400);
      expect((await ficha(r.id)).estado).toBe('ACTIVO');
      expect(codigo(await suspender(adminId).expect(409))).toBe('CUENTA_ADMIN');
      await suspender('00000000-0000-4000-8000-000000000000').expect(404);
      await post(`/admin/usuarios/${r.id}/suspender`, marco, {
        motivo: 'Información falsa',
        nota: 'Lo confirmaron dos negocios',
        confirmar: true,
      }).expect(403);
    });

    it('suspende con motivo, avisa a la persona, queda en la auditoría y se reactiva con motivo', async () => {
      const r = await recicladorNuevo();
      const hecha = (await suspender(r.id).expect(200)).body as Ficha;
      expect(hecha).toMatchObject({ estado: 'SUSPENDIDO', motivoSuspension: 'Información falsa' });
      expect(codigo(await suspender(r.id).expect(409))).toBe('CUENTA_NO_ACTIVA');
      expect(await notificaciones(r.id, 'Tu cuenta fue suspendida')).toBe(1);
      const aviso = await prueba.bd.notificacion.findFirstOrThrow({
        where: { usuarioId: r.id, titulo: 'Tu cuenta fue suspendida' },
      });
      expect(aviso.mensaje).toContain('Información falsa');
      const auditoria = await prueba.bd.auditoria.findFirstOrThrow({ where: { entidadId: r.id, accion: 'SUSPENDER' } });
      expect(auditoria).toMatchObject({ tipo: 'USUARIOS', adminId });
      expect(auditoria.motivo).toContain('Información falsa');
      expect(auditoria.motivo).toContain('Lo confirmaron'.slice(0, 0) + 'Dos negocios');

      await reactivar(r.id, { motivo: 'no', confirmar: true }).expect(400);
      await reactivar(r.id, { motivo: 'Aclaró lo ocurrido' }).expect(400);
      expect(((await reactivar(r.id).expect(200)).body as Ficha).estado).toBe('ACTIVO');
      expect(codigo(await reactivar(r.id).expect(409))).toBe('CUENTA_NO_SUSPENDIDA');
      expect(await notificaciones(r.id, 'Tu cuenta fue reactivada')).toBe(1);
      expect((await ficha(r.id)).historialDeSituacion.map((h) => h.accion)).toEqual(['REACTIVAR', 'SUSPENDER']);
    });

    it('una cuenta suspendida no publica ni oferta, pero lee su historial', async () => {
      const r = await recicladorNuevo();
      await suspender(r.id).expect(200);
      expect(
        codigo(
          await post('/publicaciones', r.token, { material: 'pet', kg: 10 }).set('X-Posicion', POSICION).expect(403),
        ),
      ).toBe('CUENTA_SUSPENDIDA');
      await get('/yo/puntos', r.token).expect(200);
      await get('/yo/resenas', r.token).expect(200);
      await reactivar(r.id).expect(200);
    });

    it('un reciclador suspendido: sus publicaciones se ocultan y sus ofertas pendientes se retiran con aviso; vuelven al reactivar', async () => {
      const r = await recicladorNuevo();
      const publicacionId = await publicar(r.token);
      const ofertaId = await ofertar(publicacionId);
      expect(await visiblesParaTiticaca()).toContain(publicacionId);

      const hecha = (await suspender(r.id).expect(200)).body as Ficha & { efectos: { ofertasRetiradas: number } };
      expect(hecha.efectos.ofertasRetiradas).toBe(1);
      expect((await prueba.bd.oferta.findUniqueOrThrow({ where: { id: ofertaId } })).estado).toBe('RETIRADA');
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id: publicacionId } })).estado).toBe(
        'DISPONIBLE',
      );
      expect(await visiblesParaTiticaca()).not.toContain(publicacionId);
      const titicacaUsuario = (await prueba.bd.comprador.findUniqueOrThrow({ where: { id: titicacaId } })).usuarioId;
      expect(await notificaciones(titicacaUsuario, 'Una publicación ya no está disponible')).toBeGreaterThanOrEqual(1);

      await reactivar(r.id).expect(200);
      expect(await visiblesParaTiticaca()).toContain(publicacionId);
    });

    it('un negocio suspendido: no aparece en el mapa, no oferta y sus ofertas pendientes se retiran con aviso al reciclador', async () => {
      const r = await recicladorNuevo();
      const publicacionId = await publicar(r.token);
      const ofertaId = await ofertar(publicacionId, eco);
      const usuarioEco = (await prueba.bd.comprador.findUniqueOrThrow({ where: { id: ecoId } })).usuarioId;
      const enElMapa = async () =>
        (
          (await get('/compradores?material=pet&radio=20', marco).set('X-Posicion', POSICION).expect(200)).body as {
            opciones: Array<{ id: string }>;
          }
        ).opciones.some((o) => o.id === ecoId);
      expect(await enElMapa()).toBe(true);
      await suspender(usuarioEco).expect(200);
      try {
        expect(await enElMapa()).toBe(false);
        await get(`/compradores/${ecoId}`, marco).expect(404);
        expect((await prueba.bd.oferta.findUniqueOrThrow({ where: { id: ofertaId } })).estado).toBe('RETIRADA');
        expect(await notificaciones(r.id, 'Una oferta fue retirada')).toBe(1);
        expect(
          codigo(await post(`/negocio/publicaciones/${publicacionId}/ofertas`, eco, { precioKg: 2.6 }).expect(403)),
        ).toBe('CUENTA_SUSPENDIDA');
        await get('/mi-negocio/plan', eco).expect(200);
      } finally {
        await reactivar(usuarioEco).expect(200);
      }
      expect(await enElMapa()).toBe(true);
    });

    it('las operaciones en curso no se cortan: la otra parte recibe un aviso y la administración las ve en la ficha', async () => {
      const r = await recicladorNuevo();
      const publicacionId = await publicar(r.token);
      const ofertaId = await ofertar(publicacionId);
      const operacionId = (
        (await post(`/ofertas/${ofertaId}/aceptar`, r.token).expect(200)).body as { operacionId: string }
      ).operacionId;
      const titicacaUsuario = (await prueba.bd.comprador.findUniqueOrThrow({ where: { id: titicacaId } })).usuarioId;
      const antes = await notificaciones(titicacaUsuario, 'La otra cuenta de tu operación fue suspendida');
      await suspender(r.id).expect(200);
      expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } })).estado).toBe('ACEPTADA');
      expect(await notificaciones(titicacaUsuario, 'La otra cuenta de tu operación fue suspendida')).toBe(antes + 1);
      const f = await ficha(r.id);
      expect(f.actividad.operacionesEnCurso).toBe(1);
      expect(f.operacionesEnCurso[0]).toMatchObject({
        id: operacionId,
        estado: 'ACEPTADA',
        otraParte: 'Acopio Titicaca',
      });
      await reactivar(r.id).expect(200);
    });
  });

  describe('moderación de avisos', () => {
    // Sin cifras en el título: el servidor rechaza lo que parezca un teléfono o un precio
    const publicarAviso = async (titulo: string) =>
      (
        (
          await post('/mi-negocio/avisos', eco, {
            tipo: 'ANUNCIO',
            titulo,
            mensaje: 'Atendemos toda la mañana.',
            vigenciaDias: 5,
          }).expect(201)
        ).body as { id: string }
      ).id;
    const visibles = async () => JSON.stringify((await get(`/compradores/${ecoId}/avisos`, marco).expect(200)).body);

    it('oculta con motivo y confirmación, el negocio lee el motivo y puede crear otro; restituye con motivo', async () => {
      const titulo = 'Aviso para moderar';
      const id = await publicarAviso(titulo);
      expect(await visibles()).toContain(titulo);
      const lista = (await get('/admin/avisos?estado=activos', admin).expect(200)).body as {
        datos: Array<{ id: string; negocio: { nombre: string } }>;
      };
      expect(lista.datos.find((a) => a.id === id)?.negocio.nombre).toBe('EcoAcopio Juliaca');
      await get('/admin/avisos', eco).expect(403);

      await post(`/admin/avisos/${id}/ocultar`, admin, { motivo: 'Incluye un precio', confirmar: false }).expect(400);
      await post(`/admin/avisos/${id}/ocultar`, admin, { motivo: 'no', confirmar: true }).expect(400);
      await post(`/admin/avisos/${id}/ocultar`, admin, {
        motivo: 'Dice cosas que no corresponden',
        confirmar: true,
      }).expect(200);
      expect(
        codigo(
          await post(`/admin/avisos/${id}/ocultar`, admin, {
            motivo: 'Dice cosas que no corresponden',
            confirmar: true,
          }).expect(409),
        ),
      ).toBe('AVISO_YA_OCULTO');
      expect(await visibles()).not.toContain(titulo);

      const mios = (await get('/mi-negocio/avisos', eco).expect(200)).body as {
        datos: Array<{ id: string; oculto: boolean; motivoOculto: string | null; vigente: boolean }>;
      };
      expect(mios.datos.find((a) => a.id === id)).toMatchObject({
        oculto: true,
        motivoOculto: 'Dice cosas que no corresponden',
        vigente: false,
      });
      const usuarioEco = (await prueba.bd.comprador.findUniqueOrThrow({ where: { id: ecoId } })).usuarioId;
      expect(await notificaciones(usuarioEco, `Ocultamos tu aviso «${titulo}»`)).toBe(1);
      expect((await prueba.bd.auditoria.findFirstOrThrow({ where: { entidadId: id, accion: 'OCULTAR' } })).tipo).toBe(
        'AVISOS',
      );
      const otro = await publicarAviso('Aviso nuevo del negocio');
      expect(otro).toBeDefined();

      await post(`/admin/avisos/${id}/restituir`, admin, {
        motivo: 'El negocio corrigió el contenido',
        confirmar: true,
      }).expect(200);
      expect(await visibles()).toContain(titulo);
      expect(
        codigo(
          await post(`/admin/avisos/${id}/restituir`, admin, {
            motivo: 'El negocio corrigió el contenido',
            confirmar: true,
          }).expect(409),
        ),
      ).toBe('AVISO_NO_OCULTO');
      expect(await prueba.bd.auditoria.count({ where: { entidadId: id, tipo: 'AVISOS' } })).toBe(2);
      await prueba.bd.aviso.updateMany({ where: { compradorId: ecoId }, data: { retiradoEn: new Date() } });
    });

    it('la administración no puede editar un aviso y un aviso inexistente es 404', async () => {
      await post('/admin/avisos/00000000-0000-4000-8000-000000000000/ocultar', admin, {
        motivo: 'No existe el aviso',
        confirmar: true,
      }).expect(404);
      const id = await publicarAviso('Aviso intacto');
      const respuesta = await prueba
        .http()
        .patch(`/api/v1/admin/avisos/${id}`)
        .set(bearer(admin))
        .send({ titulo: 'Otro' });
      expect([404, 405]).toContain(respuesta.status);
      await prueba.bd.aviso.updateMany({ where: { compradorId: ecoId }, data: { retiradoEn: new Date() } });
    });
  });

  describe('cambios de dirección (58)', () => {
    it('la cola muestra la dirección vigente frente a la propuesta y el negocio sigue visible con la anterior', async () => {
      const zonaId = await zonaDeJuliaca(prueba);
      const antes = (await prueba.bd.comprador.findUniqueOrThrow({ where: { id: ecoId } })).direccion;
      const nueva = { direccion: 'Jr. Lambayeque 900, Juliaca', zonaId, ubicacion: { lat: -15.495, lng: -70.13 } };
      await post('/mi-negocio/cambio-direccion', eco, nueva).expect(201);
      const solicitud = await prueba.bd.verificacion.findFirstOrThrow({
        where: { compradorId: ecoId, tipo: 'CAMBIO_DIRECCION', estado: 'EN_REVISION' },
      });
      const detalle = (await get(`/admin/verificaciones/${solicitud.id}`, admin).expect(200)).body as {
        tipo: string;
        cambioDireccion: {
          vigente: { direccion: string | null };
          propuesta: { direccion: string; pin: { lat: number; lng: number } | null };
        };
      };
      expect(detalle.tipo).toBe('CAMBIO_DIRECCION');
      expect(detalle.cambioDireccion.vigente.direccion).toBe(antes);
      expect(detalle.cambioDireccion.propuesta).toMatchObject({
        direccion: 'Jr. Lambayeque 900, Juliaca',
        pin: { lat: -15.495, lng: -70.13 },
      });
      const cola = (await get('/admin/verificaciones?estado=pendientes', admin).expect(200)).body as {
        datos: Array<{ id: string; tipo: string }>;
      };
      expect(cola.datos.find((v) => v.id === solicitud.id)?.tipo).toBe('CAMBIO_DIRECCION');
      const ficha = (await get(`/compradores/${ecoId}`, marco).expect(200)).body as { direccion: string };
      expect(ficha.direccion).toBe(antes);
      await post(`/admin/verificaciones/${solicitud.id}/rechazar`, admin, {
        motivo: 'Dirección no verificable',
        mensaje: 'No coincide con el pin del mapa.',
      }).expect(200);
      expect(((await get(`/compradores/${ecoId}`, marco).expect(200)).body as { direccion: string }).direccion).toBe(
        antes,
      );
    });
  });

  describe('auditoría (64)', () => {
    it('es de solo lectura, con filtros, y nunca devuelve ubicación, contraseñas ni contactos', async () => {
      await prueba.bd.auditoria.create({
        data: {
          adminId,
          tipo: 'VERIFICACION',
          accion: 'PRUEBA_PRIVACIDAD',
          entidad: 'comprador',
          entidadId: 'x',
          motivo: 'Prueba de privacidad',
          despues: {
            estado: 'APROBADO',
            ubicacion: { lat: -15.5, lng: -70.1 },
            pin: { lat: 1, lng: 2 },
            contrasena: 'secreta',
            telefono: '900000000',
            anidado: { hash: 'abc', visible: 'sí' },
          },
        },
      });
      const r = (await get('/admin/auditoria?accion=PRUEBA_PRIVACIDAD', admin).expect(200)).body as {
        datos: Array<{ accion: string; despues: Record<string, unknown> }>;
        resumen: { total: number };
      };
      expect(r.datos).toHaveLength(1);
      const texto = JSON.stringify(r.datos[0]);
      expect(texto).not.toMatch(/ubicacion|pin|secreta|contrasena|telefono|900000000|hash|abc|"lat"|"lng"/i);
      expect(r.datos[0]!.despues).toMatchObject({ estado: 'APROBADO', anidado: { visible: 'sí' } });
      expect(r.resumen.total).toBeGreaterThan(0);

      const porTipo = (await get('/admin/auditoria?tipo=USUARIOS', admin).expect(200)).body as {
        datos: Array<{ tipo: string }>;
        total: number;
      };
      expect(porTipo.total).toBeGreaterThan(0);
      expect(porTipo.datos.every((f) => f.tipo === 'USUARIOS')).toBe(true);
      const porAdmin = (await get(`/admin/auditoria?admin=${adminId}`, admin).expect(200)).body as { total: number };
      expect(porAdmin.total).toBeGreaterThan(0);
      const hoy = hoyLima();
      const deHoy = (await get(`/admin/auditoria?desde=${hoy}&hasta=${hoy}`, admin).expect(200)).body as {
        total: number;
      };
      expect(deHoy.total).toBeGreaterThan(0);
      const futuro = (await get('/admin/auditoria?desde=2099-01-01', admin).expect(200)).body as { total: number };
      expect(futuro.total).toBe(0);
      await get('/admin/auditoria?tipo=NADA', admin).expect(400);
      await get('/admin/auditoria', marco).expect(403);
      await get('/admin/auditoria', titicaca).expect(403);
    });

    it('no hay forma de escribir, editar ni borrar entradas por la API', async () => {
      for (const metodo of ['post', 'put', 'patch', 'delete'] as const) {
        const respuesta = await prueba.http()[metodo]('/api/v1/admin/auditoria').set(bearer(admin)).send({});
        expect([404, 405]).toContain(respuesta.status);
      }
    });
  });

  describe('panel de inicio (57)', () => {
    type Panel = {
      pendientes: {
        total: number;
        verificaciones: number;
        cambiosDireccion: number;
        reportes: number;
        incidencias: number;
        solicitudesPlan: number;
        masAntiguos: Array<{ desde: string; enlace: string }>;
      };
      metricas: {
        periodo: number;
        sinDatos: boolean;
        usuarios: {
          total: number;
          porRol: Record<string, number>;
          nuevos: number;
          suspendidos: number;
          porSemana: Array<{ valor: number }>;
        };
        negocios: { centrosVerificados: number; movilesVerificados: number };
        operaciones: { completadas: number; canceladas: number; enCurso: number; tasaCierre: number | null };
        kilos: { total: number; porMaterial: Array<{ material: string; kg: number }> };
        incidencias: { abiertas: number };
        embudo: { publicaciones: number; conOfertas: number; aceptadas: number; completadas: number };
      };
    };

    it('los pendientes coinciden con la base y lo más antiguo va primero', async () => {
      const p = ((await get('/admin/panel', admin).expect(200)).body as Panel).pendientes;
      expect(p.verificaciones).toBe(
        await prueba.bd.verificacion.count({ where: { estado: 'EN_REVISION', tipo: 'REGISTRO' } }),
      );
      expect(p.cambiosDireccion).toBe(
        await prueba.bd.verificacion.count({ where: { estado: 'EN_REVISION', tipo: 'CAMBIO_DIRECCION' } }),
      );
      expect(p.solicitudesPlan).toBe(await prueba.bd.solicitudPlan.count({ where: { estado: 'PENDIENTE' } }));
      expect(p.incidencias).toBe(
        await prueba.bd.reporte.count({
          where: { tipo: 'OPERACION', estado: { in: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] } },
        }),
      );
      expect(p.reportes).toBe(
        await prueba.bd.reporte.count({
          where: {
            tipo: { in: ['NEGOCIO', 'RESENA'] },
            estado: { in: ['PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA'] },
          },
        }),
      );
      expect(p.total).toBe(p.verificaciones + p.cambiosDireccion + p.reportes + p.incidencias + p.solicitudesPlan);
      const fechas = p.masAntiguos.map((f) => new Date(f.desde).getTime());
      expect([...fechas].sort((a, b) => a - b)).toEqual(fechas);
      expect(JSON.stringify(p.masAntiguos)).not.toMatch(/telefono|correo/i);
    });

    it('las métricas coinciden con los datos reales de la semilla y de la demo', async () => {
      const m = ((await get('/admin/panel?periodo=90', admin).expect(200)).body as Panel).metricas;
      expect(m.periodo).toBe(90);
      const desde = new Date(
        `${new Date(Date.now() - 89 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })}T00:00:00-05:00`,
      );
      const porRol = (rol: 'RECICLADOR' | 'CENTRO' | 'COMPRADOR_MOVIL' | 'ADMIN') =>
        prueba.bd.usuario.count({ where: { rol, estado: { not: 'ELIMINADO' } } });
      expect(m.usuarios.porRol).toEqual({
        RECICLADOR: await porRol('RECICLADOR'),
        CENTRO: await porRol('CENTRO'),
        COMPRADOR_MOVIL: await porRol('COMPRADOR_MOVIL'),
        ADMIN: await porRol('ADMIN'),
      });
      expect(m.usuarios.total).toBe(await prueba.bd.usuario.count({ where: { estado: { not: 'ELIMINADO' } } }));
      expect(m.usuarios.suspendidos).toBe(await prueba.bd.usuario.count({ where: { estado: 'SUSPENDIDO' } }));
      expect(m.usuarios.nuevos).toBe(
        await prueba.bd.usuario.count({ where: { estado: { not: 'ELIMINADO' }, creadoEn: { gte: desde } } }),
      );
      expect(m.usuarios.porSemana).toHaveLength(8);
      expect(m.negocios).toEqual({
        centrosVerificados: await prueba.bd.comprador.count({
          where: { tipo: 'CENTRO', estadoVerificacion: 'APROBADO' },
        }),
        movilesVerificados: await prueba.bd.comprador.count({
          where: { tipo: 'MOVIL', estadoVerificacion: 'APROBADO' },
        }),
      });
      const completadas = await prueba.bd.operacion.count({
        where: { estado: 'COMPLETADA', completadaEn: { gte: desde } },
      });
      const canceladas = await prueba.bd.operacion.count({
        where: { estado: 'CANCELADA', canceladaEn: { gte: desde } },
      });
      expect(m.operaciones.completadas).toBe(completadas);
      expect(m.operaciones.canceladas).toBe(canceladas);
      expect(m.operaciones.tasaCierre).toBe(
        completadas + canceladas > 0 ? Math.round((completadas / (completadas + canceladas)) * 1000) / 10 : null,
      );
      expect(m.operaciones.enCurso).toBe(
        await prueba.bd.operacion.count({
          where: { estado: { in: ['ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA'] } },
        }),
      );
      const kgOp = await prueba.bd.operacion.aggregate({
        where: { estado: 'COMPLETADA', completadaEn: { gte: desde } },
        _sum: { kgFinal: true },
      });
      const kgDirecto = await prueba.bd.registroReciclaje.aggregate({
        where: { estado: 'CONFIRMADO', resueltoEn: { gte: desde } },
        _sum: { kgConfirmado: true },
      });
      expect(m.kilos.total).toBeCloseTo(Number(kgOp._sum.kgFinal ?? 0) + Number(kgDirecto._sum.kgConfirmado ?? 0), 1);
      expect(m.kilos.porMaterial.reduce((s, x) => s + x.kg, 0)).toBeCloseTo(m.kilos.total, 1);
      expect(m.embudo.publicaciones).toBe(await prueba.bd.publicacion.count({ where: { creadaEn: { gte: desde } } }));
      expect(m.embudo.aceptadas).toBe(await prueba.bd.operacion.count({ where: { creadaEn: { gte: desde } } }));
      expect(m.embudo.conOfertas).toBeLessThanOrEqual(m.embudo.publicaciones);
      expect(m.embudo.completadas).toBeLessThanOrEqual(m.embudo.aceptadas);
    });

    it('los períodos son 7, 30 o 90 días y solo los ve la administración', async () => {
      for (const periodo of [7, 30, 90]) {
        expect(((await get(`/admin/panel?periodo=${periodo}`, admin).expect(200)).body as Panel).metricas.periodo).toBe(
          periodo,
        );
      }
      await get('/admin/panel?periodo=15', admin).expect(400);
      await get('/admin/panel', marco).expect(403);
      await get('/admin/panel', eco).expect(403);
    });

    it('sin operaciones terminadas no hay tasa de cierre: se dice «aún sin datos», no cero', async () => {
      const m = ((await get('/admin/panel?periodo=7', admin).expect(200)).body as Panel).metricas;
      if (m.operaciones.completadas + m.operaciones.canceladas === 0) expect(m.operaciones.tasaCierre).toBeNull();
      expect(typeof m.sinDatos).toBe('boolean');
    });
  });
});
