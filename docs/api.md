# API

API REST en NestJS. Todas las rutas van bajo `/api/v1`. En desarrollo, la documentación interactiva está en `/api/docs` y el documento OpenAPI en `/api/docs-json`.

## Organización

```
apps/api/src/
  main.ts            arranque
  aplicacion.ts      configuración común: prefijo, seguridad, CORS, documentación
  app.module.ts      módulo raíz
  modulos/<dominio>/ un módulo por dominio: controlador → servicio → acceso a datos
  nucleo/            piezas transversales
    configuracion/   variables de entorno validadas al arrancar
    base-datos/      conexiones de Prisma
    errores/         formato único de errores
    registros/       registros en JSON con identificador de solicitud
    validacion/      validación de entradas con los esquemas compartidos
  generado/          cliente de Prisma (se genera solo, no se versiona)
```

Un módulo usa a otro solo a través de su servicio; nunca lee sus tablas.

## Convenciones

| Tema            | Regla                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| Rutas           | En español: `/api/v1/publicaciones/cercanas`                                 |
| Campos          | En español y camelCase: `cantidadKg`, `precioEsperado`                       |
| Estados         | En mayúsculas, iguales a la base de datos: `EN_COORDINACION`                 |
| Identificadores | UUID; nunca números correlativos                                             |
| Dinero y peso   | Texto decimal con dos decimales: `"2.50"`                                    |
| Fechas          | ISO 8601 en UTC; la interfaz las muestra en America/Lima                     |
| Paginación      | `?limite=20&cursor=…` → `{ datos, paginacion: { siguienteCursor, total } }`  |
| Posición        | Cabecera `X-Posicion: lat,lng` redondeada en el dispositivo; nunca en la URL |

## Errores

Todas las respuestas de error tienen la misma forma:

```json
{
  "error": {
    "codigo": "NO_ENCONTRADO",
    "mensaje": "No encontramos lo que buscas.",
    "campos": [{ "campo": "cantidadKg", "mensaje": "Escribe un peso entre 1 y 5 000 kg." }],
    "idSolicitud": "3d9ac03b-c886-4a38-97eb-58be01825780"
  }
}
```

| HTTP | Código                   | Cuándo                                        |
| ---- | ------------------------ | --------------------------------------------- |
| 400  | `ENTRADA_NO_VALIDA`      | Datos mal formados; `campos` dice cuáles      |
| 401  | `NO_AUTENTICADO`         | Sin sesión                                    |
| 403  | `SIN_PERMISO`            | El rol no lo permite                          |
| 404  | `NO_ENCONTRADO`          | No existe o no le pertenece                   |
| 409  | `CONFLICTO`              | El estado actual no admite la acción          |
| 422  | el de la regla           | Una regla de negocio lo impide                |
| 429  | `DEMASIADAS_SOLICITUDES` | Se superó el límite de solicitudes            |
| 500  | `ERROR_INTERNO`          | Error inesperado; nunca se muestra el detalle |

Para una regla de negocio, el servicio lanza `ErrorNegocio` con su código y mensaje. Para validar una entrada, el controlador usa `ValidarCon` con el esquema del paquete compartido.

## Seguridad y registros

- Cabeceras de seguridad estándar; no se revela la tecnología del servidor.
- CORS: solo el origen de la web (`WEB_ORIGEN`).
- Límite de solicitudes por minuto (`API_LIMITE_POR_MINUTO`); las rutas de salud no cuentan.
- Cada solicitud tiene un identificador que viaja en la cabecera `X-Request-Id`, en los registros y en los errores.
- Los registros nunca guardan la cabecera de autorización, las cookies ni la posición del usuario.

## Acceso y sesiones

- **Registro**: el reciclador (pantalla 03) y los negocios (pantallas 05 y 06) crean su cuenta con teléfono y contraseña de al menos 8 caracteres. La cuenta queda `PENDIENTE_TELEFONO` hasta verificar el teléfono con un código de 6 dígitos.
- **Códigos**: vencen a los 10 minutos, admiten 5 intentos, se puede pedir otro cada 60 segundos (si el anterior no se usó) y como máximo 5 por hora. Se guardan cifrados.
- **Inicio de sesión**: con teléfono o correo y contraseña. El error es el mismo si la cuenta no existe o si la contraseña es incorrecta. Máximo 10 intentos por minuto en cada ruta de acceso (`API_LIMITE_ACCESO_POR_MINUTO`; solo se sube en las pruebas automáticas).
- **Administración**: sus cuentas se crean con `pnpm admin:crear`, nunca desde la app. Al entrar, además de la contraseña, se pide un código enviado a su teléfono.
- **Google**: la primera vez se completa la cuenta (rol y teléfono verificado). Requiere `GOOGLE_CLIENT_ID`; sin ella la ruta responde 503 `GOOGLE_NO_DISPONIBLE`.
- **Tokens**: el acceso dura 15 minutos (`SESION_ACCESO_MINUTOS`) y va en la cabecera `Authorization: Bearer`. El de refresco dura 30 días (`SESION_REFRESCO_DIAS`); la web lo recibe en la cookie `rm_refresco` (no legible desde JavaScript) y la app móvil, en el cuerpo, enviando la cabecera `X-Cliente: movil`.
- **Renovación**: cada renovación cambia el token de refresco y cierra el acceso anterior. Si alguien reutiliza un token de refresco ya usado, se cierran todas las sesiones de esa cuenta.
- **Recuperación** (pantalla 08): responde lo mismo exista o no la cuenta. Restablecer o cambiar la contraseña cierra todas las sesiones.

## Permisos

