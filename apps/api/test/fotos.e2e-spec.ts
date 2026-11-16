import sharp from 'sharp';
import { ADMIN } from '../prisma/datos-semilla.js';
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

type Cuerpo = Record<string, unknown>;
const error = (respuesta: { body: unknown }) => (respuesta.body as { error: { codigo: string } }).error;

// Foto JPG con coordenadas GPS y modelo de cámara en sus metadatos
function fotoConGps(ancho = 2400, alto = 1800): Promise<Buffer> {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: '#2f9b66' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Camara de prueba', Model: 'Modelo X' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '15/1 29/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '70/1 8/1 0/1' },
    })
    .toBuffer();
}

describe('Fotos', () => {
  let prueba: Prueba;
  let centro: string;
  let zonaId: number;

  beforeAll(async () => {
    prueba = await crearPrueba();
    centro = await nuevoNegocio(prueba, '933000001');
    zonaId = await zonaDeJuliaca(prueba);
  });
  afterAll(async () => {
    await prueba.cerrar();
  });

  const subir = (token: string, proposito: string, datos: Buffer, nombre = 'foto.jpg') =>
    prueba.http().post('/api/v1/fotos').set(bearer(token)).field('proposito', proposito).attach('foto', datos, nombre);

  it('reprocesa la foto: quita la ubicación y los datos de la cámara, la achica y la pasa a WebP', async () => {
    const original = await fotoConGps();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const respuesta = await subir(centro, 'NEGOCIO', original).expect(201);
    expect(respuesta.body).toMatchObject({ proposito: 'NEGOCIO', ancho: 1600, alto: 1200 });

    const id = (respuesta.body as Cuerpo).id as string;
    const descargada = await prueba
      .http()
      .get(`/api/v1/fotos/${id}`)
      .set(bearer(centro))
      .buffer(true)
      .parse((res, listo) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => listo(null, Buffer.concat(partes)));
      })
      .expect(200);
    expect(descargada.headers['content-type']).toBe('image/webp');
    const metadatos = await sharp(descargada.body as Buffer).metadata();
    expect(metadatos.format).toBe('webp');
    expect(metadatos.exif).toBeUndefined();
    expect(metadatos.width).toBe(1600);

    const mini = await prueba.http().get(`/api/v1/fotos/${id}?tamano=mini`).set(bearer(centro)).expect(200);
    expect(Number(mini.headers['content-length'])).toBeLessThan(Number(descargada.headers['content-length']));
  });

  it('rechaza archivos que no son imágenes y fotos de más de 8 MB', async () => {
    const texto = await subir(centro, 'NEGOCIO', Buffer.from('no soy una foto'), 'nota.jpg').expect(422);
    expect(error(texto).codigo).toBe('FOTO_NO_VALIDA');
    const grande = await subir(centro, 'NEGOCIO', Buffer.alloc(8 * 1024 * 1024 + 10, 1)).expect(413);
    expect(error(grande).codigo).toBe('ARCHIVO_MUY_GRANDE');
    await prueba.http().post('/api/v1/fotos').set(bearer(centro)).field('proposito', 'NEGOCIO').expect(400);
  });

  it('un reciclador sube solo su foto de perfil, que reemplaza a la anterior', async () => {
    const reciclador = await nuevoReciclador(prueba, '933000002');
    await subir(reciclador, 'NEGOCIO', await fotoConGps(800, 600)).expect(403);

    const primera = await subir(reciclador, 'PERFIL', await fotoConGps(800, 600)).expect(201);
    const segunda = await subir(reciclador, 'PERFIL', await fotoConGps(800, 600)).expect(201);
    const idPrimera = (primera.body as Cuerpo).id as string;
    await prueba.http().get(`/api/v1/fotos/${idPrimera}`).set(bearer(reciclador)).expect(404);
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({
      where: { telefono: '933000002' },
      select: { fotoId: true },
    });
    expect(usuario.fotoId).toBe((segunda.body as Cuerpo).id);
  });

  it('solo la ven su dueño y la administración', async () => {
    const subida = await subir(centro, 'NEGOCIO', await fotoConGps(800, 600)).expect(201);
    const id = (subida.body as Cuerpo).id as string;
    const otro = await nuevoReciclador(prueba, '933000003');
    await prueba.http().get(`/api/v1/fotos/${id}`).set(bearer(otro)).expect(404);
    await prueba.http().get(`/api/v1/fotos/${id}`).expect(404);
    const admin = await entrar(prueba, ADMIN.telefono);
    await prueba.http().get(`/api/v1/fotos/${id}`).set(bearer(admin)).expect(200);
    await prueba.http().delete(`/api/v1/fotos/${id}`).set(bearer(centro)).expect(204);
  });

  it('el registro del negocio guarda sus fotos, la administración las ve y las sueltas se eliminan', async () => {
    const usada = ((await subir(centro, 'NEGOCIO', await fotoConGps(800, 600)).expect(201)).body as Cuerpo)
      .id as string;
    const suelta = ((await subir(centro, 'NEGOCIO', await fotoConGps(800, 600)).expect(201)).body as Cuerpo)
      .id as string;

    const ajena = await nuevoNegocio(prueba, '933000004');
    const deOtro = ((await subir(ajena, 'NEGOCIO', await fotoConGps(800, 600)).expect(201)).body as Cuerpo)
      .id as string;
    const robada = await prueba
      .http()
      .post('/api/v1/mi-negocio/registro/enviar')
      .set(bearer(centro))
      .send({ ...registroCentro(zonaId, 'Acopio Con Fotos'), fotos: [deOtro] })
      .expect(422);
    expect(error(robada).codigo).toBe('FOTO_NO_VALIDA');

    const enviado = await prueba
      .http()
      .post('/api/v1/mi-negocio/registro/enviar')
      .set(bearer(centro))
      .send({ ...registroCentro(zonaId, 'Acopio Con Fotos'), fotos: [usada] })
      .expect(200);
    expect(((enviado.body as Cuerpo).negocio as Cuerpo).fotos).toEqual([usada]);
    await prueba.http().get(`/api/v1/fotos/${suelta}`).set(bearer(centro)).expect(404);

    const enUso = await prueba.http().delete(`/api/v1/fotos/${usada}`).set(bearer(centro)).expect(409);
    expect(error(enUso).codigo).toBe('FOTO_EN_USO');

    const admin = await entrar(prueba, ADMIN.telefono);
    const cola = await prueba.http().get('/api/v1/admin/verificaciones').set(bearer(admin)).expect(200);
    const fila = (cola.body as { datos: { id: string; comprador: { nombreComercial: string } }[] }).datos.find(
      (item) => item.comprador.nombreComercial === 'Acopio Con Fotos',
    )!;
    const detalle = await prueba.http().get(`/api/v1/admin/verificaciones/${fila.id}`).set(bearer(admin)).expect(200);
    expect(((detalle.body as Cuerpo).comprador as Cuerpo).fotos).toEqual([usada]);
  });
});
