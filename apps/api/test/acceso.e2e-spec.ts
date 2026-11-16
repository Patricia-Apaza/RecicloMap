import { ADMIN, NEGOCIOS, RECICLADOR } from '../prisma/datos-semilla.js';
import {
  bearer,
  CLAVE,
  CLAVE_SEMILLA,
  codigoAdminConocido,
  crearPrueba,
  entrar,
  nuevoReciclador,
  type Prueba,
} from './apoyo.js';

type Cuerpo = Record<string, unknown>;
const cuerpo = (respuesta: { body: unknown }) => respuesta.body as Cuerpo;
const error = (respuesta: { body: unknown }) =>
  (respuesta.body as { error: { codigo: string; mensaje: string } }).error;

function cookieRefresco(cabeceras: Record<string, unknown>): string {
  const cookies = (cabeceras['set-cookie'] as string[] | undefined) ?? [];
  const cookie = cookies.find((valor) => valor.startsWith('rm_refresco='));
  if (!cookie) throw new Error('No llegó la cookie de refresco');
  return cookie.split(';')[0]!;
}

describe('Acceso', () => {
  let prueba: Prueba;

  beforeAll(async () => {
    prueba = await crearPrueba();
  });
  afterAll(async () => {
    await prueba.cerrar();
  });

  describe('registro del reciclador', () => {
    const telefono = '911000001';

    it('pide contraseña de al menos 8 caracteres y acepta solo números peruanos', async () => {
      const respuesta = await prueba
        .http()
        .post('/api/v1/auth/registro/reciclador')
        .send({ nombre: 'Rosa Mamani', telefono: '811', contrasena: 'corta', aceptaTerminos: true })
        .expect(400);
      const campos = (respuesta.body as { error: { campos: { campo: string }[] } }).error.campos.map((c) => c.campo);
      expect(campos).toEqual(expect.arrayContaining(['telefono', 'contrasena']));
    });

    it('registra, envía un código de 6 dígitos y no abre sesión hasta verificar', async () => {
      const respuesta = await prueba
        .http()
        .post('/api/v1/auth/registro/reciclador')
        .send({ nombre: 'Rosa Mamani', telefono: '911 000 001', contrasena: CLAVE, aceptaTerminos: true })
        .expect(201);
      expect(cuerpo(respuesta)).toMatchObject({
        siguientePaso: 'VERIFICAR_TELEFONO',
        telefono: '••• ••• 001',
        reenviarEn: 60,
      });
      expect(cuerpo(respuesta).codigoDePrueba).toMatch(/^\d{6}$/);
      expect(prueba.mensajes.ultimoPara(telefono)?.texto).toContain(cuerpo(respuesta).codigoDePrueba as string);
      expect(cuerpo(respuesta).tokenAcceso).toBeUndefined();
    });

    it('no deja reenviar antes de 60 segundos', async () => {
      const respuesta = await prueba.http().post('/api/v1/auth/telefono/enviar-codigo').send({ telefono }).expect(429);
      expect(error(respuesta).codigo).toBe('ESPERA_REENVIO');
    });

    it('rechaza el teléfono repetido', async () => {
      const respuesta = await prueba
        .http()
        .post('/api/v1/auth/registro/reciclador')
        .send({ nombre: 'Otra Persona', telefono, contrasena: CLAVE, aceptaTerminos: true })
        .expect(409);
      expect(error(respuesta).codigo).toBe('TELEFONO_REGISTRADO');
    });

    it('bloquea el código tras 5 intentos fallidos', async () => {
      for (let intento = 1; intento <= 5; intento++) {
        const respuesta = await prueba
          .http()
          .post('/api/v1/auth/telefono/verificar')
          .send({ telefono, codigo: '000000' });
        expect(respuesta.status).toBe(422);
      }
      const bloqueado = await prueba
        .http()
        .post('/api/v1/auth/telefono/verificar')
        .send({ telefono, codigo: '000000' })
        .expect(422);
      expect(error(bloqueado).codigo).toBe('CODIGO_BLOQUEADO');
    });

    it('al verificar abre sesión y pide elegir materiales; luego entrega la insignia Semilla', async () => {
      const token = await nuevoReciclador(prueba, '911000002');
      const perfil = await prueba.http().get('/api/v1/yo').set(bearer(token)).expect(200);
      expect(cuerpo(perfil)).toMatchObject({ rol: 'RECICLADOR', estado: 'ACTIVO', siguientePaso: 'ELEGIR_MATERIALES' });

      const materiales = await prueba
        .http()
        .put('/api/v1/yo/materiales')
        .set(bearer(token))
        .send({ materiales: ['pet', 'plastico'] })
        .expect(200);
      expect(cuerpo(materiales).siguientePaso).toBe('LISTO');
      expect(cuerpo(materiales).insignias).toEqual([expect.objectContaining({ codigo: 'semilla', nombre: 'Semilla' })]);

      const avisos = await prueba.http().get('/api/v1/notificaciones').set(bearer(token)).expect(200);
      expect(JSON.stringify(avisos.body)).toContain('Nueva insignia: Semilla');
    });
  });

  describe('inicio de sesión', () => {
    it('entra con teléfono o correo y contraseña', async () => {
      const porTelefono = await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: RECICLADOR.telefono, contrasena: CLAVE_SEMILLA })
        .expect(200);
      expect(cuerpo(porTelefono).tokenAcceso).toEqual(expect.any(String));
      expect(cookieRefresco(porTelefono.headers)).toMatch(/^rm_refresco=/);
      expect(porTelefono.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);

      const negocio = NEGOCIOS[0]!;
      const conCorreo = await prueba.bd.usuario.update({
        where: { telefono: negocio.telefono },
        data: { correo: 'centro@reciclomap.test' },
      });
      expect(conCorreo.correo).toBe('centro@reciclomap.test');
      await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: 'centro@reciclomap.test', contrasena: CLAVE_SEMILLA })
        .expect(200);
    });

    it('responde igual si la cuenta no existe o si la contraseña es incorrecta', async () => {
      const inexistente = await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: '999999999', contrasena: CLAVE })
        .expect(401);
      const incorrecta = await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: RECICLADOR.telefono, contrasena: 'Equivocada1' })
        .expect(401);
      expect(error(inexistente)).toMatchObject({
        codigo: 'CREDENCIALES_INVALIDAS',
        mensaje: error(incorrecta).mensaje,
      });
    });

    it('la app móvil recibe el token de refresco en el cuerpo', async () => {
      const respuesta = await prueba
        .http()
        .post('/api/v1/auth/login')
        .set('X-Cliente', 'movil')
        .send({ identificador: RECICLADOR.telefono, contrasena: CLAVE_SEMILLA })
        .expect(200);
      expect(cuerpo(respuesta).tokenRefresco).toEqual(expect.any(String));
    });

    it('el administrador necesita además un código enviado a su teléfono', async () => {
      const paso = await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: ADMIN.correo, contrasena: CLAVE_SEMILLA })
        .expect(200);
      expect(cuerpo(paso)).toMatchObject({ siguientePaso: 'CODIGO_ADMIN', tokenTemporal: expect.any(String) });
      expect(cuerpo(paso).tokenAcceso).toBeUndefined();

      await prueba
        .http()
        .post('/api/v1/auth/admin/verificar')
        .send({ tokenTemporal: cuerpo(paso).tokenTemporal, codigo: '000000' })
        .expect(422);
      const codigo =
        (cuerpo(paso).codigoDePrueba as string | undefined) ?? (await codigoAdminConocido(prueba, ADMIN.telefono));
      const sesion = await prueba
        .http()
        .post('/api/v1/auth/admin/verificar')
        .send({ tokenTemporal: cuerpo(paso).tokenTemporal, codigo })
        .expect(200);
      expect(cuerpo(sesion).usuario).toMatchObject({ rol: 'ADMIN' });
    });
  });

  describe('sesiones', () => {
    it('renueva con la cookie, rota el token y detecta su reutilización', async () => {
      const login = await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: RECICLADOR.telefono, contrasena: CLAVE_SEMILLA })
        .expect(200);
      const primera = cookieRefresco(login.headers);

      const renovada = await prueba.http().post('/api/v1/auth/refresh').set('Cookie', primera).expect(200);
      const segunda = cookieRefresco(renovada.headers);
      expect(segunda).not.toBe(primera);

      const reutilizada = await prueba.http().post('/api/v1/auth/refresh').set('Cookie', primera).expect(401);
      expect(error(reutilizada).codigo).toBe('SESION_INVALIDA');
      // Reutilizar un token robado cierra también la sesión legítima
      await prueba.http().post('/api/v1/auth/refresh').set('Cookie', segunda).expect(401);
      await prueba
        .http()
        .get('/api/v1/yo')
        .set(bearer(cuerpo(login).tokenAcceso as string))
        .expect(401);
    });

    it('sin cookie no renueva', async () => {
      const respuesta = await prueba.http().post('/api/v1/auth/refresh').expect(401);
      expect(error(respuesta).codigo).toBe('SESION_INVALIDA');
    });

    it('cerrar sesión invalida el acceso al instante', async () => {
      const login = await prueba
        .http()
        .post('/api/v1/auth/login')
        .send({ identificador: RECICLADOR.telefono, contrasena: CLAVE_SEMILLA })
        .expect(200);
      const token = cuerpo(login).tokenAcceso as string;
      await prueba.http().post('/api/v1/auth/logout').set('Cookie', cookieRefresco(login.headers)).expect(204);
      await prueba.http().get('/api/v1/yo').set(bearer(token)).expect(401);
    });

    it('cerrar todas las sesiones cierra los demás dispositivos', async () => {
      const uno = await entrar(prueba, RECICLADOR.telefono);
      const dos = await entrar(prueba, RECICLADOR.telefono);
      await prueba.http().post('/api/v1/auth/logout-todas').set(bearer(uno)).expect(204);
      await prueba.http().get('/api/v1/yo').set(bearer(dos)).expect(401);
    });

    it('rechaza rutas privadas sin sesión o con un token alterado', async () => {
      await prueba.http().get('/api/v1/yo').expect(401);
      await prueba.http().get('/api/v1/yo').set(bearer('no-es-un-token')).expect(401);
    });
  });

  describe('recuperación de contraseña', () => {
    const telefono = '911000003';

    beforeAll(async () => {
      await nuevoReciclador(prueba, telefono);
    });

    it('responde lo mismo exista o no la cuenta', async () => {
      const existe = await prueba.http().post('/api/v1/auth/recuperar').send({ identificador: telefono }).expect(200);
      const noExiste = await prueba
        .http()
        .post('/api/v1/auth/recuperar')
        .send({ identificador: '911999999' })
        .expect(200);
      const { codigoDePrueba, ...publico } = cuerpo(existe);
      expect(codigoDePrueba).toMatch(/^\d{6}$/);
      expect(publico).toEqual(cuerpo(noExiste));
    });

    it('cambiar la contraseña por recuperación cierra todas las sesiones', async () => {
      const abierta = await entrar(prueba, telefono, CLAVE);
      const codigo = prueba.mensajes.ultimoPara(telefono)!.texto.match(/\d{6}/)![0];
      const verificado = await prueba
        .http()
        .post('/api/v1/auth/recuperar/verificar')
        .send({ identificador: telefono, codigo })
        .expect(200);
      await prueba
        .http()
        .post('/api/v1/auth/recuperar/restablecer')
        .send({ tokenRestablecer: cuerpo(verificado).tokenRestablecer, contrasena: 'NuevaClave2026' })
        .expect(204);

      await prueba.http().get('/api/v1/yo').set(bearer(abierta)).expect(401);
      await prueba.http().post('/api/v1/auth/login').send({ identificador: telefono, contrasena: CLAVE }).expect(401);
      await entrar(prueba, telefono, 'NuevaClave2026');
    });

    it('cambiar la contraseña desde la cuenta exige la actual y cierra las sesiones', async () => {
      const uno = await entrar(prueba, telefono, 'NuevaClave2026');
      const dos = await entrar(prueba, telefono, 'NuevaClave2026');
      await prueba
        .http()
        .put('/api/v1/auth/contrasena')
        .set(bearer(uno))
        .send({ actual: 'Equivocada1', nueva: CLAVE })
        .expect(422);
      await prueba
        .http()
        .put('/api/v1/auth/contrasena')
        .set(bearer(uno))
        .send({ actual: 'NuevaClave2026', nueva: CLAVE })
        .expect(204);
      await prueba.http().get('/api/v1/yo').set(bearer(dos)).expect(401);
    });
  });

  describe('Google', () => {
    it('una cuenta nueva pasa por "Completa tu cuenta" con rol y teléfono verificado', async () => {
      const inicio = await prueba
        .http()
        .post('/api/v1/auth/google')
        .send({ credencial: 'google|g-001|luz@gmail.com|Luz Condori' })
        .expect(200);
      expect(cuerpo(inicio)).toMatchObject({
        siguientePaso: 'COMPLETAR_CUENTA_GOOGLE',
        nombre: 'Luz Condori',
        correo: 'luz@gmail.com',
      });

      const completar = await prueba
        .http()
        .post('/api/v1/auth/google/completar')
        .send({
          tokenTemporal: cuerpo(inicio).tokenTemporal,
          rol: 'RECICLADOR',
          telefono: '911000004',
          aceptaTerminos: true,
        })
        .expect(201);
      expect(cuerpo(completar).siguientePaso).toBe('VERIFICAR_TELEFONO');
      await prueba
        .http()
        .post('/api/v1/auth/telefono/verificar')
        .send({ telefono: '911000004', codigo: cuerpo(completar).codigoDePrueba })
        .expect(200);

      const otraVez = await prueba
        .http()
        .post('/api/v1/auth/google')
        .send({ credencial: 'google|g-001|luz@gmail.com|Luz Condori' })
        .expect(200);
      expect(cuerpo(otraVez).usuario).toMatchObject({ nombre: 'Luz Condori', rol: 'RECICLADOR' });
    });

    it('no permite crear cuentas de administración', async () => {
      const inicio = await prueba.http().post('/api/v1/auth/google').send({ credencial: 'google|g-002' }).expect(200);
      await prueba
        .http()
        .post('/api/v1/auth/google/completar')
        .send({
          tokenTemporal: cuerpo(inicio).tokenTemporal,
          rol: 'ADMIN',
          telefono: '911000005',
          aceptaTerminos: true,
        })
        .expect(400);
    });
  });

  describe('cuenta suspendida', () => {
    it('puede consultar pero no puede hacer cambios', async () => {
      const telefono = '911000006';
      const token = await nuevoReciclador(prueba, telefono);
      await prueba.bd.usuario.update({
        where: { telefono },
        data: { estado: 'SUSPENDIDO', motivoSuspension: 'Prueba de suspensión' },
      });

      await prueba.http().get('/api/v1/yo').set(bearer(token)).expect(200);
      const cambio = await prueba
        .http()
        .put('/api/v1/yo/materiales')
        .set(bearer(token))
        .send({ materiales: ['pet'] })
        .expect(403);
      expect(error(cambio).codigo).toBe('CUENTA_SUSPENDIDA');
    });
  });

  describe('permisos por rol', () => {
    it('un reciclador no entra a la cola del administrador ni a "Mi negocio"', async () => {
      const token = await entrar(prueba, RECICLADOR.telefono);
      const admin = await prueba.http().get('/api/v1/admin/verificaciones').set(bearer(token)).expect(403);
      expect(error(admin).codigo).toBe('SIN_PERMISO');
      await prueba.http().get('/api/v1/mi-negocio').set(bearer(token)).expect(403);
    });

    it('los catálogos son públicos', async () => {
      const materiales = await prueba.http().get('/api/v1/materiales').expect(200);
      expect((materiales.body as { datos: { nombre: string }[] }).datos.map((m) => m.nombre)).toContain(
        'Plástico duro',
      );
    });
  });
});

describe('Límite de intentos de acceso', () => {
  let prueba: Prueba;

  beforeAll(async () => {
    prueba = await crearPrueba({ conLimite: true });
  });
  afterAll(async () => {
    await prueba.cerrar();
  });

  it('frena los intentos repetidos de inicio de sesión', async () => {
    const intentos = [];
    for (let intento = 0; intento < 11; intento++) {
      intentos.push(
        (await prueba.http().post('/api/v1/auth/login').send({ identificador: '999999998', contrasena: CLAVE })).status,
      );
    }
    expect(intentos.slice(0, 10).every((estado) => estado === 401)).toBe(true);
    expect(intentos[10]).toBe(429);
  });
});
