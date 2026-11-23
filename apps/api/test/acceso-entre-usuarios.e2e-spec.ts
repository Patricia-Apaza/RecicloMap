import { randomUUID } from 'node:crypto';
import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { bearer, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';
import { listarRutas } from './apoyo-rutas.js';
import { cerrarConexiones, giroGastado, propietario } from './bd/apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const RECHAZOS = [400, 401, 403, 404, 409, 422];
const UUID_AJENO = '00000000-0000-4000-8000-000000000001';

// Rutas con identificador que son públicas o compartidas a propósito, con su razón
const COMPARTIDAS: Record<string, string> = {
  'GET /api/v1/ciudades/:id/zonas': 'catálogo público',
  'GET /api/v1/compradores/:id': 'ficha pública de un negocio verificado',
  'GET /api/v1/compradores/:id/avisos': 'avisos públicos de un negocio verificado',
  'GET /api/v1/compradores/:id/ruta': 'ruta pública de un comprador móvil verificado',
  'GET /api/v1/negocios/:id/resenas': 'reseñas públicas de un negocio',
  'POST /api/v1/compradores/:id/visitas': 'estadística de visita a una ficha pública',
  'POST /api/v1/compradores/:id/solicitudes-llegada': 'estadística de «Cómo llegar» a una ficha pública',
  'POST /api/v1/negocio/publicaciones/:id/ofertas':
    'todo negocio verificado de la ciudad ve y oferta (regla de visibilidad)',
  'GET /api/v1/negocio/publicaciones/:id':
    'todo negocio verificado de la ciudad ve las publicaciones (regla de visibilidad)',
  'POST /api/v1/yo/lista-espera/:ciudadId': 'la persona se anota a sí misma',
  'PUT /api/v1/favoritos/:compradorId': 'la persona guarda un negocio público para sí misma',
  'DELETE /api/v1/favoritos/:compradorId': 'solo toca los favoritos de quien llama',
  'PATCH /api/v1/favoritos/:compradorId/alertas': 'solo toca los favoritos de quien llama',
  'POST /api/v1/yo/desafios/:id/reclamar': 'los desafíos del mes son iguales para todos; cada quien reclama el suyo',
};

describe('Control de acceso: nadie llega por identificador a lo de otra persona (Fase 13B)', () => {
  let prueba: Prueba;
  const t = { admin: '', titicaca: '', eco: '', movil: '', victima: '', otro: '' };
  type Quien = keyof typeof t;
  const ids = {
    victima: '',
    compradorTiticaca: '',
    publicacion: '',
    oferta: '',
    operacion: '',
    publicacion2: '',
    oferta2: '',
    entrega: '',
    notificacion: '',
    busqueda: '',
    foto: '',
    premio: '',
    aviso: '',
  };
  const marcas: string[] = [];

  beforeAll(async () => {
    prueba = await crearPrueba();
    t.admin = await entrar(prueba, ADMIN.telefono);
    t.titicaca = await entrar(prueba, '900000011');
    t.eco = await entrar(prueba, '900000012');
    t.movil = await entrar(prueba, '900000022');
    const tel = telefono();
    t.victima = await nuevoReciclador(prueba, tel, 'Vicente Victima Quispe');
    t.otro = await nuevoReciclador(prueba, telefono(), 'Otto Intruso Mamani');
    const victima = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
    ids.victima = victima.id;
    marcas.push(tel, 'Vicente Victima');
    const comprador = await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } });
    ids.compradorTiticaca = comprador.id;

    const publicar = async () =>
      (
        (await post('/publicaciones', t.victima, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as { publicacion: { id: string } }
      ).publicacion.id;
    ids.publicacion = await publicar();
    ids.oferta = (
      (await post(`/negocio/publicaciones/${ids.publicacion}/ofertas`, t.titicaca, { precioKg: 2.5 }).expect(201))
        .body as { id: string }
    ).id;
    ids.operacion = (
      (await post(`/ofertas/${ids.oferta}/aceptar`, t.victima).expect(200)).body as { operacionId: string }
    ).operacionId;
    ids.publicacion2 = await publicar();
    ids.oferta2 = (
      (await post(`/negocio/publicaciones/${ids.publicacion2}/ofertas`, t.titicaca, { precioKg: 2.7 }).expect(201))
        .body as { id: string }
    ).id;
    ids.entrega = (
      (
        await post('/registros-directos', t.victima, {
          compradorId: ids.compradorTiticaca,
          material: 'pet',
          kg: 9,
        }).expect(201)
      ).body as { id: string }
    ).id;
    ids.notificacion = (
      await propietario.query('SELECT id FROM notificacion WHERE usuario_id = $1 LIMIT 1', [ids.victima])
    ).rows[0].id as string;
    ids.busqueda = (
      await propietario.query(
        "INSERT INTO busqueda_guardada (usuario_id, nombre, filtros) VALUES ($1, 'Mi búsqueda', '{}') RETURNING id",
        [ids.victima],
      )
    ).rows[0].id as string;
    const clave = `perfil/${randomUUID()}.webp`;
    ids.foto = (
      await propietario.query(
        "INSERT INTO archivo (propietario_id, proposito, clave, tipo_mime, bytes) VALUES ($1, 'PERFIL', $2, 'image/webp', 4) RETURNING id",
        [ids.victima, clave],
      )
    ).rows[0].id as string;
    await propietario.query('UPDATE usuario SET foto_id = $2 WHERE id = $1', [ids.victima, ids.foto]);
    const premio = (await propietario.query("SELECT id FROM premio WHERE tipo = 'OBJETO' AND activo LIMIT 1")).rows[0]
      .id as string;
    const giro = await giroGastado(ids.victima);
    const config = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;
    const sorteo = (
      await propietario.query(
        'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
        [giro, ids.victima, config, premio],
      )
    ).rows[0].id as string;
    ids.premio = (
      await propietario.query(
        "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, 'RM-AC01', 'Punto', now() + interval '20 days') RETURNING id",
        [sorteo, ids.victima, premio],
      )
    ).rows[0].id as string;
    ids.aviso = (
      await propietario
        .query(
          "INSERT INTO aviso (comprador_id, tipo, titulo, vigente_hasta) VALUES ($1, 'PROMOCION', 'Aviso de prueba', current_date + 5) RETURNING id",
          [ids.compradorTiticaca],
        )
        .catch(() => ({ rows: [{ id: UUID_AJENO }] }))
    ).rows[0].id as string;
  });
  afterAll(async () => {
    await cerrarConexiones();
    await prueba.cerrar();
  });

  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const llamar = (metodo: string, ruta: string, token: string | null, cuerpo: object = {}) => {
    const r = prueba.http()[metodo.toLowerCase() as 'get'](ruta);
    if (token) r.set(bearer(token));
    return metodo === 'GET' || metodo === 'DELETE' ? r : r.send(cuerpo);
  };
  const sinFuga = (cuerpo: unknown) => {
    const texto = JSON.stringify(cuerpo);
    for (const marca of marcas) expect(texto).not.toContain(marca);
  };

  // Recursos de la víctima y de Titicaca: ruta → quiénes NO deben poder usarla → cuerpo válido para que llegue a la comprobación de dueño
  const ATAC = (...quienes: Quien[]): Quien[] => quienes;
  const duenos = () => {
    const op = `/api/v1/operaciones/${ids.operacion}`;
    const cuerpoOp: Record<string, object> = {
      coordinar: { tipo: 'REFERENCIA', referencia: 'Frente al mercado' },
      entregar: {},
      confirmar: { kgRecibidos: 20 },
      conforme: {},
      'no-conforme': { detalle: 'Los kilos no coinciden con lo acordado.' },
      incidencia: { detalle: 'No responde desde hace varios días.' },
      problema: { tipo: 'OTRO', detalle: 'Hubo un problema con el pago acordado.' },
      cancelar: { motivo: 'Ya no puedo' },
      calificacion: { estrellas: 5 },
    };
    const lista: Array<[string, string, object, Quien[]]> = [
      ['GET', op, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      ...Object.entries(cuerpoOp).map(([accion, cuerpo]): [string, string, object, Quien[]] => [
        'POST',
        `${op}/${accion}`,
        cuerpo,
        ATAC('otro', 'eco', 'movil', 'admin'),
      ]),
      ['POST', `/api/v1/ofertas/${ids.oferta2}/aceptar`, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      ['POST', `/api/v1/ofertas/${ids.oferta2}/rechazar`, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      ['GET', `/api/v1/publicaciones/${ids.publicacion2}`, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      ['GET', `/api/v1/publicaciones/${ids.publicacion2}/ofertas`, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      ['PUT', `/api/v1/publicaciones/${ids.publicacion2}`, { kg: 5 }, ATAC('otro', 'eco', 'movil', 'admin')],
      ['POST', `/api/v1/publicaciones/${ids.publicacion2}/cancelar`, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      ['POST', `/api/v1/publicaciones/${ids.publicacion2}/renovar`, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      ['POST', `/api/v1/publicaciones/${ids.publicacion2}/duplicar`, {}, ATAC('otro', 'eco', 'movil', 'admin')],
      [
        'POST',
        `/api/v1/publicaciones/${ids.publicacion2}/volver-a-publicar`,
        {},
        ATAC('otro', 'eco', 'movil', 'admin'),
      ],
      [
        'PUT',
        `/api/v1/negocio/ofertas/${ids.oferta2}`,
        { precioKg: 9 },
        ATAC('victima', 'otro', 'eco', 'movil', 'admin'),
      ],
      ['POST', `/api/v1/negocio/ofertas/${ids.oferta2}/retirar`, {}, ATAC('victima', 'otro', 'eco', 'movil', 'admin')],
      [
        'POST',
        `/api/v1/mi-negocio/entregas-directas/${ids.entrega}/confirmar`,
        { kg: 9 },
        ATAC('victima', 'otro', 'eco', 'movil', 'admin'),
      ],
      [
        'POST',
        `/api/v1/mi-negocio/entregas-directas/${ids.entrega}/rechazar`,
        { motivo: 'No coincide' },
        ATAC('victima', 'otro', 'eco', 'movil', 'admin'),
      ],
      ['DELETE', `/api/v1/mi-negocio/avisos/${ids.aviso}`, {}, ATAC('victima', 'otro', 'eco', 'movil', 'admin')],
      [
        'POST',
        `/api/v1/notificaciones/${ids.notificacion}/leer`,
        {},
        ATAC('otro', 'eco', 'movil', 'titicaca', 'admin'),
      ],
      ['DELETE', `/api/v1/busquedas/${ids.busqueda}`, {}, ATAC('otro', 'eco', 'movil', 'titicaca', 'admin')],
      ['POST', `/api/v1/yo/premios/${ids.premio}/reclamar`, {}, ATAC('otro', 'eco', 'movil', 'titicaca', 'admin')],
      [
        'POST',
        `/api/v1/yo/premios/${ids.premio}/renunciar`,
        { confirmar: true },
        ATAC('otro', 'eco', 'movil', 'titicaca', 'admin'),
      ],
      ['DELETE', `/api/v1/fotos/${ids.foto}`, {}, ATAC('otro', 'eco', 'movil', 'titicaca', 'admin')],
      ['GET', `/api/v1/fotos/${ids.foto}`, {}, ATAC('otro', 'eco', 'movil', 'titicaca')],
      [
        'POST',
        `/api/v1/resenas/${UUID_AJENO}/respuesta`,
        { texto: 'Gracias por tu reseña' },
        ATAC('otro', 'victima', 'eco', 'movil', 'titicaca', 'admin'),
      ],
      [
        'POST',
        `/api/v1/resenas/${UUID_AJENO}/reportes`,
        { motivo: 'OFENSIVA' },
        ATAC('titicaca', 'eco', 'movil', 'admin'),
      ],
      [
        'POST',
        `/api/v1/mi-negocio/reportes/${UUID_AJENO}/corregido`,
        {},
        ATAC('victima', 'otro', 'eco', 'movil', 'admin'),
      ],
      ['GET', `/api/v1/negocio/publicaciones/${ids.publicacion2}`, {}, ATAC('otro', 'victima', 'admin')],
    ];
    return lista;
  };

  it('toda ruta con identificador está en la matriz o es pública a propósito', () => {
    const cubiertas = new Set<string>();
    for (const [metodo, ruta] of duenos())
      cubiertas.add(`${metodo} ${ruta.split('?')[0]!.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')}`);
    const sinCubrir = listarRutas(prueba.app)
      .filter((r) => r.ruta.includes(':') && !r.ruta.startsWith('/api/v1/admin/'))
      .map((r) => `${r.metodo} ${r.ruta}`)
      .filter((clave) => !cubiertas.has(clave.replace(/:\w+/g, ':id')) && !COMPARTIDAS[clave]);
    expect(sinCubrir).toEqual([]);
  });

  it('nadie llega a lo ajeno: cada rol y cada ruta con identificador responde un rechazo, sin fugas', async () => {
    for (const [metodo, ruta, cuerpo, atacantes] of duenos()) {
      for (const quien of atacantes) {
        const r = await llamar(metodo, ruta, t[quien], cuerpo);
        expect(RECHAZOS, `${quien} ${metodo} ${ruta} respondió ${r.status}`).toContain(r.status);
        sinFuga(r.body);
      }
      const anonimo = await llamar(metodo, ruta, null, cuerpo);
      if (!ruta.includes('/fotos/'))
        expect([401, 403], `sin sesión ${metodo} ${ruta} respondió ${anonimo.status}`).toContain(anonimo.status);
      else expect([401, 403, 404]).toContain(anonimo.status);
    }
  });

  it('las operaciones ajenas responden 403 o 404, no un error por el estado', async () => {
    for (const quien of ['otro', 'eco', 'movil']) {
      for (const accion of ['coordinar', 'entregar', 'confirmar', 'conforme', 'cancelar']) {
        const cuerpo =
          accion === 'coordinar'
            ? { tipo: 'REFERENCIA', referencia: 'Frente al mercado' }
            : accion === 'confirmar'
              ? { kgRecibidos: 20 }
              : accion === 'cancelar'
                ? { motivo: 'Ya no puedo' }
                : {};
        const r = await post(`/operaciones/${ids.operacion}/${accion}`, t[quien as Quien], cuerpo);
        expect([403, 404], `${quien} ${accion} respondió ${r.status}`).toContain(r.status);
      }
      expect([403, 404]).toContain(
        (
          await prueba
            .http()
            .get(`/api/v1/operaciones/${ids.operacion}`)
            .set(bearer(t[quien as Quien]))
        ).status,
      );
    }
  });

  it('las rutas de administración responden 401 o 403 a cualquiera que no sea administrador', async () => {
    const rutas = listarRutas(prueba.app).filter((r) => r.ruta.startsWith('/api/v1/admin/'));
    expect(rutas.length).toBeGreaterThan(40);
    for (const r of rutas) {
      const ruta = r.ruta.replace(/:(\w+)/g, (_m, nombre: string) =>
        /^(id|ciudadId)$/.test(nombre) && /ciudades|zonas/.test(r.ruta)
          ? '1'
          : nombre === 'clave'
            ? 'aviso_max_activos'
            : UUID_AJENO,
      );
      for (const quien of ['victima', 'titicaca', 'eco', 'movil']) {
        const respuesta = await llamar(r.metodo, ruta, t[quien as Quien], {});
        expect(respuesta.status, `${quien} ${r.metodo} ${ruta}`).toBe(403);
      }
      expect((await llamar(r.metodo, ruta, null, {})).status, `sin sesión ${r.metodo} ${ruta}`).toBe(401);
    }
  });

  it('las rutas de un rol responden 403 a los otros roles', async () => {
    const casos: Array<[string, string, string[]]> = [
      ['GET', '/api/v1/yo/ruleta', ['titicaca', 'eco', 'movil', 'admin']],
      ['GET', '/api/v1/yo/premios', ['titicaca', 'eco', 'movil', 'admin']],
      ['POST', '/api/v1/publicaciones', ['titicaca', 'eco', 'movil', 'admin']],
      ['GET', '/api/v1/mi-negocio/entregas-directas', ['victima', 'admin']],
      ['GET', '/api/v1/negocio/publicaciones', ['victima', 'otro', 'admin']],
      ['GET', '/api/v1/negocio/estadisticas', ['victima', 'otro', 'admin']],
    ];
    for (const [metodo, ruta, quienes] of casos) {
      for (const quien of quienes) {
        const r = await llamar(metodo, ruta, t[quien as Quien], { material: 'pet', kg: 5 });
        expect([403, 404], `${quien} ${metodo} ${ruta} respondió ${r.status}`).toContain(r.status);
      }
    }
  });
});
