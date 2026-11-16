import { ADMIN, ORIGEN } from '../prisma/datos-semilla.js';
import { calcularSemaforo } from '../src/modulos/mapa/semaforo.js';
import { PreciosAviso } from '../src/modulos/precios/precios-aviso.js';
import { Configuracion } from '../src/nucleo/configuracion/configuracion.js';
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

type Opcion = {
  id: string;
  nombre: string;
  tipo: 'CENTRO' | 'MOVIL';
  esPro: boolean;
  destacado: boolean;
  distanciaKm: number;
  estado: { abierto: boolean | null; texto: string };
  pagos: string[];
  precio: { min: string; max: string; antiguo: boolean };
  semaforo: { clave: string; texto: string; comparadoEntre: number };
  demanda: string;
};
type Resultado = { comparadoEntre: number; opciones: Opcion[] };
type Material = {
  material: { codigo: string };
  min: string;
  max: string;
  semaforo: { clave: string; comparadoEntre: number };
};

const POSICION = `${ORIGEN.lat.toFixed(3)},${ORIGEN.lng.toFixed(3)}`;
const error = (respuesta: { body: unknown }) =>
  (respuesta.body as { error: { codigo: string; mensaje: string; campos?: Array<{ mensaje: string }> } }).error;

describe('Mapa, semáforo y precios', () => {
  let prueba: Prueba;

  beforeAll(async () => {
    prueba = await crearPrueba();
  });
  afterAll(async () => {
    await prueba.cerrar();
  });

  const buscar = async (consulta: string, cabeceras: Record<string, string> = { 'X-Posicion': POSICION }) =>
    (await prueba.http().get(`/api/v1/compradores?${consulta}`).set(cabeceras).expect(200)).body as Resultado;

  describe('lista y mapa (09, 10)', () => {
    it('pide material y ubicación; el invitado puede buscar sin sesión', async () => {
      expect(error(await prueba.http().get('/api/v1/compradores?material=pet').expect(400)).codigo).toBe(
        'UBICACION_REQUERIDA',
      );
      await prueba.http().get('/api/v1/compradores').set('X-Posicion', POSICION).expect(400);
      await prueba.http().get('/api/v1/compradores?material=pet&radio=7').set('X-Posicion', POSICION).expect(400);
      expect(
        error(await prueba.http().get('/api/v1/compradores?material=pet').set('X-Posicion', 'Juliaca').expect(400))
          .codigo,
      ).toBe('POSICION_NO_VALIDA');
      const resultado = await buscar('material=pet&radio=20');
      expect(resultado.opciones.length).toBeGreaterThan(3);
    });

    it('el semáforo llega calculado, con texto, y es el de RN-01 sobre las opciones visibles', async () => {
      const resultado = await buscar('material=pet&radio=10');
      expect(resultado.comparadoEntre).toBe(resultado.opciones.length);
      const esperado = calcularSemaforo(
        resultado.opciones.map((o) => ({ id: o.id, min: Number(o.precio.min), max: Number(o.precio.max) })),
      );
      for (const opcion of resultado.opciones) {
        expect(opcion.semaforo.clave).toBe(esperado.get(opcion.id));
        expect(opcion.semaforo.texto).toMatch(/Mejor precio|Precio intermedio|Precio bajo|Sin comparación/);
        expect(['ALTA', 'MEDIA', 'BAJA']).toContain(opcion.demanda);
      }
    });

    it('solo aparecen negocios verificados (RN-18)', async () => {
      const nombres = (await buscar('material=pet&radio=20')).opciones.map((o) => o.nombre);
      expect(nombres).not.toContain('Acopio Los Pinos');
      expect(nombres).not.toContain('Reciclajes Sur');
    });

    it('al cambiar el radio cambian los resultados y el conjunto comparado', async () => {
      const cerca = await buscar('material=pet&radio=1');
      const lejos = await buscar('material=pet&radio=20');
      expect(cerca.opciones.length).toBeLessThan(lejos.opciones.length);
      expect(cerca.opciones.every((o) => o.distanciaKm <= 1)).toBe(true);
    });

    it('filtra por tipo, por disponibilidad del móvil y acepta la zona elegida a mano', async () => {
      const moviles = await buscar('material=pet&radio=20&tipo=movil');
      expect(moviles.opciones.every((o) => o.tipo === 'MOVIL')).toBe(true);
      const abiertos = await buscar('material=pet&radio=20&tipo=movil&soloAbiertos=true');
      expect(abiertos.opciones.every((o) => o.estado.texto === 'Disponible')).toBe(true);
      expect(abiertos.opciones.length).toBeLessThan(moviles.opciones.length);
      const zona = await zonaDeJuliaca(prueba);
      const porZona = await buscar('material=pet&radio=20', { 'X-Zona': String(zona) });
      expect(porZona.opciones.length).toBeGreaterThan(0);
    });

    it('Pro solo cambia el orden "Recomendado": nunca el semáforo ni otros órdenes (RN-03)', async () => {
      const antes = await buscar('material=pet&radio=20&orden=precio');
      const recomendado = await buscar('material=pet&radio=20&orden=recomendado');
      const primeroNoPro = recomendado.opciones.findIndex((o) => !o.esPro);
      expect(recomendado.opciones.slice(0, primeroNoPro).every((o) => o.destacado)).toBe(true);

      // Se vuelve Pro al negocio con el precio más bajo
      const ultimo = antes.opciones.at(-1)!;
      const hoy = new Date();
      await prueba.bd.comprador.update({
        where: { id: ultimo.id },
        data: {
          plan: 'PRO',
          planDesde: new Date(hoy.getTime() - 86_400_000),
          planHasta: new Date(hoy.getTime() + 30 * 86_400_000),
        },
      });
      try {
        const despues = await buscar('material=pet&radio=20&orden=precio');
        expect(despues.opciones.map((o) => o.id)).toEqual(antes.opciones.map((o) => o.id));
        expect(despues.opciones.map((o) => o.semaforo.clave)).toEqual(antes.opciones.map((o) => o.semaforo.clave));
        expect(despues.opciones.some((o) => o.destacado)).toBe(false);
        const conPro = await buscar('material=pet&radio=20&orden=recomendado');
        expect(conPro.opciones.find((o) => o.id === ultimo.id)?.destacado).toBe(true);
      } finally {
        await prueba.bd.comprador.update({
          where: { id: ultimo.id },
          data: { plan: 'GRATIS', planDesde: null, planHasta: null },
        });
      }
    });

    it('un precio suspendido por el admin no aparece para ese material, pero sí los otros', async () => {
      const pet = await buscar('material=pet&radio=20');
      const elegido = pet.opciones[0]!;
      const precio = await prueba.bd.precioMaterial.findFirstOrThrow({
        where: { compradorId: elegido.id, material: { codigo: 'pet' } },
        select: { id: true },
      });
      const admin = await prueba.bd.usuario.findUniqueOrThrow({
        where: { telefono: ADMIN.telefono },
        select: { id: true },
      });
      const moderacion = await prueba.bd.moderacionPrecio.create({
        data: {
          precioMaterialId: precio.id,
          estado: 'SUSPENDIDO',
          motivo: 'Precio fuera de lo habitual',
          adminId: admin.id,
        },
      });
      try {
        expect((await buscar('material=pet&radio=20')).opciones.map((o) => o.id)).not.toContain(elegido.id);
        expect((await buscar('material=carton&radio=20')).opciones.map((o) => o.id)).toContain(elegido.id);
      } finally {
        await prueba.bd.moderacionPrecio.update({
          where: { id: moderacion.id },
          data: { cerradaEn: new Date(), motivoCierre: 'Fin de la prueba' },
        });
      }
    });
  });

  describe('detalle del negocio (15)', () => {
    it('mismo semáforo que la lista para el mismo conjunto', async () => {
      const lista = await buscar('material=pet&radio=20');
      for (const opcion of lista.opciones.slice(0, 3)) {
        const detalle = (
          await prueba
            .http()
            .get(`/api/v1/compradores/${opcion.id}?material=pet&radio=20`)
            .set('X-Posicion', POSICION)
            .expect(200)
        ).body as { materiales: Material[] };
        const pet = detalle.materiales.find((m) => m.material.codigo === 'pet')!;
        expect(pet.semaforo).toEqual(opcion.semaforo);
      }
    });

    it('muestra la ficha pública y no muestra negocios sin verificar', async () => {
      const centro = (await buscar('material=pet&radio=20&tipo=centro')).opciones[0]!;
      const ficha = (await prueba.http().get(`/api/v1/compradores/${centro.id}`).expect(200)).body as Record<
        string,
        unknown
      >;
      expect(ficha).toMatchObject({ tipo: 'CENTRO', distanciaKm: null, whatsapp: expect.any(String) });
      expect((ficha.horario as { dias: unknown[] }).dias.length).toBeGreaterThan(0);
      const pendiente = await prueba.bd.comprador.findFirstOrThrow({
        where: { nombreComercial: 'Acopio Los Pinos' },
        select: { id: true },
      });
      await prueba.http().get(`/api/v1/compradores/${pendiente.id}`).expect(404);
    });

    it('el comprador móvil sin días ni métodos de pago declarados queda "No indicado", sin inventarlos', async () => {
      const token = await nuevoNegocio(prueba, '944000001', 'MOVIL');
      const zonaId = await zonaDeJuliaca(prueba);
      const {
        direccion: _d,
        ubicacion: _u,
        horario: _h,
        pagos: _p,
        ...resto
      } = registroCentro(zonaId, 'Recojo Sin Días');
      await prueba
        .http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(token))
        .send({ ...resto, tipo: 'MOVIL', vehiculo: 'TRICICLO', horario: { abre: '07:00', cierra: '16:00' } })
        .expect(200);
      const comprador = await prueba.bd.comprador.findFirstOrThrow({
        where: { nombreComercial: 'Recojo Sin Días' },
        select: { id: true },
      });
      await prueba.bd.comprador.update({ where: { id: comprador.id }, data: { estadoVerificacion: 'APROBADO' } });
      const ficha = (await prueba.http().get(`/api/v1/compradores/${comprador.id}`).expect(200)).body as Record<
        string,
        unknown
      >;
      expect(ficha).toMatchObject({ pagos: [], horario: { dias: [], habitual: { abre: '07:00', cierra: '16:00' } } });
      expect(ficha.estado).toMatchObject({ texto: 'Disponible' });
      expect(await prueba.bd.compradorHorario.count({ where: { compradorId: comprador.id } })).toBe(0);
    });
  });

  describe('precios del negocio (43)', () => {
    it('el negocio ve su semáforo frente al mercado sin nombres de otros', async () => {
      const token = await entrar(prueba, '900000012');
      const respuesta = await prueba.http().get('/api/v1/mi-negocio/precios').set(bearer(token)).expect(200);
      const texto = JSON.stringify(respuesta.body);
      expect(texto).not.toContain('Acopio Titicaca');
      const materiales = (respuesta.body as { materiales: Material[] }).materiales;
      expect(materiales).toHaveLength(5);
      expect(materiales.find((m) => m.material.codigo === 'pet')?.semaforo).toMatchObject({
        clave: expect.any(String),
      });
    });

    it('guardar cambia el precio, deja historial y valida el rango con el nombre del material', async () => {
      const token = await entrar(prueba, '900000013');
      const malo = await prueba
        .http()
        .put('/api/v1/mi-negocio/precios')
        .set(bearer(token))
        .send({ precios: { pet: { min: 3, max: 2 } } })
        .expect(400);
      expect(error(malo).campos?.map((c) => c.mensaje)).toContain(
        'En PET, el precio máximo no puede ser menor que el mínimo.',
      );
      const antes = (
        (await prueba.http().get('/api/v1/mi-negocio/precios/historial').set(bearer(token)).expect(200)).body as {
          datos: unknown[];
        }
      ).datos.length;
      const guardado = await prueba
        .http()
        .put('/api/v1/mi-negocio/precios')
        .set(bearer(token))
        .send({ precios: { pet: { min: 2.15, max: 2.65, demanda: 'ALTA' }, carton: { min: 0.4, max: 0.55 } } })
        .expect(200);
      const materiales = (guardado.body as { materiales: Array<Material & { activo: boolean; demanda: string }> })
        .materiales;
      expect(materiales.find((m) => m.material.codigo === 'pet')).toMatchObject({
        activo: true,
        min: '2.15',
        max: '2.65',
        demanda: 'ALTA',
      });
      expect(materiales.find((m) => m.material.codigo === 'metal')).toMatchObject({ activo: false });
      const despues = (
        (await prueba.http().get('/api/v1/mi-negocio/precios/historial').set(bearer(token)).expect(200)).body as {
          datos: unknown[];
        }
      ).datos.length;
      expect(despues).toBeGreaterThan(antes);
    });

    it('nadie más cambia precios: ni el admin ni un negocio sin verificar', async () => {
      const admin = await entrar(prueba, ADMIN.telefono);
      await prueba
        .http()
        .put('/api/v1/mi-negocio/precios')
        .set(bearer(admin))
        .send({ precios: { pet: { min: 1, max: 2 } } })
        .expect(403);
      const pendiente = await nuevoNegocio(prueba, '944000002');
      const zonaId = await zonaDeJuliaca(prueba);
      await prueba
        .http()
        .post('/api/v1/mi-negocio/registro/enviar')
        .set(bearer(pendiente))
        .send(registroCentro(zonaId, 'Centro Pendiente'))
        .expect(200);
      const respuesta = await prueba
        .http()
        .put('/api/v1/mi-negocio/precios')
        .set(bearer(pendiente))
        .send({ precios: { pet: { min: 1, max: 2 } } })
        .expect(403);
      expect(error(respuesta).codigo).toBe('NEGOCIO_NO_VERIFICADO');
      const reciclador = await nuevoReciclador(prueba, '944000003');
      await prueba.http().get('/api/v1/mi-negocio/precios').set(bearer(reciclador)).expect(403);
    });

    it('el aviso de precio desactualizado llega una sola vez por período', async () => {
      const negocio = await prueba.bd.comprador.findFirstOrThrow({
        where: { nombreComercial: 'Recicla Puno Sur' },
        select: { id: true, usuarioId: true },
      });
      await prueba.bd.precioMaterial.updateMany({
        where: { compradorId: negocio.id },
        data: { actualizadoEn: new Date(Date.now() - 10 * 86_400_000) },
      });
      const aviso = prueba.app.get(PreciosAviso);
      expect(await aviso.avisarDesactualizados()).toBeGreaterThan(0);
      const primera = await prueba.bd.notificacion.count({
        where: { usuarioId: negocio.usuarioId, titulo: 'Actualiza tus precios' },
      });
      await aviso.avisarDesactualizados();
      const segunda = await prueba.bd.notificacion.count({
        where: { usuarioId: negocio.usuarioId, titulo: 'Actualiza tus precios' },
      });
      expect(primera).toBe(1);
      expect(segunda).toBe(1);
      const lista = await buscar('material=pet&radio=20');
      expect(lista.opciones.find((o) => o.id === negocio.id)?.precio.antiguo).toBe(true);
    });
  });

  describe('pin del centro', () => {
    it('un centro registrado antes coloca su pin una vez y dentro de su ciudad', async () => {
      const token = await entrar(prueba, '900000014');
      // Simula un centro aprobado antes de que existiera el pin
      await prueba.bd.comprador.updateMany({
        where: { telefonoNegocio: '900000014' },
        data: { ubicacionConfirmada: false },
      });
      const fuera = await prueba
        .http()
        .put('/api/v1/mi-negocio/ubicacion')
        .set(bearer(token))
        .send({ ubicacion: { lat: -12.05, lng: -77.04 } })
        .expect(422);
      expect(error(fuera).codigo).toBe('PIN_FUERA_DE_LA_CIUDAD');
      await prueba
        .http()
        .put('/api/v1/mi-negocio/ubicacion')
        .set(bearer(token))
        .send({ ubicacion: { lat: -15.49, lng: -70.12 } })
        .expect(200);
      expect(
        error(
          await prueba
            .http()
            .put('/api/v1/mi-negocio/ubicacion')
            .set(bearer(token))
            .send({ ubicacion: { lat: -15.49, lng: -70.12 } })
            .expect(409),
        ).codigo,
      ).toBe('PIN_YA_COLOCADO');
    });

    it('con el mapa disponible el registro del centro exige el pin, y dentro de su ciudad', async () => {
      const mapas = prueba.app.get(Configuracion).googleMaps as { claveNavegador: string | undefined };
      mapas.claveNavegador = 'clave-de-pruebas';
      try {
        const token = await nuevoNegocio(prueba, '944000004');
        const zonaId = await zonaDeJuliaca(prueba);
        const { ubicacion: _u, ...sinPin } = registroCentro(zonaId, 'Centro Sin Pin');
        const enviar = (cuerpo: object) =>
          prueba.http().post('/api/v1/mi-negocio/registro/enviar').set(bearer(token)).send(cuerpo);
        expect(error(await enviar(sinPin).expect(422)).codigo).toBe('PIN_REQUERIDO');
        const fuera = await enviar({ ...sinPin, ubicacion: { lat: -12.05, lng: -77.04 } }).expect(422);
        expect(error(fuera).codigo).toBe('PIN_FUERA_DE_LA_CIUDAD');
      } finally {
        mapas.claveNavegador = undefined;
      }
    });

    it('sin clave de Google Maps (solo fuera de producción) la zona basta como respaldo', async () => {
      const token = await nuevoNegocio(prueba, '944000006');
      const zonaId = await zonaDeJuliaca(prueba);
      const { ubicacion: _u, ...sinPin } = registroCentro(zonaId, 'Centro Por Zona');
      await prueba.http().post('/api/v1/mi-negocio/registro/enviar').set(bearer(token)).send(sinPin).expect(200);
      const estado = (await prueba.http().get('/api/v1/mi-negocio').set(bearer(token)).expect(200)).body as {
        negocio: { ubicacionConfirmada: boolean; ubicacion: unknown };
      };
      expect(estado.negocio).toMatchObject({ ubicacionConfirmada: false, ubicacion: null });
    });
  });

  describe('búsquedas guardadas (11) y catálogos', () => {
    it('el reciclador guarda hasta 5 búsquedas y las borra', async () => {
      const token = await nuevoReciclador(prueba, '944000005');
      const ids: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const respuesta = await prueba
          .http()
          .post('/api/v1/busquedas')
          .set(bearer(token))
          .send({ nombre: `PET ${i}`, filtros: { material: 'pet', radio: 5, tipo: 'centro' } })
          .expect(201);
        ids.push((respuesta.body as { id: string }).id);
      }
      const sexta = await prueba
        .http()
        .post('/api/v1/busquedas')
        .set(bearer(token))
        .send({ nombre: 'Otra', filtros: { material: 'pet' } })
        .expect(409);
      expect(error(sexta).codigo).toBe('DEMASIADAS_BUSQUEDAS');
      await prueba.http().delete(`/api/v1/busquedas/${ids[0]}`).set(bearer(token)).expect(204);
      const lista = (await prueba.http().get('/api/v1/busquedas').set(bearer(token)).expect(200)).body as {
        datos: Array<{ filtros: { radio: number } }>;
      };
      expect(lista.datos).toHaveLength(4);
      expect(lista.datos[0]?.filtros.radio).toBe(5);
      const negocio = await entrar(prueba, '900000011');
      await prueba.http().get('/api/v1/busquedas').set(bearer(negocio)).expect(403);
    });

    it('el rango real por material sale de los negocios verificados visibles', async () => {
      const respuesta = (await prueba.http().get('/api/v1/precios/referencia').expect(200)).body as {
        ciudad: { nombre: string };
        materiales: Array<{ codigo: string; min: string; max: string; negocios: number }>;
      };
      expect(respuesta.ciudad.nombre).toBe('Juliaca');
      const pet = respuesta.materiales.find((m) => m.codigo === 'pet')!;
      expect(Number(pet.min)).toBeLessThanOrEqual(Number(pet.max));
      expect(pet.negocios).toBeGreaterThan(1);
    });

    it('la configuración pública da los radios y, sin clave, ningún mapa', async () => {
      const respuesta = (await prueba.http().get('/api/v1/configuracion-publica').expect(200)).body as Record<
        string,
        unknown
      >;
      expect(respuesta).toMatchObject({ radiosKm: [1, 3, 5, 10, 20], radioDefectoKm: 5, diasPrecioAlDia: 7 });
      expect(respuesta).toHaveProperty('googleMaps');
    });
  });
});