Toda ruta exige sesión salvo las marcadas como públicas. En cada solicitud se lee el estado de la cuenta y de la sesión en la base, así que una suspensión o un cierre de sesión rigen al instante.

| Decorador              | Qué exige                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `@Publica()`           | Nada; si llega un token válido, se identifica a la persona       |
| `@Roles(...)`          | Uno de los roles indicados                                       |
| `@PermiteEstados(...)` | Estados de cuenta admitidos; por defecto `ACTIVO` y `SUSPENDIDO` |
| `@NegocioVerificado()` | Centro o comprador aprobado por un administrador (RN-18)         |

Una cuenta `SUSPENDIDO` solo puede consultar (GET); cualquier cambio responde 403 `CUENTA_SUSPENDIDA`.

| HTTP | Código                                                    | Cuándo                                                 |
| ---- | --------------------------------------------------------- | ------------------------------------------------------ |
| 401  | `SESION_VENCIDA`                                          | El acceso venció; renovar con el token de refresco     |
| 401  | `SESION_INVALIDA`                                         | El token de refresco no sirve; volver a iniciar sesión |
| 401  | `CREDENCIALES_INVALIDAS`                                  | Teléfono, correo o contraseña incorrectos              |
| 403  | `TELEFONO_SIN_VERIFICAR`                                  | Falta verificar el teléfono                            |
| 403  | `REGISTRO_INCOMPLETO`                                     | El negocio no completó su registro                     |
| 403  | `NEGOCIO_NO_VERIFICADO`                                   | El negocio aún no fue aprobado                         |
| 403  | `CUENTA_SUSPENDIDA`                                       | Cuenta suspendida intentando un cambio                 |
| 422  | `CODIGO_INCORRECTO`, `CODIGO_VENCIDO`, `CODIGO_BLOQUEADO` | Problemas con el código de 6 dígitos                   |
| 429  | `ESPERA_REENVIO`, `DEMASIADOS_CODIGOS`                    | Se pidieron códigos demasiado seguido                  |

## Mensajes (SMS y correo)

Por ahora son simulados (`MENSAJERIA_PROVEEDOR=simulado`): llegan al buzón de pruebas en http://localhost:8025, con el asunto `SMS para 9XXXXXXXX`. Con `MENSAJERIA_EXPONER_CODIGO=true`, las respuestas incluyen `codigoDePrueba` para automatizar pruebas; en producción esa opción está prohibida y la API no arranca si se activa. El proveedor real de SMS se conecta antes del piloto.

Cada SMS debe caber en un solo mensaje contando las tildes: 160 caracteres si todo está en el alfabeto GSM, 70 si lleva á, í, ó o ú. Los textos viven en `apps/api/src/modulos/mensajeria/textos-sms.ts` y una prueba comprueba que cada uno cabe; si el nombre del negocio no cabe, el aviso dice "tu negocio".

## Fotos

- Se suben con `POST /fotos` (multipart: `foto` y `proposito` = `PERFIL` o `NEGOCIO`). JPG, PNG o WebP de hasta 8 MB.
- La web las achica en el celular antes de subirlas; la API siempre las vuelve a procesar: endereza, limita a 1600 px, guarda en WebP con miniatura de 400 px y **sin metadatos** (ubicación, cámara, fecha).
- Las ven su dueño y la administración (`GET /fotos/:id?tamano=mini|completa`). Las fotos de un negocio aprobado son públicas, porque se muestran en su detalle; las de una publicación las ven los negocios verificados de su ciudad; las demás responden 404 a cualquier otra persona.
- La foto de perfil nueva reemplaza a la anterior. Las del negocio (hasta 3) viajan en el campo `fotos` del registro; las que no quedaron en el registro enviado se eliminan.
- Almacén compatible con S3 (`ALMACEN_*`): SeaweedFS en local; en la nube, cualquier proveedor S3 cambiando variables. En pruebas automáticas, `ALMACEN_PROVEEDOR=memoria` (prohibido en producción).

## Mapa y semáforo

- `GET /compradores?material=pet&radio=5&tipo=todos&orden=recomendado` es público (también para invitados). Filtros opcionales: `pagos` (lista separada por comas), `demandaMinima`, `soloAbiertos`, `soloAlDia`. Radios permitidos: 1, 3, 5, 10 y 20 km.
- El punto de búsqueda viaja **en una cabecera, nunca en la URL**: `X-Posicion: -15.493,-70.129` (la web la redondea a 3 decimales, unos 100 m) o `X-Zona: <id de zona>` si la persona no dio permiso de ubicación. Sin ninguna de las dos responde 400 `UBICACION_REQUERIDA`. La cabecera se oculta en los registros del servidor.
- El **semáforo** se calcula solo en el servidor, por material, entre las opciones que quedan tras los filtros: se compara el punto medio de cada rango y se divide en tercios (Mejor precio, Precio intermedio, Precio bajo). Con dos opciones: Mejor y Bajo; con una sola o todas iguales: "Sin comparación". Cada opción trae `semaforo.clave` y `semaforo.texto`.
- La **demanda** (ALTA, MEDIA, BAJA) es un dato aparte que declara cada negocio.
- El plan Pro solo afecta el orden "recomendado" (aparece como destacado). Con orden por precio, cercanía, demanda o calificación, el plan no cuenta y nunca cambia el semáforo.
- No aparecen negocios sin verificar ni precios suspendidos por moderación. Un precio sin actualizar en más de `dias_precio_al_dia` días (7 por defecto) llega con `antiguo: true`.
- `GET /compradores/:id?radio=5&material=pet` devuelve el detalle (15) con el semáforo de cada material calculado contra el mismo conjunto que la lista. Del comprador móvil solo se muestra su zona; lo que no declaró (días, pagos) llega vacío y la web lo muestra como "No indicado".

