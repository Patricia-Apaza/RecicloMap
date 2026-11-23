import { randomUUID } from 'node:crypto';
import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { completarOperacion } from '../src/modulos/operaciones/cierre.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';
import { cerrarConexiones, crearOferta, crearPublicacion, giroGastado, propietario } from './bd/apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
type Error = { error: { codigo: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

type Parametro = { clave: string; minimo: number; maximo: number; valor: number | null; costoPremios?: boolean };
type Catalogo = {
  enPausa: boolean;
  sumaActivos: number;
  valido: boolean;
  datos: Array<{
    id: string;
    nombre: string;
    tipo: string;
    puntos: number | null;
    probabilidad: number;
    stock: number | null;
    patrocinador: string | null;
    puntoEntrega: string | null;
    vigenciaCanjeDias: number | null;
    vigenteDesde: string | null;
    vigenteHasta: string | null;
    activo: boolean;
  }>;
};
type Ciudades = {
  datos: Array<{
    id: number;
    nombre: string;
    estado: string;
    listaEspera: number;
    avisadas: number;
    puedeActivar: boolean;
  }>;
};

describe('Parámetros, ciudades, premios y entregas de la administración (Fase 12B)', () => {
  let prueba: Prueba;
  let admin: string;
  let marco: string;
  let titicaca: string;
  let titicacaId: string;
  let titicacaUsuario: string;
  const parametrosCambiados = new Map<string, number>();

  beforeAll(async () => {
    prueba = await crearPrueba();
    admin = await entrar(prueba, ADMIN.telefono);
    marco = await entrar(prueba, '900000001');
    titicaca = await entrar(prueba, '900000011');
    const comprador = await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } });
    titicacaId = comprador.id;
    titicacaUsuario = comprador.usuarioId;
  });
  afterAll(async () => {
    for (const [clave, valor] of parametrosCambiados) {
      await propietario.query(
        "INSERT INTO parametro_historial (clave, valor_anterior, valor_nuevo, motivo, admin_id) SELECT $1::text, valor, $2::text, 'Restaurar prueba', (SELECT id FROM usuario WHERE rol = 'ADMIN' LIMIT 1) FROM parametro WHERE clave = $1::text",
        [clave, String(valor)],
      );
      await propietario.query('UPDATE parametro SET valor = $2::text WHERE clave = $1::text', [clave, String(valor)]);
    }
    await propietario.query("UPDATE parametro SET valor = '0' WHERE clave = 'ruleta_en_pausa'");
    await propietario.query("UPDATE premio SET activo = false WHERE nombre LIKE 'Prueba 12B%' AND activo");
    await propietario.query(
      "DELETE FROM lista_espera_ciudad WHERE ciudad_id IN (SELECT id FROM ciudad WHERE nombre LIKE 'Ciudad de prueba%')",
    );
    await propietario.query(
      "DELETE FROM zona WHERE ciudad_id IN (SELECT id FROM ciudad WHERE nombre LIKE 'Ciudad de prueba%')",
    );
    await propietario.query("DELETE FROM ciudad WHERE nombre LIKE 'Ciudad de prueba%'");
    await cerrarConexiones();
    await prueba.cerrar();
  });

  const get = (ruta: string, token: string) => prueba.http().get(`/api/v1${ruta}`).set(bearer(token));
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const put = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().put(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const MOTIVO = 'Ajuste acordado con el equipo';

  async function parametro(clave: string): Promise<Parametro> {
    const grupos = (await get('/admin/parametros', admin).expect(200)).body as {
      grupos: Array<{ parametros: Parametro[] }>;
    };
    return grupos.grupos.flatMap((g) => g.parametros).find((p) => p.clave === clave)!;
  }
  async function cambiar(clave: string, valor: number, extra: object = {}) {
    const actual = await parametro(clave);
    if (!parametrosCambiados.has(clave)) parametrosCambiados.set(clave, actual.valor!);
    return put(`/admin/parametros/${clave}`, admin, { valor, motivo: MOTIVO, ...extra });
  }
  const esperar = <T extends { status: number }>(r: T, estado: number): T => {
    expect(r.status).toBe(estado);
    return r;
  };
  const catalogo = async () => (await get('/admin/premios', admin).expect(200)).body as Catalogo;
  const aCuerpo = (c: Catalogo, cambios: (p: Catalogo['datos'][number]) => Catalogo['datos'][number] = (p) => p) =>
    c.datos.map((p) => {
      const q = cambios(p);
      return {
        id: q.id,
        nombre: q.nombre,
        tipo: q.tipo,
        puntos: q.puntos,
        probabilidad: q.probabilidad,
        stock: q.stock,
        patrocinador: q.patrocinador,
        puntoEntrega: q.puntoEntrega,
        vigenciaCanjeDias: q.vigenciaCanjeDias,
        vigenteDesde: q.vigenteDesde ? new Date(q.vigenteDesde).toISOString() : null,
        vigenteHasta: q.vigenteHasta ? new Date(q.vigenteHasta).toISOString() : null,
        activo: q.activo,
      };
    });
  async function recicladorNuevo() {
    const tel = telefono();
    const token = await nuevoReciclador(prueba, tel, 'Rosa Mamani Quispe');
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
    return { token, id: usuario.id };
  }

  describe('parámetros editables', () => {
    it('solo la administración los ve y los cambia', async () => {
      await get('/admin/parametros', marco).expect(403);
      await put('/admin/parametros/aviso_max_activos', marco, { valor: 4, motivo: MOTIVO }).expect(403);
      const lista = (await get('/admin/parametros', admin).expect(200)).body as {
        grupos: Array<{ parametros: Parametro[] }>;
        fijos: Array<{ clave: string }>;
        reglasFijas: unknown[];
      };
      const todos = lista.grupos.flatMap((g) => g.parametros);
      expect(todos.length).toBeGreaterThanOrEqual(25);
      expect(todos.every((p) => p.valor !== null && p.minimo <= p.valor && p.valor <= p.maximo)).toBe(true);
      expect(lista.fijos.map((f) => f.clave)).toEqual(expect.arrayContaining(['precio_kg_minimo', 'precio_kg_maximo']));
      expect(lista.reglasFijas.length).toBeGreaterThan(0);
    });

    it('rechaza lo que está fuera de su rango, sin motivo o que no se puede editar', async () => {
      const p = await parametro('aviso_max_activos');
      expect(codigo(esperar(await cambiar('aviso_max_activos', p.maximo + 1), 422))).toBe('VALOR_FUERA_DE_RANGO');
      expect(codigo(esperar(await cambiar('aviso_max_activos', p.minimo - 1), 422))).toBe('VALOR_FUERA_DE_RANGO');
      expect(codigo(esperar(await cambiar('aviso_max_activos', 2.5), 422))).toBe('VALOR_NO_VALIDO');
      await put('/admin/parametros/aviso_max_activos', admin, { valor: 4 }).expect(400);
      await put('/admin/parametros/aviso_max_activos', admin, { valor: 4, motivo: 'no' }).expect(400);
      expect(
        codigo(await put('/admin/parametros/precio_kg_maximo', admin, { valor: 60, motivo: MOTIVO }).expect(403)),
      ).toBe('PARAMETRO_NO_EDITABLE');
      expect(
        codigo(await put('/admin/parametros/puntos_por_kg', admin, { valor: 2, motivo: MOTIVO }).expect(403)),
      ).toBe('PARAMETRO_NO_EDITABLE');
      expect((await parametro('aviso_max_activos')).valor).toBe(p.valor);
    });

    it('un cambio válido queda con motivo y administrador en el historial y no repite el mismo valor', async () => {
      const antes = await parametro('aviso_max_activos');
      const nuevo = antes.valor === 4 ? 5 : 4;
      esperar(await cambiar('aviso_max_activos', nuevo), 200);
      expect((await parametro('aviso_max_activos')).valor).toBe(nuevo);
      const historial = (await get('/admin/parametros/aviso_max_activos/historial', admin).expect(200)).body as {
        datos: Array<{ anterior: string; nuevo: string; motivo: string; administrador: string }>;
      };
      expect(historial.datos[0]).toMatchObject({ anterior: String(antes.valor), nuevo: String(nuevo), motivo: MOTIVO });
      expect(codigo(esperar(await cambiar('aviso_max_activos', nuevo), 409))).toBe('SIN_CAMBIO');
      const auditoria = (await get('/admin/auditoria?tipo=PARAMETROS', admin).expect(200)).body as { total: number };
      expect(auditoria.total).toBeGreaterThan(0);
    });

    it('los que cambian el costo de los premios piden una confirmación más', async () => {
      const p = await parametro('puntos_por_giro');
      expect(p.costoPremios).toBe(true);
      const nuevo = p.valor === 600 ? 700 : 600;
      expect(codigo(esperar(await cambiar('puntos_por_giro', nuevo), 422))).toBe('CONFIRMACION_REQUERIDA');
      expect((await parametro('puntos_por_giro')).valor).toBe(p.valor);
      esperar(await cambiar('puntos_por_giro', nuevo, { confirmarCosto: true }), 200);
      expect((await parametro('puntos_por_giro')).valor).toBe(nuevo);
      esperar(await cambiar('puntos_por_giro', p.valor!, { confirmarCosto: true }), 200);
    });

    it('rige desde ese momento: lo publicado antes conserva su vigencia', async () => {
      const r = await recicladorNuevo();
      const id = (
        (await post('/publicaciones', r.token, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as {
          publicacion: { id: string };
        }
      ).publicacion.id;
      const antes = (await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).venceEn.getTime();
      const p = await parametro('vigencia_publicacion_dias');
      const nuevo = p.valor === 10 ? 11 : 10;
      esperar(await cambiar('vigencia_publicacion_dias', nuevo), 200);
      expect((await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).venceEn.getTime()).toBe(antes);
      const otra = (
        (await post('/publicaciones', r.token, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as {
          publicacion: { id: string };
        }
      ).publicacion.id;
      const nueva = (await prueba.bd.publicacion.findUniqueOrThrow({ where: { id: otra } })).venceEn.getTime();
      expect(Math.round((nueva - Date.now()) / 86_400_000)).toBe(nuevo);
    });

    it('los radios guardan su coherencia: el de uso por defecto no pasa del máximo', async () => {
      const maximo = await parametro('radio_maximo_km');
      const defecto = await parametro('radio_defecto_km');
      const r = await cambiar('radio_defecto_km', Math.min(defecto.maximo, maximo.valor! + 1));
      if (maximo.valor! + 1 <= defecto.maximo) expect([409, 422]).toContain(r.status);
    });
  });

  describe('ciudades, zonas y lista de espera', () => {
    const nombre = `Ciudad de prueba ${Math.random().toString(36).slice(2, 7)}`;
    let id: number;

    it('solo la administración la crea, como «Próximamente»', async () => {
      await post('/admin/ciudades', marco, { nombre, region: 'Región de prueba', motivo: MOTIVO }).expect(403);
      const creada = (
        await post('/admin/ciudades', admin, { nombre, region: 'Región de prueba', motivo: MOTIVO }).expect(201)
      ).body as {
        id: number;
        estado: string;
      };
      id = creada.id;
      expect(creada.estado).toBe('PROXIMAMENTE');
      expect(codigo(await post('/admin/ciudades', admin, { nombre, region: 'Otra', motivo: MOTIVO }).expect(409))).toBe(
        'CIUDAD_REPETIDA',
      );
    });

    it('no se activa sin sus requisitos y, con ellos, avisa una sola vez a quien esperaba', async () => {
      const a = await recicladorNuevo();
      const b = await recicladorNuevo();
      await propietario.query('INSERT INTO lista_espera_ciudad (ciudad_id, usuario_id) VALUES ($1, $2), ($1, $3)', [
        id,
        a.id,
        b.id,
      ]);
      const decision = { motivo: MOTIVO, confirmar: true };
      expect(codigo(await post(`/admin/ciudades/${id}/activar`, admin, decision).expect(409))).toBe(
        'REQUISITOS_INCOMPLETOS',
      );
      await post(`/admin/ciudades/${id}/zonas`, admin, {
        nombre: 'Centro',
        lat: -16.4,
        lng: -71.5,
        motivo: MOTIVO,
      }).expect(201);
      await put(`/admin/ciudades/${id}/requisitos`, admin, { verificadoresAsignados: true, motivo: MOTIVO }).expect(
        200,
      );
      expect(codigo(await post(`/admin/ciudades/${id}/activar`, admin, decision).expect(409))).toBe(
        'REQUISITOS_INCOMPLETOS',
      );
      await put(`/admin/ciudades/${id}/requisitos`, admin, { preciosBaseCargados: true, motivo: MOTIVO }).expect(200);
      const lista = (await get('/admin/ciudades', admin).expect(200)).body as Ciudades;
      expect(lista.datos.find((c) => c.id === id)).toMatchObject({
        listaEspera: 2,
        puedeActivar: true,
        estado: 'PROXIMAMENTE',
      });
      await post(`/admin/ciudades/${id}/activar`, admin, { motivo: MOTIVO }).expect(400);
      expect((await post(`/admin/ciudades/${id}/activar`, admin, decision).expect(200)).body).toMatchObject({
        estado: 'ACTIVA',
        avisados: 2,
      });
      expect(codigo(await post(`/admin/ciudades/${id}/activar`, admin, decision).expect(409))).toBe('CIUDAD_YA_ACTIVA');
      for (const u of [a.id, b.id]) {
        expect(await prueba.bd.notificacion.count({ where: { usuarioId: u, titulo: `Ya abrimos ${nombre}` } })).toBe(1);
      }
      const final = (await get('/admin/ciudades', admin).expect(200)).body as Ciudades;
      expect(final.datos.find((c) => c.id === id)).toMatchObject({ estado: 'ACTIVA', avisadas: 2 });
    });

    it('vuelve a «Próximamente» solo si nadie la usa y queda en la auditoría', async () => {
      const decision = { motivo: MOTIVO, confirmar: true };
      expect((await post(`/admin/ciudades/${id}/desactivar`, admin, decision).expect(200)).body).toMatchObject({
        estado: 'PROXIMAMENTE',
      });
      const activa = (await get('/admin/ciudades', admin).expect(200)).body as Ciudades;
      const juliaca = activa.datos.find((c) => c.nombre === 'Juliaca')!;
      expect(codigo(await post(`/admin/ciudades/${juliaca.id}/desactivar`, admin, decision).expect(409))).toMatch(
        /CIUDAD_EN_USO|CIUDAD_NO_ACTIVA/,
      );
      const auditoria = (await get('/admin/auditoria?tipo=CIUDADES', admin).expect(200)).body as { total: number };
      expect(auditoria.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('catálogo de premios', () => {
    it('solo la administración lo ve y lo guarda', async () => {
      await get('/admin/premios', marco).expect(403);
      const c = await catalogo();
      await put('/admin/premios', marco, { premios: aCuerpo(c), motivo: MOTIVO }).expect(403);
      expect(c.valido).toBe(true);
      expect(c.sumaActivos).toBe(100);
    });

    it('no guarda si las probabilidades no suman 100 %, o si falta «Sigue intentando»', async () => {
      const c = await catalogo();
      const sube = aCuerpo(c, (p) =>
        p.activo && p.tipo !== 'SIN_PREMIO' ? { ...p, probabilidad: p.probabilidad + 1 } : p,
      );
      const r = await put('/admin/premios', admin, { premios: sube.slice(0, 20), motivo: MOTIVO });
      expect([409, 422]).toContain(r.status);
      expect(codigo(r)).toBe('CATALOGO_NO_VALIDO');
      const sin = aCuerpo(c, (p) => (p.tipo === 'SIN_PREMIO' ? { ...p, activo: false } : p));
      expect(codigo(await put('/admin/premios', admin, { premios: sin, motivo: MOTIVO }))).toBe('CATALOGO_NO_VALIDO');
      expect((await catalogo()).sumaActivos).toBe(100);
    });

    it('solo existen tres tipos de premio', async () => {
      const c = await catalogo();
      const raro = aCuerpo(c);
      raro.push({
        ...raro[0]!,
        id: undefined as unknown as string,
        nombre: 'Dinero en efectivo',
        tipo: 'EFECTIVO',
        probabilidad: 0,
        activo: false,
      });
      await put('/admin/premios', admin, { premios: raro, motivo: MOTIVO }).expect(400);
    });

    it('un premio que ya salió no se borra: omitirlo se rechaza y solo se desactiva', async () => {
      const r = await recicladorNuevo();
      const c0 = await catalogo();
      const base = c0.datos.find((p) => p.tipo === 'OBJETO' && p.activo)!;
      const giro = await giroGastado(r.id);
      const config = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;
      await propietario.query(
        'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4)',
        [giro, r.id, config, base.id],
      );
      const c = await catalogo();
      const sinEl = aCuerpo(c).filter((p) => p.id !== base.id);
      expect(codigo(await put('/admin/premios', admin, { premios: sinEl, motivo: MOTIVO }))).toBe('PREMIO_OMITIDO');
      const renombrado = aCuerpo(c, (p) => (p.id === base.id ? { ...p, nombre: 'Otro nombre' } : p));
      expect(codigo(await put('/admin/premios', admin, { premios: renombrado, motivo: MOTIVO }))).toBe(
        'PREMIO_GANADO_BLOQUEADO',
      );
      expect(await prueba.bd.premio.count({ where: { id: base.id } })).toBe(1);
    });

    it('cambiar probabilidades o stock no altera lo que ya salió y rige para los giros siguientes', async () => {
      const antes = (
        await propietario.query(
          'SELECT id, giro_id, configuracion_id, numero_sorteado, premio_id FROM sorteo_ruleta ORDER BY id',
        )
      ).rows;
      const antesConfig = (await propietario.query('SELECT count(*)::int AS n FROM ruleta_configuracion')).rows[0]
        .n as number;
      const c = await catalogo();
      const [a, b] = c.datos.filter((p) => p.activo && p.tipo === 'PUNTOS' && p.probabilidad >= 1);
      expect(a && b).toBeTruthy();
      const cambio = aCuerpo(c, (p) =>
        p.id === a!.id
          ? { ...p, probabilidad: Math.round((p.probabilidad - 0.5) * 100) / 100 }
          : p.id === b!.id
            ? { ...p, probabilidad: Math.round((p.probabilidad + 0.5) * 100) / 100 }
            : p,
      );
      await put('/admin/premios', admin, { premios: cambio, motivo: MOTIVO }).expect(200);
      expect(
        (
          await propietario.query(
            'SELECT id, giro_id, configuracion_id, numero_sorteado, premio_id FROM sorteo_ruleta ORDER BY id',
          )
        ).rows,
      ).toEqual(antes);
      expect((await propietario.query('SELECT count(*)::int AS n FROM ruleta_configuracion')).rows[0].n).toBe(
        antesConfig + 1,
      );
      expect((await catalogo()).sumaActivos).toBe(100);
      await put('/admin/premios', admin, { premios: aCuerpo(c), motivo: MOTIVO }).expect(200);
    });

    it('repone stock con motivo y queda en la auditoría', async () => {
      const c = await catalogo();
      const objeto = c.datos.find((p) => p.tipo === 'OBJETO' && p.activo && p.stock !== null)!;
      await post(`/admin/premios/${objeto.id}/reponer`, marco, { cantidad: 5, motivo: MOTIVO }).expect(403);
      await post(`/admin/premios/${objeto.id}/reponer`, admin, { cantidad: 5 }).expect(400);
      await post(`/admin/premios/${objeto.id}/reponer`, admin, { cantidad: 0, motivo: MOTIVO }).expect(400);
      const hecho = (
        await post(`/admin/premios/${objeto.id}/reponer`, admin, { cantidad: 5, motivo: MOTIVO }).expect(200)
      ).body as { stock: number };
      expect(hecho.stock).toBe(objeto.stock! + 5);
      const sinStock = c.datos.find((p) => p.tipo === 'SIN_PREMIO')!;
      expect([409, 422]).toContain(
        (await post(`/admin/premios/${sinStock.id}/reponer`, admin, { cantidad: 5, motivo: MOTIVO })).status,
      );
      const auditoria = (await get('/admin/auditoria?tipo=PREMIOS', admin).expect(200)).body as { total: number };
      expect(auditoria.total).toBeGreaterThan(0);
    });
  });

  describe('entregas de premios', () => {
    async function reclamado() {
      const r = await recicladorNuevo();
      const nombre = `Prueba 12B ${Math.random().toString(36).slice(2, 7)}`;
      const premio = (
        await propietario.query(
          "INSERT INTO premio (nombre, tipo, probabilidad, stock, punto_entrega, vigencia_canje_dias, activo, orden) VALUES ($1, 'OBJETO', 0, 5, 'Punto de prueba', 30, true, 97) RETURNING id",
          [nombre],
        )
      ).rows[0].id as string;
      const giro = await giroGastado(r.id);
      const config = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;
      const sorteo = (
        await propietario.query(
          'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
          [giro, r.id, config, premio],
        )
      ).rows[0].id as string;
      const codigoPremio = `RM-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')}`;
      const ganado = (
        await propietario.query(
          "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, $4, 'Punto de prueba', now() + interval '30 days') RETURNING id",
          [sorteo, r.id, premio, codigoPremio],
        )
      ).rows[0].id as string;
      return { ...r, ganado, codigo: codigoPremio, nombre };
    }

    it('solo se entrega lo reclamado, con su código, solo por la administración, y avisa a la persona', async () => {
      const p = await reclamado();
      expect(codigo(await post('/admin/premios-entregas', admin, { codigo: p.codigo }).expect(409))).toBe(
        'PREMIO_NO_RECLAMADO',
      );
      await post(`/yo/premios/${p.ganado}/reclamar`, p.token).expect(200);
      await post('/admin/premios-entregas', p.token, { codigo: p.codigo }).expect(403);
      await post('/admin/premios-entregas', marco, { codigo: p.codigo }).expect(403);
      await post('/admin/premios-entregas', admin, { codigo: 'ABC' }).expect(400);
      await post('/admin/premios-entregas', admin, { codigo: 'RM-ZZZZ' }).expect(404);
      const cola = (await get('/admin/premios-entregas?estado=por-entregar', admin).expect(200)).body as {
        conteos: Record<string, number>;
        datos: Array<{ codigo: string; persona: string }>;
      };
      expect(cola.datos.map((d) => d.codigo)).toContain(p.codigo);
      const hecho = (
        await post('/admin/premios-entregas', admin, {
          codigo: p.codigo.toLowerCase(),
          nota: 'Entregado en mostrador',
        }).expect(200)
      ).body;
      expect(hecho).toMatchObject({ codigo: p.codigo, estado: 'ENTREGADO' });
      expect(
        await prueba.bd.notificacion.count({
          where: { usuarioId: p.id, titulo: { contains: 'Te entregamos tu premio' } },
        }),
      ).toBe(1);
      expect(codigo(await post('/admin/premios-entregas', admin, { codigo: p.codigo }).expect(409))).toBe(
        'PREMIO_YA_ENTREGADO',
      );
      const entregados = (await get('/admin/premios-entregas?estado=entregados', admin).expect(200)).body as {
        datos: Array<{ codigo: string }>;
      };
      expect(entregados.datos.map((d) => d.codigo)).toContain(p.codigo);
    });

    it('un premio entregado, ganado y reclamado no se puede editar ni borrar desde el catálogo', async () => {
      const c = await catalogo();
      const ganado = c.datos.find((p) => p.nombre.startsWith('Prueba 12B'))!;
      expect(ganado).toBeTruthy();
      const sinEl = aCuerpo(c).filter((p) => p.id !== ganado.id);
      expect(codigo(await put('/admin/premios', admin, { premios: sinEl, motivo: MOTIVO }))).toBe('PREMIO_OMITIDO');
    });
  });

  describe('pausa de la ruleta', () => {
    async function completada(recicladorId: string, kg: number) {
      const publicacionId = await crearPublicacion(recicladorId, { codigoMaterial: 'pet', kg });
      const ofertaId = await crearOferta(publicacionId, titicacaId);
      await propietario.query("UPDATE oferta SET estado = 'ACEPTADA' WHERE id = $1", [ofertaId]);
      await propietario.query("UPDATE publicacion SET estado = 'EN_NEGOCIACION' WHERE id = $1", [publicacionId]);
      const nueva = await propietario.query(
        'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [publicacionId, ofertaId, recicladorId, titicacaId],
      );
      const operacionId = (nueva.rows[0] as { id: string }).id;
      for (const e of ['EN_COORDINACION', 'ENTREGADA'])
        await propietario.query('UPDATE operacion SET estado = $2 WHERE id = $1', [operacionId, e]);
      await propietario.query(
        "UPDATE operacion SET estado = 'CONFIRMADA', kg_final = $2, monto_final = $3, confirmada_en = now() WHERE id = $1",
        [operacionId, kg, kg * 2.5],
      );
      await prueba.bd.$transaction((tx) => completarOperacion(tx, operacionId, { porPlazo: false, ahora: new Date() }));
    }

    it('con la ruleta en pausa nadie gira, conserva sus giros y reclama sus premios; al reanudar, gira', async () => {
      const r = await recicladorNuevo();
      await completada(r.id, 500);
      const estado = async () =>
        (await get('/yo/ruleta', r.token).expect(200)).body as {
          puedeGirar: boolean;
          enPausa: boolean;
          giros: { disponibles: number };
        };
      expect(await estado()).toMatchObject({ puedeGirar: true, enPausa: false, giros: { disponibles: 1 } });
      await post('/admin/ruleta/pausar', marco, { motivo: MOTIVO, confirmar: true }).expect(403);
      await post('/admin/ruleta/pausar', admin, { motivo: MOTIVO }).expect(400);
      await post('/admin/ruleta/pausar', admin, { motivo: MOTIVO, confirmar: true }).expect(200);
      expect(codigo(await post('/admin/ruleta/pausar', admin, { motivo: MOTIVO, confirmar: true }).expect(409))).toBe(
        'RULETA_YA_EN_PAUSA',
      );
      try {
        expect(await estado()).toMatchObject({ puedeGirar: false, enPausa: true, giros: { disponibles: 1 } });
        expect(codigo(await post('/yo/ruleta/girar', r.token, { clave: randomUUID() }).expect(409))).toBe(
          'RULETA_EN_PAUSA',
        );
        expect((await estado()).giros.disponibles).toBe(1);
        const catalogoPausa = await catalogo();
        expect(catalogoPausa.enPausa).toBe(true);
        // Un premio ya ganado sigue reclamándose
        const premio = (
          await propietario.query(
            "INSERT INTO premio (nombre, tipo, probabilidad, stock, punto_entrega, vigencia_canje_dias, activo, orden) VALUES ($1, 'OBJETO', 0, 5, 'Punto', 30, true, 96) RETURNING id",
            [`Prueba 12B pausa ${Math.random().toString(36).slice(2, 6)}`],
          )
        ).rows[0].id as string;
        const giro = await giroGastado(r.id);
        const config = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;
        const sorteo = (
          await propietario.query(
            'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
            [giro, r.id, config, premio],
          )
        ).rows[0].id as string;
        const ganado = (
          await propietario.query(
            "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, 'RM-PAUS', 'Punto', now() + interval '30 days') RETURNING id",
            [sorteo, r.id, premio],
          )
        ).rows[0].id as string;
        await post(`/yo/premios/${ganado}/reclamar`, r.token).expect(200);
      } finally {
        await post('/admin/ruleta/reanudar', admin, { motivo: MOTIVO, confirmar: true }).expect(200);
      }
      expect(codigo(await post('/admin/ruleta/reanudar', admin, { motivo: MOTIVO, confirmar: true }).expect(409))).toBe(
        'RULETA_YA_EN_MARCHA',
      );
      expect(await estado()).toMatchObject({ puedeGirar: true, enPausa: false });
      await post('/yo/ruleta/girar', r.token, { clave: randomUUID() }).expect(200);
    });
  });

  describe('panel de inicio: bloques nuevos', () => {
    it('muestra parámetros recientes, ciudades y estado de la ruleta, solo con conteos', async () => {
      const panel = (await get('/admin/panel', admin).expect(200)).body as {
        bloques: {
          parametros: Array<{ clave: string; motivo: string }>;
          ciudades: Array<{ nombre: string; estado: string; listaEspera: number }>;
          ruleta: { enPausa: boolean; girosUsados: number; premiosPorEntregar: number; stockBajo: number };
        };
      };
      expect(panel.bloques.parametros.length).toBeGreaterThan(0);
      expect(panel.bloques.ciudades.some((c) => c.nombre === 'Juliaca')).toBe(true);
      expect(Object.keys(panel.bloques.ruleta)).toEqual(
        expect.arrayContaining(['enPausa', 'girosUsados', 'premiosPorEntregar', 'stockBajo']),
      );
      await get('/admin/panel', marco).expect(403);
    });
  });

  describe('ajustes de la 12A: operaciones con una cuenta suspendida', () => {
    const suspender = (id: string) =>
      post(`/admin/usuarios/${id}/suspender`, admin, {
        motivo: 'Información falsa',
        nota: 'Prueba de la fase',
        confirmar: true,
      });
    const reactivar = (id: string) =>
      post(`/admin/usuarios/${id}/reactivar`, admin, { motivo: 'Aclaró lo ocurrido', confirmar: true });
    async function enCurso(r: { token: string }, hasta: 'aceptada' | 'entregada' | 'confirmada') {
      const pub = (
        (await post('/publicaciones', r.token, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as { publicacion: { id: string } }
      ).publicacion.id;
      const oferta = (
        (await post(`/negocio/publicaciones/${pub}/ofertas`, titicaca, { precioKg: 2.5 }).expect(201)).body as {
          id: string;
        }
      ).id;
      const { operacionId } = (await post(`/ofertas/${oferta}/aceptar`, r.token).expect(200)).body as {
        operacionId: string;
      };
      if (hasta === 'aceptada') return operacionId;
      await post(`/operaciones/${operacionId}/coordinar`, r.token, {
        tipo: 'REFERENCIA',
        referencia: 'Frente al mercado',
      }).expect(200);
      await post(`/operaciones/${operacionId}/entregar`, r.token).expect(200);
      if (hasta === 'entregada') return operacionId;
      await post(`/operaciones/${operacionId}/confirmar`, titicaca, { kgRecibidos: 20 }).expect(200);
      return operacionId;
    }

    it('con el reciclador suspendido, el negocio no confirma kilos pero sí reporta un problema', async () => {
      const r = await recicladorNuevo();
      const op = await enCurso(r, 'entregada');
      await suspender(r.id).expect(200);
      try {
        expect(codigo(await post(`/operaciones/${op}/confirmar`, titicaca, { kgRecibidos: 20 }).expect(409))).toBe(
          'CONTRAPARTE_SUSPENDIDA',
        );
        await post(`/operaciones/${op}/problema`, titicaca, {
          tipo: 'OTRO',
          detalle: 'El reciclador no responde y no puedo cerrar.',
        }).expect(201);
      } finally {
        await reactivar(r.id).expect(200);
      }
      await post(`/operaciones/${op}/confirmar`, titicaca, { kgRecibidos: 20 }).expect(200);
    });

    it('con el negocio suspendido, el reciclador no da su conforme y la operación no se cierra sola', async () => {
      const r = await recicladorNuevo();
      const op = await enCurso(r, 'confirmada');
      await suspender(titicacaUsuario).expect(200);
      try {
        expect(codigo(await post(`/operaciones/${op}/conforme`, r.token).expect(409))).toBe('CONTRAPARTE_SUSPENDIDA');
        await propietario.query("UPDATE operacion SET confirmada_en = now() - interval '100 hours' WHERE id = $1", [
          op,
        ]);
        const { OperacionesService } = await import('../src/modulos/operaciones/operaciones.service.js');
        await prueba.app.get(OperacionesService).cerrarPorPlazo(op);
        expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: op } })).estado).toBe('CONFIRMADA');
      } finally {
        await reactivar(titicacaUsuario).expect(200);
      }
      await post(`/operaciones/${op}/conforme`, r.token).expect(200);
    });

    it('con una cuenta suspendida, la otra parte puede cancelar si aún no se entregó', async () => {
      const r = await recicladorNuevo();
      const op = await enCurso(r, 'aceptada');
      await suspender(r.id).expect(200);
      try {
        await post(`/operaciones/${op}/cancelar`, titicaca, {
          motivo: 'La cuenta del reciclador fue suspendida',
        }).expect(200);
      } finally {
        await reactivar(r.id).expect(200);
      }
      expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: op } })).estado).toBe('CANCELADA');
    });

    it('la publicación que vuelve al reactivar conserva su vencimiento original', async () => {
      const r = await recicladorNuevo();
      const id = (
        (await post('/publicaciones', r.token, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as { publicacion: { id: string } }
      ).publicacion.id;
      const antes = (await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } })).venceEn.getTime();
      await suspender(r.id).expect(200);
      await propietario.query("UPDATE parametro SET valor = valor WHERE clave = 'vigencia_publicacion_dias'");
      await reactivar(r.id).expect(200);
      const despues = await prueba.bd.publicacion.findUniqueOrThrow({ where: { id } });
      expect(despues.venceEn.getTime()).toBe(antes);
      expect(despues.estado).toBe('DISPONIBLE');
    });
  });
});
