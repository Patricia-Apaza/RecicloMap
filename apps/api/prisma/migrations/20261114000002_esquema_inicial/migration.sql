-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "rol" AS ENUM ('RECICLADOR', 'CENTRO', 'COMPRADOR_MOVIL', 'ADMIN');

-- CreateEnum
CREATE TYPE "usuario_estado" AS ENUM ('PENDIENTE_TELEFONO', 'REGISTRO_INCOMPLETO', 'ACTIVO', 'SUSPENDIDO', 'ELIMINADO');

-- CreateEnum
CREATE TYPE "proveedor_identidad" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "proposito_codigo" AS ENUM ('VERIFICAR_TELEFONO', 'RECUPERAR_CONTRASENA', 'CAMBIAR_TELEFONO', 'INICIO_ADMIN');

-- CreateEnum
CREATE TYPE "tipo_consentimiento" AS ENUM ('TERMINOS', 'PRIVACIDAD', 'UBICACION');

-- CreateEnum
CREATE TYPE "proposito_archivo" AS ENUM ('PERFIL', 'NEGOCIO', 'PUBLICACION');

-- CreateEnum
CREATE TYPE "ciudad_estado" AS ENUM ('ACTIVA', 'PROXIMAMENTE');

-- CreateEnum
CREATE TYPE "comprador_tipo" AS ENUM ('CENTRO', 'MOVIL');

-- CreateEnum
CREATE TYPE "vehiculo" AS ENUM ('MOTO', 'TRICICLO', 'CAMIONETA', 'CAMION');

-- CreateEnum
CREATE TYPE "plan" AS ENUM ('GRATIS', 'PRO');

