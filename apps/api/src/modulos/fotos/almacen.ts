import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { Configuracion } from '../../nucleo/configuracion/configuracion.js';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

// Se inyecta como clase abstracta: S3 en local (SeaweedFS) y en la nube, memoria en pruebas
export abstract class Almacen {
  abstract guardar(clave: string, datos: Buffer, tipo: string): Promise<void>;
  abstract leer(clave: string): Promise<Buffer>;
  abstract borrar(clave: string): Promise<void>;
}

const NO_DISPONIBLE = () =>
  new ErrorNegocio(
    'FOTOS_NO_DISPONIBLES',
    'No pudimos guardar la foto por ahora. Intenta de nuevo en un momento.',
    503,
  );

export class AlmacenMemoria extends Almacen {
  private readonly objetos = new Map<string, Buffer>();

  guardar(clave: string, datos: Buffer): Promise<void> {
    this.objetos.set(clave, datos);
    return Promise.resolve();
  }

  leer(clave: string): Promise<Buffer> {
    const datos = this.objetos.get(clave);
    return datos
      ? Promise.resolve(datos)
      : Promise.reject(new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa foto.', 404));
  }

  tiene(clave: string): boolean {
    return this.objetos.has(clave);
  }

  borrar(clave: string): Promise<void> {
    this.objetos.delete(clave);
    return Promise.resolve();
  }
}

@Injectable()
export class AlmacenS3 extends Almacen {
  private readonly registro = new Logger('Almacen');
  private readonly cliente: S3Client | undefined;
  private readonly bucket: string;
  private listo: Promise<void> | undefined;

  constructor(configuracion: Configuracion) {
    super();
    const { url, region, bucket, claveAcceso, claveSecreta } = configuracion.almacen;
    this.bucket = bucket;
    if (claveAcceso && claveSecreta) {
      this.cliente = new S3Client({
        endpoint: url,
        region,
        forcePathStyle: true,
        credentials: { accessKeyId: claveAcceso, secretAccessKey: claveSecreta },
      });
    }
  }

  async guardar(clave: string, datos: Buffer, tipo: string): Promise<void> {
    const cliente = await this.preparado();
    await this.intentar(() =>
      cliente.send(new PutObjectCommand({ Bucket: this.bucket, Key: clave, Body: datos, ContentType: tipo })),
    );
  }

  async leer(clave: string): Promise<Buffer> {
    const cliente = await this.preparado();
    const respuesta = await this.intentar(() =>
      cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: clave })),
    );
    if (!respuesta.Body) throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa foto.', 404);
    return Buffer.from(await respuesta.Body.transformToByteArray());
  }

  async borrar(clave: string): Promise<void> {
    const cliente = await this.preparado();
    await this.intentar(() => cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave })));
  }

  // Crea el bucket la primera vez; en la nube ya existirá y solo se comprueba
  private async preparado(): Promise<S3Client> {
    const cliente = this.cliente;
    if (!cliente) throw NO_DISPONIBLE();
    this.listo ??= (async () => {
      try {
        await cliente.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        await cliente.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
    })().catch((error: unknown) => {
      this.listo = undefined;
      this.registro.error(`El almacén de fotos no responde: ${(error as Error).message}`);
      throw NO_DISPONIBLE();
    });
    await this.listo;
    return cliente;
  }

  private async intentar<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (error instanceof ErrorNegocio) throw error;
      const nombre = (error as { name?: string }).name;
      if (nombre === 'NoSuchKey' || nombre === 'NotFound') {
        throw new ErrorNegocio('NO_ENCONTRADO', 'No encontramos esa foto.', 404);
      }
      this.registro.error(`Error del almacén de fotos: ${(error as Error).message}`);
      throw NO_DISPONIBLE();
    }
  }
}
