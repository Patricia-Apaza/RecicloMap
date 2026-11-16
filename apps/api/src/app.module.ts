import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './modulos/auth/auth.module.js';
import { AvisosModule } from './modulos/avisos/avisos.module.js';
import { BusquedasModule } from './modulos/busquedas/busquedas.module.js';
import { CatalogosModule } from './modulos/catalogos/catalogos.module.js';
import { FavoritosModule } from './modulos/favoritos/favoritos.module.js';
import { EstadisticasModule } from './modulos/estadisticas/estadisticas.module.js';
import { FotosModule } from './modulos/fotos/fotos.module.js';
import { JuegoModule } from './modulos/juego/juego.module.js';
import { MapaModule } from './modulos/mapa/mapa.module.js';
import { MensajeriaModule } from './modulos/mensajeria/mensajeria.module.js';
import { IncidenciasModule } from './modulos/incidencias/incidencias.module.js';
import { MovilModule } from './modulos/movil/movil.module.js';
import { NegociosModule } from './modulos/negocios/negocios.module.js';
import { NotificacionesModule } from './modulos/notificaciones/notificaciones.module.js';
import { OperacionesModule } from './modulos/operaciones/operaciones.module.js';
import { PreciosModule } from './modulos/precios/precios.module.js';
import { PublicacionesModule } from './modulos/publicaciones/publicaciones.module.js';
import { ReportesModule } from './modulos/reportes/reportes.module.js';
import { ResenasModule } from './modulos/resenas/resenas.module.js';
import { SaludModule } from './modulos/salud/salud.module.js';
import { UsuariosModule } from './modulos/usuarios/usuarios.module.js';
import { VerificacionesModule } from './modulos/verificaciones/verificaciones.module.js';
import { BaseDatosModule } from './nucleo/base-datos/base-datos.module.js';
import { Configuracion } from './nucleo/configuracion/configuracion.js';
import { ConfiguracionModule } from './nucleo/configuracion/configuracion.module.js';
import { FiltroErrores } from './nucleo/errores/filtro-errores.js';
import { opcionesDeRegistro } from './nucleo/registros/registros.js';
import { GuardiaAcceso } from './nucleo/seguridad/guardia-acceso.js';
import { SeguridadModule } from './nucleo/seguridad/seguridad.module.js';

@Module({
  imports: [
    ConfiguracionModule,
    LoggerModule.forRootAsync({ inject: [Configuracion], useFactory: opcionesDeRegistro }),
    ThrottlerModule.forRootAsync({
      inject: [Configuracion],
      useFactory: (configuracion: Configuracion) => ({
        throttlers: [{ ttl: 60_000, limit: configuracion.limitePorMinuto }],
      }),
    }),
    ScheduleModule.forRoot(),
    BaseDatosModule,
    SeguridadModule,
    MensajeriaModule,
    NotificacionesModule,
    FotosModule,
    SaludModule,
    CatalogosModule,
    AuthModule,
    UsuariosModule,
    NegociosModule,
    VerificacionesModule,
    MapaModule,
    PreciosModule,
    BusquedasModule,
    PublicacionesModule,
    OperacionesModule,
    MovilModule,
    JuegoModule,
    IncidenciasModule,
    ResenasModule,
    ReportesModule,
    FavoritosModule,
    EstadisticasModule,
    AvisosModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: FiltroErrores },
    // Primero el límite de solicitudes, luego la sesión y los permisos
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: GuardiaAcceso },
  ],
})
export class AppModule {}