## Precios del negocio

- `GET /mi-negocio/precios`: los 5 materiales con rango, demanda, fecha, aviso de precio antiguo, estado de moderación y el semáforo propio frente a los negocios a 5 km (solo la etiqueta y cuántos se compararon; nunca nombres ni precios ajenos).
- `PUT /mi-negocio/precios` (centro o comprador **verificado**): rango obligatorio por material activo, de S/ 0.10 a S/ 50.00, con mínimo menor o igual al máximo. Cada cambio queda en el historial (`GET /mi-negocio/precios/historial`, últimos 30).
- El administrador no tiene permiso de escritura sobre los precios, ni en la API ni en la base de datos.
- Todos los días a las 08:00 (hora de Lima) el negocio con precios de más de 7 días recibe el aviso "Actualiza tus precios", una sola vez por periodo.
- `PUT /mi-negocio/ubicacion`: el centro registrado antes del mapa coloca su pin una sola vez (409 `PIN_YA_COLOCADO` si ya lo tiene) y dentro de su ciudad (422 `PIN_FUERA_DE_LA_CIUDAD`). Los centros nuevos colocan el pin en el registro, donde es obligatorio si hay clave de Google Maps (en producción siempre la hay: la API no arranca sin ella); sin clave, en desarrollo, basta la zona. Por ahora el pin no se mueve.

## Búsquedas guardadas

Solo el reciclador: `GET /busquedas`, `POST /busquedas` (`nombre` y `filtros`, hasta 5; luego 409 `DEMASIADAS_BUSQUEDAS`) y `DELETE /busquedas/:id`.

## Publicaciones y ofertas

- **Publicar** (`POST /publicaciones`, reciclador): material, kilos (1 a 5 000), precio esperado opcional (S/ 0.10 a 50.00), nota y hasta 3 fotos subidas con `proposito=PUBLICACION`. La ciudad sale de la cuenta. La ubicación llega en `X-Posicion` o `X-Zona` (si no, la zona del perfil): se guarda en una tabla que la API puede escribir pero no leer, y nunca vuelve en una respuesta. Vence a los `vigencia_publicacion_dias` (7).
- **Visibilidad (RF-23):** la ve todo negocio verificado de la misma ciudad, compre o no ese material. El aviso "Nueva publicación cerca" llega a los que están a `radio_aviso_publicacion_km` (5) o menos. "Lo verán N" (`GET /publicaciones/alcance`) cuenta a todos los que pueden verla.
- **Listado del negocio** (`GET /negocio/publicaciones?material=&pagina=&porPagina=`): paginado (hasta 50 por página), con `total`. El parámetro `radio_visibilidad_km` limita la distancia; `0` significa toda la ciudad (valor de Juliaca).
- **Lo que ve un negocio:** el reciclador aparece como "Reciclador", con ciudad, tramo de distancia, nivel, calificación ("Nuevo" con menos de 3), operaciones, "Reciclador Confiable" y "Teléfono verificado". Nunca nombre, barrio, coordenadas ni distancia numérica, ni las ofertas de otros negocios: para él la publicación siempre figura como "Disponible".
- **Ofertas:** una vigente por negocio y publicación; el total se calcula en la base (precio por kg × kilos). Se puede cambiar (avisa al reciclador) o retirar; tras retirar se puede volver a ofertar, tras un rechazo no.
- **Aceptar** (`POST /ofertas/:id/aceptar`) es una sola transacción con la publicación bloqueada: las demás pendientes pasan a `NO_SELECCIONADA`, se crea la operación en `ACEPTADA`, se libera el WhatsApp entre las partes y se anota si fue la oferta de mayor total entre 2 o más. Dos aceptaciones simultáneas: una gana y la otra recibe 409.
- **Rechazar todas** devuelve la publicación a `DISPONIBLE`. **Editar** solo sin ofertas pendientes. **Cancelar** pide motivo y cierra las pendientes con aviso. **Renovar** da 7 días desde hoy. **Volver a publicar** (vencida) y **duplicar** (finalizada o cancelada) crean una publicación nueva: la ubicación se vuelve a tomar como al publicar (`X-Posicion` o `X-Zona`; sin ella, 400 `UBICACION_REQUERIDA`) y las fotos no se copian.
- **Tareas:** cada hora vencen las publicaciones de más de 7 días (sus ofertas pendientes pasan a `NO_SELECCIONADA`, con aviso); todos los días a las 09:00 (Lima) se avisa al reciclador 2 días antes del vencimiento, una vez por vigencia.
- **Comprador móvil** (`GET /comprador/inicio`, `PUT /mi-negocio/estado-movil`): disponibilidad, zona de trabajo y si se muestra la zona. La zona se cambia como máximo una vez cada 24 horas, porque es el punto desde el que se calculan los tramos.

## Operaciones

Estados: `ACEPTADA → EN_COORDINACION → ENTREGADA → CONFIRMADA → COMPLETADA`, o `CANCELADA`. Cada transición bloquea la fila (`FOR UPDATE`) y crea el aviso a la otra parte en la misma transacción.

