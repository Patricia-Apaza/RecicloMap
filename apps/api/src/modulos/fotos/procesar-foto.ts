import sharp from 'sharp';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';

export const TAMANO_MAXIMO_FOTO = 8 * 1024 * 1024;
export const LADO_MAXIMO = 1600;
export const LADO_MINIATURA = 400;
const FORMATOS = new Set(['jpeg', 'png', 'webp']);

export type FotoProcesada = { foto: Buffer; miniatura: Buffer; ancho: number; alto: number };

// Se decodifica y se vuelve a codificar: así no queda ningún metadato (GPS, cámara, fecha)
export async function procesarFoto(original: Buffer): Promise<FotoProcesada> {
  const invalida = () =>
    new ErrorNegocio('FOTO_NO_VALIDA', 'Sube una foto en formato JPG, PNG o WebP.', 422, [
      { campo: 'foto', mensaje: 'Formato no admitido.' },
    ]);
  let formato: string | undefined;
  try {
    formato = (await sharp(original, { limitInputPixels: 50_000_000 }).metadata()).format;
  } catch {
    throw invalida();
  }
  if (!formato || !FORMATOS.has(formato)) throw invalida();

  const base = () => sharp(original, { limitInputPixels: 50_000_000 }).rotate();
  const { data: foto, info } = await base()
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const miniatura = await base()
    .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: 'cover' })
    .webp({ quality: 72 })
    .toBuffer();
  return { foto, miniatura, ancho: info.width, alto: info.height };
}
