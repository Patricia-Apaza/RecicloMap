import { randomUUID } from 'node:crypto';
import { VERSION_TEXTOS_LEGALES } from '@reciclomap/shared';
import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { completarOperacion } from '../src/modulos/operaciones/cierre.js';
import { AlmacenMemoria, Almacen } from '../src/modulos/fotos/almacen.js';
import { EliminacionService } from '../src/modulos/privacidad/eliminacion.service.js';
import { RetencionService } from '../src/modulos/privacidad/retencion.service.js';
import { bearer, CLAVE, crearPrueba, entrar, nuevoReciclador, type Prueba } from './apoyo.js';
import { cerrarConexiones, crearOferta, crearPublicacion, giroGastado, propietario, sinReglas } from './bd/apoyo.js';

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
type Error = { error: { codigo: string; detalles?: Array<{ campo: string; mensaje: string }> } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const DIA = 86_400_000;

describe('Privacidad: exportar datos, eliminar cuenta, consentimientos y retención (Fase 13A)', () => {
  let prueba: Prueba;
  let admin: string;
  let titicaca: string;
  let titicacaId: string;
  let titicacaUsuario: string;

  beforeAll(async () => {
    prueba = await crearPrueba();
    admin = await entrar(prueba, ADMIN.telefono);
    titicaca = await entrar(prueba, '900000011');
    const comprador = await prueba.bd.comprador.findFirstOrThrow({ where: { nombreComercial: 'Acopio Titicaca' } });
    titicacaId = comprador.id;
    titicacaUsuario = comprador.usuarioId;
  });
  afterAll(async () => {
    await cerrarConexiones();
    await prueba.cerrar();
  });

  const get = (ruta: string, token: string) => prueba.http().get(`/api/v1${ruta}`).set(bearer(token));
  const post = (ruta: string, token: string, cuerpo: object = {}) =>
    prueba.http().post(`/api/v1${ruta}`).set(bearer(token)).send(cuerpo);
  const eliminarSolicitud = (token: string) => prueba.http().delete('/api/v1/yo/eliminacion').set(bearer(token));

  async function recicladorNuevo(nombre = 'Rosa Mamani Quispe') {
    const tel = telefono();
    const token = await nuevoReciclador(prueba, tel, nombre);
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
    return { token, id: usuario.id, telefono: tel };
  }
  async function completada(recicladorId: string, kg = 20) {
    const publicacionId = await crearPublicacion(recicladorId, { codigoMaterial: 'pet', kg });
    const ofertaId = await crearOferta(publicacionId, titicacaId);
    await propietario.query("UPDATE oferta SET estado = 'ACEPTADA' WHERE id = $1", [ofertaId]);
    await propietario.query("UPDATE publicacion SET estado = 'EN_NEGOCIACION' WHERE id = $1", [publicacionId]);
    const nueva = await propietario.query(
      'INSERT INTO operacion (publicacion_id, oferta_id, reciclador_id, comprador_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [publicacionId, ofertaId, recicladorId, titicacaId],
    );
    const id = nueva.rows[0].id as string;
    for (const e of ['EN_COORDINACION', 'ENTREGADA'])
      await propietario.query('UPDATE operacion SET estado = $2 WHERE id = $1', [id, e]);
    await propietario.query(
      "INSERT INTO coordinacion (operacion_id, tipo, referencia, pin, mensaje) VALUES ($1, 'REFERENCIA', 'Frente al mercado', ST_SetSRID(ST_MakePoint(-70.133, -15.497), 4326)::geography, 'Llámame al llegar')",
      [id],
    );
    await propietario.query(
      "UPDATE operacion SET estado = 'CONFIRMADA', kg_final = $2, monto_final = $3, confirmada_en = now() WHERE id = $1",
      [id, kg, kg * 2.5],
    );
    await prueba.bd.$transaction((tx) => completarOperacion(tx, id, { porPlazo: false, ahora: new Date() }));
    return id;
  }
  async function eliminar(token: string, contrasena = CLAVE) {
    const codigoPedido = await post('/yo/eliminacion/codigo', token, { contrasena }).expect(200);
    const clave = (codigoPedido.body as { codigoDePrueba: string }).codigoDePrueba;
    return post('/yo/eliminacion', token, { contrasena, codigo: clave, entiendo: true });
  }

  describe('exportar mis datos', () => {
    it('pide la contraseña y no se descarga con una incorrecta', async () => {
      const r = await recicladorNuevo();
      expect(codigo(await post('/yo/exportacion', r.token, {}).expect(422))).toBe('CONTRASENA_INCORRECTA');
      expect(codigo(await post('/yo/exportacion', r.token, { contrasena: 'incorrecta' }).expect(422))).toBe(
        'CONTRASENA_INCORRECTA',
      );
      expect((await get('/yo/privacidad', r.token).expect(200)).body).toMatchObject({
        exportacion: { disponible: true },
      });
    });

    it('un reciclador recibe solo lo suyo: ni teléfonos, ni correos, ni ubicaciones de otras personas', async () => {
      const r = await recicladorNuevo();
      const id = await completada(r.id, 30);
      await propietario.query(
        "INSERT INTO calificacion (operacion_id, autor_id, destino_id, estrellas, comentario) VALUES ($1, $2, $3, 5, 'Muy puntual'), ($1, $3, $2, 4, 'Buen trato')",
        [id, titicacaUsuario, r.id],
      );
      await post('/publicaciones', r.token, { material: 'pet', kg: 12 }).set('X-Posicion', POSICION).expect(201);
      const respuesta = await post('/yo/exportacion', r.token, { contrasena: CLAVE }).expect(200);
      expect(respuesta.headers['content-disposition']).toMatch(
        /attachment; filename="reciclomap-datos-\d{4}-\d{2}-\d{2}\.json"/,
      );
      const datos = respuesta.body as Record<string, unknown> & {
        cuenta: { telefono: string; nombre: string };
        operaciones: Array<{ negocio: string; coordinacion: { referencia: string } | null }>;
        resenasEscritas: unknown[];
        resenasRecibidas: Array<{ de: string; comentario: string }>;
        ubicacionesDeMisPublicaciones: Array<{ lat: number }>;
        puntos: { movimientos: unknown[] };
      };
      expect(datos.cuenta).toMatchObject({ telefono: r.telefono, nombre: 'Rosa Mamani Quispe' });
      expect(datos.operaciones.some((o) => o.negocio === 'Acopio Titicaca')).toBe(true);
      expect(datos.resenasEscritas).toHaveLength(1);
      expect(datos.resenasRecibidas[0]).toMatchObject({ comentario: 'Muy puntual', de: expect.any(String) });
      expect(datos.ubicacionesDeMisPublicaciones.length).toBeGreaterThan(0);
      expect(datos.puntos.movimientos.length).toBeGreaterThan(0);

      // Nada de otras personas: ningún teléfono, correo ni WhatsApp que no sea el propio
      const texto = JSON.stringify(datos);
      const ajenos = await propietario.query(
        `SELECT telefono AS v FROM usuario WHERE id <> $1 AND telefono ~ '^9'
         UNION SELECT correo FROM usuario WHERE id <> $1 AND correo IS NOT NULL
         UNION SELECT whatsapp FROM comprador WHERE whatsapp ~ '^9' UNION SELECT telefono_negocio FROM comprador WHERE telefono_negocio IS NOT NULL`,
        [r.id],
      );
      expect(ajenos.rows.length).toBeGreaterThan(5);
      for (const fila of ajenos.rows as Array<{ v: string }>) expect(texto).not.toContain(fila.v);
    });

    it('un negocio recibe su ficha y sus precios, sin datos de los recicladores', async () => {
      const respuesta = await post('/yo/exportacion', titicaca, { contrasena: CLAVE }).expect(200);
      const datos = respuesta.body as {
        negocio: { nombreComercial: string; precios: unknown[]; whatsapp: string } | null;
        reciclador: unknown;
      };
      expect(datos.negocio?.nombreComercial).toBe('Acopio Titicaca');
      expect(datos.negocio?.precios.length).toBeGreaterThan(0);
      expect(datos.reciclador).toBeNull();
      const texto = JSON.stringify(respuesta.body);
      const recicladores = await propietario.query("SELECT telefono, correo FROM usuario WHERE rol = 'RECICLADOR'");
      for (const f of recicladores.rows as Array<{ telefono: string; correo: string | null }>) {
        expect(texto).not.toContain(f.telefono);
        if (f.correo) expect(texto).not.toContain(f.correo);
      }
    });

    it('se permite una por día y solo queda el hecho en el registro, sin contenido', async () => {
      const r = await recicladorNuevo();
      await post('/yo/exportacion', r.token, { contrasena: CLAVE }).expect(200);
      expect(codigo(await post('/yo/exportacion', r.token, { contrasena: CLAVE }).expect(429))).toBe(
        'EXPORTACION_DIARIA',
      );
      expect((await get('/yo/privacidad', r.token).expect(200)).body).toMatchObject({
        exportacion: { disponible: false },
      });
      const hechos = await propietario.query(
        "SELECT tipo FROM registro_privacidad WHERE usuario_id = $1 AND tipo = 'EXPORTACION'",
        [r.id],
      );
      expect(hechos.rows).toHaveLength(1);
      const columnas = await propietario.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'registro_privacidad'",
      );
      expect((columnas.rows as Array<{ column_name: string }>).map((c) => c.column_name).sort()).toEqual([
        'creado_en',
        'id',
        'tipo',
        'usuario_id',
      ]);
    });

    it('la administración ve el hecho en su registro de privacidad', async () => {
      const lista = (await get('/admin/auditoria/privacidad', admin).expect(200)).body as {
        resumen: Record<string, number>;
        datos: Array<{ tipo: string }>;
      };
      expect(lista.resumen.EXPORTACION).toBeGreaterThan(0);
      expect(lista.datos.length).toBeGreaterThan(0);
      await get('/admin/auditoria/privacidad', titicaca).expect(403);
    });
  });

  describe('consentimientos y versión de los textos', () => {
    it('el registro exige aceptar los textos y declarar ser mayor de 18 años', async () => {
      const base = { nombre: 'Rosa Mamani Quispe', telefono: telefono(), contrasena: CLAVE };
      await prueba
        .http()
        .post('/api/v1/auth/registro/reciclador')
        .send({ ...base, aceptaTerminos: true })
        .expect(400);
      await prueba
        .http()
        .post('/api/v1/auth/registro/reciclador')
        .send({ ...base, mayorDeEdad: true })
        .expect(400);
      await prueba
        .http()
        .post('/api/v1/auth/registro/reciclador')
        .send({ ...base, aceptaTerminos: true, mayorDeEdad: false })
        .expect(400);
      await prueba
        .http()
        .post('/api/v1/auth/registro/reciclador')
        .send({ ...base, aceptaTerminos: true, mayorDeEdad: true })
        .expect(201);
      const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: base.telefono } });
      const filas = await prueba.bd.consentimiento.findMany({ where: { usuarioId: usuario.id } });
      expect(filas.map((f) => f.tipo).sort()).toEqual(['MAYOR_EDAD', 'PRIVACIDAD', 'TERMINOS']);
      expect(new Set(filas.map((f) => f.version))).toEqual(new Set([VERSION_TEXTOS_LEGALES]));
      expect(filas.every((f) => f.aceptadoEn.getTime() > Date.now() - 60_000)).toBe(true);
    });

    it('si cambia la versión se pide aceptar de nuevo antes de seguir, sin borrar lo aceptado antes', async () => {
      const r = await recicladorNuevo();
      await propietario.query(
        "UPDATE consentimiento SET version = '2026-01' WHERE usuario_id = $1 AND tipo IN ('TERMINOS', 'PRIVACIDAD')",
        [r.id],
      );
      expect(
        codigo(
          await post('/publicaciones', r.token, { material: 'pet', kg: 5 }).set('X-Posicion', POSICION).expect(403),
        ),
      ).toBe('TEXTOS_PENDIENTES');
      expect(codigo(await get('/yo/ruleta', r.token).expect(403))).toBe('TEXTOS_PENDIENTES');
      const yo = (await get('/yo', r.token).expect(200)).body as { siguientePaso: string };
      expect(yo.siguientePaso).toBe('ACEPTAR_TEXTOS');
      expect((await get('/yo/privacidad', r.token).expect(200)).body).toMatchObject({
        textos: { pendientes: ['TERMINOS', 'PRIVACIDAD'], versionVigente: VERSION_TEXTOS_LEGALES },
      });
      await post('/yo/consentimientos', r.token, { version: '2026-01', aceptaTerminos: true }).expect(400);
      await post('/yo/consentimientos', r.token, { version: VERSION_TEXTOS_LEGALES }).expect(400);
      expect(
        (
          await post('/yo/consentimientos', r.token, { version: VERSION_TEXTOS_LEGALES, aceptaTerminos: true }).expect(
            200,
          )
        ).body,
      ).toMatchObject({ pendientes: [] });
      await get('/yo/ruleta', r.token).expect(200);
      const filas = await prueba.bd.consentimiento.findMany({
        where: { usuarioId: r.id, tipo: 'TERMINOS' },
        orderBy: { aceptadoEn: 'asc' },
      });
      expect(filas.map((f) => f.version)).toEqual(['2026-01', VERSION_TEXTOS_LEGALES]);
    });
  });

  describe('eliminar mi cuenta', () => {
    it('no se puede con operaciones en curso, y dice qué resolver y dónde', async () => {
      const r = await recicladorNuevo();
      const pub = (
        (await post('/publicaciones', r.token, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as { publicacion: { id: string } }
      ).publicacion.id;
      const oferta = (
        (await post(`/negocio/publicaciones/${pub}/ofertas`, titicaca, { precioKg: 2.5 }).expect(201)).body as {
          id: string;
        }
      ).id;
      await post(`/ofertas/${oferta}/aceptar`, r.token).expect(200);
      const bloqueo = await post('/yo/eliminacion/codigo', r.token, { contrasena: CLAVE }).expect(409);
      expect(codigo(bloqueo)).toBe('ELIMINACION_BLOQUEADA');
      expect((bloqueo.body as { error: { campos?: Array<{ campo: string }> } }).error.campos?.[0]?.campo).toBe(
        'operaciones',
      );
      const resumen = (await get('/yo/privacidad', r.token).expect(200)).body as {
        eliminacion: { bloqueos: Array<{ tipo: string; donde: string }> };
      };
      expect(resumen.eliminacion.bloqueos[0]).toMatchObject({ tipo: 'operaciones' });
      expect((await prueba.bd.usuario.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe('ACTIVO');
    });

    it('tampoco con incidencias abiertas, entregas directas pendientes o premios por entregar', async () => {
      const r = await recicladorNuevo();
      const id = await completada(r.id);
      await propietario.query(
        "INSERT INTO reporte (tipo, autor_id, operacion_id, motivo, detalle, estado) VALUES ('OPERACION', $1, $2, 'PAGO', 'Me pagaron menos de lo acordado', 'PENDIENTE')",
        [r.id, id],
      );
      const tipos = async () =>
        (
          (await get('/yo/privacidad', r.token).expect(200)).body as {
            eliminacion: { bloqueos: Array<{ tipo: string }> };
          }
        ).eliminacion.bloqueos.map((b) => b.tipo);
      expect(await tipos()).toEqual(['incidencias']);
      await propietario.query(
        "UPDATE reporte SET estado = 'DESCARTADO', decision = 'Sin mérito', resuelto_en = now() WHERE autor_id = $1",
        [r.id],
      );
      await post('/registros-directos', r.token, { compradorId: titicacaId, material: 'pet', kg: 8 }).expect(201);
      expect(await tipos()).toEqual(['entregas_directas']);
      await propietario.query(
        "UPDATE registro_reciclaje SET estado = 'RECHAZADO', motivo_rechazo = 'No coincide' WHERE reciclador_id = $1",
        [r.id],
      );
      const premio = (await propietario.query("SELECT id FROM premio WHERE tipo = 'OBJETO' AND activo LIMIT 1")).rows[0]
        .id as string;
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
          "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, $4, 'Punto', now() + interval '20 days') RETURNING id",
          [sorteo, r.id, premio, `RM-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')}`],
        )
      ).rows[0].id as string;
      expect(await tipos()).toEqual(['premios']);
      await post(`/yo/premios/${ganado}/reclamar`, r.token).expect(200);
      expect(await tipos()).toEqual(['premios']);
      expect(codigo(await post('/yo/eliminacion/codigo', r.token, { contrasena: CLAVE }).expect(409))).toBe(
        'ELIMINACION_BLOQUEADA',
      );
    });

    it('pide la contraseña y el código, y una cuenta de administración no se elimina', async () => {
      const r = await recicladorNuevo();
      expect(codigo(await post('/yo/eliminacion/codigo', r.token, { contrasena: 'incorrecta' }).expect(422))).toBe(
        'CONTRASENA_INCORRECTA',
      );
      await post('/yo/eliminacion', r.token, { contrasena: CLAVE, codigo: '000000', entiendo: true }).expect(422);
      const pedido = await post('/yo/eliminacion/codigo', r.token, { contrasena: CLAVE }).expect(200);
      const clave = (pedido.body as { codigoDePrueba: string }).codigoDePrueba;
      await post('/yo/eliminacion', r.token, { contrasena: CLAVE, codigo: clave }).expect(400);
      expect(
        codigo(
          await post('/yo/eliminacion', r.token, { contrasena: 'incorrecta', codigo: clave, entiendo: true }).expect(
            422,
          ),
        ),
      ).toBe('CONTRASENA_INCORRECTA');
      expect((await prueba.bd.usuario.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe('ACTIVO');
      expect(codigo(await post('/yo/eliminacion/codigo', admin, { contrasena: CLAVE }).expect(403))).toBe(
        'ADMIN_NO_ELIMINABLE',
      );
    });

    it('durante la gracia la cuenta no opera, no se ve y se puede cancelar al iniciar sesión', async () => {
      const r = await recicladorNuevo();
      const pub = (
        (await post('/publicaciones', r.token, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as { publicacion: { id: string } }
      ).publicacion.id;
      expect(
        (
          (await get('/negocio/publicaciones', titicaca).expect(200)).body as { datos: Array<{ id: string }> }
        ).datos.map((p) => p.id),
      ).toContain(pub);
      const hecho = (await eliminar(r.token)).body as { programadaEn: string };
      expect(new Date(hecho.programadaEn).getTime() - Date.now()).toBeGreaterThan(6.9 * DIA);
      // Sus sesiones se cierran y los avisos no llegan
      await get('/yo', r.token).expect(401);
      expect(
        (
          (await get('/negocio/publicaciones', titicaca).expect(200)).body as { datos: Array<{ id: string }> }
        ).datos.map((p) => p.id),
      ).not.toContain(pub);
      const entrada = (
        await prueba
          .http()
          .post('/api/v1/auth/login')
          .send({ identificador: r.telefono, contrasena: CLAVE })
          .expect(200)
      ).body as {
        tokenAcceso: string;
        usuario: { estado: string; siguientePaso: string };
      };
      expect(entrada.usuario).toMatchObject({ estado: 'EN_ELIMINACION', siguientePaso: 'CANCELAR_ELIMINACION' });
      expect(
        codigo(
          await post('/publicaciones', entrada.tokenAcceso, { material: 'pet', kg: 5 })
            .set('X-Posicion', POSICION)
            .expect(403),
        ),
      ).toBe('CUENTA_EN_ELIMINACION');
      await get('/yo/ruleta', entrada.tokenAcceso).expect(403);
      expect((await get('/yo/privacidad', entrada.tokenAcceso).expect(200)).body).toMatchObject({
        eliminacion: { enEliminacion: true },
      });
      expect((await eliminarSolicitud(entrada.tokenAcceso).expect(200)).body).toEqual({ estado: 'ACTIVO' });
      expect(codigo(await eliminarSolicitud(entrada.tokenAcceso).expect(403))).toBe('SIN_PERMISO');
      const otra = (
        await prueba
          .http()
          .post('/api/v1/auth/login')
          .send({ identificador: r.telefono, contrasena: CLAVE })
          .expect(200)
      ).body as { tokenAcceso: string };
      await get('/yo/ruleta', otra.tokenAcceso).expect(200);
      const hechos = await propietario.query('SELECT tipo FROM registro_privacidad WHERE usuario_id = $1 ORDER BY id', [
        r.id,
      ]);
      expect((hechos.rows as Array<{ tipo: string }>).map((h) => h.tipo)).toEqual([
        'ELIMINACION_SOLICITADA',
        'ELIMINACION_CANCELADA',
      ]);
    });

    it('antes de cumplirse la gracia nada se anonimiza', async () => {
      const r = await recicladorNuevo();
      expect((await eliminar(r.token)).status).toBe(200);
      expect(await prueba.app.get(EliminacionService).anonimizarVencidas(new Date(Date.now() + 6 * DIA))).toBe(0);
      expect((await prueba.bd.usuario.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe('EN_ELIMINACION');
      await expect(propietario.query('SELECT anonimizar_cuenta($1::uuid)', [r.id])).rejects.toMatchObject({
        code: 'RM040',
      });
    });

    it('pasada la gracia no queda rastro de la persona; operaciones y reseñas siguen como «Usuario eliminado»', async () => {
      const r = await recicladorNuevo('Elena Condori Apaza');
      const op = await completada(r.id, 40);
      await propietario.query(
        "INSERT INTO calificacion (operacion_id, autor_id, destino_id, estrellas, comentario) VALUES ($1, $2, $3, 5, 'Excelente atención')",
        [op, r.id, titicacaUsuario],
      );
      // Todo lo que la persona tenía: foto, favoritos, búsquedas, avisos y suscripción
      const clave = `perfil/${randomUUID()}.jpg`;
      const almacen = prueba.app.get<AlmacenMemoria>(Almacen);
      await almacen.guardar(clave, Buffer.from('foto'));
      const archivo = (
        await propietario.query(
          "INSERT INTO archivo (propietario_id, proposito, clave, tipo_mime, bytes) VALUES ($1, 'PERFIL', $2, 'image/jpeg', 4) RETURNING id",
          [r.id, clave],
        )
      ).rows[0].id as string;
      await propietario.query('UPDATE usuario SET foto_id = $2, correo = $3 WHERE id = $1', [
        r.id,
        archivo,
        `elena${r.id.slice(0, 6)}@correo.pe`,
      ]);
      await propietario.query("UPDATE reciclador_perfil SET sobre_mi = 'Recojo en el mercado' WHERE usuario_id = $1", [
        r.id,
      ]);
      await propietario.query('INSERT INTO favorito (usuario_id, comprador_id) VALUES ($1, $2)', [r.id, titicacaId]);
      await propietario.query(
        "INSERT INTO busqueda_guardada (usuario_id, nombre, filtros) VALUES ($1, 'Cartón cerca', '{}')",
        [r.id],
      );
      await propietario.query(
        "INSERT INTO suscripcion_push (usuario_id, endpoint, p256dh, auth) VALUES ($1, $2, 'p', 'a')",
        [r.id, `https://push.test/${r.id}`],
      );
      await propietario.query(
        "INSERT INTO identidad_externa (usuario_id, proveedor, sujeto) VALUES ($1, 'GOOGLE', $2)",
        [r.id, `sub-${r.id}`],
      );
      const pub = (
        (await post('/publicaciones', r.token, { material: 'pet', kg: 20 }).set('X-Posicion', POSICION).expect(201))
          .body as { publicacion: { id: string } }
      ).publicacion.id;
      const antes = {
        movimientos: (
          await propietario.query('SELECT count(*)::int AS n FROM movimiento_puntos WHERE usuario_id = $1', [r.id])
        ).rows[0].n as number,
        giros: (await propietario.query('SELECT count(*)::int AS n FROM giro WHERE usuario_id = $1', [r.id])).rows[0]
          .n as number,
      };
      expect(antes.movimientos).toBeGreaterThan(0);

      expect((await eliminar(r.token)).status).toBe(200);
      const servicio = prueba.app.get(EliminacionService);
      expect(await servicio.anonimizarVencidas(new Date(Date.now() + 8 * DIA))).toBeGreaterThanOrEqual(1);
      expect(await servicio.vaciarArchivosPorBorrar()).toBeGreaterThanOrEqual(0);

      const u = await prueba.bd.usuario.findUniqueOrThrow({ where: { id: r.id } });
      expect(u).toMatchObject({
        nombre: 'Usuario eliminado',
        correo: null,
        hashContrasena: null,
        fotoId: null,
        estado: 'ELIMINADO',
      });
      expect(u.telefono).toMatch(/^X[0-9a-f]{8}$/);
      expect(u.telefono).not.toBe(r.telefono);
      const cuenta = async (tabla: string, columna = 'usuario_id') =>
        (await propietario.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${columna} = $1`, [r.id])).rows[0]
          .n as number;
      for (const tabla of [
        'sesion',
        'identidad_externa',
        'suscripcion_push',
        'favorito',
        'busqueda_guardada',
        'notificacion',
        'preferencia_usuario',
        'reciclador_material',
      ]) {
        expect(await cuenta(tabla)).toBe(0);
      }
      expect(
        (
          await propietario.query(
            'SELECT count(*)::int AS n FROM codigo_verificacion WHERE destino = $1 OR usuario_id = $2',
            [r.telefono, r.id],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (await propietario.query('SELECT sobre_mi FROM reciclador_perfil WHERE usuario_id = $1', [r.id])).rows[0]
          .sobre_mi,
      ).toBeNull();
      expect(await cuenta('archivo', 'propietario_id')).toBe(0);
      expect(almacen.tiene(clave)).toBe(false);
      expect(
        (await propietario.query('SELECT count(*)::int AS n FROM archivo_por_borrar WHERE clave = $1', [clave])).rows[0]
          .n,
      ).toBe(0);
      expect(
        (
          await propietario.query('SELECT count(*)::int AS n FROM publicacion_ubicacion WHERE publicacion_id = $1', [
            pub,
          ])
        ).rows[0].n,
      ).toBe(0);
      expect((await propietario.query('SELECT estado FROM publicacion WHERE id = $1', [pub])).rows[0].estado).toBe(
        'CANCELADA',
      );
      const coord = (
        await propietario.query('SELECT referencia, mensaje FROM coordinacion WHERE operacion_id = $1', [op])
      ).rows[0];
      expect(coord).toEqual({ referencia: 'Dato eliminado', mensaje: null });

      // Operaciones y reseñas se conservan; las tablas de solo agregar no se tocaron
      const operacion = (await get(`/operaciones/${op}`, titicaca).expect(200)).body as {
        estado: string;
        otraParte?: { nombre: string };
      };
      expect(operacion.estado).toBe('COMPLETADA');
      expect(JSON.stringify(operacion)).toContain('Usuario eliminado');
      expect(JSON.stringify(operacion)).not.toContain('Elena Condori');
      expect(JSON.stringify(operacion)).not.toMatch(/X[0-9a-f]{8}/);
      expect(await prueba.bd.calificacion.count({ where: { autorId: r.id, comentario: 'Excelente atención' } })).toBe(
        1,
      );
      expect(await cuenta('movimiento_puntos')).toBe(antes.movimientos);
      expect(await cuenta('giro')).toBe(antes.giros);
      expect(
        (
          await propietario.query(
            "SELECT tipo FROM registro_privacidad WHERE usuario_id = $1 AND tipo = 'CUENTA_ANONIMIZADA'",
            [r.id],
          )
        ).rows,
      ).toHaveLength(1);

      // Ya no inicia sesión, no está en el ranking y su teléfono queda libre para una cuenta nueva sin historial
      await prueba.http().post('/api/v1/auth/login').send({ identificador: r.telefono, contrasena: CLAVE }).expect(401);
      const nuevoToken = await nuevoReciclador(prueba, r.telefono, 'Elena Condori Apaza');
      const nueva = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: r.telefono } });
      expect(nueva.id).not.toBe(r.id);
      expect((await get('/yo', nuevoToken).expect(200)).body).toMatchObject({ nombre: 'Elena Condori Apaza' });
      expect(await prueba.bd.operacion.count({ where: { recicladorId: nueva.id } })).toBe(0);
    });
  });

  describe('retención: depuración por plazos, en hora de Lima', () => {
    it('borra lo vencido y no toca lo vigente', async () => {
      const r = await recicladorNuevo();
      const ahora = new Date();
      const hace = (dias: number) => new Date(ahora.getTime() - dias * DIA);
      const c = async (sql: string, v: unknown[] = []) => (await propietario.query(sql, v)).rows[0].n as number;

      // Códigos de teléfono: usados o vencidos hace más de un día
      for (const [usado, expira] of [
        [hace(2), hace(2)],
        [null, hace(3)],
        [hace(0.01), new Date(ahora.getTime() + 600_000)],
      ] as const) {
        await propietario.query(
          "INSERT INTO codigo_verificacion (usuario_id, destino, proposito, hash_codigo, expira_en, usado_en) VALUES ($1, $2, 'VERIFICAR_TELEFONO', repeat('a', 64), $3, $4)",
          [r.id, `r${r.telefono}`, expira, usado],
        );
      }
      // Sesiones: vencidas o revocadas hace más de 30 días
      for (const [expira, revoca] of [
        [hace(40), null],
        [hace(5), hace(40)],
        [hace(5), null],
        [new Date(ahora.getTime() + DIA), null],
      ] as const) {
        await propietario.query(
          'INSERT INTO sesion (usuario_id, hash_token, familia, expira_en, revocada_en) VALUES ($1, md5(random()::text) || md5(random()::text), gen_random_uuid(), $2, $3)',
          [r.id, expira, revoca],
        );
      }
      // Avisos: leídos hace más de 90 días, sin leer hace más de 180
      for (const [creada, leida] of [
        [hace(100), hace(95)],
        [hace(20), hace(10)],
        [hace(200), null],
        [hace(100), null],
      ] as const) {
        await propietario.query(
          "INSERT INTO notificacion (usuario_id, tipo, titulo, mensaje, creada_en, leida_en) VALUES ($1, 'CUENTA', 'Prueba de retención', 'x', $2, $3)",
          [r.id, creada, leida],
        );
      }
      const fecha = (d: number) => hace(d).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
      for (const d of [130, 30]) {
        await propietario.query(
          "INSERT INTO evento_visita (comprador_id, fecha, hora, visitante) VALUES ($1, $2, 10, repeat('v', 64))",
          [titicacaId, fecha(d)],
        );
      }
      for (const d of [200, 30])
        await propietario.query('INSERT INTO solicitud_llegada (comprador_id, fecha) VALUES ($1, $2)', [
          titicacaId,
          fecha(d),
        ]);
      // Punto, referencia y mensaje de operaciones cerradas hace más de 24 meses
      const vieja = await completada(r.id, 10);
      const reciente = await completada(r.id, 10);
      await sinReglas((cliente) =>
        cliente.query("UPDATE operacion SET completada_en = now() - interval '26 months' WHERE id = $1", [vieja]),
      );
      // Archivos que ninguna foto usa y llevan más de una semana
      const huerfano = `huerfano/${randomUUID()}.jpg`;
      const reciente2 = `reciente/${randomUUID()}.jpg`;
      await propietario.query(
        "INSERT INTO archivo (propietario_id, proposito, clave, tipo_mime, bytes, creado_en) VALUES ($1, 'PERFIL', $2, 'image/jpeg', 4, now() - interval '9 days')",
        [r.id, huerfano],
      );
      await propietario.query(
        "INSERT INTO archivo (propietario_id, proposito, clave, tipo_mime, bytes, creado_en) VALUES ($1, 'PERFIL', $2, 'image/jpeg', 4, now() - interval '1 day')",
        [r.id, reciente2],
      );

      const resultado = await prueba.app.get(RetencionService).depurar(ahora);
      expect(resultado.codigos).toBeGreaterThanOrEqual(2);
      // Queda el código de registro (aún vigente) y el usado hace unos minutos
      expect(await c('SELECT count(*)::int AS n FROM codigo_verificacion WHERE usuario_id = $1', [r.id])).toBe(2);
      expect(resultado.sesiones).toBeGreaterThanOrEqual(2);
      expect(
        await c('SELECT count(*)::int AS n FROM notificacion WHERE usuario_id = $1 AND titulo = $2', [
          r.id,
          'Prueba de retención',
        ]),
      ).toBe(2);
      expect(
        await c(
          "SELECT count(*)::int AS n FROM evento_visita WHERE comprador_id = $1 AND fecha = $2 AND visitante = repeat('v', 64)",
          [titicacaId, fecha(130)],
        ),
      ).toBe(0);
      expect(
        await c(
          "SELECT count(*)::int AS n FROM evento_visita WHERE comprador_id = $1 AND fecha = $2 AND visitante = repeat('v', 64)",
          [titicacaId, fecha(30)],
        ),
      ).toBe(1);
      expect(
        await c('SELECT count(*)::int AS n FROM solicitud_llegada WHERE comprador_id = $1 AND fecha = $2', [
          titicacaId,
          fecha(200),
        ]),
      ).toBe(0);
      expect(
        await c('SELECT count(*)::int AS n FROM solicitud_llegada WHERE comprador_id = $1 AND fecha = $2', [
          titicacaId,
          fecha(30),
        ]),
      ).toBe(1);
      const textos = async (id: string) =>
        (await propietario.query('SELECT referencia FROM coordinacion WHERE operacion_id = $1', [id])).rows[0]
          .referencia as string | null;
      expect(await textos(reciente)).toBe('Frente al mercado');
      expect(await textos(vieja)).toBe('Dato eliminado');
      expect(await c('SELECT count(*)::int AS n FROM archivo WHERE clave = $1', [huerfano])).toBe(0);
      expect(await c('SELECT count(*)::int AS n FROM archivo WHERE clave = $1', [reciente2])).toBe(1);
      // Una segunda vuelta no encuentra nada nuevo que depurar
      const segunda = await prueba.app.get(RetencionService).depurar(ahora);
      expect([segunda.codigos, segunda.sesiones, segunda.notificacionesLeidas, segunda.notificacionesSinLeer]).toEqual([
        0, 0, 0, 0,
      ]);
    });
  });

  describe('cuentas que entran solo con Google (sin contraseña)', () => {
    async function cuentaDeGoogle() {
      const r = await recicladorNuevo();
      await propietario.query('UPDATE usuario SET hash_contrasena = NULL WHERE id = $1', [r.id]);
      return r;
    }

    it('exportan con el código del teléfono verificado, sin crear contraseña', async () => {
      const r = await cuentaDeGoogle();
      expect(
        ((await get('/yo/privacidad', r.token).expect(200)).body as { tieneContrasena: boolean }).tieneContrasena,
      ).toBe(false);
      expect(codigo(await post('/yo/exportacion', r.token, {}).expect(422))).toBe('CODIGO_REQUERIDO');
      const pedido = await post('/yo/exportacion/codigo', r.token, {}).expect(200);
      expect(codigo(await post('/yo/exportacion', r.token, { codigo: '000000' }).expect(422))).toBe(
        'CODIGO_INCORRECTO',
      );
      const datos = await post('/yo/exportacion', r.token, {
        codigo: (pedido.body as { codigoDePrueba: string }).codigoDePrueba,
      }).expect(200);
      expect((datos.body as { cuenta: { telefono: string } }).cuenta.telefono).toBe(r.telefono);
      expect(codigo(await post('/yo/exportacion', r.token, { codigo: '123456' }).expect(429))).toBe(
        'EXPORTACION_DIARIA',
      );
    });

    it('quien tiene contraseña no usa el código para exportar', async () => {
      const r = await recicladorNuevo();
      expect(codigo(await post('/yo/exportacion/codigo', r.token, {}).expect(409))).toBe('CONTRASENA_DISPONIBLE');
      expect(codigo(await post('/yo/exportacion', r.token, { codigo: '123456' }).expect(422))).toBe(
        'CONTRASENA_INCORRECTA',
      );
    });

    it('eliminan la cuenta con el código al teléfono verificado', async () => {
      const r = await cuentaDeGoogle();
      const pedido = await post('/yo/eliminacion/codigo', r.token, {}).expect(200);
      const codigoSms = (pedido.body as { codigoDePrueba: string }).codigoDePrueba;
      await post('/yo/eliminacion', r.token, { codigo: '000000', entiendo: true }).expect(422);
      await post('/yo/eliminacion', r.token, { codigo: codigoSms }).expect(400);
      await post('/yo/eliminacion', r.token, { codigo: codigoSms, entiendo: true }).expect(200);
      expect((await prueba.bd.usuario.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe('EN_ELIMINACION');
    });
  });

  describe('renunciar a un premio', () => {
    async function conPremio(estado: 'POR_RECLAMAR' | 'RECLAMADO' = 'POR_RECLAMAR') {
      const r = await recicladorNuevo();
      const premio = (
        await propietario.query(
          "SELECT id, stock FROM premio WHERE tipo = 'OBJETO' AND activo AND stock IS NOT NULL LIMIT 1",
        )
      ).rows[0] as { id: string; stock: number };
      const giro = await giroGastado(r.id);
      const config = (await propietario.query('SELECT max(id) AS id FROM ruleta_configuracion')).rows[0].id as number;
      const sorteo = (
        await propietario.query(
          'INSERT INTO sorteo_ruleta (giro_id, usuario_id, configuracion_id, numero_sorteado, premio_id) VALUES ($1, $2, $3, 1, $4) RETURNING id',
          [giro, r.id, config, premio.id],
        )
      ).rows[0].id as string;
      const ganado = (
        await propietario.query(
          "INSERT INTO premio_ganado (sorteo_id, usuario_id, premio_id, codigo, punto_entrega, vence_en) VALUES ($1, $2, $3, $4, 'Punto', now() + interval '20 days') RETURNING id",
          [sorteo, r.id, premio.id, `RM-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')}`],
        )
      ).rows[0].id as string;
      if (estado === 'RECLAMADO') await post(`/yo/premios/${ganado}/reclamar`, r.token).expect(200);
      // El sorteo ya descontó su unidad: este es el stock con el que se compara después de renunciar
      const stock = (await propietario.query('SELECT stock FROM premio WHERE id = $1', [premio.id])).rows[0]
        .stock as number;
      return { ...r, ganado, premio: { ...premio, stock } };
    }

    it('exige confirmación, no devuelve stock, queda registrado y destraba la eliminación', async () => {
      const p = await conPremio();
      expect(codigo(await post('/yo/eliminacion/codigo', p.token, { contrasena: CLAVE }).expect(409))).toBe(
        'ELIMINACION_BLOQUEADA',
      );
      await post(`/yo/premios/${p.ganado}/renunciar`, p.token, {}).expect(400);
      await post(`/yo/premios/${p.ganado}/renunciar`, p.token, { confirmar: false }).expect(400);
      const otro = await recicladorNuevo();
      await post(`/yo/premios/${p.ganado}/renunciar`, otro.token, { confirmar: true }).expect(404);
      const hecho = await post(`/yo/premios/${p.ganado}/renunciar`, p.token, { confirmar: true }).expect(200);
      expect(hecho.body).toMatchObject({ estado: 'RENUNCIADO' });
      const stock = (await propietario.query('SELECT stock FROM premio WHERE id = $1', [p.premio.id])).rows[0]
        .stock as number;
      expect(stock).toBe(p.premio.stock);
      expect((await prueba.bd.premioGanado.findUniqueOrThrow({ where: { id: p.ganado } })).renunciadoEn).not.toBeNull();
      expect(codigo(await post(`/yo/premios/${p.ganado}/renunciar`, p.token, { confirmar: true }).expect(409))).toBe(
        'PREMIO_NO_RENUNCIABLE',
      );
      expect(codigo(await post(`/yo/premios/${p.ganado}/reclamar`, p.token).expect(409))).toMatch(/PREMIO_/);
      const lista = (await get('/yo/premios', p.token).expect(200)).body as { items: Array<{ estado: string }> };
      expect(lista.items.some((i) => i.estado === 'RENUNCIADO')).toBe(true);
      expect(
        (
          await propietario.query(
            "SELECT tipo FROM registro_privacidad WHERE usuario_id = $1 AND tipo = 'PREMIO_RENUNCIADO'",
            [p.id],
          )
        ).rows,
      ).toHaveLength(1);
      await post('/yo/eliminacion/codigo', p.token, { contrasena: CLAVE }).expect(200);
    });

    it('también se renuncia a un premio ya reclamado que espera su entrega', async () => {
      const p = await conPremio('RECLAMADO');
      expect(codigo(await post('/yo/eliminacion/codigo', p.token, { contrasena: CLAVE }).expect(409))).toBe(
        'ELIMINACION_BLOQUEADA',
      );
      await post(`/yo/premios/${p.ganado}/renunciar`, p.token, { confirmar: true }).expect(200);
      await post('/yo/eliminacion/codigo', p.token, { contrasena: CLAVE }).expect(200);
      // Ya no sale en la cola de entregas de la administración
      const cola = (await get('/admin/premios-entregas?estado=por-entregar', admin).expect(200)).body as {
        datos: Array<{ codigo: string }>;
      };
      const codigoGanado = (await prueba.bd.premioGanado.findUniqueOrThrow({ where: { id: p.ganado } })).codigo;
      expect(cola.datos.map((d) => d.codigo)).not.toContain(codigoGanado);
      expect(codigo(await post('/admin/premios-entregas', admin, { codigo: codigoGanado }).expect(409))).toBe(
        'PREMIO_NO_RECLAMADO',
      );
    });
  });

  describe('volver a registrarse con el mismo teléfono', () => {
    it('quien se eliminó crea una cuenta nueva, sin historial, y la vieja no entra', async () => {
      const r = await recicladorNuevo('Marta Quispe Apaza');
      const viejo = await completada(r.id, 15);
      expect((await eliminar(r.token)).status).toBe(200);
      await prueba.app.get(EliminacionService).anonimizarVencidas(new Date(Date.now() + 8 * DIA));
      expect((await prueba.bd.usuario.findUniqueOrThrow({ where: { id: r.id } })).estado).toBe('ELIMINADO');
      const nuevoToken = await nuevoReciclador(prueba, r.telefono, 'Marta Quispe Apaza');
      const nueva = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: r.telefono } });
      expect(nueva.id).not.toBe(r.id);
      expect(nueva.estado).toBe('ACTIVO');
      expect(await prueba.bd.operacion.count({ where: { recicladorId: nueva.id } })).toBe(0);
      expect((await get('/yo', nuevoToken).expect(200)).body).toMatchObject({ nombre: 'Marta Quispe Apaza' });
      // La operación anterior sigue siendo de la cuenta anonimizada
      expect((await prueba.bd.operacion.findUniqueOrThrow({ where: { id: viejo } })).recicladorId).toBe(r.id);
      await get(`/operaciones/${viejo}`, nuevoToken).expect(404);
    });
  });
});
