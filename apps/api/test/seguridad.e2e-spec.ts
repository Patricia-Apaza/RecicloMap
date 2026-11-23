import { ADMIN } from '../prisma/datos-semilla.js';
import { bearer, CLAVE, codigoAdminConocido, crearPrueba, nuevoReciclador, type Prueba } from './apoyo.js';
import { PrismaApi } from '../src/nucleo/base-datos/prisma.js';
import { verificarArranqueSeguro } from '../src/nucleo/configuracion/arranque.js';
import { hashearContrasena } from '../src/nucleo/seguridad/contrasenas.js';
import { cerrarConexiones, propietario } from './bd/apoyo.js';

type Error = { error: { codigo: string; mensaje: string } };
const codigo = (r: { body: unknown }) => (r.body as Error).error.codigo;
const telefono = () => `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const ORIGEN_WEB = 'http://localhost:3000';
const HORA = 3_600_000;

describe('Seguridad de la API: cabeceras, CORS, sesiones y fuerza bruta (Fase 13B)', () => {
  let prueba: Prueba;
  beforeAll(async () => {
    prueba = await crearPrueba();
  });
  afterAll(async () => {
    await cerrarConexiones();
    await prueba.cerrar();
  });

  const http = () => prueba.http();

  describe('cabeceras y CORS', () => {
    it('la API responde con cabeceras de seguridad y sin pistas de la tecnología', async () => {
      const r = await http().get('/api/v1/salud');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      expect(r.headers['content-security-policy']).toContain("default-src 'none'");
      expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(r.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(r.headers['x-powered-by']).toBeUndefined();
      // HSTS solo tiene sentido en producción, detrás de HTTPS
      expect(r.headers['strict-transport-security']).toBeUndefined();
    });

    it('solo el origen de la web recibe permiso CORS, con credenciales', async () => {
      const bueno = await http().get('/api/v1/salud').set('Origin', ORIGEN_WEB);
      expect(bueno.headers['access-control-allow-origin']).toBe(ORIGEN_WEB);
      expect(bueno.headers['access-control-allow-credentials']).toBe('true');
      for (const ajeno of ['https://malo.example', 'http://localhost:3999', 'null']) {
        const r = await http().get('/api/v1/salud').set('Origin', ajeno);
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
        const previo = await http()
          .options('/api/v1/auth/login')
          .set('Origin', ajeno)
          .set('Access-Control-Request-Method', 'POST');
        expect(previo.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    it('una escritura que viene de otro origen se rechaza antes de tocar la sesión (CSRF)', async () => {
      const r = await http().post('/api/v1/auth/refresh').set('Origin', 'https://malo.example').send({});
      expect(r.status).toBe(403);
      expect(codigo(r)).toBe('ORIGEN_NO_PERMITIDO');
      const ok = await http().post('/api/v1/auth/refresh').set('Origin', ORIGEN_WEB).send({});
      expect(ok.status).toBe(401);
      expect(codigo(ok)).toBe('SESION_INVALIDA');
    });

    it('la cookie de sesión es httpOnly, SameSite=Lax y limitada a la ruta de acceso', async () => {
      const tel = telefono();
      await nuevoReciclador(prueba, tel);
      const r = await http().post('/api/v1/auth/login').send({ identificador: tel, contrasena: CLAVE }).expect(200);
      const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('rm_refresco='))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    });
  });

  describe('autenticación sin revelar si una cuenta existe', () => {
    it('ingresar responde igual con una cuenta inexistente y con una contraseña incorrecta', async () => {
      const tel = telefono();
      await nuevoReciclador(prueba, tel);
      const mala = await http().post('/api/v1/auth/login').send({ identificador: tel, contrasena: 'incorrecta-1' });
      const noExiste = await http()
        .post('/api/v1/auth/login')
        .send({ identificador: telefono(), contrasena: 'incorrecta-1' });
      const sinCorreo = await http()
        .post('/api/v1/auth/login')
        .send({ identificador: 'nadie@correo.pe', contrasena: 'incorrecta-1' });
      for (const r of [mala, noExiste, sinCorreo]) {
        expect(r.status).toBe(401);
        expect(codigo(r)).toBe('CREDENCIALES_INVALIDAS');
      }
      expect((mala.body as Error).error.mensaje).toBe((noExiste.body as Error).error.mensaje);
    });

    it('recuperar y reenviar el código responden igual exista o no la cuenta', async () => {
      const tel = telefono();
      await nuevoReciclador(prueba, tel);
      // El código de prueba solo existe fuera de producción; el resto de la respuesta debe ser idéntico
      const forma = (cuerpo: unknown) =>
        Object.keys(cuerpo as object)
          .filter((k) => k !== 'codigoDePrueba')
          .sort()
          .join(',');
      const existe = await http().post('/api/v1/auth/recuperar').send({ identificador: tel });
      const noExiste = await http().post('/api/v1/auth/recuperar').send({ identificador: telefono() });
      expect([existe.status, forma(existe.body)]).toEqual([noExiste.status, forma(noExiste.body)]);
      const r1 = await http().post('/api/v1/auth/telefono/enviar-codigo').send({ telefono: telefono() });
      expect(r1.status).toBeLessThan(300);
    });
  });

  describe('freno contra fuerza bruta', () => {
    it('tras 5 fallos seguidos el ingreso espera, aunque la contraseña sea la correcta, y responde lo mismo', async () => {
      const tel = telefono();
      await nuevoReciclador(prueba, tel);
      for (let i = 0; i < 5; i++) {
        expect(
          (
            await http()
              .post('/api/v1/auth/login')
              .send({ identificador: tel, contrasena: `mala-clave-${i}` })
          ).status,
        ).toBe(401);
      }
      const fila = (
        await propietario.query('SELECT fallos_acceso, acceso_bloqueado_hasta FROM usuario WHERE telefono = $1', [tel])
      ).rows[0] as {
        fallos_acceso: number;
        acceso_bloqueado_hasta: Date | null;
      };
      expect(fila.fallos_acceso).toBe(5);
      expect(fila.acceso_bloqueado_hasta!.getTime()).toBeGreaterThan(Date.now());
      const bloqueada = await http().post('/api/v1/auth/login').send({ identificador: tel, contrasena: CLAVE });
      expect(bloqueada.status).toBe(401);
      expect(codigo(bloqueada)).toBe('CREDENCIALES_INVALIDAS');
      // Pasada la espera, la contraseña correcta entra y el contador vuelve a cero
      await propietario.query(
        "UPDATE usuario SET acceso_bloqueado_hasta = now() - interval '1 second' WHERE telefono = $1",
        [tel],
      );
      await http().post('/api/v1/auth/login').send({ identificador: tel, contrasena: CLAVE }).expect(200);
      expect(
        (await propietario.query('SELECT fallos_acceso FROM usuario WHERE telefono = $1', [tel])).rows[0].fallos_acceso,
      ).toBe(0);
    });

    it('el código del teléfono se bloquea tras 5 intentos fallidos', async () => {
      const tel = telefono();
      const token = await nuevoReciclador(prueba, tel);
      const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { telefono: tel } });
      // Una cuenta de Google no tiene contraseña: confirma con un código
      await propietario.query('UPDATE usuario SET hash_contrasena = NULL WHERE id = $1', [usuario.id]);
      await http().post('/api/v1/yo/exportacion/codigo').set(bearer(token)).send({}).expect(200);
      for (let i = 0; i < 5; i++) {
        const r = await http().post('/api/v1/yo/exportacion').set(bearer(token)).send({ codigo: '000001' });
        expect(r.status).toBe(422);
      }
      expect(codigo(await http().post('/api/v1/yo/exportacion').set(bearer(token)).send({ codigo: '000001' }))).toBe(
        'CODIGO_BLOQUEADO',
      );
    });

    it('confirmar con contraseña o código admite pocos intentos por minuto', async () => {
      const limitada = await crearPrueba({ conLimite: true });
      const anterior = process.env.API_LIMITE_CONFIRMACION_POR_MINUTO;
      process.env.API_LIMITE_CONFIRMACION_POR_MINUTO = '3';
      try {
        const token = await nuevoReciclador(limitada, telefono());
        const estados: number[] = [];
        for (let i = 0; i < 5; i++) {
          estados.push(
            (
              await limitada
                .http()
                .post('/api/v1/yo/exportacion')
                .set(bearer(token))
                .send({ contrasena: 'incorrecta-1' })
            ).status,
          );
        }
        expect(estados.slice(0, 3)).toEqual([422, 422, 422]);
        expect(estados.slice(3)).toEqual([429, 429]);
      } finally {
        if (anterior === undefined) delete process.env.API_LIMITE_CONFIRMACION_POR_MINUTO;
        else process.env.API_LIMITE_CONFIRMACION_POR_MINUTO = anterior;
        await limitada.cerrar();
      }
    });
  });

  describe('sesión de administración más corta', () => {
    it('la sesión del administrador vence a las 8 horas de haber iniciado y no se renueva sin fin', async () => {
      await prueba.bd.codigoVerificacion.deleteMany({ where: { destino: ADMIN.telefono, proposito: 'INICIO_ADMIN' } });
      const paso = (
        await http()
          .post('/api/v1/auth/login')
          .send({ identificador: ADMIN.telefono, contrasena: process.env.SEMILLA_CLAVE ?? 'Prueba2026!' })
          .expect(200)
      ).body as {
        tokenTemporal: string;
        codigoDePrueba?: string;
      };
      const codigoAdmin = paso.codigoDePrueba ?? (await codigoAdminConocido(prueba, ADMIN.telefono));
      const abierta = await http()
        .post('/api/v1/auth/admin/verificar')
        .send({ tokenTemporal: paso.tokenTemporal, codigo: codigoAdmin })
        .expect(200);
      const cookie = ([] as string[])
        .concat(abierta.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('rm_refresco='))!;
      const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
      expect(maxAge).toBeLessThanOrEqual(8 * 3600);
      expect(maxAge).toBeGreaterThan(7 * 3600);
      const sesion = (
        await propietario.query(
          'SELECT familia, creada_en, expira_en FROM sesion WHERE usuario_id = (SELECT id FROM usuario WHERE telefono = $1) AND revocada_en IS NULL ORDER BY creada_en DESC LIMIT 1',
          [ADMIN.telefono],
        )
      ).rows[0] as {
        familia: string;
        creada_en: Date;
        expira_en: Date;
      };
      expect(sesion.expira_en.getTime() - sesion.creada_en.getTime()).toBeLessThanOrEqual(8 * HORA + 1000);

      // Renovar no la alarga: el límite sigue contando desde que inició
      const valor = cookie.split(';')[0]!;
      const renovada = await http().post('/api/v1/auth/refresh').set('Cookie', valor).send({}).expect(200);
      const nueva = ([] as string[])
        .concat(renovada.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('rm_refresco='))!;
      expect(Number(/Max-Age=(\d+)/i.exec(nueva)?.[1])).toBeLessThanOrEqual(maxAge);
      const familia = (
        await propietario.query(
          'SELECT max(expira_en) AS limite, min(creada_en) AS inicio FROM sesion WHERE familia = $1',
          [sesion.familia],
        )
      ).rows[0] as { limite: Date; inicio: Date };
      expect(familia.limite.getTime() - familia.inicio.getTime()).toBeLessThanOrEqual(8 * HORA + 1000);

      // Una sesión de administración que ya pasó sus 8 horas no se renueva
      await propietario.query("UPDATE sesion SET creada_en = now() - interval '9 hours' WHERE familia = $1", [
        sesion.familia,
      ]);
      const valorNuevo = nueva.split(';')[0]!;
      expect((await http().post('/api/v1/auth/refresh').set('Cookie', valorNuevo).send({})).status).toBe(401);
    });

    it('la cuenta normal conserva su sesión larga', async () => {
      const tel = telefono();
      await nuevoReciclador(prueba, tel);
      const r = await http().post('/api/v1/auth/login').send({ identificador: tel, contrasena: CLAVE }).expect(200);
      const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('rm_refresco='))!;
      expect(Number(/Max-Age=(\d+)/i.exec(cookie)?.[1])).toBeGreaterThan(20 * 24 * 3600);
    });
  });

  describe('arranque en producción', () => {
    it('con datos semilla en la base la API se niega a arrancar', async () => {
      await expect(verificarArranqueSeguro(prueba.app.get(PrismaApi))).rejects.toThrow(/datos semilla/);
    });

    it('una cuenta de administración con la contraseña de semilla la detiene aunque no haya datos semilla', async () => {
      const hash = await hashearContrasena('Prueba2026!');
      const simulado = {
        usuario: {
          count: () => Promise.resolve(0),
          findMany: () => Promise.resolve([{ hashContrasena: hash }]),
        },
      } as unknown as PrismaApi;
      await expect(verificarArranqueSeguro(simulado)).rejects.toThrow(/contraseña de los datos semilla/);
    });

    it('en la demostración las cuentas de la semilla no detienen el arranque, pero su contraseña de ejemplo sí', async () => {
      const propia = {
        usuario: {
          count: () => Promise.resolve(12),
          findMany: () =>
            Promise.resolve([
              {
                hashContrasena:
                  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              },
            ]),
        },
      } as unknown as PrismaApi;
      await expect(verificarArranqueSeguro(propia)).rejects.toThrow(/datos semilla/);
      await expect(verificarArranqueSeguro(propia, undefined, { demostracion: true })).resolves.toBeUndefined();
      const hash = await hashearContrasena('Prueba2026!');
      const ejemplo = {
        usuario: { count: () => Promise.resolve(12), findMany: () => Promise.resolve([{ hashContrasena: hash }]) },
      } as unknown as PrismaApi;
      await expect(verificarArranqueSeguro(ejemplo, undefined, { demostracion: true })).rejects.toThrow(
        /contraseña de los datos semilla/,
      );
    });

    it('con una base limpia y una contraseña propia arranca', async () => {
      const simulado = {
        usuario: {
          count: () => Promise.resolve(0),
          findMany: () =>
            Promise.resolve([
              {
                hashContrasena:
                  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              },
            ]),
        },
      } as unknown as PrismaApi;
      await expect(verificarArranqueSeguro(simulado)).resolves.toBeUndefined();
    });
  });
});