- **Seguimiento** (`GET /operaciones/:id`, solo sus dos partes): estado, fechas, punto de encuentro, plazos, incidencia y `acciones`, la lista de lo que el usuario puede hacer ahora. La web solo muestra botones de esa lista.
- **Coordinar** (reciclador): `LOCAL_DEL_CENTRO` (solo si el comprador es un centro) o `REFERENCIA` con texto obligatorio y pin opcional; día (hoy a 7 días) y franja opcionales. La ubicación del reciclador nunca se usa ni se expone.
- **Entregar** (reciclador) → **Recibí** (negocio, `kgRecibidos` obligatorios, más de 0 y hasta 5 000). Monto final = kilos recibidos × precio por kg de la oferta, informativo: el pago ocurre fuera de RecicloMap. El reciclador nunca escribe el peso.
- **Conforme** (reciclador) completa la operación; **No conforme** abre una incidencia y detiene el plazo.
- **Plazos** (tarea cada 10 minutos; 72 h): en `CONFIRMADA` sin respuesta ni disputa se completa sola y avisa a ambos; en `ENTREGADA` sin confirmar se avisa a ambos una vez y el reciclador puede abrir una incidencia (`POST /operaciones/:id/incidencia`). Nada se cierra solo en `ENTREGADA`.
- **Cancelar** (cualquiera de las partes, con motivo) solo antes de `ENTREGADA`. La publicación queda cancelada; si canceló el negocio, el reciclador ve "Volver a publicar".
- **Cierre en una transacción** (`completarOperacion`, el mismo para conformidad, plazo, administración y semilla): estado `COMPLETADA`, publicación `FINALIZADA`, kilos acumulados, 1 punto por kg en un único movimiento por operación (índice único: la conformidad y el cierre automático simultáneos suman una sola vez), 1 giro por cada 500 puntos de reciclaje, nivel recalculado y un evento `OPERACION_COMPLETADA` para evaluar insignias y desafíos más adelante. Si algo falla, no queda nada a medias.
- **Historial** (`GET /operaciones?estado=&material=`, pantallas 28 y 51) con indicadores y conteos; `GET /operaciones/exportar` devuelve el mismo filtro en CSV (UTF-8 con BOM, para Excel). Nunca incluye la dirección del reciclador.
- **Mis compras** (`GET /negocio/compras`, pantalla 54): ofertas que esperan respuesta, compras en curso y completadas, con los kilos recibidos.

## Incidencias (administración)

`GET /admin/incidencias?estado=abiertas|resueltas` y `POST /admin/incidencias/:id/resolver` con `decision` y `motivo`:

| Decisión                    | Cuándo                     | Efecto                                                                                |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `PEDIR_CORRECCION`          | `ENTREGADA` o `CONFIRMADA` | El negocio tiene 72 h para volver a escribir los kilos; el reciclador revisa otra vez |
| `CERRAR_CON_KILOS_VIGENTES` | `CONFIRMADA`               | Completa con los kilos que confirmó el negocio                                        |
| `ANULAR`                    | `ENTREGADA` o `CONFIRMADA` | Cancela sin puntos ni calificaciones                                                  |

El administrador nunca escribe kilos, montos ni reseñas: la base de datos se lo impide (`rm_admin` no tiene permiso sobre esas columnas ni tablas). Cada decisión queda en la auditoría y avisa a ambas partes.

## Calificaciones y reseñas

- `POST /operaciones/:id/calificacion`: una por autor y operación (índice único), solo en `COMPLETADA`, 1 a 5 estrellas, etiquetas de su dirección (un disparador de la base lo comprueba) y comentario opcional. Nadie puede editarlas ni borrarlas.
- **Públicas** (`GET /negocios/:id/resenas`): autor como "Nombre I.", promedio o "Nuevo" con menos de 3, distribución y respuesta del negocio. No se crean reseñas desde la ficha.
- **Del negocio** (`GET /mi-negocio/resenas?filtro=todas|sin-responder|bajas`): responde una vez (`POST /resenas/:id/respuesta`, 409 `YA_RESPONDIDA`). Cualquier usuario puede reportar una reseña (`POST /resenas/:id/reportes`); queda guardada para la moderación.
- La reseña que un negocio hace de un reciclador solo la ven otros negocios, en el perfil del reciclador.

## Notificaciones en vivo y push

- **Filtros** (`GET /notificaciones?filtro=`): `todas`, `sin-leer`, `ofertas`, `operaciones`, `premios`, `avisos`.
- **Preferencias** (`GET` y `PUT /notificaciones/preferencias`): `ofertas`, `premios` y `avisos` se pueden apagar; `operaciones` siempre está activo. Los avisos de una operación propia y los de seguridad de la cuenta son obligatorios. Nunca se envían por WhatsApp.
- **En vivo:** Socket.IO en `/api/v1/en-vivo` con el token de acceso en `auth.token`. Cada usuario solo recibe lo suyo. Las notificaciones se guardan en la transacción del hecho y un difusor las lee cada 2 segundos y las emite (bandeja de salida): cualquier instancia de la API puede emitir sin compartir memoria. La web usa sondeo largo porque su proxy reenvía HTTP.
- **Push** (opcional): `POST` y `DELETE /notificaciones/push` registran el navegador. Requiere claves VAPID (`PUSH_CLAVE_PUBLICA`, `PUSH_CLAVE_PRIVADA`, `PUSH_CONTACTO`); sin ellas, `/configuracion-publica` devuelve `push: null` y la web oculta la opción. Cada aviso se envía por push una sola vez.

## Descubrimiento

