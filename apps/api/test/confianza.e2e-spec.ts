import { Client } from 'pg';
import { vi } from 'vitest';
import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { OperacionesTareas } from '../src/modulos/operaciones/operaciones-tareas.js';
import { ReportesTareas } from '../src/modulos/reportes/reportes-tareas.js';
import { urlPropietarioActual } from '../src/nucleo/base-datos/conexiones.js';
import { Configuracion } from '../src/nucleo/configuracion/configuracion.js';
import { PrismaAdmin } from '../src/nucleo/base-datos/prisma.js';
import {
  bearer,
  CLAVE,
  crearPrueba,
  entrar,
  nuevoNegocio,
  nuevoReciclador,
  type Prueba,
  registroCentro,
  zonaDeJuliaca,
} from './apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
type Error = { error: { codigo: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
type Opcion = { id: string; nombre: string; semaforo: { clave: string }; precio: { min: string; max: string } };

describe('Confianza y descubrimiento (Fase 8)', () => {
  let prueba: Prueba;
  let reciclador: string;
  let recicladorId: string;
  let lucia: string;
  let titicaca: string;
  let titicacaId: string;
  let ruben: string;
  let admin: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    reciclador = await nuevoReciclador(prueba, '948000001', 'Rosa Mamani Quispe');
    recicladorId = (await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: '948000001' } })).id;
    lucia = await entrar(prueba, '900000002');
    titicaca = await entrar(prueba, '900000011');
    titicacaId = (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } })).id;
    ruben = await entrar(prueba, '900000021');
    admin = await entrar(prueba, ADMIN.telefono);
  });
  afterAll(() => prueba.cerrar());

  const http = () => prueba.http();
  const get = (ruta: string, token?: string) => {
    const pedido = http().get(`/api/v1${ruta}`).set('X-Posicion', POSICION);
    return token ? pedido.set(bearer(token)) : pedido;
  };
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);

  describe('Reportar información de un negocio (16, 49, 60)', () => {
    let reporteId: string;

    it('solo el reciclador reporta: el invitado necesita cuenta y el negocio no puede', async () => {
      const cuerpo = { compradorId: titicacaId, motivo: 'PRECIO', material: 'pet', precioVisto: '2,10' };
      await http().post('/api/v1/reportes').send(cuerpo).expect(401);
      await post('/reportes', ruben, cuerpo).expect(403);
      await post('/reportes', reciclador, { ...cuerpo, motivo: 'FALSA', precioVisto: null }).expect(400);
      const creado = await post('/reportes', reciclador, cuerpo).expect(201);
      reporteId = (creado.body as { id: string }).id;
      expect(codigo(await post('/reportes', reciclador, cuerpo).expect(409))).toBe('YA_REPORTADO');
      const mios = (await get('/reportes/mios', reciclador).expect(200)).body as { datos: { id: string }[] };
      expect(mios.datos.map((r) => r.id)).toContain(reporteId);
    });

    it('el negocio ve el motivo y el estado, nunca quién lo reportó', async () => {
      const respuesta = await get('/mi-negocio/reportes', titicaca).expect(200);
      const texto = JSON.stringify(respuesta.body);
      expect(texto).toContain(reporteId);
      expect(texto).not.toContain(recicladorId);
      expect(texto).not.toContain('Rosa');
      expect(texto).not.toContain('948000001');
      expect(texto).not.toMatch(/"autor/);
    });

    it('el administrador ve al autor, pide corrección con plazo y el negocio marca "Ya lo corregí"', async () => {
      const lista = (await get('/admin/reportes?tipo=NEGOCIO&estado=pendientes', admin).expect(200)).body as {
        datos: Array<{ id: string; autor: { nombre: string }; acciones: string[] }>;
      };
      const fila = lista.datos.find((r) => r.id === reporteId)!;
      expect(fila.autor.nombre).toBe('Rosa M.');
      expect(fila.acciones).toEqual(['PEDIR_CORRECCION', 'RESOLVER', 'DESCARTAR']);
      await post(`/admin/reportes/${reporteId}/pedir-correccion`, admin, {
        motivo: 'Revisa tu PET',
        plazoHoras: 7,
      }).expect(400);
      await post(`/admin/reportes/${reporteId}/pedir-correccion`, titicaca, {
        motivo: 'Revisa tu PET',
        plazoHoras: 48,
      }).expect(403);
      await post(`/admin/reportes/${reporteId}/pedir-correccion`, admin, {
        motivo: 'Revisa tu PET',
        plazoHoras: 48,
      }).expect(200);

      const negocio = (await get('/mi-negocio/reportes?estado=correccion', titicaca).expect(200)).body as {
        datos: Array<{ id: string; correccion: { plazoHasta: string; enlace: string } }>;
      };
      const pedido = negocio.datos.find((r) => r.id === reporteId)!;
      expect(new Date(pedido.correccion.plazoHasta).getTime() - Date.now()).toBeGreaterThan(47 * 3_600_000);
      expect(pedido.correccion.enlace).toBe('/negocio/precios');

      await post(`/mi-negocio/reportes/${reporteId}/corregido`, titicaca).expect(200);
      expect(codigo(await post(`/mi-negocio/reportes/${reporteId}/corregido`, titicaca).expect(409))).toBe(
        'SIN_CORRECCION_PEDIDA',
      );
      await post(`/admin/reportes/${reporteId}/resolver`, admin, { motivo: 'El negocio actualizó su PET.' }).expect(
        200,
      );
      const auditoria = await prueba.bd.auditoria.findMany({
        where: { entidadId: reporteId },
        orderBy: { creadaEn: 'asc' },
      });
      expect(auditoria.map((a) => a.accion)).toEqual(['reporte_pedir_correccion', 'reporte_resolver']);
      expect(
        codigo(
          await post(`/admin/reportes/${reporteId}/descartar`, admin, { motivo: 'Ya estaba cerrado.' }).expect(409),
        ),
      ).toBe('DECISION_NO_VALIDA');
    });
  });

  describe('Reseñas reportadas y ocultas', () => {
    it('ocultar una reseña no la borra, la saca de la vista pública y del promedio, avisa al autor y queda auditado', async () => {
      const rubenId = (await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: '900000021' } })).id;
      // La semilla trae reseñas de Rubén ya reportadas por él; se ocultan desde la cola del administrador
      const reporte = await prueba.bd.reporte.findFirstOrThrow({
        where: { tipo: 'RESENA', estado: 'PENDIENTE', calificacion: { destinoId: rubenId } },
        orderBy: { creadoEn: 'asc' },
      });
      const resena = await prueba.bd.calificacion.findUniqueOrThrow({
        where: { id: reporte.calificacionId! },
        select: { id: true, autorId: true, destinoId: true },
      });
      const negocio = await prueba.bd.comprador.findUniqueOrThrow({
        where: { usuarioId: resena.destinoId },
        select: { id: true, califCant: true },
      });
      await post(`/admin/reportes/${reporte.id}/ocultar-resena`, admin, { motivo: 'abc' }).expect(400);
      await post(`/admin/reportes/${reporte.id}/ocultar-resena`, admin, {
        motivo: 'Afirma algo falso sin pruebas.',
      }).expect(200);

      expect(await prueba.bd.calificacion.count({ where: { id: resena.id } })).toBe(1);
      const publicas = (await get(`/negocios/${negocio.id}/resenas`).expect(200)).body as {
        resumen: { cantidad: number };
        datos: { id: string }[];
      };
      expect(publicas.datos.map((r) => r.id)).not.toContain(resena.id);
      expect(publicas.resumen.cantidad).toBe(negocio.califCant - 1);
      const aviso = await prueba.bd.notificacion.findFirst({
        where: { usuarioId: resena.autorId, titulo: 'Ocultamos una reseña tuya' },
      });
      expect(aviso).not.toBeNull();
      const auditoria = await prueba.bd.auditoria.findFirstOrThrow({ where: { entidadId: resena.id } });
      expect(auditoria.accion).toBe('reporte_ocultar_resena');
      expect(auditoria.motivo).toBe('Afirma algo falso sin pruebas.');
    });

    it('la conexión de administración no puede editar ni borrar una reseña ni deshacer su ocultamiento', async () => {
      const admins = prueba.app.get(PrismaAdmin);
      const oculta = await prueba.bd.resenaOculta.findFirstOrThrow();
      await expect(
        admins.$executeRaw`UPDATE calificacion SET comentario = 'editado' WHERE id = ${oculta.calificacionId}::uuid`,
      ).rejects.toThrow(/permission denied/);
      await expect(
        admins.$executeRaw`DELETE FROM resena_oculta WHERE calificacion_id = ${oculta.calificacionId}::uuid`,
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('Moderación de precios (61)', () => {
    let precioId: string;
    const opcionesPet = async (token?: string) =>
      ((await get('/compradores?material=pet&radio=20', token).expect(200)).body as { opciones: Opcion[] }).opciones;

    it('lista por riesgo con alertas y acciones; nunca ofrece editar el valor', async () => {
      const lista = (await get('/admin/precios', admin).expect(200)).body as {
        datos: Array<{ id: string; negocio: { id: string }; material: { codigo: string }; acciones: string[] }>;
      };
      const fila = lista.datos.find((p) => p.negocio.id === titicacaId && p.material.codigo === 'pet')!;
      precioId = fila.id;
      expect(fila.acciones).toEqual(['MARCAR', 'PEDIR_CORRECCION', 'SUSPENDER']);
      await get('/admin/precios', titicaca).expect(403);
    });

    it('un precio suspendido desaparece del mapa, la ficha, la calculadora, comparar y favoritos; el negocio ve el motivo', async () => {
      await http().put(`/api/v1/favoritos/${titicacaId}`).set(bearer(reciclador)).expect(200);
      expect((await opcionesPet()).some((o) => o.id === titicacaId)).toBe(true);

      await post(`/admin/precios/${precioId}/suspender`, admin, { motivo: 'Rango imposible frente al resto.' }).expect(
        200,
      );

      expect((await opcionesPet()).some((o) => o.id === titicacaId)).toBe(false);
      const ficha = (await get(`/compradores/${titicacaId}`).expect(200)).body as {
        materiales: { material: { codigo: string } }[];
      };
      expect(ficha.materiales.map((m) => m.material.codigo)).not.toContain('pet');
      const calculo = (await get('/calculadora?material=pet&kg=10&radio=20').expect(200)).body as {
        opciones: Opcion[];
      };
      expect(calculo.opciones.some((o) => o.id === titicacaId)).toBe(false);
      const otro = (await opcionesPet())[0]!.id;
      const comparar = (await get(`/compradores/comparar?ids=${titicacaId},${otro}`).expect(200)).body as {
        materiales: Array<{ material: { codigo: string }; precios: Record<string, unknown> }>;
      };
      expect(Object.keys(comparar.materiales.find((m) => m.material.codigo === 'pet')!.precios)).not.toContain(
        titicacaId,
      );
      const favoritos = (await get('/favoritos', reciclador).expect(200)).body as {
        datos: Array<{ id: string; negocio: { materiales?: { material: { codigo: string } }[] } }>;
      };
      const favorito = favoritos.datos.find((f) => f.id === titicacaId)!;
      expect(favorito.negocio.materiales?.map((m) => m.material.codigo)).not.toContain('pet');

      const propios = (await get('/mi-negocio/precios', titicaca).expect(200)).body as {
        materiales: Array<{ material: { codigo: string }; moderacion: { estado: string; motivo: string } | null }>;
      };
      expect(propios.materiales.find((m) => m.material.codigo === 'pet')!.moderacion).toEqual(
        expect.objectContaining({ estado: 'SUSPENDIDO', motivo: 'Rango imposible frente al resto.' }),
      );
    });

    it('restituir lo devuelve; pedir corrección vencida avisa al administrador y no suspende sola', async () => {
      await post(`/admin/precios/${precioId}/restituir`, admin, { motivo: 'El negocio corrigió el rango.' }).expect(
        200,
      );
      expect((await opcionesPet()).some((o) => o.id === titicacaId)).toBe(true);

      await post(`/admin/precios/${precioId}/pedir-correccion`, admin, {
        motivo: 'Revisa el rango.',
        plazoHoras: 24,
      }).expect(200);
      await prueba.bd.moderacionPrecio.updateMany({
        where: { precioMaterialId: precioId, cerradaEn: null },
        data: { plazoHasta: new Date(Date.now() - 60_000) },
      });
      const tareas = prueba.app.get(ReportesTareas);
      expect(await tareas.avisarPlazosVencidos()).toBeGreaterThanOrEqual(1);
      expect(await tareas.avisarPlazosVencidos()).toBe(0);
      const vigente = await prueba.bd.moderacionPrecio.findFirstOrThrow({
        where: { precioMaterialId: precioId, cerradaEn: null },
      });
      expect(vigente.estado).toBe('CORRECCION_PEDIDA');
      expect((await opcionesPet()).some((o) => o.id === titicacaId)).toBe(true);
      const adminId = (await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: ADMIN.telefono } })).id;
      expect(
        await prueba.bd.notificacion.count({
          where: { usuarioId: adminId, titulo: 'Venció un plazo de corrección de precio' },
        }),
      ).toBeGreaterThanOrEqual(1);

      expect(codigo(await post(`/admin/precios/${precioId}/marcar`, admin, { motivo: 'Otra vez.' }).expect(409))).toBe(
        'ACCION_NO_VALIDA',
      );
      await post(`/admin/precios/${precioId}/restituir`, admin, { motivo: 'Se cierra la revisión.' }).expect(200);
      const auditoria = await prueba.bd.auditoria.findMany({
        where: { entidadId: precioId },
        orderBy: { creadaEn: 'asc' },
      });
      expect(auditoria.map((a) => a.accion)).toEqual([
        'precio_suspender',
        'precio_restituir',
        'precio_pedir_correccion',
        'precio_restituir',
      ]);
    });
  });

  describe('Calculadora, comparar y cómo llegar (18, 20, 21)', () => {
    it('la calculadora la usa el invitado: valor = kilos × rango, 3 opciones con el mismo semáforo que el mapa', async () => {
      await http().get('/api/v1/calculadora?material=pet&kg=10').expect(400);
      const calculo = (await get('/calculadora?material=pet&kg=10&radio=20').expect(200)).body as {
        comparadoEntre: number;
        estimado: { min: string; max: string; negocio: string };
        opciones: Array<Opcion & { valor: { min: string; max: string } }>;
        puntos: number;
      };
      const mapa = (await get('/compradores?material=pet&radio=20').expect(200)).body as {
        comparadoEntre: number;
        opciones: Opcion[];
      };
      expect(calculo.comparadoEntre).toBe(mapa.comparadoEntre);
      expect(calculo.opciones.length).toBeLessThanOrEqual(3);
      expect(calculo.puntos).toBe(10);
      for (const opcion of calculo.opciones) {
        const enMapa = mapa.opciones.find((o) => o.id === opcion.id)!;
        expect(opcion.semaforo.clave).toBe(enMapa.semaforo.clave);
        expect(opcion.valor.min).toBe((Number(enMapa.precio.min) * 10).toFixed(2));
      }
      expect(calculo.estimado.negocio).toBe(calculo.opciones[0]!.nombre);
    });

    it('comparar calcula el semáforo solo entre los elegidos: con 2, Mejor y Bajo', async () => {
      const mapa = (await get('/compradores?material=pet&radio=20&orden=precio').expect(200)).body as {
        opciones: Opcion[];
      };
      const [caro, barato] = [mapa.opciones[0]!, mapa.opciones[mapa.opciones.length - 1]!];
      const comparar = (await get(`/compradores/comparar?ids=${caro.id},${barato.id}`).expect(200)).body as {
        materiales: Array<{ material: { codigo: string }; precios: Record<string, { semaforo: { clave: string } }> }>;
      };
      const pet = comparar.materiales.find((m) => m.material.codigo === 'pet')!;
      expect(pet.precios[caro.id]!.semaforo.clave).toBe('MEJOR');
      expect(pet.precios[barato.id]!.semaforo.clave).toBe('BAJO');
      await get(`/compradores/comparar?ids=${caro.id}`).expect(400);
    });

    it('cómo llegar suma al conteo sin avisar al negocio; el enlace lleva solo el destino', async () => {
      const antes = await prueba.bd.solicitudLlegada.count({ where: { compradorId: titicacaId } });
      const avisosAntes = await prueba.bd.notificacion.count({ where: { usuario: { comprador: { id: titicacaId } } } });
      const respuesta = (
        await http().post(`/api/v1/compradores/${titicacaId}/solicitudes-llegada`).send({}).expect(201)
      ).body as { enlace: string; direccion: string };
      expect(respuesta.enlace).toMatch(
        /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+\.\d+,-?\d+\.\d+$/,
      );
      expect(respuesta.enlace).not.toContain('origin');
      expect(await prueba.bd.solicitudLlegada.count({ where: { compradorId: titicacaId } })).toBe(antes + 1);
      expect(await prueba.bd.notificacion.count({ where: { usuario: { comprador: { id: titicacaId } } } })).toBe(
        avisosAntes,
      );
    });

    it('sin clave de servidor la ruta es null; con clave, Google recibe el origen redondeado', async () => {
      const sinClave = (await get(`/compradores/${titicacaId}/ruta?modo=pie`).expect(200)).body as {
        ruta: unknown;
        enlace: string;
      };
      expect(sinClave.ruta).toBeNull();
      await http().get(`/api/v1/compradores/${titicacaId}/ruta`).expect(400);

      const configuracion = prueba.app.get(Configuracion);
      (configuracion.googleMaps as { claveServidor?: string }).claveServidor = 'clave-de-servidor-de-prueba';
      const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 1400,
                duration: '1020s',
                legs: [{ steps: [{ navigationInstruction: { instructions: 'Gira a la derecha' } }] }],
              },
            ],
          }),
          { status: 200 },
        ),
      );
      try {
        const conClave = (
          await http()
            .get(`/api/v1/compradores/${titicacaId}/ruta?modo=moto`)
            .set('X-Posicion', '-15.49712,-70.13348')
            .expect(200)
        ).body as { ruta: { distanciaKm: number; minutos: number; pasos: string[] } };
        expect(conClave.ruta).toEqual({ distanciaKm: 1.4, minutos: 17, trazo: null, pasos: ['Gira a la derecha'] });
        const enviado = JSON.parse(espia.mock.calls[0]![1]!.body as string) as {
          origin: { location: { latLng: { latitude: number; longitude: number } } };
          travelMode: string;
        };
        expect(enviado.origin.location.latLng).toEqual({ latitude: -15.497, longitude: -70.133 });
        expect(enviado.travelMode).toBe('TWO_WHEELER');
      } finally {
        espia.mockRestore();
        (configuracion.googleMaps as { claveServidor?: string }).claveServidor = undefined;
      }
    });
  });

  describe('Favoritos y alertas de precio (19)', () => {
    it('solo quienes tienen la alerta activa reciben el cambio de precio de un favorito', async () => {
      await http().put(`/api/v1/favoritos/${titicacaId}`).set(bearer(ruben)).expect(403);
      await http().put(`/api/v1/favoritos/${titicacaId}`).set(bearer(lucia)).expect(200);
      expect(((await get('/favoritos/ids', lucia).expect(200)).body as { ids: string[] }).ids).toContain(titicacaId);
      await http()
        .patch(`/api/v1/favoritos/${titicacaId}/alertas`)
        .set(bearer(lucia))
        .send({ alertaPrecio: false })
        .expect(200);

      const precios = (await get('/mi-negocio/precios', titicaca).expect(200)).body as {
        materiales: Array<{ material: { codigo: string }; activo: boolean; min: string; max: string; demanda: string }>;
      };
      const cuerpo = Object.fromEntries(
        precios.materiales
          .filter((m) => m.activo)
          .map((m) => [
            m.material.codigo,
            {
              min: Number(m.min),
              max: m.material.codigo === 'carton' ? Number((Number(m.max) + 0.05).toFixed(2)) : Number(m.max),
              demanda: m.demanda,
            },
          ]),
      );
      await http().put('/api/v1/mi-negocio/precios').set(bearer(titicaca)).send({ precios: cuerpo }).expect(200);
      const titulo = 'Acopio Titicaca cambió sus precios';
      expect(await prueba.bd.notificacion.count({ where: { usuarioId: recicladorId, titulo } })).toBe(1);
      const luciaId = (await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: '900000002' } })).id;
      expect(await prueba.bd.notificacion.count({ where: { usuarioId: luciaId, titulo } })).toBe(0);
      const aviso = await prueba.bd.notificacion.findFirstOrThrow({ where: { usuarioId: recicladorId, titulo } });
      expect(aviso.mensaje).toContain('Cartón');
      expect(aviso.mensaje).not.toContain('PET');

      const original = Object.fromEntries(
        precios.materiales
          .filter((m) => m.activo)
          .map((m) => [m.material.codigo, { min: Number(m.min), max: Number(m.max), demanda: m.demanda }]),
      );
      await http().put('/api/v1/mi-negocio/precios').set(bearer(titicaca)).send({ precios: original }).expect(200);
      await http().delete(`/api/v1/favoritos/${titicacaId}`).set(bearer(lucia)).expect(204);
      await http().delete(`/api/v1/favoritos/${titicacaId}`).set(bearer(reciclador)).expect(204);
    });
  });

  describe('Mi cuenta (22, 39)', () => {
    it('edita el perfil y cambiar el teléfono exige verificar el número nuevo', async () => {
      const zonaId = await zonaDeJuliaca(prueba);
      await http().patch('/api/v1/yo/perfil').set(bearer(reciclador)).send({ nombre: 'Ro', zonaId }).expect(400);
      const perfil = (
        await http()
          .patch('/api/v1/yo/perfil')
          .set(bearer(reciclador))
          .send({ nombre: 'Rosa Mamani', correo: 'rosa@correo.pe', zonaId, sobreMi: 'Reciclo en el mercado.' })
          .expect(200)
      ).body as { nombre: string; correo: string; correoVerificado: boolean; sobreMi: string };
      expect(perfil).toEqual(
        expect.objectContaining({
          nombre: 'Rosa Mamani',
          correo: 'rosa@correo.pe',
          correoVerificado: false,
          sobreMi: 'Reciclo en el mercado.',
        }),
      );
      await http().patch('/api/v1/yo/perfil').set(bearer(titicaca)).send({ nombre: 'Titicaca', zonaId }).expect(403);

      expect(codigo(await post('/yo/telefono/cambiar', reciclador, { telefono: '900000011' }).expect(409))).toBe(
        'TELEFONO_EN_USO',
      );
      const envio = (await post('/yo/telefono/cambiar', reciclador, { telefono: '948000099' }).expect(200)).body as {
        codigoDePrueba: string;
      };
      expect(
        (await prueba.bd.usuario.findUniqueOrThrow({ where: { id: recicladorId }, select: { telefono: true } }))
          .telefono,
      ).toBe('948000001');
      await post('/yo/telefono/confirmar', reciclador, { telefono: '948000099', codigo: '000000' }).expect(422);
      await post('/yo/telefono/confirmar', reciclador, { telefono: '948000099', codigo: envio.codigoDePrueba }).expect(
        200,
      );
      const cuenta = await prueba.bd.usuario.findUniqueOrThrow({ where: { id: recicladorId } });
      expect(cuenta.telefono).toBe('948000099');
      expect(
        await prueba.bd.notificacion.count({ where: { usuarioId: recicladorId, titulo: 'Cambiaste tu número' } }),
      ).toBe(1);
      await http().post('/api/v1/auth/login').send({ identificador: '948000099', contrasena: CLAVE }).expect(200);
    });

    it('ranking y lista de espera de una ciudad "Próximamente"', async () => {
      await http().put('/api/v1/yo/preferencias').set(bearer(reciclador)).send({ visibleEnRanking: false }).expect(200);
      const ciudades = (await http().get('/api/v1/ciudades').expect(200)).body as {
        datos: { id: number; nombre: string }[];
      };
      const puno = ciudades.datos.find((c) => c.nombre === 'Puno')!;
      const juliaca = ciudades.datos.find((c) => c.nombre === 'Juliaca')!;
      await post(`/yo/lista-espera/${puno.id}`, reciclador).expect(200);
      await post(`/yo/lista-espera/${puno.id}`, reciclador).expect(200);
      expect(await prueba.bd.listaEsperaCiudad.count({ where: { ciudadId: puno.id, usuarioId: recicladorId } })).toBe(
        1,
      );
      expect(codigo(await post(`/yo/lista-espera/${juliaca.id}`, reciclador).expect(409))).toBe('CIUDAD_ACTIVA');
    });
  });

  describe('Datos y horarios del negocio (47, S5)', () => {
    let centro: string;
    let centroId: string;

    beforeAll(async () => {
      const zonaId = await zonaDeJuliaca(prueba);
      centro = await nuevoNegocio(prueba, '948000050');
      await http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(centro))
        .send(registroCentro(zonaId, 'Acopio Datos Prueba'))
        .expect(200);
      const verificacion = await prueba.bd.verificacion.findFirstOrThrow({
        where: { comprador: { nombreComercial: 'Acopio Datos Prueba' } },
      });
      centroId = verificacion.compradorId;
      await post(`/admin/verificaciones/${verificacion.id}/aprobar`, admin).expect(200);
    });
    // Se retira del mapa al terminar para no alterar las demás pruebas
    afterAll(() => prueba.bd.comprador.update({ where: { id: centroId }, data: { estadoVerificacion: 'RECHAZADO' } }));

    it('datos, horario y pagos se guardan al momento', async () => {
      await http()
        .patch('/api/v1/mi-negocio/datos')
        .set(bearer(centro))
        .send({ nombreComercial: 'Ac', whatsapp: '987654321' })
        .expect(400);
      await http()
        .patch('/api/v1/mi-negocio/datos')
        .set(bearer(centro))
        .send({ nombreComercial: 'Acopio Datos Prueba', descripcion: 'Báscula calibrada.', whatsapp: '987 654 322' })
        .expect(200);
      await http()
        .put('/api/v1/mi-negocio/horarios')
        .set(bearer(centro))
        .send({ dias: [{ dia: 1, abre: '09:00', cierra: '08:00' }] })
        .expect(400);
      const datos = (
        await http()
          .put('/api/v1/mi-negocio/horarios')
          .set(bearer(centro))
          .send({
            dias: [
              { dia: 1, abre: '08:00', cierra: '17:00' },
              { dia: 6, abre: '08:00', cierra: '13:00' },
            ],
          })
          .expect(200)
      ).body as { horario: { dias: { dia: number; cierra: string }[] }; whatsapp: string };
      expect(datos.whatsapp).toBe('987654322');
      expect(datos.horario.dias).toEqual([
        { dia: 1, abre: '08:00', cierra: '17:00' },
        { dia: 6, abre: '08:00', cierra: '13:00' },
      ]);
      await http().put('/api/v1/mi-negocio/pagos').set(bearer(centro)).send({ pagos: [] }).expect(400);
      await http()
        .put('/api/v1/mi-negocio/pagos')
        .set(bearer(centro))
        .send({ pagos: ['PLIN'] })
        .expect(200);
      await http().patch('/api/v1/mi-negocio/datos').set(bearer(reciclador)).send({}).expect(403);
    });

    it('cambiar la dirección es una solicitud: sigue visible con la anterior hasta que el administrador la aprueba', async () => {
      const zonaId = await zonaDeJuliaca(prueba);
      const nueva = { direccion: 'Jr. Lambayeque 900, Juliaca', zonaId, ubicacion: { lat: -15.495, lng: -70.13 } };
      await post('/mi-negocio/cambio-direccion', centro, nueva).expect(201);
      expect(codigo(await post('/mi-negocio/cambio-direccion', centro, nueva).expect(409))).toBe('CAMBIO_EN_REVISION');
      const ficha = (await get(`/compradores/${centroId}`).expect(200)).body as { direccion: string };
      expect(ficha.direccion).toBe('Jr. Moquegua 123, Juliaca');

      const solicitud = await prueba.bd.verificacion.findFirstOrThrow({
        where: { compradorId: centroId, tipo: 'CAMBIO_DIRECCION', estado: 'EN_REVISION' },
      });
      await post(`/admin/verificaciones/${solicitud.id}/pedir-informacion`, admin, {
        motivo: 'Otro dato',
        mensaje: 'Sube una foto de la fachada nueva.',
      }).expect(409);
      await post(`/admin/verificaciones/${solicitud.id}/aprobar`, admin).expect(200);
      const despues = (await get(`/compradores/${centroId}`).expect(200)).body as { direccion: string };
      expect(despues.direccion).toBe('Jr. Lambayeque 900, Juliaca');
      const negocio = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: centroId } });
      expect(negocio.estadoVerificacion).toBe('APROBADO');
    });
  });

  describe('Operaciones: problemas, reseñas recibidas y los 7 pasos', () => {
    let operacionId: string;

    beforeAll(async () => {
      const publicacion = (
        await post('/publicaciones', reciclador, { material: 'carton', kg: 30 }).set('X-Posicion', POSICION).expect(201)
      ).body as { publicacion: { id: string } };
      const oferta = (
        await post(`/negocio/publicaciones/${publicacion.publicacion.id}/ofertas`, ruben, { precioKg: 0.7 }).expect(201)
      ).body as { id: string };
      operacionId = (
        (await post(`/ofertas/${oferta.id}/aceptar`, reciclador).expect(200)).body as { operacionId: string }
      ).operacionId;
    });

    it('el seguimiento trae las fechas de publicación y oferta para los 7 pasos', async () => {
      const detalle = (await get(`/operaciones/${operacionId}`, reciclador).expect(200)).body as {
        fechas: Record<string, string | null>;
        acciones: string[];
      };
      expect(detalle.fechas.publicada).toBeTruthy();
      expect(detalle.fechas.ofertaRecibida).toBeTruthy();
      expect(new Date(detalle.fechas.publicada!).getTime()).toBeLessThanOrEqual(
        new Date(detalle.fechas.aceptada!).getTime(),
      );
      expect(detalle.acciones).toContain('reportarProblema');
    });

    it('cualquiera de las partes reporta un problema; el administrador lo resuelve sin tocar la operación', async () => {
      await post(`/operaciones/${operacionId}/problema`, reciclador, { tipo: 'PAGO', detalle: 'corto' }).expect(400);
      await post(`/operaciones/${operacionId}/problema`, reciclador, {
        tipo: 'TRATO',
        detalle: 'Me hablaron de mala manera al coordinar.',
      }).expect(201);
      expect(
        codigo(
          await post(`/operaciones/${operacionId}/problema`, reciclador, {
            tipo: 'TRATO',
            detalle: 'Me hablaron de mala manera al coordinar.',
          }).expect(409),
        ),
      ).toBe('YA_REPORTADO');
      await post(`/operaciones/${operacionId}/problema`, ruben, {
        tipo: 'NO_LLEGO',
        detalle: 'Esperé en el punto y no llegó nadie.',
      }).expect(201);
      await post(`/operaciones/${operacionId}/problema`, titicaca, {
        tipo: 'OTRO',
        detalle: 'No participo en esta operación.',
      }).expect(404);

      const incidencias = (await get('/admin/incidencias?estado=abiertas', admin).expect(200)).body as {
        datos: Array<{
          id: string;
          motivo: string;
          reportadoPor: string;
          decisiones: string[];
          operacion: { id: string };
        }>;
      };
      const trato = incidencias.datos.find((i) => i.operacion.id === operacionId && i.motivo === 'TRATO')!;
      expect(trato.reportadoPor).toBe('RECICLADOR');
      expect(trato.decisiones).toEqual(['RESOLVER', 'DESCARTAR']);
      await post(`/admin/incidencias/${trato.id}/resolver`, admin, {
        decision: 'ANULAR',
        motivo: 'No corresponde.',
      }).expect(409);
      await post(`/admin/incidencias/${trato.id}/resolver`, admin, {
        decision: 'RESOLVER',
        motivo: 'Hablamos con ambas partes.',
      }).expect(200);
      const operacion = await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } });
      expect(operacion.estado).toBe('ACEPTADA');
      expect(operacion.enDisputa).toBe(false);
      const mios = (await get('/operaciones/problemas/mios', reciclador).expect(200)).body as {
        datos: Array<{ motivo: string; estado: string; decision: string | null }>;
      };
      expect(mios.datos[0]).toEqual(
        expect.objectContaining({ motivo: 'TRATO', estado: 'RESUELTO', decision: 'Hablamos con ambas partes.' }),
      );
    });

    it('el reciclador ve las reseñas que recibió, con el negocio como autor', async () => {
      const marco = await entrar(prueba, '900000001');
      const resenas = (await get('/yo/resenas', marco).expect(200)).body as {
        resumen: { cantidad: number };
        datos: Array<{ autor: string; estrellas: number }>;
      };
      expect(resenas.resumen.cantidad).toBeGreaterThanOrEqual(10);
      const negocios = await prueba.bd.comprador.findMany({ select: { nombreComercial: true } });
      expect(negocios.map((n) => n.nombreComercial)).toContain(resenas.datos[0]!.autor);
      await get('/yo/resenas', titicaca).expect(403);
    });
  });

  describe('Alertas de posible colusión', () => {
    it('señala pares repetidos en 7 días y pesos atípicos, sin bloquear a nadie', async () => {
      const alertas = (await get('/admin/alertas?dias=90', admin).expect(200)).body as {
        umbrales: { operacionesPar: number; desvioPct: number; kgOperacion: number };
        pares: Array<{ operacionesEn7Dias: number }>;
        pesos: Array<{ desvioPct: number; kgRecibidos: number }>;
      };
      expect(alertas.umbrales).toEqual({ operacionesPar: 3, desvioPct: 40, kgOperacion: 500 });
      for (const par of alertas.pares) expect(par.operacionesEn7Dias).toBeGreaterThanOrEqual(3);
      for (const peso of alertas.pesos) {
        expect(Math.abs(peso.desvioPct) >= 40 || peso.kgRecibidos >= 500).toBe(true);
      }
      await get('/admin/alertas', titicaca).expect(403);
      await get('/admin/alertas?dias=200', admin).expect(400);
    });
  });

  // Regresión: el contenedor usa la hora de Lima; los plazos deben medirse igual desde cualquier zona horaria
  describe('Zona horaria America/Lima en vencimientos y plazos de 72 h', () => {
    let lima: Client;
    beforeAll(async () => {
      lima = new Client({ connectionString: urlPropietarioActual().split('?')[0] });
      await lima.connect();
      await lima.query("SET TIME ZONE 'America/Lima'");
    });
    afterAll(() => lima.end());

    it('la publicación vence a las 168 h y la conformidad se cierra a las 72 h exactas, leídas desde Lima', async () => {
      const publicacion = (
        await post('/publicaciones', reciclador, { material: 'papel', kg: 12 }).set('X-Posicion', POSICION).expect(201)
      ).body as { publicacion: { id: string } };
      const id = publicacion.publicacion.id;
      const vence = await lima.query<{ horas: string; desde_ahora: string }>(
        `SELECT extract(epoch FROM vence_en - creada_en) / 3600 AS horas,
                extract(epoch FROM vence_en - now()) / 3600 AS desde_ahora
           FROM publicacion WHERE id = $1`,
        [id],
      );
      expect(Number(vence.rows[0]!.horas)).toBeCloseTo(168, 3);
      expect(Number(vence.rows[0]!.desde_ahora)).toBeGreaterThan(167.9);

      const oferta = (await post(`/negocio/publicaciones/${id}/ofertas`, ruben, { precioKg: 0.45 }).expect(201))
        .body as {
        id: string;
      };
      const { operacionId } = (await post(`/ofertas/${oferta.id}/aceptar`, reciclador).expect(200)).body as {
        operacionId: string;
      };
      await post(`/operaciones/${operacionId}/coordinar`, reciclador, {
        tipo: 'REFERENCIA',
        referencia: 'Frente al mercado Túpac Amaru',
      }).expect(200);
      await post(`/operaciones/${operacionId}/entregar`, reciclador).expect(200);
      const confirmada = (await post(`/operaciones/${operacionId}/confirmar`, ruben, { kgRecibidos: 12 }).expect(200))
        .body as { fechas: { confirmada: string }; plazos: { conformidadHasta: string } };
      expect(Math.abs(new Date(confirmada.fechas.confirmada).getTime() - Date.now())).toBeLessThan(60_000);
      expect(
        new Date(confirmada.plazos.conformidadHasta).getTime() - new Date(confirmada.fechas.confirmada).getTime(),
      ).toBe(72 * 3_600_000);

      const tareas = prueba.app.get(OperacionesTareas);
      await lima.query(`UPDATE operacion SET confirmada_en = now() - interval '71 hours 58 minutes' WHERE id = $1`, [
        operacionId,
      ]);
      await tareas.cerrarVencidas();
      expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } })).estado).toBe('CONFIRMADA');
      await lima.query(`UPDATE operacion SET confirmada_en = now() - interval '72 hours 2 minutes' WHERE id = $1`, [
        operacionId,
      ]);
      await tareas.cerrarVencidas();
      const cerrada = await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } });
      expect(cerrada.estado).toBe('COMPLETADA');
      expect(cerrada.completadaPorPlazo).toBe(true);
    });
  });
});