-- CreateEnum
CREATE TYPE "verificacion_estado" AS ENUM ('EN_REVISION', 'INFO_PEDIDA', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "verificacion_tipo" AS ENUM ('REGISTRO', 'CAMBIO_DIRECCION');

-- CreateEnum
CREATE TYPE "disponibilidad" AS ENUM ('DISPONIBLE', 'EN_RUTA', 'FUERA_DE_SERVICIO');

-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "demanda" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "moderacion_estado" AS ENUM ('SOSPECHOSO', 'CORRECCION_PEDIDA', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "publicacion_estado" AS ENUM ('DISPONIBLE', 'CON_OFERTAS', 'EN_NEGOCIACION', 'FINALIZADA', 'CANCELADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "origen_ubicacion" AS ENUM ('GPS', 'ZONA');

-- CreateEnum
CREATE TYPE "oferta_estado" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'NO_SELECCIONADA', 'RETIRADA');

-- CreateEnum
CREATE TYPE "operacion_estado" AS ENUM ('ACEPTADA', 'EN_COORDINACION', 'ENTREGADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "punto_encuentro_tipo" AS ENUM ('LOCAL_DEL_CENTRO', 'REFERENCIA');

-- CreateEnum
CREATE TYPE "franja" AS ENUM ('MANANA', 'TARDE', 'NOCHE');

-- CreateEnum
CREATE TYPE "destino_calificacion" AS ENUM ('NEGOCIO', 'RECICLADOR');

-- CreateEnum
CREATE TYPE "registro_estado" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "reporte_tipo" AS ENUM ('NEGOCIO', 'OPERACION', 'RESENA');

-- CreateEnum
CREATE TYPE "reporte_motivo" AS ENUM ('PRECIO', 'CERRADO', 'UBICACION', 'FALSA', 'OTRO', 'NO_LLEGO', 'PESO', 'PAGO', 'TRATO', 'NO_CONFIRMA', 'NO_CONFORME', 'RESENA_INAPROPIADA');

-- CreateEnum
CREATE TYPE "reporte_estado" AS ENUM ('PENDIENTE', 'EN_REVISION', 'CORRECCION_PEDIDA', 'RESUELTO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "resolucion_incidencia" AS ENUM ('KILOS_CORREGIDOS', 'CERRADA_CON_KILOS_VIGENTES', 'ANULADA');

-- CreateEnum
CREATE TYPE "aviso_tipo" AS ENUM ('PROMOCION', 'ANUNCIO', 'NECESIDAD', 'CAMPANA');

-- CreateEnum
CREATE TYPE "notificacion_tipo" AS ENUM ('OFERTA', 'ACEPTACION', 'OPERACION', 'DESAFIO', 'GIRO', 'PRECIO', 'AVISO', 'CONFIRMACION', 'INSIGNIA');

-- CreateEnum
CREATE TYPE "insignia_categoria" AS ENUM ('KILOS', 'CONSTANCIA', 'CALIDAD', 'PRECIO', 'COMUNIDAD', 'JUEGO');

-- CreateEnum
CREATE TYPE "desafio_tipo" AS ENUM ('KG_TOTAL', 'KG_MATERIAL', 'OPERACIONES', 'OPERACIONES_MATERIAL', 'CALIFICACIONES', 'DIAS_PUBLICANDO');

-- CreateEnum
CREATE TYPE "puntos_motivo" AS ENUM ('OPERACION', 'REGISTRO_DIRECTO', 'DESAFIO', 'INVITACION', 'RULETA');

-- CreateEnum
CREATE TYPE "giro_origen" AS ENUM ('PUNTOS', 'META_MES');

-- CreateEnum
CREATE TYPE "premio_tipo" AS ENUM ('PUNTOS', 'OBJETO', 'SIN_PREMIO');

-- CreateEnum
CREATE TYPE "premio_ganado_estado" AS ENUM ('POR_RECLAMAR', 'ENTREGADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "medio_pago_plan" AS ENUM ('YAPE', 'EFECTIVO');

-- CreateEnum
CREATE TYPE "solicitud_plan_estado" AS ENUM ('PENDIENTE', 'ATENDIDA');

-- CreateEnum
CREATE TYPE "auditoria_tipo" AS ENUM ('VERIFICACION', 'PRECIOS', 'USUARIOS', 'REPORTES', 'PLAN', 'PARAMETROS', 'PREMIOS', 'CIUDADES', 'CONFIGURACION');

-- CreateEnum
CREATE TYPE "tramo_distancia" AS ENUM ('menos de 1 km', '1–2 km', '2–5 km', 'más de 5 km');

-- CreateTable
CREATE TABLE "ciudad" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "region" VARCHAR(60) NOT NULL,
    "estado" "ciudad_estado" NOT NULL DEFAULT 'PROXIMAMENTE',
    "verificadores_asignados" BOOLEAN NOT NULL DEFAULT false,
    "precios_base_cargados" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciudad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zona" (
    "id" SMALLSERIAL NOT NULL,
    "ciudad_id" SMALLINT NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "centro" geography(Point,4326) NOT NULL,

    CONSTRAINT "zona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lista_espera_ciudad" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ciudad_id" SMALLINT NOT NULL,
    "usuario_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_espera_ciudad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nivel" (
    "id" SMALLINT NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "kg_min" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "nivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insignia" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "categoria" "insignia_categoria" NOT NULL,
    "descripcion" VARCHAR(160) NOT NULL,
    "meta" INTEGER NOT NULL,
    "unidad" VARCHAR(20) NOT NULL,
    "destacada" BOOLEAN NOT NULL DEFAULT false,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "insignia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiqueta_calificacion" (
    "id" SMALLSERIAL NOT NULL,
    "destino" "destino_calificacion" NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "etiqueta_calificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro" (
    "clave" VARCHAR(60) NOT NULL,
    "valor" VARCHAR(200) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametro_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rol" "rol" NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "telefono" CHAR(9) NOT NULL,
    "telefono_verificado_en" TIMESTAMPTZ(3),
    "correo" VARCHAR(120),
    "correo_verificado_en" TIMESTAMPTZ(3),
    "hash_contrasena" VARCHAR(255),
    "foto_id" UUID,
    "ciudad_id" SMALLINT NOT NULL,
    "estado" "usuario_estado" NOT NULL DEFAULT 'PENDIENTE_TELEFONO',
    "motivo_suspension" VARCHAR(200),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(3),

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "hash_token" CHAR(64) NOT NULL,
    "familia" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usada_en" TIMESTAMPTZ(3),
    "revocada_en" TIMESTAMPTZ(3),
    "agente" VARCHAR(200),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo_verificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID,
    "destino" VARCHAR(120) NOT NULL,
    "proposito" "proposito_codigo" NOT NULL,
    "hash_codigo" CHAR(64) NOT NULL,
    "intentos" SMALLINT NOT NULL DEFAULT 0,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidad_externa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "proveedor" "proveedor_identidad" NOT NULL,
    "sujeto" VARCHAR(120) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identidad_externa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimiento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_consentimiento" NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "aceptado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "propietario_id" UUID NOT NULL,
    "proposito" "proposito_archivo" NOT NULL,
    "clave" VARCHAR(200) NOT NULL,
    "clave_miniatura" VARCHAR(200),
    "tipo_mime" VARCHAR(40) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencia_usuario" (
    "usuario_id" UUID NOT NULL,
    "notif_ofertas" BOOLEAN NOT NULL DEFAULT true,
    "notif_premios" BOOLEAN NOT NULL DEFAULT true,
    "notif_precios" BOOLEAN NOT NULL DEFAULT false,
    "notif_avisos" BOOLEAN NOT NULL DEFAULT true,
    "alerta_fav_precio" BOOLEAN NOT NULL DEFAULT true,
    "alerta_fav_horario" BOOLEAN NOT NULL DEFAULT false,
    "alerta_fav_movil_cerca" BOOLEAN NOT NULL DEFAULT false,
    "visible_en_ranking" BOOLEAN NOT NULL DEFAULT true,
    "idioma" VARCHAR(5) NOT NULL DEFAULT 'es',

    CONSTRAINT "preferencia_usuario_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "suscripcion_push" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "endpoint" VARCHAR(500) NOT NULL,
    "p256dh" VARCHAR(200) NOT NULL,
    "auth" VARCHAR(100) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripcion_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reciclador_perfil" (
    "usuario_id" UUID NOT NULL,
    "zona_id" SMALLINT,
    "sobre_mi" VARCHAR(200),
    "nivel_id" SMALLINT NOT NULL DEFAULT 1,
    "kg_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "puntos" INTEGER NOT NULL DEFAULT 0,
    "puntos_reciclaje" INTEGER NOT NULL DEFAULT 0,
    "racha_semanas" SMALLINT NOT NULL DEFAULT 0,
    "operaciones_completadas" INTEGER NOT NULL DEFAULT 0,
    "calif_prom" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "calif_cant" INTEGER NOT NULL DEFAULT 0,
    "codigo_invitacion" VARCHAR(20) NOT NULL,
    "invitado_por_id" UUID,

    CONSTRAINT "reciclador_perfil_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "reciclador_material" (
    "usuario_id" UUID NOT NULL,
    "material_id" SMALLINT NOT NULL,

    CONSTRAINT "reciclador_material_pkey" PRIMARY KEY ("usuario_id","material_id")
);

-- CreateTable
CREATE TABLE "comprador" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" "comprador_tipo" NOT NULL,
    "nombre_comercial" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(160),
    "direccion" VARCHAR(160),
    "zona_id" SMALLINT,
    "ubicacion" geography(Point,4326),
    "telefono_negocio" CHAR(9),
    "whatsapp" CHAR(9) NOT NULL,
    "vehiculo" "vehiculo",
    "plan" "plan" NOT NULL DEFAULT 'GRATIS',
    "plan_desde" DATE,
    "plan_hasta" DATE,
    "estado_verificacion" "verificacion_estado" NOT NULL DEFAULT 'EN_REVISION',
    "disponibilidad" "disponibilidad" NOT NULL DEFAULT 'DISPONIBLE',
    "mostrar_zona" BOOLEAN NOT NULL DEFAULT true,
    "posicion_aproximada" geography(Point,4326),
    "posicion_actualizada_en" TIMESTAMPTZ(3),
    "ruta_publicada" BOOLEAN NOT NULL DEFAULT false,
    "calif_prom" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "calif_cant" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprador_borrador" (
    "usuario_id" UUID NOT NULL,
    "paso" SMALLINT NOT NULL DEFAULT 1,
    "datos" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprador_borrador_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "comprador_horario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "dia" SMALLINT NOT NULL,
    "abre" TIME(0) NOT NULL,
    "cierra" TIME(0) NOT NULL,

    CONSTRAINT "comprador_horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprador_pago" (
    "comprador_id" UUID NOT NULL,
    "metodo" "metodo_pago" NOT NULL,

    CONSTRAINT "comprador_pago_pkey" PRIMARY KEY ("comprador_id","metodo")
);

-- CreateTable
CREATE TABLE "comprador_foto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "archivo_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "comprador_foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parada_ruta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "zona_id" SMALLINT NOT NULL,
    "desde" TIME(0) NOT NULL,
    "hasta" TIME(0) NOT NULL,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "parada_ruta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "tipo" "verificacion_tipo" NOT NULL DEFAULT 'REGISTRO',
    "estado" "verificacion_estado" NOT NULL DEFAULT 'EN_REVISION',
    "motivo" VARCHAR(120),
    "mensaje" VARCHAR(300),
    "cambios" JSONB,
    "revisado_por_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_en" TIMESTAMPTZ(3),

    CONSTRAINT "verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precio_material" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "material_id" SMALLINT NOT NULL,
    "precio_min" DECIMAL(6,2) NOT NULL,
    "precio_max" DECIMAL(6,2) NOT NULL,
    "demanda" "demanda" NOT NULL DEFAULT 'MEDIA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_por_id" UUID NOT NULL,

    CONSTRAINT "precio_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_precio" (
    "id" BIGSERIAL NOT NULL,
    "precio_material_id" UUID NOT NULL,
    "precio_min" DECIMAL(6,2) NOT NULL,
    "precio_max" DECIMAL(6,2) NOT NULL,
    "autor_id" UUID NOT NULL,
    "cambiado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderacion_precio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "precio_material_id" UUID NOT NULL,
    "estado" "moderacion_estado" NOT NULL,
    "motivo" VARCHAR(300) NOT NULL,
    "plazo_hasta" TIMESTAMPTZ(3),
    "admin_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMPTZ(3),
    "motivo_cierre" VARCHAR(300),

    CONSTRAINT "moderacion_precio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publicacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reciclador_id" UUID NOT NULL,
    "material_id" SMALLINT NOT NULL,
    "cantidad_kg" DECIMAL(8,2) NOT NULL,
    "precio_esperado" DECIMAL(6,2),
    "nota" VARCHAR(140),
    "ciudad_id" SMALLINT NOT NULL,
    "estado" "publicacion_estado" NOT NULL DEFAULT 'DISPONIBLE',
    "motivo_cancelacion" VARCHAR(200),
    "cancelada_por_id" UUID,
    "origen_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publicacion_ubicacion" (
    "publicacion_id" UUID NOT NULL,
    "ubicacion" geography(Point,4326) NOT NULL,
    "origen" "origen_ubicacion" NOT NULL DEFAULT 'GPS',

    CONSTRAINT "publicacion_ubicacion_pkey" PRIMARY KEY ("publicacion_id")
);

-- CreateTable
CREATE TABLE "publicacion_foto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publicacion_id" UUID NOT NULL,
    "archivo_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "publicacion_foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publicacion_id" UUID NOT NULL,
    "comprador_id" UUID NOT NULL,
    "precio_kg" DECIMAL(6,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "mensaje" VARCHAR(200),
    "cuando_recoge" VARCHAR(40),
    "estado" "oferta_estado" NOT NULL DEFAULT 'PENDIENTE',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_en" TIMESTAMPTZ(3),

    CONSTRAINT "oferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publicacion_id" UUID NOT NULL,
    "oferta_id" UUID NOT NULL,
    "reciclador_id" UUID NOT NULL,
    "comprador_id" UUID NOT NULL,
    "estado" "operacion_estado" NOT NULL DEFAULT 'ACEPTADA',
    "en_disputa" BOOLEAN NOT NULL DEFAULT false,
    "kg_final" DECIMAL(8,2),
    "monto_final" DECIMAL(10,2),
    "ofertas_al_aceptar" SMALLINT NOT NULL DEFAULT 1,
    "acepto_mayor_total" BOOLEAN NOT NULL DEFAULT false,
    "completada_por_plazo" BOOLEAN NOT NULL DEFAULT false,
    "motivo_cancelacion" VARCHAR(200),
    "cancelada_por_id" UUID,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coordinada_en" TIMESTAMPTZ(3),
    "entregada_en" TIMESTAMPTZ(3),
    "confirmada_en" TIMESTAMPTZ(3),
    "completada_en" TIMESTAMPTZ(3),
    "cancelada_en" TIMESTAMPTZ(3),

    CONSTRAINT "operacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinacion" (
    "operacion_id" UUID NOT NULL,
    "tipo" "punto_encuentro_tipo" NOT NULL,
    "referencia" VARCHAR(160),
    "pin" geography(Point,4326),
    "dia" DATE,
    "franja" "franja",
    "mensaje" VARCHAR(200),
    "definida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinacion_pkey" PRIMARY KEY ("operacion_id")
);

-- CreateTable
CREATE TABLE "calificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operacion_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "destino_id" UUID NOT NULL,
    "estrellas" SMALLINT NOT NULL,
    "comentario" VARCHAR(300),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calificacion_etiqueta" (
    "calificacion_id" UUID NOT NULL,
    "etiqueta_id" SMALLINT NOT NULL,

    CONSTRAINT "calificacion_etiqueta_pkey" PRIMARY KEY ("calificacion_id","etiqueta_id")
);

-- CreateTable
CREATE TABLE "respuesta_calificacion" (
    "calificacion_id" UUID NOT NULL,
    "texto" VARCHAR(300) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respuesta_calificacion_pkey" PRIMARY KEY ("calificacion_id")
);

-- CreateTable
CREATE TABLE "registro_reciclaje" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reciclador_id" UUID NOT NULL,
    "comprador_id" UUID NOT NULL,
    "material_id" SMALLINT NOT NULL,
    "kg" DECIMAL(8,2) NOT NULL,
    "kg_confirmado" DECIMAL(8,2),
    "fecha" DATE NOT NULL,
    "estado" "registro_estado" NOT NULL DEFAULT 'PENDIENTE',
    "motivo_rechazo" VARCHAR(200),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto_en" TIMESTAMPTZ(3),

    CONSTRAINT "registro_reciclaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporte" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "reporte_tipo" NOT NULL,
    "autor_id" UUID NOT NULL,
    "comprador_id" UUID,
    "material_id" SMALLINT,
    "operacion_id" UUID,
    "calificacion_id" UUID,
    "motivo" "reporte_motivo" NOT NULL,
    "precio_visto" DECIMAL(6,2),
    "detalle" VARCHAR(300),
    "estado" "reporte_estado" NOT NULL DEFAULT 'PENDIENTE',
    "plazo_hasta" TIMESTAMPTZ(3),
    "decision" VARCHAR(300),
    "resolucion" "resolucion_incidencia",
    "resuelto_por_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto_en" TIMESTAMPTZ(3),

    CONSTRAINT "reporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorito" (
    "usuario_id" UUID NOT NULL,
    "comprador_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorito_pkey" PRIMARY KEY ("usuario_id","comprador_id")
);

-- CreateTable
CREATE TABLE "busqueda_guardada" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "filtros" JSONB NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "busqueda_guardada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_llegada" (
    "id" BIGSERIAL NOT NULL,
    "comprador_id" UUID NOT NULL,
    "material_id" SMALLINT,
    "fecha" DATE NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_llegada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_visita" (
    "id" BIGSERIAL NOT NULL,
    "comprador_id" UUID NOT NULL,
    "material_id" SMALLINT,
    "fecha" DATE NOT NULL,
    "hora" SMALLINT NOT NULL,
    "visitante" CHAR(64) NOT NULL,

    CONSTRAINT "evento_visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aviso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "tipo" "aviso_tipo" NOT NULL,
    "titulo" VARCHAR(80) NOT NULL,
    "mensaje" VARCHAR(200),
    "vigente_hasta" DATE NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retirado_en" TIMESTAMPTZ(3),

    CONSTRAINT "aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" "notificacion_tipo" NOT NULL,
    "titulo" VARCHAR(80) NOT NULL,
    "mensaje" VARCHAR(200) NOT NULL,
    "enlace" VARCHAR(200),
    "leida_en" TIMESTAMPTZ(3),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_dominio" (
    "id" BIGSERIAL NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "entidad" VARCHAR(40) NOT NULL,
    "entidad_id" VARCHAR(40) NOT NULL,
    "datos" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesado_en" TIMESTAMPTZ(3),

    CONSTRAINT "evento_dominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_insignia" (
    "usuario_id" UUID NOT NULL,
    "insignia_id" SMALLINT NOT NULL,
    "obtenida_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_insignia_pkey" PRIMARY KEY ("usuario_id","insignia_id")
);

-- CreateTable
CREATE TABLE "plantilla_desafio" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "tipo" "desafio_tipo" NOT NULL,
    "material_id" SMALLINT,
    "meta" DECIMAL(8,2) NOT NULL,
    "unidad" VARCHAR(20) NOT NULL,
    "puntos" INTEGER NOT NULL,
    "es_meta_mes" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plantilla_desafio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desafio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plantilla_id" SMALLINT NOT NULL,
    "mes" DATE NOT NULL,
    "meta" DECIMAL(8,2) NOT NULL,
    "puntos" INTEGER NOT NULL,
    "es_meta_mes" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "desafio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_desafio" (
    "usuario_id" UUID NOT NULL,
    "desafio_id" UUID NOT NULL,
    "progreso" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "completado_en" TIMESTAMPTZ(3),
    "reclamado_en" TIMESTAMPTZ(3),
    "acreditado_al_cierre" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "usuario_desafio_pkey" PRIMARY KEY ("usuario_id","desafio_id")
);

-- CreateTable
CREATE TABLE "movimiento_puntos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "puntos" INTEGER NOT NULL,
    "motivo" "puntos_motivo" NOT NULL,
    "cuenta_para_giros" BOOLEAN NOT NULL,
    "operacion_id" UUID,
    "registro_id" UUID,
    "desafio_id" UUID,
    "sorteo_id" UUID,
    "invitado_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invitador_id" UUID NOT NULL,
    "invitado_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contada_en" TIMESTAMPTZ(3),

    CONSTRAINT "invitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "origen" "giro_origen" NOT NULL,
    "numero" INTEGER,
    "desafio_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usado_en" TIMESTAMPTZ(3),

    CONSTRAINT "giro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(60) NOT NULL,
    "tipo" "premio_tipo" NOT NULL,
    "puntos" INTEGER,
    "probabilidad" DECIMAL(5,2) NOT NULL,
    "stock" INTEGER,
    "patrocinado" BOOLEAN NOT NULL DEFAULT false,
    "patrocinador" VARCHAR(80),
    "punto_entrega" VARCHAR(160),
    "vigencia_canje_dias" SMALLINT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "premio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ruleta_configuracion" (
    "id" SERIAL NOT NULL,
    "premios" JSONB NOT NULL,
    "publicada_por_id" UUID,
    "publicada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ruleta_configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sorteo_ruleta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "giro_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "configuracion_id" INTEGER NOT NULL,
    "numero_sorteado" INTEGER NOT NULL,
    "premio_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sorteo_ruleta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premio_ganado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sorteo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "premio_id" UUID NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "estado" "premio_ganado_estado" NOT NULL DEFAULT 'POR_RECLAMAR',
    "punto_entrega" VARCHAR(160) NOT NULL,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "entregado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premio_ganado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "estado" "solicitud_plan_estado" NOT NULL DEFAULT 'PENDIENTE',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendida_en" TIMESTAMPTZ(3),

    CONSTRAINT "solicitud_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comprador_id" UUID NOT NULL,
    "monto" DECIMAL(8,2) NOT NULL,
    "medio" "medio_pago_plan" NOT NULL,
    "periodo_desde" DATE NOT NULL,
    "periodo_hasta" DATE NOT NULL,
    "registrado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "admin_id" UUID NOT NULL,
    "tipo" "auditoria_tipo" NOT NULL,
    "accion" VARCHAR(60) NOT NULL,
    "entidad" VARCHAR(40) NOT NULL,
    "entidad_id" VARCHAR(40) NOT NULL,
    "motivo" VARCHAR(300),
    "antes" JSONB,
    "despues" JSONB,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ciudad_nombre_key" ON "ciudad"("nombre");

-- CreateIndex
CREATE INDEX "zona_centro_idx" ON "zona" USING GIST ("centro");

-- CreateIndex
CREATE UNIQUE INDEX "zona_ciudad_id_nombre_key" ON "zona"("ciudad_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "lista_espera_ciudad_ciudad_id_usuario_id_key" ON "lista_espera_ciudad"("ciudad_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_codigo_key" ON "material"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "material_nombre_key" ON "material"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "nivel_nombre_key" ON "nivel"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "nivel_kg_min_key" ON "nivel"("kg_min");

-- CreateIndex
CREATE UNIQUE INDEX "insignia_codigo_key" ON "insignia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "insignia_nombre_key" ON "insignia"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "etiqueta_calificacion_destino_codigo_key" ON "etiqueta_calificacion"("destino", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_telefono_key" ON "usuario"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_foto_id_key" ON "usuario"("foto_id");

-- CreateIndex
CREATE INDEX "usuario_rol_estado_idx" ON "usuario"("rol", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_hash_token_key" ON "sesion"("hash_token");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE INDEX "sesion_familia_idx" ON "sesion"("familia");

-- CreateIndex
CREATE INDEX "codigo_verificacion_destino_proposito_creado_en_idx" ON "codigo_verificacion"("destino", "proposito", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "identidad_externa_proveedor_sujeto_key" ON "identidad_externa"("proveedor", "sujeto");

-- CreateIndex
CREATE UNIQUE INDEX "identidad_externa_usuario_id_proveedor_key" ON "identidad_externa"("usuario_id", "proveedor");

-- CreateIndex
CREATE UNIQUE INDEX "consentimiento_usuario_id_tipo_version_key" ON "consentimiento"("usuario_id", "tipo", "version");

-- CreateIndex
CREATE UNIQUE INDEX "archivo_clave_key" ON "archivo"("clave");

-- CreateIndex
CREATE INDEX "archivo_propietario_id_idx" ON "archivo"("propietario_id");

-- CreateIndex
CREATE UNIQUE INDEX "suscripcion_push_endpoint_key" ON "suscripcion_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripcion_push_usuario_id_idx" ON "suscripcion_push"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "reciclador_perfil_codigo_invitacion_key" ON "reciclador_perfil"("codigo_invitacion");

-- CreateIndex
CREATE UNIQUE INDEX "comprador_usuario_id_key" ON "comprador"("usuario_id");

-- CreateIndex
CREATE INDEX "comprador_ubicacion_idx" ON "comprador" USING GIST ("ubicacion");

-- CreateIndex
CREATE INDEX "comprador_estado_verificacion_tipo_idx" ON "comprador"("estado_verificacion", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "comprador_horario_comprador_id_dia_key" ON "comprador_horario"("comprador_id", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "comprador_foto_archivo_id_key" ON "comprador_foto"("archivo_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprador_foto_comprador_id_orden_key" ON "comprador_foto"("comprador_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "parada_ruta_comprador_id_zona_id_key" ON "parada_ruta"("comprador_id", "zona_id");

-- CreateIndex
CREATE INDEX "verificacion_estado_creada_en_idx" ON "verificacion"("estado", "creada_en");

-- CreateIndex
CREATE INDEX "verificacion_comprador_id_idx" ON "verificacion"("comprador_id");

-- CreateIndex
CREATE INDEX "precio_material_material_id_activo_idx" ON "precio_material"("material_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "precio_material_comprador_id_material_id_key" ON "precio_material"("comprador_id", "material_id");

-- CreateIndex
CREATE INDEX "historial_precio_precio_material_id_cambiado_en_idx" ON "historial_precio"("precio_material_id", "cambiado_en");

-- CreateIndex
CREATE INDEX "moderacion_precio_precio_material_id_cerrada_en_idx" ON "moderacion_precio"("precio_material_id", "cerrada_en");

-- CreateIndex
CREATE INDEX "publicacion_reciclador_id_estado_idx" ON "publicacion"("reciclador_id", "estado");

-- CreateIndex
CREATE INDEX "publicacion_ciudad_id_estado_creada_en_idx" ON "publicacion"("ciudad_id", "estado", "creada_en");

-- CreateIndex
CREATE INDEX "publicacion_estado_vence_en_idx" ON "publicacion"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "publicacion_ubicacion_ubicacion_idx" ON "publicacion_ubicacion" USING GIST ("ubicacion");

-- CreateIndex
CREATE UNIQUE INDEX "publicacion_foto_archivo_id_key" ON "publicacion_foto"("archivo_id");

-- CreateIndex
CREATE UNIQUE INDEX "publicacion_foto_publicacion_id_orden_key" ON "publicacion_foto"("publicacion_id", "orden");

-- CreateIndex
CREATE INDEX "oferta_publicacion_id_estado_idx" ON "oferta"("publicacion_id", "estado");

-- CreateIndex
CREATE INDEX "oferta_comprador_id_estado_idx" ON "oferta"("comprador_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "operacion_publicacion_id_key" ON "operacion"("publicacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "operacion_oferta_id_key" ON "operacion"("oferta_id");

-- CreateIndex
CREATE INDEX "operacion_reciclador_id_estado_idx" ON "operacion"("reciclador_id", "estado");

-- CreateIndex
CREATE INDEX "operacion_comprador_id_estado_idx" ON "operacion"("comprador_id", "estado");

-- CreateIndex
CREATE INDEX "operacion_estado_entregada_en_idx" ON "operacion"("estado", "entregada_en");

-- CreateIndex
CREATE INDEX "operacion_estado_confirmada_en_idx" ON "operacion"("estado", "confirmada_en");

-- CreateIndex
CREATE INDEX "calificacion_destino_id_creada_en_idx" ON "calificacion"("destino_id", "creada_en");

-- CreateIndex
CREATE UNIQUE INDEX "calificacion_operacion_id_autor_id_key" ON "calificacion"("operacion_id", "autor_id");

-- CreateIndex
CREATE INDEX "registro_reciclaje_comprador_id_estado_idx" ON "registro_reciclaje"("comprador_id", "estado");

-- CreateIndex
CREATE INDEX "registro_reciclaje_reciclador_id_estado_idx" ON "registro_reciclaje"("reciclador_id", "estado");

-- CreateIndex
CREATE INDEX "reporte_tipo_estado_creado_en_idx" ON "reporte"("tipo", "estado", "creado_en");

-- CreateIndex
CREATE INDEX "reporte_comprador_id_estado_idx" ON "reporte"("comprador_id", "estado");

-- CreateIndex
CREATE INDEX "reporte_operacion_id_idx" ON "reporte"("operacion_id");

-- CreateIndex
CREATE INDEX "favorito_comprador_id_idx" ON "favorito"("comprador_id");

-- CreateIndex
CREATE INDEX "busqueda_guardada_usuario_id_idx" ON "busqueda_guardada"("usuario_id");

-- CreateIndex
CREATE INDEX "solicitud_llegada_comprador_id_fecha_idx" ON "solicitud_llegada"("comprador_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "evento_visita_comprador_id_fecha_visitante_key" ON "evento_visita"("comprador_id", "fecha", "visitante");

-- CreateIndex
CREATE INDEX "aviso_comprador_id_vigente_hasta_idx" ON "aviso"("comprador_id", "vigente_hasta");

-- CreateIndex
CREATE INDEX "notificacion_usuario_id_creada_en_idx" ON "notificacion"("usuario_id", "creada_en");

-- CreateIndex
CREATE INDEX "evento_dominio_procesado_en_id_idx" ON "evento_dominio"("procesado_en", "id");

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_desafio_codigo_key" ON "plantilla_desafio"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "desafio_plantilla_id_mes_key" ON "desafio"("plantilla_id", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_puntos_sorteo_id_key" ON "movimiento_puntos"("sorteo_id");

-- CreateIndex
CREATE INDEX "movimiento_puntos_usuario_id_creado_en_idx" ON "movimiento_puntos"("usuario_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_puntos_operacion_id_motivo_key" ON "movimiento_puntos"("operacion_id", "motivo");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_puntos_registro_id_motivo_key" ON "movimiento_puntos"("registro_id", "motivo");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_puntos_usuario_id_desafio_id_key" ON "movimiento_puntos"("usuario_id", "desafio_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_puntos_usuario_id_invitado_id_key" ON "movimiento_puntos"("usuario_id", "invitado_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitacion_invitado_id_key" ON "invitacion"("invitado_id");

-- CreateIndex
CREATE INDEX "invitacion_invitador_id_idx" ON "invitacion"("invitador_id");

-- CreateIndex
CREATE INDEX "giro_usuario_id_usado_en_idx" ON "giro"("usuario_id", "usado_en");

-- CreateIndex
CREATE UNIQUE INDEX "giro_usuario_id_origen_numero_key" ON "giro"("usuario_id", "origen", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "giro_usuario_id_desafio_id_key" ON "giro"("usuario_id", "desafio_id");

-- CreateIndex
CREATE UNIQUE INDEX "premio_nombre_key" ON "premio"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "sorteo_ruleta_giro_id_key" ON "sorteo_ruleta"("giro_id");

-- CreateIndex
CREATE INDEX "sorteo_ruleta_usuario_id_creado_en_idx" ON "sorteo_ruleta"("usuario_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "premio_ganado_sorteo_id_key" ON "premio_ganado"("sorteo_id");

-- CreateIndex
CREATE UNIQUE INDEX "premio_ganado_codigo_key" ON "premio_ganado"("codigo");

-- CreateIndex
CREATE INDEX "premio_ganado_usuario_id_estado_idx" ON "premio_ganado"("usuario_id", "estado");

-- CreateIndex
CREATE INDEX "premio_ganado_estado_vence_en_idx" ON "premio_ganado"("estado", "vence_en");

-- CreateIndex
CREATE INDEX "solicitud_plan_estado_creada_en_idx" ON "solicitud_plan"("estado", "creada_en");

-- CreateIndex
CREATE INDEX "pago_plan_comprador_id_periodo_desde_idx" ON "pago_plan"("comprador_id", "periodo_desde");

-- CreateIndex
CREATE INDEX "auditoria_tipo_creada_en_idx" ON "auditoria"("tipo", "creada_en");

-- CreateIndex
CREATE INDEX "auditoria_creada_en_idx" ON "auditoria"("creada_en");

-- AddForeignKey
ALTER TABLE "zona" ADD CONSTRAINT "zona_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera_ciudad" ADD CONSTRAINT "lista_espera_ciudad_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera_ciudad" ADD CONSTRAINT "lista_espera_ciudad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_foto_id_fkey" FOREIGN KEY ("foto_id") REFERENCES "archivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_verificacion" ADD CONSTRAINT "codigo_verificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identidad_externa" ADD CONSTRAINT "identidad_externa_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencia_usuario" ADD CONSTRAINT "preferencia_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reciclador_perfil" ADD CONSTRAINT "reciclador_perfil_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reciclador_perfil" ADD CONSTRAINT "reciclador_perfil_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reciclador_perfil" ADD CONSTRAINT "reciclador_perfil_nivel_id_fkey" FOREIGN KEY ("nivel_id") REFERENCES "nivel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reciclador_perfil" ADD CONSTRAINT "reciclador_perfil_invitado_por_id_fkey" FOREIGN KEY ("invitado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reciclador_material" ADD CONSTRAINT "reciclador_material_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reciclador_material" ADD CONSTRAINT "reciclador_material_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprador" ADD CONSTRAINT "comprador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprador" ADD CONSTRAINT "comprador_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprador_borrador" ADD CONSTRAINT "comprador_borrador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprador_horario" ADD CONSTRAINT "comprador_horario_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprador_pago" ADD CONSTRAINT "comprador_pago_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprador_foto" ADD CONSTRAINT "comprador_foto_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprador_foto" ADD CONSTRAINT "comprador_foto_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parada_ruta" ADD CONSTRAINT "parada_ruta_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parada_ruta" ADD CONSTRAINT "parada_ruta_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion" ADD CONSTRAINT "verificacion_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion" ADD CONSTRAINT "verificacion_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_material" ADD CONSTRAINT "precio_material_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_material" ADD CONSTRAINT "precio_material_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_material" ADD CONSTRAINT "precio_material_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_precio" ADD CONSTRAINT "historial_precio_precio_material_id_fkey" FOREIGN KEY ("precio_material_id") REFERENCES "precio_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_precio" ADD CONSTRAINT "historial_precio_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderacion_precio" ADD CONSTRAINT "moderacion_precio_precio_material_id_fkey" FOREIGN KEY ("precio_material_id") REFERENCES "precio_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderacion_precio" ADD CONSTRAINT "moderacion_precio_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_reciclador_id_fkey" FOREIGN KEY ("reciclador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_cancelada_por_id_fkey" FOREIGN KEY ("cancelada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion" ADD CONSTRAINT "publicacion_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "publicacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_ubicacion" ADD CONSTRAINT "publicacion_ubicacion_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "publicacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_foto" ADD CONSTRAINT "publicacion_foto_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "publicacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_foto" ADD CONSTRAINT "publicacion_foto_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta" ADD CONSTRAINT "oferta_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "publicacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oferta" ADD CONSTRAINT "oferta_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "publicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "oferta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_reciclador_id_fkey" FOREIGN KEY ("reciclador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_cancelada_por_id_fkey" FOREIGN KEY ("cancelada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinacion" ADD CONSTRAINT "coordinacion_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificacion" ADD CONSTRAINT "calificacion_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificacion" ADD CONSTRAINT "calificacion_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificacion" ADD CONSTRAINT "calificacion_destino_id_fkey" FOREIGN KEY ("destino_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificacion_etiqueta" ADD CONSTRAINT "calificacion_etiqueta_calificacion_id_fkey" FOREIGN KEY ("calificacion_id") REFERENCES "calificacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificacion_etiqueta" ADD CONSTRAINT "calificacion_etiqueta_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "etiqueta_calificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_calificacion" ADD CONSTRAINT "respuesta_calificacion_calificacion_id_fkey" FOREIGN KEY ("calificacion_id") REFERENCES "calificacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_reciclaje" ADD CONSTRAINT "registro_reciclaje_reciclador_id_fkey" FOREIGN KEY ("reciclador_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_reciclaje" ADD CONSTRAINT "registro_reciclaje_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_reciclaje" ADD CONSTRAINT "registro_reciclaje_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_calificacion_id_fkey" FOREIGN KEY ("calificacion_id") REFERENCES "calificacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte" ADD CONSTRAINT "reporte_resuelto_por_id_fkey" FOREIGN KEY ("resuelto_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorito" ADD CONSTRAINT "favorito_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorito" ADD CONSTRAINT "favorito_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "busqueda_guardada" ADD CONSTRAINT "busqueda_guardada_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_llegada" ADD CONSTRAINT "solicitud_llegada_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_llegada" ADD CONSTRAINT "solicitud_llegada_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_visita" ADD CONSTRAINT "evento_visita_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_visita" ADD CONSTRAINT "evento_visita_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso" ADD CONSTRAINT "aviso_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_insignia" ADD CONSTRAINT "usuario_insignia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_insignia" ADD CONSTRAINT "usuario_insignia_insignia_id_fkey" FOREIGN KEY ("insignia_id") REFERENCES "insignia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_desafio" ADD CONSTRAINT "plantilla_desafio_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desafio" ADD CONSTRAINT "desafio_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla_desafio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_desafio" ADD CONSTRAINT "usuario_desafio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_desafio" ADD CONSTRAINT "usuario_desafio_desafio_id_fkey" FOREIGN KEY ("desafio_id") REFERENCES "desafio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_reciclaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_desafio_id_fkey" FOREIGN KEY ("desafio_id") REFERENCES "desafio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_sorteo_id_fkey" FOREIGN KEY ("sorteo_id") REFERENCES "sorteo_ruleta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_invitado_id_fkey" FOREIGN KEY ("invitado_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_invitador_id_fkey" FOREIGN KEY ("invitador_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_invitado_id_fkey" FOREIGN KEY ("invitado_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giro" ADD CONSTRAINT "giro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giro" ADD CONSTRAINT "giro_desafio_id_fkey" FOREIGN KEY ("desafio_id") REFERENCES "desafio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ruleta_configuracion" ADD CONSTRAINT "ruleta_configuracion_publicada_por_id_fkey" FOREIGN KEY ("publicada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteo_ruleta" ADD CONSTRAINT "sorteo_ruleta_giro_id_fkey" FOREIGN KEY ("giro_id") REFERENCES "giro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteo_ruleta" ADD CONSTRAINT "sorteo_ruleta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteo_ruleta" ADD CONSTRAINT "sorteo_ruleta_configuracion_id_fkey" FOREIGN KEY ("configuracion_id") REFERENCES "ruleta_configuracion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sorteo_ruleta" ADD CONSTRAINT "sorteo_ruleta_premio_id_fkey" FOREIGN KEY ("premio_id") REFERENCES "premio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premio_ganado" ADD CONSTRAINT "premio_ganado_sorteo_id_fkey" FOREIGN KEY ("sorteo_id") REFERENCES "sorteo_ruleta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premio_ganado" ADD CONSTRAINT "premio_ganado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premio_ganado" ADD CONSTRAINT "premio_ganado_premio_id_fkey" FOREIGN KEY ("premio_id") REFERENCES "premio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_plan" ADD CONSTRAINT "solicitud_plan_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_plan" ADD CONSTRAINT "pago_plan_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "comprador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_plan" ADD CONSTRAINT "pago_plan_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