- **Calculadora** (`GET /calculadora?material=&kg=&radio=`, también el invitado; ubicación en `X-Posicion` o `X-Zona`): usa el mismo conjunto y el mismo semáforo que el mapa. Devuelve el valor estimado (kilos × rango del mejor), los puntos que daría y las 3 mejores opciones por valor.
- **Comparar** (`GET /compradores/comparar?ids=a,b,c`, 2 a 3 negocios): el semáforo se calcula solo entre los elegidos, material por material. Con dos, Mejor y Bajo.
- **Cómo llegar** (RN-17): `POST /compradores/:id/solicitudes-llegada` solo suma al conteo (el negocio no recibe aviso ni se guarda quién lo pidió) y devuelve el destino público y el enlace a Google Maps con solo el destino. `GET /compradores/:id/ruta?modo=pie|moto|transporte` pide el trazo desde el servidor con el origen redondeado a 3 decimales (~110 m); sin `GOOGLE_MAPS_CLAVE_SERVIDOR`, `ruta` es `null` y solo queda el enlace.
- **Favoritos** (reciclador): `GET /favoritos`, `GET /favoritos/ids`, `PUT` y `DELETE /favoritos/:compradorId` (hasta 30), `PATCH /favoritos/:compradorId/alertas` (`alertaPrecio`, `alertaAvisos`). Es la única vía de alertas de precio: cuando un negocio cambia su rango, solo reciben el aviso quienes lo guardaron y dejaron la alerta activa. Un favorito sin precios visibles se marca `visible: false`.

## Reportes y moderación

- **Reportar información** (`POST /reportes`, solo reciclador; motivos `PRECIO`, `CERRADO`, `UBICACION`, `FALSA`, `OTRO`; `FALSA` y `OTRO` piden detalle): un mismo reciclador no repite un reporte abierto por el mismo motivo sobre el mismo negocio (409 `YA_REPORTADO`). `GET /reportes/mios` lista los suyos.
- **Reportes sobre mi negocio** (`GET /mi-negocio/reportes?estado=`): motivo, estado, material y, si hay pedido de corrección, motivo, plazo y qué hacer. Nunca el autor. `POST /mi-negocio/reportes/:id/corregido` ("Ya lo corregí") lo devuelve a revisión.
- **Administración** (`/admin/reportes?tipo=NEGOCIO|RESENA&estado=`): `pedir-correccion` (plazo de 24 h, 48 h, 3 o 7 días), `resolver`, `descartar` y, para reseñas, `ocultar-resena`. Toda decisión pide motivo, se audita en la misma transacción y avisa a quien corresponde.
- **Reseñas ocultas:** ocultar no borra ni edita nada; crea una fila en `resena_oculta` (insert-only para ambas conexiones). La reseña deja de listarse y de contar en el promedio (la base recalcula la reputación). El autor recibe un aviso. Ni la conexión de administración puede editar el texto de una reseña.
- **Moderación de precios** (`GET /admin/precios`, `POST /admin/precios/:id/marcar`, `/pedir-correccion`, `/suspender`, `/restituir`): nunca cambia el valor. Un precio suspendido sale de la vista `v_mapa`, así que desaparece del mapa, la lista, la ficha, la calculadora, comparar y favoritos; el negocio ve el motivo en Precios y demanda. Un plazo vencido avisa una vez a la administración (tarea cada 30 minutos) y no suspende solo.
- **Alertas de posible colusión** (`GET /admin/alertas?dias=`): pares reciclador–negocio con `colusion_operaciones_par_7_dias` (3) o más operaciones completadas en 7 días, y operaciones cuyo peso **recibido es mayor** que el publicado en `colusion_desvio_peso_pct` (40 %) o más, o de `colusion_kg_operacion` (500 kg) o más. Un peso recibido menor es un tema de calidad y se revisa en incidencias, no aquí. Cada alerta trae su contexto (operaciones del par, fecha de publicación y de cierre) y es solo una señal: nunca bloquea a nadie. `POST /admin/alertas/descartar` (`tipo` `PAR` o `PESO`, `clave`, `motivo`) la descarta con motivo y queda en la auditoría; un par vuelve a alertar si hay operaciones nuevas.
- **Límites de reportes:** un reciclador tiene como máximo `reportes_max_abiertos_reciclador` (5) reportes de negocios en revisión y `reportes_max_por_negocio_24h` (2) sobre un mismo negocio en 24 horas (429 `LIMITE_REPORTES` y `LIMITE_REPORTES_NEGOCIO`). Ambos se editan en parámetros.
- **Problemas de una operación** (`POST /operaciones/:id/problema`, cualquiera de las dos partes; `NO_LLEGO`, `PESO`, `PAGO`, `TRATO`, `OTRO`, detalle de 15 a 300 caracteres): crea una incidencia sin tocar la operación. La administración la resuelve o descarta en `/admin/incidencias`. `GET /operaciones/problemas/mios` lista los propios.

## Paneles del negocio

Los centros y los compradores móviles ven solo lo suyo. Todo se calcula en el servidor con días de Lima (America/Lima).

