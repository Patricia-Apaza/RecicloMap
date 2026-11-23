import { ORIGEN } from '../prisma/datos-semilla.js';
import { PublicacionesTareas } from '../src/modulos/publicaciones/publicaciones-tareas.js';
import { bearer, crearPrueba, entrar, nuevoNegocio, nuevoReciclador, type Prueba, zonaDeJuliaca } from './apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
const TITICACA = '900000011';
const PUNO_SUR = '900000015';
const ECOACOPIO = '900000012';
const RUBEN = '900000021';
const LOS_ANDES = '900000022';
const SIN_VERIFICAR = '900000016';

type Error = { error: { codigo: string; mensaje: string } };
type Publicacion = {
  id: string;
  estado: string;
  kg: number;
  ofertas: { pendientes: number };
  operacion: { id: string } | null;
};
type Cercana = {
  id: string;
  estado: string;
  tramo: string;
  compraEsteMaterial: boolean;
  miOferta: { id: string; estado: string; total: string } | null;
  reciclador: Record<string, unknown>;
};
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;

describe('Publicaciones y ofertas (Fase 6)', () => {
  let prueba: Prueba;
  let reciclador: string;
  let titicaca: string;
  let punoSur: string;
  let ecoacopio: string;
  let ruben: string;
  let losAndes: string;
  let telefonoReciclador: string;
  const nombreReciclador = 'Rosa Mamani Quispe';

  beforeAll(async () => {
    prueba = await crearPrueba();
    telefonoReciclador = '946000001';
    reciclador = await nuevoReciclador(prueba, telefonoReciclador, nombreReciclador);
    const tokens = await Promise.all(
      [TITICACA, PUNO_SUR, ECOACOPIO, RUBEN, LOS_ANDES].map((telefono) => entrar(prueba, telefono)),
    );
    [titicaca, punoSur, ecoacopio, ruben, losAndes] = tokens as [string, string, string, string, string];
  });
  afterAll(() => prueba.cerrar());

  const publicar = (
    cuerpo: object,
    cabeceras: Record<string, string> = { 'X-Posicion': POSICION },
    token = reciclador,
  ) => prueba.http().post('/api/v1/publicaciones').set(bearer(token)).set(cabeceras).send(cuerpo);
  const ofertar = (token: string, publicacionId: string, precioKg: number | string = 2.5) =>
    prueba
      .http()
      .post(`/api/v1/negocio/publicaciones/${publicacionId}/ofertas`)
      .set(bearer(token))
      .send({ precioKg, mensaje: 'Recojo hoy.', cuandoRecoge: 'Hoy por la tarde' });
  const nueva = async (material = 'pet', kg = 35) =>
    ((await publicar({ material, kg }).expect(201)).body as { publicacion: Publicacion }).publicacion.id;
  const notificaciones = async (token: string) =>
    (
      (await prueba.http().get('/api/v1/notificaciones').set(bearer(token)).expect(200)).body as {
        datos: Array<{ titulo: string; mensaje: string; enlace: string }>;
      }
    ).datos;

  describe('publicar (12)', () => {
    it('valida kilos y precio, y exige ubicación o zona', async () => {
      expect(codigo(await publicar({ material: 'pet', kg: 0 }).expect(400))).toBe('ENTRADA_NO_VALIDA');
      expect(codigo(await publicar({ material: 'pet', kg: 10, precioEsperado: 60 }).expect(400))).toBe(
        'ENTRADA_NO_VALIDA',
      );
      expect(codigo(await publicar({ material: 'pet', kg: 10 }, {}).expect(400))).toBe('UBICACION_REQUERIDA');
    });

    it('publica con la zona elegida, vence en 7 días y nunca devuelve la ubicación', async () => {
      const zona = await zonaDeJuliaca(prueba);
      const respuesta = await publicar(
        { material: 'carton', kg: '60', precioEsperado: '0,55' },
        { 'X-Zona': String(zona) },
      ).expect(201);
      const cuerpo = respuesta.body as {
        publicacion: Publicacion & { diasRestantes: number; precioEsperado: string };
        loVeran: number;
      };
      expect(cuerpo.publicacion).toMatchObject({
        estado: 'DISPONIBLE',
        kg: 60,
        precioEsperado: '0.55',
        diasRestantes: 7,
      });
      expect(JSON.stringify(cuerpo)).not.toMatch(/-15\.\d|-70\.\d|ubicacion/);
    });

    it('"Lo verán N" cuenta a todos los negocios verificados de la ciudad (C8)', async () => {
      const respuesta = await publicar({ material: 'papel', kg: 20 }).expect(201);
      const verificados = await prueba.bd.comprador.count({
        where: { estadoVerificacion: 'APROBADO', usuario: { estado: 'ACTIVO' } },
      });
      expect((respuesta.body as { loVeran: number }).loVeran).toBe(verificados);
      const alcance = await prueba.http().get('/api/v1/publicaciones/alcance').set(bearer(reciclador)).expect(200);
      expect(alcance.body).toEqual({ negocios: verificados });
    });

    it('las fechas que escribe la API coinciden con el reloj de la base, aunque el servidor esté en hora de Lima', async () => {
      const id = await nueva('pet', 11);
      const [fila] = await prueba.bd.$queryRaw<Array<{ horas: number }>>`
        SELECT EXTRACT(EPOCH FROM (vence_en - now())) / 3600 AS horas FROM publicacion WHERE id = ${id}::uuid`;
      expect(Number(fila?.horas)).toBeGreaterThan(7 * 24 - 0.1);
      expect(Number(fila?.horas)).toBeLessThan(7 * 24 + 0.1);
    });

    it('un negocio no publica material', async () => {
      await publicar({ material: 'pet', kg: 10 }, { 'X-Posicion': POSICION }, titicaca).expect(403);
    });
  });

  describe('visibilidad (RF-23) y privacidad', () => {
    let papel: string;
    beforeAll(async () => {
      papel = await nueva('papel', 25);
    });

    it('la ven todos los negocios verificados, compren o no ese material, también lejos', async () => {
      // Compras Rubén no compra papel; Recicla Puno Sur está a más de 5 km
      const deRuben = (await prueba.http().get('/api/v1/negocio/publicaciones').set(bearer(ruben)).expect(200))
        .body as { datos: Cercana[] };
      expect(deRuben.datos.find((p) => p.id === papel)).toMatchObject({ compraEsteMaterial: false });
      const lejos = (await prueba.http().get('/api/v1/negocio/publicaciones').set(bearer(punoSur)).expect(200))
        .body as { datos: Cercana[] };
      expect(lejos.datos.find((p) => p.id === papel)?.tramo).toBe('más de 5 km');
    });

    it('avisa "Nueva publicación cerca" solo a los negocios a 5 km o menos, con el material en el título', async () => {
      const cerca = await notificaciones(titicaca);
      expect(cerca.some((n) => n.titulo === 'Nueva publicación de Papel cerca' && n.enlace.endsWith(papel))).toBe(true);
      expect(cerca.find((n) => n.enlace.endsWith(papel))?.mensaje).toMatch(
        /^25 kg de Papel a (menos de 1 km|1–2 km|2–5 km) de tu local\.$/,
      );
      expect((await notificaciones(punoSur)).some((n) => n.enlace.endsWith(papel))).toBe(false);
    });

    it('un negocio no verificado no ve publicaciones ni oferta (RN-18)', async () => {
      const token = await entrar(prueba, SIN_VERIFICAR);
      await prueba.http().get('/api/v1/negocio/publicaciones').set(bearer(token)).expect(403);
      await prueba.http().get(`/api/v1/negocio/publicaciones/${papel}`).set(bearer(token)).expect(403);
      await ofertar(token, papel).expect(403);
      const nuevo = await nuevoNegocio(prueba, '946000009');
      await prueba.http().get('/api/v1/negocio/publicaciones').set(bearer(nuevo)).expect(403);
    });

    it('ninguna respuesta a un negocio trae nombre, teléfono, coordenadas, barrio ni distancia numérica del reciclador', async () => {
      const oferta = (await ofertar(ecoacopio, papel, 0.4).expect(201)).body as { id: string };
      const respuestas = [
        await prueba.http().get('/api/v1/negocio/publicaciones').set(bearer(ecoacopio)).expect(200),
        await prueba.http().get(`/api/v1/negocio/publicaciones/${papel}`).set(bearer(ecoacopio)).expect(200),
        await prueba.http().get('/api/v1/negocio/ofertas').set(bearer(ecoacopio)).expect(200),
        await prueba
          .http()
          .put(`/api/v1/negocio/ofertas/${oferta.id}`)
          .set(bearer(ecoacopio))
          .send({ precioKg: 0.42 })
          .expect(200),
      ];
      const zonas = (await prueba.bd.zona.findMany({ select: { nombre: true } })).map((z) => z.nombre);
      for (const respuesta of respuestas) {
        const texto = JSON.stringify(respuesta.body);
        expect(texto).not.toContain('Rosa');
        expect(texto).not.toContain('Mamani');
        expect(texto).not.toContain(telefonoReciclador);
        expect(texto).not.toMatch(/-15\.\d|-70\.\d|"lat"|"lng"|distancia|"km"|metros/i);
        for (const zona of zonas) expect(texto).not.toContain(zona);
      }
      const detalle = respuestas[1]!.body as Cercana & { reciclador: { alias: string; ciudad: string } };
      expect(detalle.reciclador).toMatchObject({ alias: 'Reciclador', ciudad: 'Juliaca', telefonoVerificado: true });
      expect(detalle.reciclador.calificacion).toEqual({ promedio: null, cantidad: 0, nuevo: true });
    });

    it('el negocio no ve las ofertas de otros ni cuántas hay', async () => {
      const otra = await nueva('papel', 30);
      await ofertar(titicaca, otra, 0.45).expect(201);
      const vista = (
        await prueba.http().get(`/api/v1/negocio/publicaciones/${otra}`).set(bearer(ecoacopio)).expect(200)
      ).body as Cercana;
      expect(vista.estado).toBe('DISPONIBLE');
      expect(vista.miOferta).toBeNull();
      expect(JSON.stringify(vista)).not.toMatch(/ofertas|Titicaca|0\.45/);
    });
  });

  describe('ofertas (44, 45) y respuesta del reciclador (24)', () => {
    it('una oferta vigente por negocio; cambiarla avisa y recalcula el total; retirar permite volver a ofertar', async () => {
      const id = await nueva('pet', 40);
      const primera = (await ofertar(titicaca, id, 2.5).expect(201)).body as { id: string; total: string };
      expect(primera.total).toBe('100.00');
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).estado).toBe('CON_OFERTAS');
      expect(codigo(await ofertar(titicaca, id, 2.6).expect(409))).toBe('OFERTA_EXISTENTE');

      const cambiada = await prueba
        .http()
        .put(`/api/v1/negocio/ofertas/${primera.id}`)
        .set(bearer(titicaca))
        .send({ precioKg: '2,75' })
        .expect(200);
      expect((cambiada.body as { total: string }).total).toBe('110.00');
      const avisos = await notificaciones(reciclador);
      expect(
        avisos.some(
          (n) => n.titulo === 'Nueva oferta por tu PET' && n.mensaje.includes('S/ 2.50 por kg por tus 40 kg'),
        ),
      ).toBe(true);
      expect(
        avisos.some((n) => n.titulo === 'Cambió una oferta por tu PET' && n.mensaje.endsWith('S/ 2.75 por kg.')),
      ).toBe(true);

      await prueba.http().post(`/api/v1/negocio/ofertas/${primera.id}/retirar`).set(bearer(titicaca)).expect(200);
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).estado).toBe('DISPONIBLE');
      await ofertar(titicaca, id, 2.7).expect(201);
    });

    it('tras un rechazo no se vuelve a ofertar (S2); sin pendientes vuelve a DISPONIBLE', async () => {
      const id = await nueva('pet', 10);
      const oferta = (await ofertar(ruben, id, 2.4).expect(201)).body as { id: string };
      const rechazo = await prueba
        .http()
        .post(`/api/v1/ofertas/${oferta.id}/rechazar`)
        .set(bearer(reciclador))
        .expect(200);
      expect(rechazo.body).toEqual({ estadoPublicacion: 'DISPONIBLE', pendientes: 0 });
      expect(codigo(await ofertar(ruben, id, 2.6).expect(409))).toBe('OFERTA_RECHAZADA');
      expect((await notificaciones(ruben)).some((n) => n.titulo === 'Tu oferta por PET no fue seleccionada')).toBe(
        true,
      );
    });

    it('otro reciclador no puede aceptar ni rechazar ofertas ajenas', async () => {
      const id = await nueva('pet', 12);
      const oferta = (await ofertar(titicaca, id).expect(201)).body as { id: string };
      const otro = await nuevoReciclador(prueba, '946000002', 'Juan Pérez');
      await prueba.http().post(`/api/v1/ofertas/${oferta.id}/aceptar`).set(bearer(otro)).expect(404);
      await prueba.http().post(`/api/v1/ofertas/${oferta.id}/rechazar`).set(bearer(otro)).expect(404);
      await prueba.http().post(`/api/v1/ofertas/${oferta.id}/aceptar`).set(bearer(titicaca)).expect(403);
    });

    it('al aceptar: una transacción, las demás a NO_SELECCIONADA, operación ACEPTADA, WhatsApp liberado y anotación de mayor total', async () => {
      const id = await nueva('metal', 18);
      const ofertas = await Promise.all([
        ofertar(titicaca, id, 2.6).expect(201),
        ofertar(ruben, id, 2.4).expect(201),
        ofertar(losAndes, id, 2.9).expect(201),
      ]);
      const [aTiticaca, aRuben, aLosAndes] = ofertas.map((r) => (r.body as { id: string }).id) as [
        string,
        string,
        string,
      ];
      const recibidas = (
        await prueba.http().get(`/api/v1/publicaciones/${id}/ofertas`).set(bearer(reciclador)).expect(200)
      ).body as {
        mayorTotalId: string;
        ofertas: Array<{ id: string; negocio: { whatsapp: string; distanciaKm: number } }>;
      };
      expect(recibidas.mayorTotalId).toBe(aLosAndes);
      expect(recibidas.ofertas.find((o) => o.id === aTiticaca)?.negocio.distanciaKm).toBeGreaterThan(0);

      const aceptada = await prueba
        .http()
        .post(`/api/v1/ofertas/${aLosAndes}/aceptar`)
        .set(bearer(reciclador))
        .expect(200);
      const { operacionId } = aceptada.body as { operacionId: string };
      expect(aceptada.body).toMatchObject({ aceptoMayorTotal: true, noSeleccionadas: 2 });

      const estados = await prueba.bd.oferta.findMany({
        where: { publicacionId: id },
        select: { id: true, estado: true },
      });
      expect(Object.fromEntries(estados.map((o) => [o.id, o.estado]))).toEqual({
        [aTiticaca]: 'NO_SELECCIONADA',
        [aRuben]: 'NO_SELECCIONADA',
        [aLosAndes]: 'ACEPTADA',
      });
      const operacion = await prueba.bd.operacion.findUniqueOrThrow({ where: { id: operacionId } });
      expect(operacion).toMatchObject({ estado: 'ACEPTADA', ofertasAlAceptar: 3, aceptoMayorTotal: true });
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).estado).toBe('EN_NEGOCIACION');

      // Después de aceptar, cada parte ve el WhatsApp de la otra; un tercero no ve nada
      const delNegocio = (
        await prueba.http().get(`/api/v1/operaciones/${operacionId}`).set(bearer(losAndes)).expect(200)
      ).body as { contraparte: { nombre: string; whatsapp: string } };
      expect(delNegocio.contraparte).toMatchObject({ nombre: 'Rosa M.', whatsapp: telefonoReciclador });
      const delReciclador = (
        await prueba.http().get(`/api/v1/operaciones/${operacionId}`).set(bearer(reciclador)).expect(200)
      ).body as { contraparte: { nombre: string; whatsapp: string } };
      expect(delReciclador.contraparte).toMatchObject({ nombre: 'Camión Los Andes', whatsapp: LOS_ANDES });
      await prueba.http().get(`/api/v1/operaciones/${operacionId}`).set(bearer(titicaca)).expect(404);

      expect(
        (await notificaciones(losAndes)).some(
          (n) => n.titulo === 'Aceptaron tu oferta por Metales' && n.mensaje.startsWith('Rosa M. aceptó'),
        ),
      ).toBe(true);
      expect(
        (await notificaciones(titicaca)).some((n) => n.titulo === 'Tu oferta por Metales no fue seleccionada'),
      ).toBe(true);
      const evento = await prueba.bd.eventoDominio.findFirst({
        where: { tipo: 'OFERTA_ACEPTADA', entidadId: operacionId },
      });
      expect(evento).not.toBeNull();
    });

    it('dos aceptaciones simultáneas: una gana, la otra recibe 409 y queda una sola operación', async () => {
      const id = await nueva('pet', 15);
      const a = ((await ofertar(titicaca, id, 2.5).expect(201)).body as { id: string }).id;
      const b = ((await ofertar(ecoacopio, id, 2.4).expect(201)).body as { id: string }).id;
      const respuestas = await Promise.all([
        prueba.http().post(`/api/v1/ofertas/${a}/aceptar`).set(bearer(reciclador)),
        prueba.http().post(`/api/v1/ofertas/${b}/aceptar`).set(bearer(reciclador)),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prueba.bd.operacion.count({ where: { publicacionId: id } })).toBe(1);
      expect(await prueba.bd.oferta.count({ where: { publicacionId: id, estado: 'ACEPTADA' } })).toBe(1);
    });
  });

  describe('publicaciones cerradas y paginación (42, 52)', () => {
    const ids = async (token: string) =>
      (
        (await prueba.http().get('/api/v1/negocio/publicaciones?porPagina=50').set(bearer(token)).expect(200)).body as {
          datos: Cercana[];
        }
      ).datos.map((p) => p.id);

    it('aceptada, cancelada o vencida deja de verse para los demás negocios y ya no admite ofertas', async () => {
      const aceptada = await nueva('pet', 31);
      const oferta = ((await ofertar(titicaca, aceptada, 2.5).expect(201)).body as { id: string }).id;
      await prueba.http().post(`/api/v1/ofertas/${oferta}/aceptar`).set(bearer(reciclador)).expect(200);

      const cancelada = await nueva('pet', 32);
      await prueba
        .http()
        .post(`/api/v1/publicaciones/${cancelada}/cancelar`)
        .set(bearer(reciclador))
        .send({ motivo: 'Cambié de planes' })
        .expect(200);

      const vencida = await nueva('pet', 33);
      await prueba.bd.publicacion.update({
        where: { id: vencida },
        data: { creadaEn: new Date(Date.now() - 8 * 86_400_000), venceEn: new Date(Date.now() - 60_000) },
      });

      const visibles = await ids(ecoacopio);
      for (const id of [aceptada, cancelada, vencida]) {
        expect(visibles).not.toContain(id);
        expect(codigo(await ofertar(ecoacopio, id, 2.6).expect(409))).toBe('PUBLICACION_NO_DISPONIBLE');
        await prueba.http().get(`/api/v1/negocio/publicaciones/${id}`).set(bearer(ecoacopio)).expect(404);
      }
      // Quien ofertó sí puede volver a ver la suya
      await prueba.http().get(`/api/v1/negocio/publicaciones/${aceptada}`).set(bearer(titicaca)).expect(200);
    });

    it('pagina la lista ordenada por distancia', async () => {
      const primera = (
        await prueba.http().get('/api/v1/negocio/publicaciones?porPagina=2').set(bearer(ruben)).expect(200)
      ).body as { total: number; pagina: number; datos: Cercana[] };
      const segunda = (
        await prueba.http().get('/api/v1/negocio/publicaciones?porPagina=2&pagina=2').set(bearer(ruben)).expect(200)
      ).body as { datos: Cercana[] };
      expect(primera.total).toBeGreaterThan(2);
      expect(primera.datos).toHaveLength(2);
      expect(segunda.datos.map((p) => p.id)).not.toContain(primera.datos[0]!.id);
      await prueba.http().get('/api/v1/negocio/publicaciones?porPagina=51').set(bearer(ruben)).expect(400);
    });
  });

  describe('mis publicaciones (13, 23)', () => {
    it('se edita solo sin ofertas pendientes (P15); cancelar cierra las pendientes con aviso', async () => {
      const id = await nueva('carton', 50);
      await prueba
        .http()
        .put(`/api/v1/publicaciones/${id}`)
        .set(bearer(reciclador))
        .send({ kg: 55, precioEsperado: '' })
        .expect(200);
      await ofertar(titicaca, id, 0.6).expect(201);
      const bloqueo = await prueba
        .http()
        .put(`/api/v1/publicaciones/${id}`)
        .set(bearer(reciclador))
        .send({ kg: 60 })
        .expect(409);
      expect(codigo(bloqueo)).toBe('PUBLICACION_NO_EDITABLE');

      await prueba
        .http()
        .post(`/api/v1/publicaciones/${id}/cancelar`)
        .set(bearer(reciclador))
        .send({ motivo: '' })
        .expect(400);
      const cancelada = await prueba
        .http()
        .post(`/api/v1/publicaciones/${id}/cancelar`)
        .set(bearer(reciclador))
        .send({ motivo: 'Ya vendí el material' })
        .expect(200);
      expect((cancelada.body as Publicacion).estado).toBe('CANCELADA');
      expect(await prueba.bd.oferta.count({ where: { publicacionId: id, estado: 'NO_SELECCIONADA' } })).toBe(1);
      expect(
        (await notificaciones(titicaca)).some(
          (n) => n.mensaje === 'La publicación de 55 kg de Cartón ya no está disponible.',
        ),
      ).toBe(true);

      // Sin ubicación no se duplica: la de la original no se copia
      expect(
        codigo(await prueba.http().post(`/api/v1/publicaciones/${id}/duplicar`).set(bearer(reciclador)).expect(400)),
      ).toBe('UBICACION_REQUERIDA');
      const duplicada = await prueba
        .http()
        .post(`/api/v1/publicaciones/${id}/duplicar`)
        .set(bearer(reciclador))
        .set('X-Posicion', POSICION)
        .expect(201);
      expect(duplicada.body).toMatchObject({ estado: 'DISPONIBLE', kg: 55 });
      await prueba.http().post(`/api/v1/publicaciones/${id}/volver-a-publicar`).set(bearer(reciclador)).expect(409);
    });

    it('lista por pestañas con los indicadores de las activas', async () => {
      const lista = (
        await prueba.http().get('/api/v1/publicaciones?grupo=canceladas').set(bearer(reciclador)).expect(200)
      ).body as { conteos: Record<string, number>; datos: Publicacion[]; indicadores: { activas: number } };
      expect(lista.datos.every((p) => p.estado === 'CANCELADA')).toBe(true);
      expect(lista.conteos.canceladas).toBe(lista.datos.length);
      expect(lista.indicadores.activas).toBe(lista.conteos.activas);
      const id = lista.datos[0]!.id;
      const detalle = (await prueba.http().get(`/api/v1/publicaciones/${id}`).set(bearer(reciclador)).expect(200))
        .body as {
        historial: Array<{ texto: string }>;
        editable: boolean;
      };
      expect(detalle.editable).toBe(false);
      expect(detalle.historial[0]?.texto).toBe('Publicaste el material');
      expect(detalle.historial.at(-1)?.texto).toMatch(/^Cancelaste la publicación/);
    });
  });

  describe('tareas: vencimiento y aviso (10)', () => {
    it('a los 7 días vence, las ofertas pendientes pasan a NO_SELECCIONADA y se puede volver a publicar', async () => {
      const id = await nueva('plastico', 22);
      await ofertar(titicaca, id, 1.1).expect(201);
      await prueba.bd.publicacion.update({
        where: { id },
        data: { creadaEn: new Date(Date.now() - 8 * 86_400_000), venceEn: new Date(Date.now() - 60_000) },
      });
      const tareas = prueba.app.get(PublicacionesTareas);
      expect(await tareas.vencer()).toBeGreaterThanOrEqual(1);
      expect(await tareas.vencer()).toBe(0);
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).estado).toBe('VENCIDA');
      expect(await prueba.bd.oferta.count({ where: { publicacionId: id, estado: 'NO_SELECCIONADA' } })).toBe(1);

      // Se vuelve a publicar desde otra zona: la nueva toma esa ubicación, no la de la original
      const lejana = await prueba.bd.zona.findFirstOrThrow({ where: { nombre: 'Salida a Ilave' } });
      const copia = (
        await prueba
          .http()
          .post(`/api/v1/publicaciones/${id}/volver-a-publicar`)
          .set(bearer(reciclador))
          .set('X-Zona', String(lejana.id))
          .expect(201)
      ).body as Publicacion;
      const tramos = await prueba.bd.$queryRaw<Array<{ a: string; b: string }>>`
        SELECT publicacion_tramo(${id}::uuid, c.id)::text AS a, publicacion_tramo(${copia.id}::uuid, c.id)::text AS b
          FROM comprador c WHERE c.nombre_comercial = 'Acopio Titicaca'`;
      expect(tramos[0]?.a).toBe('1–2 km');
      expect(tramos[0]?.b).toBe('más de 5 km');
    });

    it('avisa 2 días antes, una sola vez; al renovar se vuelve a poder avisar', async () => {
      const id = await nueva('pet', 9);
      await prueba.bd.publicacion.update({ where: { id }, data: { venceEn: new Date(Date.now() + 86_400_000) } });
      const tareas = prueba.app.get(PublicacionesTareas);
      await tareas.avisarPorVencer();
      await tareas.avisarPorVencer();
      const avisos = (await notificaciones(reciclador)).filter((n) => n.enlace === `/publicaciones/${id}`);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({ titulo: 'Tu publicación de PET vence pronto' });
      const renovada = await prueba
        .http()
        .post(`/api/v1/publicaciones/${id}/renovar`)
        .set(bearer(reciclador))
        .expect(200);
      expect((renovada.body as { diasRestantes: number }).diasRestantes).toBe(7);
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).avisoVencerEn).toBeNull();
    });
  });

  describe('fotos de la publicación', () => {
    it('las sube el reciclador; las ve un negocio verificado de la ciudad, no un anónimo', async () => {
      const foto = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      const subida = await prueba
        .http()
        .post('/api/v1/fotos')
        .set(bearer(reciclador))
        .field('proposito', 'PUBLICACION')
        .attach('foto', foto, 'material.png')
        .expect(201);
      const fotoId = (subida.body as { id: string }).id;
      await prueba
        .http()
        .post('/api/v1/fotos')
        .set(bearer(titicaca))
        .field('proposito', 'PUBLICACION')
        .attach('foto', foto, 'material.png')
        .expect(403);
      const conFoto = await publicar({ material: 'pet', kg: 5, fotos: [fotoId] }).expect(201);
      expect((conFoto.body as { publicacion: { fotos: string[] } }).publicacion.fotos).toEqual([fotoId]);
      await prueba.http().get(`/api/v1/fotos/${fotoId}?tamano=mini`).set(bearer(titicaca)).expect(200);
      await prueba.http().get(`/api/v1/fotos/${fotoId}`).expect(404);
      // La misma foto no sirve para otra publicación
      await publicar({ material: 'pet', kg: 6, fotos: [fotoId] }).expect(422);
    });
  });

  describe('comprador móvil (52)', () => {
    it('cambia su disponibilidad y su zona como máximo una vez al día', async () => {
      const inicio = (await prueba.http().get('/api/v1/comprador/inicio').set(bearer(ruben)).expect(200)).body as {
        zona: { id: number };
        indicadores: { ofertasEnviadas: number };
      };
      expect(inicio.indicadores.ofertasEnviadas).toBeGreaterThan(0);
      const estado = await prueba
        .http()
        .put('/api/v1/mi-negocio/estado-movil')
        .set(bearer(ruben))
        .send({ disponibilidad: 'EN_RUTA' })
        .expect(200);
      expect((estado.body as { disponibilidad: string }).disponibilidad).toBe('EN_RUTA');

      const zonas = await prueba.bd.zona.findMany({
        where: { id: { not: inicio.zona.id } },
        take: 2,
        select: { id: true },
      });
      await prueba
        .http()
        .put('/api/v1/mi-negocio/estado-movil')
        .set(bearer(ruben))
        .send({ zonaId: zonas[0]!.id })
        .expect(200);
      const repetido = await prueba
        .http()
        .put('/api/v1/mi-negocio/estado-movil')
        .set(bearer(ruben))
        .send({ zonaId: zonas[1]!.id })
        .expect(409);
      expect(codigo(repetido)).toBe('ZONA_CAMBIADA_HOY');
      await prueba.http().put('/api/v1/mi-negocio/estado-movil').set(bearer(ruben)).send({}).expect(400);
      await prueba.http().get('/api/v1/comprador/inicio').set(bearer(titicaca)).expect(403);
      // Se restaura para no afectar otras pruebas
      await prueba.bd.comprador.updateMany({
        where: { nombreComercial: 'Compras Rubén' },
        data: { zonaId: inicio.zona.id, zonaActualizadaEn: null, disponibilidad: 'DISPONIBLE' },
      });
    });
  });
});
