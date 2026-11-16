import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { DiaMovilService } from '../src/modulos/movil/dia-movil.service.js';
import { PrismaAdmin } from '../src/nucleo/base-datos/prisma.js';
import {
  bearer,
  crearPrueba,
  entrar,
  nuevoNegocio,
  nuevoReciclador,
  type Prueba,
  registroCentro,
  zonaDeJuliaca,
} from './apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
type Error = { error: { codigo: string; campos?: Array<{ campo: string; mensaje: string }> } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const DIA_MS = 86_400_000;
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const sumarDias = (fecha: string, dias: number) =>
  new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * DIA_MS).toISOString().slice(0, 10);

type Estadisticas = {
  plan: string;
  requierePro?: boolean;
  sinDatos: boolean;
  visitas: { total: number };
  llegadas: { total: number; porMaterial: Array<{ material: string; cantidad: number }> };
  ofertas: { enviadas: number; aceptadas: number };
  kg: { total: number; compras: number };
  precioFrenteAlMercado: Array<{
    material: { codigo: string };
    min: string;
    max: string;
    demanda: string;
    semaforo: unknown;
  }>;
  horasConMasVisitas: { requierePro?: boolean } | Array<{ hora: number; visitas: number }>;
  materialesMasConsultados: { requierePro?: boolean } | Array<{ material: string; consultas: number }>;
};