- **Resumen** (`GET /mi-negocio/resumen`): kilos del mes, visitas, solicitudes de llegada y qué hacer hoy. Un negocio nuevo responde `sinDatos: true`; nunca se inventan cifras.
- **Estadísticas** (`GET /mi-negocio/estadisticas?periodo=7|30|90`): ambos planes reciben visitas, solicitudes de llegada (solo conteo, por material y día), ofertas enviadas y aceptadas, kilos comprados (operaciones completadas, con el peso confirmado) y el precio frente al mercado con el mismo semáforo y el mismo conjunto que el mapa, sin nombres. Solo el plan Pro recibe 90 días, horas con más visitas y materiales más consultados. El plan Gratis recibe en su lugar la marca `requierePro: true` y ningún dato Pro. El semáforo, el precio y la demanda son idénticos en ambos planes.
- **Visitas** (`POST /compradores/:id/visitas`, público): la ficha avisa al abrirse. Cuentan invitados y recicladores, una vez por persona o dispositivo por día (cabecera `X-Dispositivo`); no cuentan al propio negocio ni a la administración. Se guarda solo una huella con clave secreta, nunca quién visitó, y nada de esto se muestra.
- **Avisos** (`GET`, `POST` y `DELETE /mi-negocio/avisos`): solo negocios verificados. Son informativos: el servidor rechaza precios, teléfonos y enlaces. Título de hasta 60 caracteres, mensaje de hasta 140 y vigencia de 1 a 14 días; máximo 3 activos. Los límites son iguales en Gratis y Pro y se editan en parámetros (`aviso_max_activos`, `aviso_vigencia_max_dias`). Se ven en `GET /avisos` y `GET /compradores/:id/avisos` (público, solo vigentes) y avisan únicamente a quienes tienen el negocio en favoritos con el aviso de anuncios activado. El campo `estado` queda listo para la moderación posterior.
- **Día del comprador móvil** (solo `COMPRADOR_MOVIL`; el centro no lo ve ni lo gestiona y la administración no edita nada): `PUT /mi-negocio/estado-movil` (Disponible, En ruta o Fuera de servicio), `GET` y `PUT /mi-negocio/ruta` (hasta 8 zonas de su ciudad con horario; 422 `ZONA_NO_VALIDA` o `RUTA_VACIA`) y `PUT /mi-negocio/posicion` (solo En ruta; 409 `NO_EN_RUTA`). La posición se redondea en el servidor (unos 110 m), se guarda un solo punto sin historial y nunca sale hacia otros usuarios. La ruta, la posición y el estado del día caducan al terminar el día en Lima, con una tarea cada 10 minutos y también al consultar. La ficha pública muestra la ruta de hoy.
- **Visibilidad de datos:** un negocio no ve ofertas ni conteos de otros; la administración no puede escribir avisos, rutas, visitas ni solicitudes de llegada, ni columnas del comprador fuera de la verificación y el plan.

## Puntos, niveles, insignias y entrega directa

Todo se calcula en el servidor, con días de Lima (America/Lima). Los puntos no son dinero ni se convierten en dinero.

- **Puntos** (`GET /yo/puntos`, solo recicladores): 1 punto por kg, solo cuando la operación llega a `COMPLETADA` (con los kilos confirmados por el negocio, también en el cierre automático a las 72 h). Una operación anulada no da nada. El libro `movimiento_puntos` solo crece: ni la API ni la administración editan o borran; las correcciones serían movimientos compensatorios del sistema. Un disparador de la base exige un hecho que justifique cada movimiento (operación completada, entrega confirmada, desafío reclamado o invitación contada) y comprueba que el saldo del perfil sea la suma del libro. No existe ningún endpoint que escriba puntos.
- **Niveles** (`GET /yo/niveles`): 0, 50, 200, 500, 1 000 y 2 500 kg = Semilla, Brote, Recolector, Guardián, Maestro y Leyenda. Salen de los kilos reales (operaciones completadas y entregas directas confirmadas), nunca de los puntos de bonus; la base fija el nivel a partir de los kilos.
- **Giros:** 1 por cada 500 puntos de reciclaje (los bonus no cuentan) y 1 extra por la Meta del mes. Se acumulan en el libro; las pantallas y la ruleta llegan en la Fase 10B, por eso la API de esta fase no los devuelve.
- **Insignias** (`GET /yo/insignias`, `GET /yo/camino`): 12 con criterio fijo. Semilla al completar el registro con materiales; Recolector, Guardián y Maestro a los 200, 500 y 1 000 kg; Racha de 4 semanas (semanas de lunes a domingo, cada una con al menos 1 operación completada o 1 entrega directa confirmada); Madrugador (5 operaciones cuya recepción se confirmó antes de las 9:00 de Lima); Reciclador Confiable (10 operaciones y 4,5 de calificación); Material impecable (5 calificaciones con "Material limpio" o "Bien separado", sin contar las ocultas); Cazador de precios (5 operaciones aceptando la oferta de mayor total habiendo al menos 2); Embajador (3 invitados que completaron su primera operación); Cazador de desafíos (5 desafíos reclamados); Primer giro se otorga con la ruleta. Se otorgan una sola vez (llave primaria) y se evalúan tras cada hecho y al abrir las pantallas, también hacia atrás.
- **Desafíos** (`GET /yo/desafios`, `POST /yo/desafios/:id/reclamar`): mensuales. El progreso se calcula con los datos reales del mes (día 1 a las 00:00 de Lima hasta el día 1 siguiente). Cada uno se reclama una sola vez; uno completado y sin reclamar se puede reclamar hasta 7 días después de terminar el mes (`desafio_reclamo_dias`). El bono suma al saldo pero no cuenta para ganar giros ni para el nivel; la Meta del mes (`meta_mes_kg`, 100 kg) da 30 puntos y 1 giro extra. Errores: `DESAFIO_INCOMPLETO`, `DESAFIO_YA_RECLAMADO` y `DESAFIO_FUERA_DE_PLAZO` (409).
- **Ranking** (`GET /ranking?alcance=mes|acumulado&ciudad=`): por ciudad activa, con nombre abreviado, nivel y kilos. Quien se oculta (`visibleEnRanking`, también en Configuración) no aparece y no se expone ningún identificador ni dato personal.
- **Invitación:** quien invita gana `puntos_por_invitacion` (10) cuando su invitado completa su primera operación; no cuentan para giros.
- **Entrega directa (RN-15)** (`POST /registros-directos`, `GET /registros-directos/mios`, `GET /registros-directos/negocios`; del lado del negocio `GET /mi-negocio/entregas-directas`, `POST .../:id/confirmar` con `kg` y `POST .../:id/rechazar` con `motivo`): el reciclador registra material y kilos entregados a un negocio verificado sin publicación previa y queda por confirmar, sin puntos. El negocio confirma con los kilos prellenados y ajustables (el valor confirmado es el que cuenta) o rechaza. Tope de `tope_diario_registro_directo` (150) puntos por día por reciclador (los kilos cuentan completos), máximo `registro_directo_max_pendientes` (3) pendientes y vencimiento a los `registro_directo_vigencia_dias` (7) sin dar puntos. Los kilos confirmados suben de nivel y cuentan para la racha y los desafíos de kilos; no generan reseñas. No se repite el mismo material al mismo negocio el mismo día. Errores: `LIMITE_PENDIENTES`, `ENTREGA_DUPLICADA`, `FECHA_NO_VALIDA`, `ENTREGA_YA_RESUELTA` y `ENTREGA_VENCIDA`.
- **Colusión:** las entregas directas confirmadas cuentan en los pares reciclador–negocio repetidos y alertan cuando el negocio confirma muchos más kilos de los registrados (mismo umbral que las operaciones); las alertas llevan el campo `origen` (`OPERACION` o `DIRECTA`).
- **Avisos de progreso:** subir de nivel, ganar una insignia, completar un desafío y la invitación llegan como avisos no críticos que respetan la preferencia de premios. Lo que concierne a una entrega directa (nueva, confirmada, rechazada o vencida) es obligatorio.

