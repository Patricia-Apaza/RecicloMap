# RecicloMap

Plataforma que conecta recicladores, centros de acopio, compradores móviles y administradores en Juliaca (Puno, Perú).

Estado actual: base de datos, API base y web con el sistema de diseño. Las pantallas del producto se construyen en las siguientes fases.

## Estructura

```
apps/web            Web (Next.js + Tailwind): sistema de diseño, navegación por rol y aplicación instalable
apps/api            API REST (NestJS + Prisma): /api/v1, documentación en /api/docs
packages/shared     Formatos de Perú, estados y textos compartidos entre web y API
docs/               Documentación del equipo
docker-compose.yml  Servicios del entorno local: base de datos, Redis y buzón de correos
```

## Requisitos

| Herramienta    | Versión                           | Cómo comprobarla   |
| -------------- | --------------------------------- | ------------------ |
| Docker Desktop | reciente, **abierto y en marcha** | `docker --version` |
| Node.js        | 22.12 o superior (recomendado 24) | `node -v`          |
| pnpm           | 11                                | `pnpm -v`          |

Si no tienes pnpm: `corepack enable` y luego `corepack prepare pnpm@11.22.0 --activate`.
En Windows, Docker Desktop necesita WSL 2 (el instalador lo ofrece).

## Puesta en marcha

Todos los comandos se ejecutan en la raíz del proyecto.

**1. Crea tu archivo de configuración local**

Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

Mac o Linux:

```bash
cp .env.example .env
```

Los valores de ejemplo sirven tal cual para trabajar en local.

**2. Instala las dependencias**

```bash
pnpm install
```

**3. Levanta los servicios**

```bash
pnpm servicios:levantar
```

Resultado esperado: `Container reciclomap-db Healthy`, `Container reciclomap-redis Healthy`, `Container reciclomap-correo Healthy` y `Container reciclomap-almacen Healthy`. El almacén guarda las fotos (SeaweedFS, compatible con S3). La primera vez descarga las imágenes y tarda unos minutos.

**4. Crea la base de pruebas y los usuarios de base de datos**

```bash
pnpm db:preparar
```

Resultado esperado: `Usuario de base de datos listo: rm_api` y `Usuario de base de datos listo: rm_admin`.

**5. Aplica las migraciones**

```bash
pnpm db:migrar
```

Resultado esperado: `All migrations have been successfully applied.`

**6. Carga los datos de ejemplo**

```bash
pnpm db:sembrar
```

Resultado esperado: `Datos semilla cargados: Juliaca con 5 centros y 5 compradores móviles verificados, 2 centros por verificar, un reciclador de ejemplo y 9 publicaciones de muestra.`

Cuentas de prueba (todas con la contraseña de `SEMILLA_CLAVE` en `.env`):

| Rol                     | Teléfono                          | Notas                                                                                   |
| ----------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| Reciclador              | 900000001                         | Entra directo; publicaciones con ofertas, historial y una operación por dar conformidad |
| Recicladores de ejemplo | 900000002 a 900000004             | Con publicaciones abiertas                                                              |
| Centro de acopio        | 900000011                         | Verificado                                                                              |
| Comprador móvil         | 900000021                         | Verificado; tiene una entrega por confirmar                                             |
| Centro por verificar    | 900000016 y 900000017             | En la cola del administrador                                                            |
| Administración          | 900000099 o admin@reciclomap.test | Pide además un código por SMS                                                           |

La semilla usa una contraseña conocida, así que solo se carga con `NODE_ENV` en desarrollo o pruebas: en producción el comando se niega.