describe('Paneles del negocio (Fase 9)', () => {
  let prueba: Prueba;
  let titicaca: string; // Pro
  let ruben: string; // Gratis, comprador móvil
  let marco: string;
  let lucia: string;
  let julio: string;
  let admin: string;
  let titicacaId: string;
  let rubenId: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    titicaca = await entrar(prueba, '900000011');
    ruben = await entrar(prueba, '900000021');
    marco = await entrar(prueba, '900000001');
    lucia = await entrar(prueba, '900000002');
    julio = await entrar(prueba, '900000003');
    admin = await entrar(prueba, ADMIN.telefono);
    titicacaId = (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } })).id;
    rubenId = (await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Compras Rubén' } })).id;
  });
  afterAll(() => prueba.cerrar());

  const http = () => prueba.http();
  const get = (ruta: string, token?: string) => {
    const pedido = http().get(`/api/v1${ruta}`).set('X-Posicion', POSICION);
    return token ? pedido.set(bearer(token)) : pedido;
  };
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const put = (ruta: string, token: string, cuerpo: object = {}) =>
    http().put(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const estadisticas = async (token: string, periodo: number) =>
    (await get(`/mi-negocio/estadisticas?periodo=${periodo}`, token).expect(200)).body as Estadisticas;

  describe('Estadísticas Gratis y Pro (50, 53, 41)', () => {
    it('el plan Gratis no recibe ningún dato Pro: lleva la marca "requiere Pro"', async () => {
      const gratis = await estadisticas(ruben, 30);
      expect(gratis.plan).toBe('GRATIS');
      expect(gratis.horasConMasVisitas).toEqual({ requierePro: true });
      expect(gratis.materialesMasConsultados).toEqual({ requierePro: true });
      // 90 días es Pro: no se envía ni una cifra
      const noventa = (await get('/mi-negocio/estadisticas?periodo=90', ruben).expect(200)).body as Record<
        string,
        unknown
      >;
      expect(Object.keys(noventa).sort()).toEqual(['periodo', 'plan', 'requierePro', 'zonaHoraria']);
      expect(noventa.requierePro).toBe(true);
      await get('/mi-negocio/estadisticas?periodo=45', ruben).expect(400);
    });

    it('el plan Pro recibe 90 días, horas con más visitas y materiales más consultados', async () => {
      const pro = await estadisticas(titicaca, 90);
      expect(pro.plan).toBe('PRO');
      expect(Array.isArray(pro.horasConMasVisitas)).toBe(true);
      expect((pro.horasConMasVisitas as Array<{ hora: number }>).length).toBeGreaterThan(0);
      expect(Array.isArray(pro.materialesMasConsultados)).toBe(true);
      const porcentajes = (pro.materialesMasConsultados as Array<{ porcentaje: number }>).reduce(
        (s, m) => s + m.porcentaje,
        0,
      );
      expect(porcentajes).toBeGreaterThanOrEqual(98);
      expect(porcentajes).toBeLessThanOrEqual(102);
    });

    it('semáforo, precio y demanda son idénticos con plan Gratis y con plan Pro', async () => {
      const comoPro = (await estadisticas(titicaca, 30)).precioFrenteAlMercado;
      expect(comoPro.length).toBeGreaterThan(0);
      await prueba.bd.comprador.update({ where: { id: titicacaId }, data: { plan: 'GRATIS' } });
      try {
        const comoGratis = await estadisticas(titicaca, 30);
        expect(comoGratis.plan).toBe('GRATIS');
        expect(comoGratis.precioFrenteAlMercado).toEqual(comoPro);
        expect(comoGratis.horasConMasVisitas).toEqual({ requierePro: true });
      } finally {
        await prueba.bd.comprador.update({ where: { id: titicacaId }, data: { plan: 'PRO' } });
      }
    });

    it('las cifras coinciden con las operaciones y ofertas reales de la semilla', async () => {
      const desde = new Date(`${sumarDias(hoyLima(), -29)}T05:00:00.000Z`);
      const operaciones = await prueba.bd.operacion.aggregate({
        where: { compradorId: titicacaId, estado: 'COMPLETADA', completadaEn: { gte: desde } },
        _sum: { kgFinal: true },
        _count: true,
      });
      const enviadas = await prueba.bd.oferta.count({
        where: { compradorId: titicacaId, estado: { not: 'RETIRADA' }, creadaEn: { gte: desde } },
      });
      const aceptadas = await prueba.bd.oferta.count({
        where: { compradorId: titicacaId, estado: 'ACEPTADA', creadaEn: { gte: desde } },
      });
      const e = await estadisticas(titicaca, 30);
      expect(e.kg.total).toBeCloseTo(Number(operaciones._sum.kgFinal ?? 0), 1);
      expect(e.kg.compras).toBe(operaciones._count);
      expect(e.ofertas).toEqual({ enviadas, aceptadas });
      // Solo operaciones completadas, con los kilos confirmados: las que siguen en curso no cuentan
      const enCurso = await prueba.bd.operacion.count({
        where: { compradorId: titicacaId, estado: { not: 'COMPLETADA' } },
      });
      expect(enCurso).toBeGreaterThanOrEqual(0);
    });

    it('un negocio sin actividad muestra "Aún sin datos", sin cifras inventadas', async () => {
      const zonaId = await zonaDeJuliaca(prueba);
      const nuevo = await nuevoNegocio(prueba, '949100001');
      await http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(nuevo))
        .send(registroCentro(zonaId, 'Acopio Sin Datos'))
        .expect(200);
      const e = await estadisticas(nuevo, 30);
      expect(e.sinDatos).toBe(true);
      expect(e.visitas.total).toBe(0);
      expect(e.llegadas.total).toBe(0);
      expect(e.ofertas).toEqual({ enviadas: 0, aceptadas: 0 });
      expect(e.kg.total).toBe(0);
      const resumen = (await get('/mi-negocio/resumen', nuevo).expect(200)).body as {
        sinDatos: boolean;
        kgRecibidos: { frenteAlMesAnterior: number | null };
      };
      expect(resumen.sinDatos).toBe(true);
      expect(resumen.kgRecibidos.frenteAlMesAnterior).toBeNull();
    });

    it('el resumen (41) trae el mes, las 8 semanas y qué hacer hoy', async () => {
      const r = (await get('/mi-negocio/resumen', titicaca).expect(200)).body as {
        kilosPorSemana: unknown[];
        paraHacerHoy: Record<string, number>;
        ultimasSolicitudes: Array<Record<string, unknown>>;
      };
      expect(r.kilosPorSemana).toHaveLength(8);
      expect(r.paraHacerHoy).toHaveProperty('preciosAntiguos');
      // Nunca quién pidió "Cómo llegar": solo material y cuándo
      for (const s of r.ultimasSolicitudes) expect(Object.keys(s).sort()).toEqual(['cuando', 'material']);
    });

    it('las solicitudes de llegada llegan solo como conteo por material y por día', async () => {
      const e = await estadisticas(titicaca, 30);
      expect(e.llegadas.total).toBeGreaterThan(0);
      expect(e.llegadas.porMaterial.reduce((s, m) => s + m.cantidad, 0)).toBe(e.llegadas.total);
      expect(JSON.stringify(e)).not.toMatch(/usuario|reciclador|telefono/i);
    });
  });

  describe('Visitas: sin duplicados el mismo día y sin contar las propias', () => {
    it('cuenta invitados y recicladores una vez por persona o dispositivo por día', async () => {
      const antes = (await estadisticas(titicaca, 7)).visitas.total;
      const dispositivo = (sufijo: string) => `dispositivo-prueba-${sufijo}`;
      const visitar = (dispositivo_: string, token?: string) => {
        const pedido = http()
          .post(`/api/v1/compradores/${titicacaId}/visitas`)
          .set('X-Dispositivo', dispositivo_)
          .send({ material: 'pet' });
        return token ? pedido.set(bearer(token)) : pedido;
      };
      expect(((await visitar(dispositivo('a')).expect(200)).body as { registrada: boolean }).registrada).toBe(true);
      expect(((await visitar(dispositivo('a')).expect(200)).body as { registrada: boolean }).registrada).toBe(false);
      expect(((await visitar(dispositivo('b')).expect(200)).body as { registrada: boolean }).registrada).toBe(true);
      expect(((await visitar(dispositivo('c'), marco).expect(200)).body as { registrada: boolean }).registrada).toBe(
        true,
      );
      // La misma persona desde otro dispositivo sigue siendo la misma persona
      expect(((await visitar(dispositivo('d'), marco).expect(200)).body as { registrada: boolean }).registrada).toBe(
        false,
      );
      expect((await estadisticas(titicaca, 7)).visitas.total).toBe(antes + 3);
    });

    it('no cuenta al propio negocio, a otro negocio ni a la administración', async () => {
      const antes = await prueba.bd.eventoVisita.count({ where: { compradorId: titicacaId } });
      for (const token of [titicaca, ruben, admin]) {
        const r = await http().post(`/api/v1/compradores/${titicacaId}/visitas`).set(bearer(token)).send({});
        expect(r.status).toBe(200);
        expect((r.body as { registrada: boolean }).registrada).toBe(false);
      }
      expect(await prueba.bd.eventoVisita.count({ where: { compradorId: titicacaId } })).toBe(antes);
    });

    it('no guarda quién visitó: el visitante es una huella que cambia por día y por negocio', async () => {
      const fila = await prueba.bd.eventoVisita.findFirstOrThrow({
        where: { compradorId: titicacaId },
        orderBy: { id: 'desc' },
      });
      const marcoId = (await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: '900000001' } })).id;
      expect(fila.visitante).toMatch(/^[0-9a-f]{64}$/);
      expect(fila.visitante).not.toContain(marcoId);
      await http().post(`/api/v1/compradores/00000000-0000-4000-8000-000000000000/visitas`).send({}).expect(404);
    });
  });

  describe('Avisos del negocio (46)', () => {
    let centro: string;
    let centroId: string;
    let sinVerificar: string;

    beforeAll(async () => {
      const zonaId = await zonaDeJuliaca(prueba);
      centro = await nuevoNegocio(prueba, '949100002');
      await http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(centro))
        .send(registroCentro(zonaId, 'Acopio Avisos Prueba'))
        .expect(200);
      const verificacion = await prueba.bd.verificacion.findFirstOrThrow({
        where: { comprador: { nombreComercial: 'Acopio Avisos Prueba' } },
      });
      centroId = verificacion.compradorId;
      await post(`/admin/verificaciones/${verificacion.id}/aprobar`, admin).expect(200);
      sinVerificar = await nuevoNegocio(prueba, '949100003');
      await http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(sinVerificar))
        .send(registroCentro(zonaId, 'Acopio Sin Verificar'))
        .expect(200);
    });
    afterAll(() => prueba.bd.comprador.update({ where: { id: centroId }, data: { estadoVerificacion: 'RECHAZADO' } }));

    it('solo los negocios verificados publican; el servidor rechaza precios, teléfonos y enlaces', async () => {
      const valido = { tipo: 'ANUNCIO', titulo: 'Horario especial', mensaje: 'Atendemos de 8 a 12.', vigenciaDias: 7 };
      expect(codigo(await post('/mi-negocio/avisos', sinVerificar, valido).expect(403))).toBe('NEGOCIO_NO_VERIFICADO');
      await post('/mi-negocio/avisos', marco, valido).expect(403);
      await post('/mi-negocio/avisos', admin, valido).expect(403);
      for (const mensaje of [
        'Pagamos S/ 2.80 por kg',
        'Llámanos al 951 234 567',
        'Visítanos en www.acopio.pe',
        'Escribe a acopio@correo.pe',
      ]) {
        const r = await post('/mi-negocio/avisos', centro, { ...valido, mensaje }).expect(400);
        expect((r.body as Error).error.campos?.[0]?.campo).toBe('mensaje');
      }
      await post('/mi-negocio/avisos', centro, { ...valido, titulo: 'ab' }).expect(400);
      await post('/mi-negocio/avisos', centro, { ...valido, titulo: 'x'.repeat(61) }).expect(400);
      expect(codigo(await post('/mi-negocio/avisos', centro, { ...valido, vigenciaDias: 15 }).expect(422))).toBe(
        'VIGENCIA_EXCESIVA',
      );
    });

    it('respeta el límite de avisos activos, igual para Gratis y Pro, y se puede quitar antes', async () => {
      const aviso = (n: number) => ({
        tipo: 'NECESIDAD',
        titulo: `Aviso número ${n}`,
        mensaje: 'Material limpio y seco.',
        vigenciaDias: 3,
      });
      const ids: string[] = [];
      for (const n of [1, 2, 3])
        ids.push(((await post('/mi-negocio/avisos', centro, aviso(n)).expect(201)).body as { id: string }).id);
      expect(codigo(await post('/mi-negocio/avisos', centro, aviso(4)).expect(409))).toBe('LIMITE_AVISOS');
      // Un negocio Pro tiene el mismo tope
      await prueba.bd.aviso.deleteMany({ where: { compradorId: titicacaId } });
      for (const n of [1, 2, 3]) await post('/mi-negocio/avisos', titicaca, aviso(n)).expect(201);
      expect(codigo(await post('/mi-negocio/avisos', titicaca, aviso(4)).expect(409))).toBe('LIMITE_AVISOS');

      await http().delete(`/api/v1/mi-negocio/avisos/${ids[0]}`).set(bearer(ruben)).expect(404);
      await http().delete(`/api/v1/mi-negocio/avisos/${ids[0]}`).set(bearer(centro)).expect(204);
      await post('/mi-negocio/avisos', centro, aviso(4)).expect(201);
      const publicos = (await http().get(`/api/v1/compradores/${centroId}/avisos`).expect(200)).body as {
        datos: Array<{ id: string }>;
      };
      expect(publicos.datos.map((a) => a.id)).not.toContain(ids[0]);
      expect(publicos.datos).toHaveLength(3);
    });

    it('vence solo: el aviso de ayer ya no aparece en la ficha ni en la sección Avisos', async () => {
      const vencido = await prueba.bd.aviso.create({
        data: {
          compradorId: centroId,
          tipo: 'ANUNCIO',
          titulo: 'Aviso de ayer',
          vigenteHasta: new Date(`${sumarDias(hoyLima(), -1)}T00:00:00Z`),
        },
      });
      const ficha = (await http().get(`/api/v1/compradores/${centroId}/avisos`).expect(200)).body as {
        datos: Array<{ id: string }>;
      };
      expect(ficha.datos.map((a) => a.id)).not.toContain(vencido.id);
      const ciudad = (await http().get('/api/v1/avisos').expect(200)).body as { datos: Array<{ id: string }> };
      expect(ciudad.datos.map((a) => a.id)).not.toContain(vencido.id);
      const mios = (await get('/mi-negocio/avisos', centro).expect(200)).body as {
        datos: Array<{ id: string; vigente: boolean }>;
        limites: { activos: number };
      };
      expect(mios.datos.find((a) => a.id === vencido.id)?.vigente).toBe(false);
      expect(mios.limites.activos).toBe(3);
    });

    it('la alerta llega a los favoritos con la alerta de anuncios activada y a nadie más', async () => {
      await http().put(`/api/v1/favoritos/${centroId}`).set(bearer(lucia)).expect(200);
      await http().put(`/api/v1/favoritos/${centroId}`).set(bearer(julio)).expect(200);
      await http()
        .patch(`/api/v1/favoritos/${centroId}/alertas`)
        .set(bearer(julio))
        .send({ alertaAvisos: false })
        .expect(200);
      await http()
        .delete(
          `/api/v1/mi-negocio/avisos/${((await get('/mi-negocio/avisos', centro)).body as { datos: Array<{ id: string; vigente: boolean }> }).datos.find((a) => a.vigente)!.id}`,
        )
        .set(bearer(centro))
        .expect(204);
      const titulo = 'Jornada de recepción';
      await post('/mi-negocio/avisos', centro, {
        tipo: 'CAMPANA',
        titulo,
        mensaje: 'Este sábado recibimos todo el día.',
        vigenciaDias: 5,
      }).expect(201);
      const [luciaId, julioId, marcoId] = await Promise.all(
        ['900000002', '900000003', '900000001'].map(
          async (t) => (await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: t } })).id,
        ),
      );
      const cuenta = (usuarioId: string | undefined) =>
        prueba.bd.notificacion.count({ where: { usuarioId: usuarioId ?? '', titulo: { contains: titulo } } });
      expect(await cuenta(luciaId)).toBe(1);
      expect(await cuenta(julioId)).toBe(0);
      expect(await cuenta(marcoId)).toBe(0);
    });
  });

  describe('Día del comprador móvil (52, 56, 55)', () => {
    const paradas = async () => {
      const zonaId = await zonaDeJuliaca(prueba);
      return [{ zonaId, desde: '08:00', hasta: '10:00' }];
    };

    it('el estado cambia con un toque y «En ruta» guarda el día', async () => {
      const r = (await put('/mi-negocio/estado-movil', ruben, { disponibilidad: 'EN_RUTA' }).expect(200)).body as {
        disponibilidad: string;
      };
      expect(r.disponibilidad).toBe('EN_RUTA');
      const fila = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: rubenId } });
      expect(fila.diaVigente?.toISOString().slice(0, 10)).toBe(hoyLima());
    });

    it('la posición se redondea en el servidor, se guarda un solo punto y se muestra solo si se comparte', async () => {
      await put('/mi-negocio/posicion', titicaca, {
        comparte: true,
        posicion: { lat: -15.4971234, lng: -70.1334567 },
      }).expect(403);
      await put('/mi-negocio/posicion', admin, { comparte: false }).expect(403);
      await put('/mi-negocio/posicion', ruben, { comparte: true }).expect(400);
      const r = (
        await put('/mi-negocio/posicion', ruben, {
          comparte: true,
          posicion: { lat: -15.4971234, lng: -70.1334567 },
        }).expect(200)
      ).body as { posicion: { lat: number; lng: number } };
      expect(r.posicion).toEqual({ lat: -15.497, lng: -70.133 });
      const [punto] = await prueba.bd.$queryRaw<Array<{ lat: number; lng: number }>>`
        SELECT ST_Y(posicion_aproximada::geometry) AS lat, ST_X(posicion_aproximada::geometry) AS lng FROM comprador WHERE id = ${rubenId}::uuid`;
      expect(punto).toEqual({ lat: -15.497, lng: -70.133 });
      // Una segunda posición reemplaza a la primera: no queda historial
      await put('/mi-negocio/posicion', ruben, {
        comparte: true,
        posicion: { lat: -15.4981999, lng: -70.1344999 },
      }).expect(200);
      const [conteo] = await prueba.bd.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM comprador WHERE posicion_aproximada IS NOT NULL AND id = ${rubenId}::uuid`;
      expect(conteo!.n).toBe(1);
      const tablas = await prueba.bd.$queryRaw<Array<{ tabla: string }>>`
        SELECT table_name AS tabla FROM information_schema.columns WHERE column_name ILIKE '%posicion%' AND table_schema = 'public' GROUP BY table_name`;
      expect(tablas.map((t) => t.tabla).sort()).toEqual(['comprador']);

      const mapa = (await get('/compradores?material=pet&radio=20').expect(200)).body as {
        opciones: Array<{ id: string; posicion: { lat: number; lng: number } }>;
      };
      expect(mapa.opciones.find((o) => o.id === rubenId)?.posicion).toEqual({ lat: -15.498, lng: -70.134 });
    });

    it('al dejar «En ruta» la posición se borra y vuelve la zona aproximada', async () => {
      await put('/mi-negocio/estado-movil', ruben, { disponibilidad: 'DISPONIBLE' }).expect(200);
      const fila = await prueba.bd.comprador.findUniqueOrThrow({
        where: { id: rubenId },
        select: { compartePosicion: true },
      });
      expect(fila.compartePosicion).toBe(false);
      const [punto] = await prueba.bd.$queryRaw<
        Array<{ nulo: boolean }>
      >`SELECT (posicion_aproximada IS NULL) AS nulo FROM comprador WHERE id = ${rubenId}::uuid`;
      expect(punto!.nulo).toBe(true);
      expect(
        codigo(
          await put('/mi-negocio/posicion', ruben, { comparte: true, posicion: { lat: -15.5, lng: -70.1 } }).expect(
            409,
          ),
        ),
      ).toBe('NO_EN_RUTA');
    });

    it('la ruta del día la ve el reciclador solo si se publica; el centro no gestiona el día del móvil', async () => {
      const lista = await paradas();
      await get('/mi-negocio/ruta', titicaca).expect(403);
      await put('/mi-negocio/ruta', titicaca, { publicar: true, paradas: lista }).expect(403);
      await put('/mi-negocio/ruta', admin, { publicar: true, paradas: lista }).expect(403);
      await put('/mi-negocio/ruta', ruben, { publicar: true, paradas: [{ ...lista[0]!, hasta: '07:00' }] }).expect(400);
      expect(codigo(await put('/mi-negocio/ruta', ruben, { publicar: true, paradas: [] }).expect(422))).toBe(
        'RUTA_VACIA',
      );
      await put('/mi-negocio/ruta', ruben, { publicar: false, paradas: lista }).expect(200);
      const oculta = (await get(`/compradores/${rubenId}`).expect(200)).body as { rutaDelDia: unknown[] };
      expect(oculta.rutaDelDia).toEqual([]);
      await put('/mi-negocio/ruta', ruben, { publicar: true, paradas: lista }).expect(200);
      const visible = (await get(`/compradores/${rubenId}`).expect(200)).body as {
        rutaDelDia: Array<{ zona: string; desde: string }>;
      };
      expect(visible.rutaDelDia).toHaveLength(1);
      expect(visible.rutaDelDia[0]!.desde).toBe('08:00');
    });

    it('todo caduca al terminar el día en hora de Lima, no a medianoche UTC', async () => {
      const servicio = prueba.app.get(DiaMovilService);
      // La prueba adelanta el reloj: se guarda el día de los demás móviles de la semilla y se restituye al terminar
      const otros = await prueba.bd.comprador.findMany({
        where: { tipo: 'MOVIL', id: { not: rubenId } },
        select: { id: true, disponibilidad: true, diaVigente: true, rutaPublicada: true },
      });
      const paradasOtros = await prueba.bd.paradaRuta.findMany({ where: { compradorId: { not: rubenId } } });
      try {
        // Día D en Lima = 2026-11-19: a las 23:59 (04:59 UTC del 20) sigue vigente; a las 00:01 del 20 (05:01 UTC) caduca
        await prueba.bd.$executeRaw`
          UPDATE comprador SET disponibilidad = 'EN_RUTA', dia_vigente = '2026-11-19', ruta_publicada = true, comparte_posicion = true,
                 posicion_aproximada = ST_SetSRID(ST_MakePoint(-70.133, -15.497), 4326)::geography WHERE id = ${rubenId}::uuid`;
        await servicio.caducarDia(new Date('2026-11-20T04:59:00Z'));
        const antes = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: rubenId } });
        expect(antes.disponibilidad).toBe('EN_RUTA');
        expect(antes.rutaPublicada).toBe(true);
        expect(await servicio.caducarDia(new Date('2026-11-20T05:01:00Z'))).toBeGreaterThanOrEqual(1);
        const fila = await prueba.bd.comprador.findUniqueOrThrow({ where: { id: rubenId } });
        expect(fila.disponibilidad).toBe('DISPONIBLE');
        expect(fila.rutaPublicada).toBe(false);
        expect(fila.compartePosicion).toBe(false);
        expect(await prueba.bd.paradaRuta.count({ where: { compradorId: rubenId } })).toBe(0);
      } finally {
        for (const o of otros) {
          await prueba.bd.comprador.update({
            where: { id: o.id },
            data: { disponibilidad: o.disponibilidad, diaVigente: o.diaVigente, rutaPublicada: o.rutaPublicada },
          });
        }
        await prueba.bd.paradaRuta.deleteMany({ where: { compradorId: { not: rubenId } } });
        await prueba.bd.paradaRuta.createMany({ data: paradasOtros });
      }
    });

    it('aunque la tarea no haya corrido, el mapa ya no muestra «En ruta» ni la posición de un día anterior', async () => {
      await prueba.bd.$executeRaw`
        UPDATE comprador SET disponibilidad = 'EN_RUTA', dia_vigente = ${sumarDias(hoyLima(), -1)}::date, comparte_posicion = true,
               posicion_aproximada = ST_SetSRID(ST_MakePoint(-70.01, -15.40), 4326)::geography WHERE id = ${rubenId}::uuid`;
      const mapa = (await get('/compradores?material=pet&radio=20').expect(200)).body as {
        opciones: Array<{ id: string; posicion: { lat: number; lng: number }; estado: { texto: string } }>;
      };
      const fila = mapa.opciones.find((o) => o.id === rubenId)!;
      expect(fila.posicion).not.toEqual({ lat: -15.4, lng: -70.01 });
      expect(fila.estado.texto).not.toMatch(/en ruta/i);
      await prueba.bd
        .$executeRaw`UPDATE comprador SET disponibilidad = 'DISPONIBLE', comparte_posicion = false, posicion_aproximada = NULL WHERE id = ${rubenId}::uuid`;
    });
  });

  describe('Permisos: cada negocio ve lo suyo y la administración no edita nada de esto', () => {
    it('solo los negocios entran a sus paneles', async () => {
      for (const ruta of ['/mi-negocio/estadisticas', '/mi-negocio/resumen', '/mi-negocio/avisos']) {
        await get(ruta, marco).expect(403);
        await get(ruta, admin).expect(403);
        await get(ruta).expect(401);
      }
    });

    it('cada negocio recibe sus propias cifras', async () => {
      const a = await estadisticas(titicaca, 30);
      const b = await estadisticas(ruben, 30);
      expect(a.kg.total).not.toBe(b.kg.total);
      expect(a.visitas.total).not.toBe(b.visitas.total);
    });

    it('la conexión de administración no puede escribir avisos, rutas, visitas, solicitudes ni el día del móvil', async () => {
      const admins = prueba.app.get(PrismaAdmin);
      await expect(
        admins.$executeRaw`INSERT INTO aviso (comprador_id, tipo, titulo, vigente_hasta) VALUES (${rubenId}::uuid, 'ANUNCIO', 'Intruso', CURRENT_DATE)`,
      ).rejects.toThrow(/permission denied/);
      await expect(admins.$executeRaw`UPDATE aviso SET titulo = 'Editado'`).rejects.toThrow(/permission denied/);
      await expect(admins.$executeRaw`DELETE FROM parada_ruta`).rejects.toThrow(/permission denied/);
      await expect(admins.$executeRaw`UPDATE evento_visita SET hora = 1`).rejects.toThrow(/permission denied/);
      await expect(admins.$executeRaw`DELETE FROM solicitud_llegada`).rejects.toThrow(/permission denied/);
      await expect(admins.$executeRaw`UPDATE comprador SET disponibilidad = 'EN_RUTA'`).rejects.toThrow(
        /permission denied/,
      );
      await expect(admins.$executeRaw`UPDATE comprador SET comparte_posicion = true`).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe('Colusión: la señal es "recibido mayor que publicado" (Fase 8, ajuste)', () => {
    let reciclador: string;

    async function operacion(kgPublicados: number, kgRecibidos: number) {
      const publicacion = (
        await post('/publicaciones', reciclador, { material: 'pet', kg: kgPublicados })
          .set('X-Posicion', POSICION)
          .expect(201)
      ).body as { publicacion: { id: string } };
      const oferta = (
        await post(`/negocio/publicaciones/${publicacion.publicacion.id}/ofertas`, titicaca, { precioKg: 2.5 }).expect(
          201,
        )
      ).body as { id: string };
      const { operacionId } = (await post(`/ofertas/${oferta.id}/aceptar`, reciclador).expect(200)).body as {
        operacionId: string;
      };
      await post(`/operaciones/${operacionId}/coordinar`, reciclador, {
        tipo: 'REFERENCIA',
        referencia: 'Frente al mercado Túpac Amaru',
      }).expect(200);
      await post(`/operaciones/${operacionId}/entregar`, reciclador).expect(200);
      await post(`/operaciones/${operacionId}/confirmar`, titicaca, { kgRecibidos: kgRecibidos }).expect(200);
      await post(`/operaciones/${operacionId}/conforme`, reciclador).expect(200);
      return operacionId;
    }
    type Alertas = {
      pares: Array<{
        clave: string;
        negocio: string;
        operacionesEn7Dias: number;
        operaciones: Array<{ fecha: string; kg: number; material: string }>;
      }>;
      pesos: Array<{
        clave: string;
        operacionId: string;
        kgPublicados: number;
        kgRecibidos: number;
        desvioPct: number;
        publicadaEn: string;
        completadaEn: string;
        material: string;
      }>;
    };
    const alertas = async () => (await get('/admin/alertas?dias=30', admin).expect(200)).body as Alertas;

    beforeAll(async () => {
      reciclador = await nuevoReciclador(prueba, '949100010', 'Pedro Colusion Ramos');
    });

    it('recibido menor que publicado no es colusión; recibido mayor sí, con su contexto', async () => {
      const menor = await operacion(100, 50);
      const mayor = await operacion(100, 160);
      const a = await alertas();
      expect(a.pesos.map((p) => p.operacionId)).not.toContain(menor);
      const fila = a.pesos.find((p) => p.operacionId === mayor)!;
      expect(fila).toEqual(
        expect.objectContaining({ kgPublicados: 100, kgRecibidos: 160, desvioPct: 60, material: 'PET' }),
      );
      expect(fila.publicadaEn).toBeTruthy();
      expect(fila.completadaEn).toBeTruthy();
      // Solo un peso muy alto (umbral de kilos) alerta aunque no supere lo publicado
      expect(a.pesos.every((p) => p.kgRecibidos > p.kgPublicados || p.kgRecibidos >= 500)).toBe(true);
    });

    it('solo alerta: descartarla pide motivo, queda auditada y no toca la operación', async () => {
      const mayor = (await alertas()).pesos.find((p) => p.kgRecibidos === 160)!;
      await post('/admin/alertas/descartar', admin, { tipo: 'PESO', clave: mayor.clave, motivo: 'abc' }).expect(400);
      await post('/admin/alertas/descartar', titicaca, {
        tipo: 'PESO',
        clave: mayor.clave,
        motivo: 'Pesaron dos veces.',
      }).expect(403);
      await post('/admin/alertas/descartar', admin, {
        tipo: 'PESO',
        clave: '00000000-0000-4000-8000-000000000000',
        motivo: 'No existe.',
      }).expect(404);
      await post('/admin/alertas/descartar', admin, {
        tipo: 'PESO',
        clave: mayor.clave,
        motivo: 'Pesaron dos veces frente a ambas partes.',
      }).expect(200);
      expect((await alertas()).pesos.map((p) => p.clave)).not.toContain(mayor.clave);
      const auditoria = await prueba.bd.auditoria.findFirstOrThrow({
        where: { accion: 'alerta_colusion_descartar' },
        orderBy: { creadaEn: 'desc' },
      });
      expect(auditoria.motivo).toBe('Pesaron dos veces frente a ambas partes.');
      const operacionIntacta = await prueba.bd.operacion.findUniqueOrThrow({ where: { id: mayor.operacionId } });
      expect(operacionIntacta.estado).toBe('COMPLETADA');
      expect(Number(operacionIntacta.kgFinal)).toBe(160);
    });

    it('el mismo par repetido 3 veces en 7 días alerta con fechas, kilos y material; se descarta hasta una operación nueva', async () => {
      await operacion(10, 10);
      await operacion(10, 10);
      const a = await alertas();
      const par = a.pares.find((p) => p.operacionesEn7Dias >= 3)!;
      expect(par).toBeDefined();
      expect(par.operaciones.length).toBeGreaterThanOrEqual(3);
      expect(par.operaciones[0]).toEqual(expect.objectContaining({ material: 'PET' }));
      await post('/admin/alertas/descartar', admin, {
        tipo: 'PAR',
        clave: par.clave,
        motivo: 'Es su comprador habitual de confianza.',
      }).expect(200);
      expect((await alertas()).pares.map((p) => p.clave)).not.toContain(par.clave);
      await post('/admin/alertas/descartar', admin, {
        tipo: 'PAR',
        clave: 'no-es-un-par',
        motivo: 'No existe.',
      }).expect(404);
    });
  });

  describe('Límite contra reportes masivos (Fase 8)', () => {
    it('un reciclador tiene pocos reportes abiertos y pocos sobre un mismo negocio por día', async () => {
      const reciclador = await nuevoReciclador(prueba, '949100020', 'Rosa Reportera Quispe');
      const reporte = (negocioId: string, motivo: string) =>
        post('/reportes', reciclador, {
          compradorId: negocioId,
          motivo,
          detalle: 'No coincide lo publicado con lo que vi.',
        });
      await reporte(titicacaId, 'PRECIO').expect(201);
      await reporte(titicacaId, 'CERRADO').expect(201);
      expect(codigo(await reporte(titicacaId, 'UBICACION').expect(429))).toBe('LIMITE_REPORTES_NEGOCIO');
      const otros = await prueba.bd.comprador.findMany({
        where: { estadoVerificacion: 'APROBADO', id: { not: titicacaId } },
        take: 4,
        select: { id: true },
      });
      for (const n of otros.slice(0, 3)) await reporte(n.id, 'PRECIO').expect(201);
      expect(codigo(await reporte(otros[3]!.id, 'PRECIO').expect(429))).toBe('LIMITE_REPORTES');
    });
  });
});