## Cuenta y negocio

- `PATCH /yo/perfil` (reciclador: nombre, correo, zona, "sobre ti"), `PATCH /yo/correo` (cualquier rol; queda sin verificar), `PUT /yo/preferencias` (aparecer en el ranking), `POST /yo/lista-espera/:ciudadId` (ciudades "Próximamente").
- **Cambiar el teléfono:** `POST /yo/telefono/cambiar` envía un código por SMS al número nuevo y `POST /yo/telefono/confirmar` lo aplica. Hasta confirmar, la cuenta sigue con el anterior; al confirmar llega un aviso de seguridad obligatorio.
- **Reseñas del reciclador:** `GET /yo/resenas` devuelve las que recibió (estrellas, etiquetas, comentario, negocio autor, fecha). Las ven el propio reciclador, los negocios verificados y la administración.
- **Datos y horarios** (`GET` y `PATCH /mi-negocio/datos`, `PUT /mi-negocio/horarios`, `PUT /mi-negocio/pagos`): se aplican al momento. `POST /mi-negocio/cambio-direccion` (solo centros) abre una solicitud de verificación de tipo `CAMBIO_DIRECCION`: mientras el administrador la decide, el centro sigue visible con la dirección anterior (S5). Al aprobarla se aplican la dirección, la zona y el pin; al rechazarla no cambia nada.

## Avisos obligatorios

Apagar "Avisos" no apaga los avisos críticos: "Tu publicación vence pronto", "Actualiza tus precios" y todo lo moderado sobre lo propio (reportes, correcciones, cambios de dirección, cambio de número) se crean como obligatorios y no respetan la preferencia. "Avisos" solo cubre las publicaciones nuevas cerca y los anuncios.

## Google Maps

La web pide la clave de navegador a `GET /configuracion-publica` (`googleMaps: { clave, idMapa }` o `null`). Es una clave pública por diseño: su seguridad está en la restricción por dominio y por API en Google Cloud. Sin clave, la lista funciona sola y la web muestra un aviso. Variables: `GOOGLE_MAPS_CLAVE_NAVEGADOR` y `GOOGLE_MAPS_ID_MAPA`. Para el trazo de "Cómo llegar" el servidor usa una clave aparte, `GOOGLE_MAPS_CLAVE_SERVIDOR` (Routes API, restringida por IP); la web nunca la recibe. Sin ella, `/configuracion-publica` devuelve `rutas: false` y solo se ofrece el enlace a Google Maps.

## Rutas