Los SMS y correos son simulados: llegan al buzón de pruebas (http://localhost:8025) y, fuera de producción, la respuesta de la API incluye `codigoDePrueba`.

**7. Arranca en modo desarrollo**

```bash
pnpm dev
```

Arranca la web y la API juntas. Resultado esperado: `✓ Ready` (web) y `API en http://localhost:3001/api/v1 · documentación en http://localhost:3001/api/docs`. Se recargan solas al guardar cambios. Para detenerlas: `Ctrl + C`.

Comprueba en el navegador:

| Dirección                                    | Qué debe mostrar                                                    |
| -------------------------------------------- | ------------------------------------------------------------------- |
| http://localhost:3000/interno/guia           | Guía del sistema de diseño (solo en desarrollo)                     |
| http://localhost:3001/api/v1/salud/listo     | `{"estado":"ok","baseDatos":"ok"}`                                  |
| http://localhost:3001/api/docs               | Documentación interactiva de la API                                 |
| http://localhost:8025                        | Buzón de correos de prueba                                          |
| http://localhost:3000                        | Bienvenida; desde ahí, registro e inicio de sesión                  |
| http://localhost:3000/mapa                   | Mapa de compradores (como invitado o reciclador)                    |
| http://localhost:3000/negocio/precios        | Precios y demanda del centro 900000011                              |
| http://localhost:3000/publicaciones          | Publicaciones del reciclador 900000001                              |
| http://localhost:3000/negocio/publicaciones  | Material publicado en la ciudad, para ofertar                       |
| http://localhost:3000/historial              | Historial y puntos del reciclador 900000001                         |
| http://localhost:3000/comprador/compras      | Compras del comprador móvil 900000021                               |
| http://localhost:3000/negocio/resenas        | Reseñas del centro 900000011                                        |
| http://localhost:3000/admin/incidencias      | Incidencias de operaciones (administración)                         |
| http://localhost:3000/admin/reportes         | Reportes de usuarios, reseñas reportadas y alertas (administración) |
| http://localhost:3000/admin/precios          | Moderación de precios (administración)                              |
| http://localhost:3000/negocio                | Resumen del centro 900000011 (plan, solicitudes y avisos)           |
| http://localhost:3000/negocio/estadisticas   | Estadísticas del negocio por período                                |
| http://localhost:3000/negocio/plan           | Plan y avisos del negocio                                           |
| http://localhost:3000/avisos                 | Avisos de los negocios (también como invitado)                      |
| http://localhost:3000/comprador/estadisticas | Estadísticas del comprador móvil 900000021                          |
| http://localhost:3000/comprador/perfil       | Perfil del comprador móvil 900000021                                |
| http://localhost:3000/comprador/ruta         | Zona y ruta del día del comprador móvil 900000021                   |
| http://localhost:3000/puntos                 | Puntos, nivel e historial del reciclador 900000001                  |
| http://localhost:3000/puntos/niveles         | Escalera de niveles y kilos por semana                              |
| http://localhost:3000/puntos/insignias       | Las 12 insignias con su progreso                                    |
| http://localhost:3000/puntos/desafios        | Desafíos del mes y su reclamo                                       |
| http://localhost:3000/puntos/ranking         | Ranking de la ciudad (mes y total)                                  |
| http://localhost:3000/puntos/entregas        | Registro de entrega directa del reciclador                          |
| http://localhost:3000/perfil                 | Perfil del reciclador: nivel, insignias especiales e historial      |
| http://localhost:3000/negocio/entregas       | Entregas directas por confirmar del centro 900000011                |
| http://localhost:3000/calculadora            | Calculadora de valor (también como invitado)                        |
| http://localhost:3000/favoritos              | Favoritos del reciclador 900000001                                  |

**Probar el flujo completo en una sola computadora.** Abre una ventana normal y otra privada (o dos navegadores) e inicia sesión con cuentas distintas: 900000001 publica, acepta, coordina y da conformidad; 900000011 o 900000021 ofertan y confirman los kilos; 900000099 resuelve incidencias en `/admin/incidencias`. Los avisos llegan al instante a la otra ventana.

**Avisos push (opcional).** Ejecuta `npx web-push generate-vapid-keys`, copia las claves en `.env` (`PUSH_CLAVE_PUBLICA` y `PUSH_CLAVE_PRIVADA`) y reinicia la API. Push solo funciona con la web construida (`pnpm build` y `pnpm start`) o en un dominio con HTTPS.

**Mapa de Google (opcional en local).** Sin clave, el mapa muestra solo la lista y un aviso interno. Para ver el mapa, pide al equipo la clave de navegador de desarrollo y colócala en `.env` como `GOOGLE_MAPS_CLAVE_NAVEGADOR`; luego reinicia la API. Esa clave solo funciona en `localhost:3000` y en los dominios del proyecto.

## Arranque del día a día

Después de la primera puesta en marcha, cada día de trabajo son tres pasos:

1. **Abre Docker Desktop** y espera a que termine de iniciar.
2. **Levanta los servicios** (base de datos, Redis, buzón de correos y almacén de fotos):

   ```bash
   pnpm servicios:levantar
   ```

3. **Arranca la web y la API juntas**:

   ```bash
   pnpm dev
   ```

   Los registros de ambas aparecen en la misma terminal con el prefijo `@reciclomap/web:dev` o `@reciclomap/api:dev`. Si la API tarda unos segundos en compilar, la web ya responde.

| Servicio                | Dirección                      |
| ----------------------- | ------------------------------ |
| Web                     | http://localhost:3000          |
| API                     | http://localhost:3001/api/v1   |
| Documentación de la API | http://localhost:3001/api/docs |
| Buzón de correos        | http://localhost:8025          |

Para empezar con datos limpios usa `pnpm db:reiniciar` (con la API detenida). Al terminar el día, `Ctrl + C` detiene la web y la API; `pnpm servicios:detener` apaga los servicios sin borrar datos.

### Puertos fijos y claves de Google

La web va siempre en el puerto **3000** y la API en el **3001**. Si otro programa ocupa uno de ellos, `pnpm dev` avisa del error en lugar de elegir otro puerto: ciérralo y vuelve a ejecutar. Así las claves de Google funcionan igual para todo el equipo.

| Dónde se configura                                                        | Qué escribir                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Cloud, cliente OAuth (Orígenes de JavaScript autorizados)          | `http://localhost:3000` (y, más adelante, el dominio del proyecto). No hace falta URI de redirección: el botón de Google entrega el token directamente |
| Google Cloud, clave del mapa para navegador (Restricciones de sitios web) | `http://localhost:3000/*` (y el dominio del proyecto)                                                                                                  |
| Google Cloud, clave del servidor (Routes API)                             | Restringida por API, no por sitio web; nunca va en el navegador                                                                                        |

## Pruebas y calidad

| Comando                | Qué hace                                                                                                                                                                                                                   | Resultado esperado                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `pnpm test`            | Pruebas unitarias del paquete compartido, la API y la web                                                                                                                                                                  | 28, 28 y 70 pruebas en verde                 |
| `pnpm db:probar`       | Pruebas de reglas en la base de datos                                                                                                                                                                                      | `Tests 91 passed (91)`                       |
| `pnpm api:e2e`         | Pruebas de extremo a extremo de la API                                                                                                                                                                                     | `Tests 53 passed (53)`                       |
| `pnpm api:postman`     | Colección de Postman con Newman. **Necesita la API arrancada**                                                                                                                                                             | 253 comprobaciones, 0 fallidas               |
| `pnpm web:e2e`         | Pruebas de la web a 360 px y en escritorio. Requiere `RM_PAGINAS_INTERNAS=1 pnpm build` y, la primera vez, el navegador de pruebas (abajo)                                                                                 | 27 en verde, 5 omitidas                      |
| `pnpm web:peso`        | Peso de las páginas y de las tipografías. Requiere `pnpm build`                                                                                                                                                            | Bienvenida por debajo de 1 MB                |
| `pnpm web:flujos`      | Registro, verificación del teléfono, aprobación del administrador e invitado, de punta a punta a 360 px y en escritorio. Arranca su propia API contra la base de pruebas. Requiere `pnpm build` y los servicios levantados | `16 passed`                                  |
| `pnpm lint`            | Revisión de código                                                                                                                                                                                                         | Sin errores                                  |
| `pnpm tipos`           | Comprobación de tipos                                                                                                                                                                                                      | Sin errores                                  |
| `pnpm formato`         | Da formato a todo el código                                                                                                                                                                                                | —                                            |
| `pnpm formato:revisar` | Comprueba el formato sin cambiar nada                                                                                                                                                                                      | `All matched files use Prettier code style!` |

Antes de la primera ejecución de `pnpm web:e2e` o `pnpm web:peso`, instala el navegador de pruebas (unos 120 MB):

```bash
pnpm --filter @reciclomap/web exec playwright install chromium
```

Las pruebas de base de datos y de extremo a extremo de la API usan una base aparte (`reciclomap_pruebas`) que se recrea en cada ejecución; no tocan tus datos de desarrollo.

La integración continua (`.github/workflows/ci.yml`) ejecuta todo lo anterior en cada pull request.

## Comandos del día a día

| Comando                                                                                       | Qué hace                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                                                                                    | Arranca todo en modo desarrollo                                     |
| `pnpm servicios:levantar`                                                                     | Inicia base de datos, Redis, buzón de correos y almacén de fotos    |
| `pnpm servicios:detener`                                                                      | Los detiene sin borrar datos                                        |
| `pnpm db:migrar`                                                                              | Aplica migraciones pendientes                                       |
| `pnpm db:reiniciar`                                                                           | Borra la base de desarrollo, la migra y la siembra de nuevo         |
| `pnpm build`                                                                                  | Compila todos los paquetes                                          |
| `pnpm admin:crear --nombre "Nombre Apellido" --telefono 9XXXXXXXX --correo correo@dominio.pe` | Crea una cuenta de administración; pide la contraseña sin mostrarla |

## Si algo falla

| Síntoma                                      | Causa y solución                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `failed to connect to the docker API`        | Docker Desktop no está abierto. Ábrelo y espera a que termine de iniciar                                                                                     |
| `port is already allocated`                  | Un puerto está ocupado. Cambia `DB_PUERTO`, `REDIS_PUERTO` o `CORREO_PUERTO_WEB` en `.env` y repite desde el paso 3                                          |
| La API no arranca: `EADDRINUSE :3001`        | Ya hay otra API corriendo. Ciérrala o cambia `API_PUERTO` en `.env`                                                                                          |
| La web no arranca: puerto 3000 en uso        | Otra aplicación usa el puerto 3000. Ciérrala                                                                                                                 |
| `Executable doesn't exist` al probar la web  | Falta el navegador de pruebas. Instálalo con el comando de la sección Pruebas                                                                                |
| `password authentication failed`             | Cambiaste una clave en `.env` después de crear la base. Ejecuta `docker compose down -v` (borra los datos locales) y repite desde el paso 3                  |
| `Falta la variable DB_...`                   | No existe el archivo `.env` en la raíz. Repite el paso 1                                                                                                     |
| `La base de datos ya tiene datos` al sembrar | Ya estaba sembrada. Para empezar de cero: `pnpm db:reiniciar`                                                                                                |
| `pnpm api:postman` falla con `ECONNREFUSED`  | La API no está arrancada. Ejecuta `pnpm dev` en otra terminal                                                                                                |
| `pnpm api:postman` falla con 429             | Se ejecutó dos veces en menos de un minuto y saltó el límite de intentos de acceso. Espera un minuto                                                         |
| No llega el código de verificación           | Revisa el buzón de pruebas en http://localhost:8025. Si pediste otro hace menos de 60 segundos, sigue sirviendo el anterior                                  |
| `No pudimos guardar la foto por ahora`       | El almacén de fotos no está arrancado o faltan `ALMACEN_CLAVE_ACCESO` y `ALMACEN_CLAVE_SECRETA` en `.env`. Revisa con `docker compose ps` y repite el paso 3 |
| El botón de Google no aparece                | Falta `NEXT_PUBLIC_GOOGLE_CLIENT_ID` en `.env` (en desarrollo, la pantalla lo avisa). Vuelve a compilar la web después de agregarlo                          |
| Mac con chip Apple: la base arranca lento    | La imagen se ejecuta emulada. Funciona igual; solo tarda más en iniciar                                                                                      |

## Documentación

- [Sistema de diseño](docs/sistema-de-diseno.md)
- [Arquitectura de la API](docs/api.md)
- [Modelo de datos y reglas de la base de datos](docs/base-de-datos.md)
- [Forma de trabajo con Git](docs/flujo-de-trabajo.md)
