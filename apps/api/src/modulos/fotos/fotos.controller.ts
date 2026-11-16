import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ErrorNegocio } from '../../nucleo/errores/error-negocio.js';
import {
  PermiteEstados,
  Publica,
  type SolicitudConUsuario,
  UsuarioActual,
  type UsuarioSesion,
} from '../../nucleo/seguridad/decoradores.js';
import { ConsultaZod } from '../../nucleo/swagger/cuerpo-zod.js';
import { ValidarCon } from '../../nucleo/validacion/validar-con.js';
import { FotosService, type TamanoFoto } from './fotos.service.js';
import { TAMANO_MAXIMO_FOTO } from './procesar-foto.js';

const esquemaSubida = z.object({
  proposito: z.enum(['PERFIL', 'NEGOCIO', 'PUBLICACION'], {
    error: 'Indica si es tu foto de perfil, del negocio o de tu material.',
  }),
});
const esquemaTamano = z.enum(['completa', 'mini']).default('completa');

@ApiTags('Fotos')
@ApiBearerAuth()
@Controller('fotos')
export class FotosController {
  constructor(private readonly fotos: FotosService) {}

  @Post()
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: TAMANO_MAXIMO_FOTO, files: 1 } }))
  @ApiOperation({
    summary: 'Sube una foto: se reprocesa sin metadatos (ubicación, cámara), a 1600 px como máximo y en WebP',
    description:
      'PERFIL reemplaza la foto de perfil. NEGOCIO queda lista para el registro del negocio. PUBLICACION (solo recicladores) queda lista para una publicación.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['foto', 'proposito'],
      properties: {
        foto: { type: 'string', format: 'binary', description: 'JPG, PNG o WebP de hasta 8 MB' },
        proposito: { type: 'string', enum: ['PERFIL', 'NEGOCIO', 'PUBLICACION'] },
      },
    },
  })
  @ApiCreatedResponse({
    schema: { example: { id: '3f0c…', proposito: 'NEGOCIO', ancho: 1600, alto: 1200, bytes: 182344 } },
  })
  @ApiPayloadTooLargeResponse({ description: 'Pesa más de 8 MB' })
  @ApiUnprocessableEntityResponse({ description: 'No es una imagen JPG, PNG o WebP' })
  subir(
    @UsuarioActual() usuario: UsuarioSesion,
    @UploadedFile() archivo: { buffer: Buffer } | undefined,
    @Body(new ValidarCon(esquemaSubida)) datos: z.infer<typeof esquemaSubida>,
  ) {
    if (!archivo) {
      throw new ErrorNegocio('ENTRADA_NO_VALIDA', 'Elige una foto.', 400, [
        { campo: 'foto', mensaje: 'Elige una foto.' },
      ]);
    }
    return this.fotos.subir(usuario, datos.proposito, archivo.buffer);
  }

  @Get(':id')
  @Publica()
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({
    summary:
      'Muestra una foto: a su dueño y a la administración; a cualquiera si es de un negocio verificado; a los negocios verificados de la ciudad si es de una publicación',
  })
  @ConsultaZod('tamano', esquemaTamano)
  @ApiOkResponse({ content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } } })
  @ApiNotFoundResponse()
  async ver(
    @Req() solicitud: SolicitudConUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tamano', new ValidarCon(esquemaTamano)) tamano: TamanoFoto,
  ) {
    return new StreamableFile(await this.fotos.leer(solicitud.usuario, id, tamano));
  }

  @Delete(':id')
  @HttpCode(204)
  @PermiteEstados('ACTIVO', 'REGISTRO_INCOMPLETO')
  @ApiOperation({ summary: 'Quita una foto que todavía no está en un registro enviado' })
  @ApiNoContentResponse()
  borrar(@UsuarioActual() usuario: UsuarioSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.fotos.borrar(usuario, id);
  }
}