| Módulo               | Rutas                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogos (públicas) | `GET /materiales`, `GET /ciudades`, `GET /ciudades/:id/zonas`, `GET /precios/referencia?ciudad=`, `GET /configuracion-publica`                                                                                                                                                                                                                                         |
| Acceso               | `POST /auth/registro/reciclador`, `/auth/registro/negocio`, `/auth/telefono/enviar-codigo`, `/auth/telefono/verificar`, `/auth/login`, `/auth/admin/verificar`, `/auth/google`, `/auth/google/completar`, `/auth/refresh`, `/auth/logout`, `/auth/logout-todas`, `/auth/recuperar`, `/auth/recuperar/verificar`, `/auth/recuperar/restablecer`; `PUT /auth/contrasena` |
| Mi cuenta            | `GET /yo`, `PUT /yo/materiales` (reciclador; entrega la insignia Semilla)                                                                                                                                                                                                                                                                                              |
| Mi negocio           | `GET /mi-negocio`, `PUT /mi-negocio/registro` (borrador), `POST /mi-negocio/registro/enviar`, `GET /mi-negocio/verificacion`, `POST /mi-negocio/verificacion/reenviar`                                                                                                                                                                                                 |
| Mapa (públicas)      | `GET /compradores`, `GET /compradores/:id`, `GET /compradores/comparar`, `GET /compradores/:id/ruta`, `POST /compradores/:id/solicitudes-llegada`, `GET /calculadora`                                                                                                                                                                                                  |
| Precios              | `GET /mi-negocio/precios`, `PUT /mi-negocio/precios`, `GET /mi-negocio/precios/historial`, `PUT /mi-negocio/ubicacion`                                                                                                                                                                                                                                                 |
| Búsquedas            | `GET /busquedas`, `POST /busquedas`, `DELETE /busquedas/:id`                                                                                                                                                                                                                                                                                                           |
| Publicaciones        | `POST /publicaciones`, `GET /publicaciones?grupo=`, `GET /publicaciones/alcance`, `GET` y `PUT /publicaciones/:id`, `POST /publicaciones/:id/renovar`, `/cancelar`, `/volver-a-publicar`, `/duplicar`; `GET /publicaciones/:id/ofertas`; `POST /ofertas/:id/aceptar`, `/rechazar`                                                                                      |
| Negocio              | `GET /negocio/publicaciones?material=`, `GET /negocio/publicaciones/:id`, `POST /negocio/publicaciones/:id/ofertas`, `GET /negocio/ofertas?estado=`, `PUT /negocio/ofertas/:id`, `POST /negocio/ofertas/:id/retirar`                                                                                                                                                   |
| Operaciones          | `GET /operaciones?estado=&material=`, `GET /operaciones/exportar`, `GET /operaciones/:id`; `POST /operaciones/:id/coordinar`, `/entregar`, `/confirmar`, `/conforme`, `/no-conforme`, `/incidencia`, `/cancelar`, `/calificacion`; `GET /negocio/compras`                                                                                                              |
| Comprador móvil      | `GET /comprador/inicio`, `PUT /mi-negocio/estado-movil`                                                                                                                                                                                                                                                                                                                |
| Fotos                | `POST /fotos`, `GET /fotos/:id`, `DELETE /fotos/:id`                                                                                                                                                                                                                                                                                                                   |
| Notificaciones       | `GET /notificaciones`, `GET /notificaciones/contador`, `POST /notificaciones/leer-todas`, `POST /notificaciones/:id/leer`, `GET` y `PUT /notificaciones/preferencias`, `POST` y `DELETE /notificaciones/push`; Socket.IO `/api/v1/en-vivo`                                                                                                                             |
| Administración       | `GET /admin/verificaciones?estado=pendientes`, `info-pedida` o `resueltas`; `GET /admin/verificaciones/:id`; `POST /admin/verificaciones/:id/aprobar`, `/rechazar`, `/pedir-informacion`                                                                                                                                                                               |
| Reportes y precios   | `GET /admin/reportes`, `POST /admin/reportes/:id/pedir-correccion`, `/resolver`, `/descartar`, `/ocultar-resena`; `GET /admin/alertas`; `GET /admin/precios`, `POST /admin/precios/:id/marcar`, `/pedir-correccion`, `/suspender`, `/restituir`                                                                                                                        |
| Reportes             | `POST /reportes`, `GET /reportes/mios`; `GET /mi-negocio/reportes`, `POST /mi-negocio/reportes/:id/corregido`; `POST /operaciones/:id/problema`, `GET /operaciones/problemas/mios`                                                                                                                                                                                     |
| Favoritos            | `GET /favoritos`, `GET /favoritos/ids`, `PUT` y `DELETE /favoritos/:compradorId`, `PATCH /favoritos/:compradorId/alertas`                                                                                                                                                                                                                                              |
| Cuenta               | `PATCH /yo/perfil`, `PATCH /yo/correo`, `POST /yo/telefono/cambiar`, `/yo/telefono/confirmar`, `PUT /yo/preferencias`, `POST /yo/lista-espera/:ciudadId`, `GET /yo/resenas`; `GET` y `PATCH /mi-negocio/datos`, `PUT /mi-negocio/horarios`, `PUT /mi-negocio/pagos`, `POST /mi-negocio/cambio-direccion`                                                               |
| Incidencias          | `GET /admin/incidencias?estado=`, `POST /admin/incidencias/:id/resolver`                                                                                                                                                                                                                                                                                               |
| Reseñas              | `GET /negocios/:id/resenas` (pública), `GET /mi-negocio/resenas?filtro=`, `POST /resenas/:id/respuesta`, `POST /resenas/:id/reportes`                                                                                                                                                                                                                                  |

Cada decisión del administrador queda en la tabla de auditoría y el negocio recibe un aviso en la app y un SMS. El administrador ve los precios del negocio, pero la base de datos no le permite modificarlos.

## Rutas de salud

| Ruta                      | Responde                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `GET /api/v1/salud`       | `{"estado":"ok"}` si el proceso vive                             |
| `GET /api/v1/salud/listo` | `{"estado":"ok","baseDatos":"ok"}`, o 503 si la base no responde |

## Colección de Postman

Está en `apps/api/postman/`, organizada por módulo, con ejemplos de respuesta y pruebas en cada petición. Para usarla en la aplicación de Postman, importa la colección y el entorno `local.postman_environment.json`. Por línea de comandos: `pnpm api:postman` con la API arrancada.

Todo endpoint nuevo llega con su petición en la colección y sus pruebas: estado, estructura, reglas de negocio y permisos por rol. El entorno nunca lleva claves reales.

## Pruebas

| Tipo                    | Dónde                | Comando            |
| ----------------------- | -------------------- | ------------------ |
| Unitarias               | `src/**/*.spec.ts`   | `pnpm test`        |
| Reglas de base de datos | `test/bd/*.spec.ts`  | `pnpm db:probar`   |
| Extremo a extremo       | `test/*.e2e-spec.ts` | `pnpm api:e2e`     |
| Contrato                | `postman/`           | `pnpm api:postman` |
