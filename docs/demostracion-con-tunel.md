# Demostración con un enlace público temporal (túnel)

Para que una persona de fuera revise la aplicación sin desplegarla en la nube: la aplicación corre en **tu laptop** y un
túnel gratuito (sin tarjeta) la expone con una dirección `https`. Esto **no** es el entorno de pruebas en la nube
(pospuesto): si la laptop se apaga o el túnel se cierra, el enlace deja de funcionar.

> **Cuidado:** el enlace es público. Cualquiera que tenga la dirección entra. Usa solo datos de prueba, no escribas datos
> reales y apaga el túnel al terminar.

## Qué es el modo demostración

Un modo explícito, distinto de producción y de desarrollo, que **solo se activa a propósito** con `MODO_DEMOSTRACION=true` en
el archivo `.env.demo`. Es producción endurecida (cabeceras, cookies seguras, CORS limitado a la dirección pública, Swagger
apagado, límites de solicitudes, defensa de origen) con tres excepciones:

- Existen las **cuentas de la semilla**, con una contraseña propia que defines tú (nunca la de ejemplo).
- El **código de verificación** se muestra en pantalla ("Solo desarrollo"), porque los SMS y correos son simulados.
- El mapa usa el **servidor público de OpenStreetMap** (apto para pruebas, no para tráfico real).

Toda la aplicación muestra el cartel **«Versión de demostración académica: datos de prueba; SMS y correo simulados»**. Si
alguna de las condiciones no se cumple (contraseña de semilla igual a la de ejemplo o muy corta, dirección sin `https` o que
apunta a `localhost`, claves de base de datos de ejemplo…), la API **se niega a arrancar** y dice qué falta.

## Elegir el túnel

|                | Cloudflare Quick Tunnel                                                            | ngrok (cuenta gratuita)                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Cuenta         | No hace falta                                                                      | Sí (correo y contraseña; la creas tú)                                                                                        |
| Dirección      | Cambia en cada arranque                                                            | Fija (un dominio gratuito `*.ngrok-free.app`)                                                                                |
| Límites        | Sin garantía de servicio ni límite publicado                                       | 1 GB de salida y 20 000 solicitudes al mes, con pantalla de advertencia la primera vez que se abre el enlace en un navegador |
| Avisos en vivo | Verificados de punta a punta                                                       | Mismo mecanismo (sondeo largo por HTTP); verificar al usarlo                                                                 |
| Google OAuth   | No funciona: el origen autorizado debe coincidir exactamente y la dirección cambia | Funciona si agregas el origen exacto en la consola de Google                                                                 |

**Recomendación:** usa **Cloudflare Quick Tunnel** para revisiones puntuales (no gasta cupo, no necesita cuenta). Usa **ngrok**
solo si necesitas una dirección fija (por ejemplo, para que el botón de Google funcione). Con una dirección cambiante, el
ingeniero entra con teléfono y contraseña; el botón de Google no funcionará.

### Cloudflare Quick Tunnel

- Mac: `brew install cloudflared`. Windows: `winget install --id Cloudflare.cloudflared`.
- Con la aplicación arrancada: `cloudflared tunnel --url http://localhost:3000`. Copia la dirección `https://….trycloudflare.com`
  que imprime.

### ngrok

1. Crea tu cuenta en https://ngrok.com (la contraseña y la verificación las escribes tú) y sigue sus pasos para instalar y
   registrar tu token con `ngrok config add-authtoken …`. Si en algún paso piden tarjeta o un pago, detente: no lo necesitas.
2. En «Domains» reclama tu dominio gratuito.
3. Con la aplicación arrancada: `ngrok http --url=https://TU-DOMINIO.ngrok-free.app 3000` (en versiones anteriores,
   `--domain=TU-DOMINIO.ngrok-free.app`).
4. Para el botón de Google, en Google Cloud → Google Auth Platform → Clientes, agrega `https://TU-DOMINIO.ngrok-free.app` como
   origen autorizado de JavaScript y compila la web con `NEXT_PUBLIC_GOOGLE_CLIENT_ID` en `.env`.

## Preparación (una sola vez)

1. Completa el README hasta la sección **Puesta en marcha** (instalar, servicios, base de datos). **Antes de levantar los
   servicios por primera vez**, cambia en `.env` todas las claves `cambia_…` (`DB_PROPIETARIO_CLAVE`, `DB_API_CLAVE`,
   `DB_ADMIN_CLAVE`, `ALMACEN_CLAVE_ACCESO`, `ALMACEN_CLAVE_SECRETA`) por valores propios. La demostración mantiene la regla de
   producción de no arrancar con claves de ejemplo. Si ya levantaste los servicios con las claves de ejemplo:
   `docker compose down -v` (borra los datos locales) y repite el README desde el paso 3.
2. Copia `.env.demo.example` como `.env.demo`:
   - Mac: `cp .env.demo.example .env.demo` · Windows (PowerShell): `Copy-Item .env.demo.example .env.demo`
3. Completa `.env.demo`: `SEMILLA_CLAVE` (la contraseña de las cuentas de prueba, 10 caracteres o más; **la defines el equipo y se
   la entrega en persona al ingeniero, no se escribe en documentos ni en mensajes**) y `JWT_SECRETO` (32 caracteres o más, al azar).
   `WEB_ORIGEN` se completa en el paso 3 del arranque.
4. Compila: `pnpm build`.

## Arranque (cada vez)

1. Abre Docker Desktop y levanta los servicios: `pnpm servicios:levantar`.
2. Abre el túnel en una terminal aparte (ver arriba) y **copia su dirección `https`**.
3. Escribe esa dirección en `WEB_ORIGEN=` de `.env.demo` (sin barra final). Con Cloudflare cambia cada vez; con ngrok es fija.
4. Valida la configuración: `pnpm demo:verificar`. Si algo falta, dice qué.
5. Reinicia los datos de prueba (borra lo que haya): `pnpm demo:preparar`. Hazlo antes de cada revisión.
6. Arranca la aplicación: `pnpm demo:iniciar`. Queda en http://localhost:3000, y el túnel la expone.
7. Abre la dirección pública en el celular (con datos móviles, no el Wi-Fi) y comprueba el cartel amarillo.

## Que la laptop no se duerma

- **Mac:** en otra terminal, `caffeinate -dis` (evita la suspensión mientras esté abierta), o Ajustes del sistema → Batería /
  Pantalla → «Evitar la suspensión automática con el adaptador conectado». Mantén la tapa abierta y el cargador conectado.
- **Windows:** `powercfg /change standby-timeout-ac 0` y `powercfg /change monitor-timeout-ac 0` (PowerShell como administrador), o
  Configuración → Sistema → Inicio/apagado y suspensión → «Nunca» con el cargador conectado.
- Mientras dura la revisión, no cierres la tapa ni apagues el Wi-Fi.

## Cuentas de prueba para el ingeniero

La contraseña es la de `SEMILLA_CLAVE` y se entrega en persona.

| Persona                         | Teléfono  | Qué ve                                             |
| ------------------------------- | --------- | -------------------------------------------------- |
| Marco (reciclador)              | 900000001 | Publicaciones, ofertas, historial, puntos y ruleta |
| Compras Rubén (comprador móvil) | 900000021 | Publicaciones cercanas, ofertas, compras           |
| Acopio Titicaca (centro)        | 900000011 | Precios, plan, estadísticas, reseñas               |
| Administración                  | 900000099 | Panel; pide un código que aparece **en pantalla**  |

También puede **crear su propia cuenta** (el código de verificación aparece en pantalla, marcado «Solo desarrollo»). El guion de
15 minutos está en `docs/guion-demo.md`: usa una ventana normal y una privada con las cuentas de arriba.

## Apagar todo

1. En la terminal de `pnpm demo:iniciar`: `Ctrl + C`.
2. En la terminal del túnel: `Ctrl + C` (con Cloudflare, el enlace muere al instante).
3. `pnpm servicios:detener` (no borra datos).
4. Cierra `caffeinate` o restablece las opciones de suspensión.

## Capacidad del túnel gratuito

Medida con el guion de demostración completo (tres dispositivos, cada uno con la caché vacía, a 360 px y en escritorio), contando
cada solicitud que pasaría por el túnel:

| Concepto                                                                      | Solicitudes     |
| ----------------------------------------------------------------------------- | --------------- |
| Archivos estáticos (primera visita de tres dispositivos)                      | ≈ 425           |
| API                                                                           | ≈ 205           |
| Páginas, manifiesto y otros                                                   | ≈ 33            |
| Avisos en vivo durante el guion (hay cargas completas de página en la prueba) | ≈ 58            |
| **Total del guion**                                                           | **≈ 730 – 745** |

En una sesión real las pantallas cambian sin recargar la página, así que esos ≈ 58 avisos de la prueba no se repiten; en cambio, con
15 minutos de pantalla abierta por persona, los avisos en vivo suman unas 150 solicitudes entre las tres personas. Una sesión
completa del guion cuesta entonces unas **830** solicitudes: con el límite de 20 000 al mes de ngrok caben **unas 24 sesiones
completas**. Una revisión de una sola persona (primera visita, 30 minutos explorando, unas 140 de archivos estáticos, 120 de API y
100 de avisos) cuesta unas 370: caben **unas 54 revisiones**. Cloudflare Quick Tunnel no publica un límite.

Lo que se redujo para ahorrar cupo (y datos del celular): ya no se precargan pantallas en segundo plano (≈ 190–350 solicitudes
menos por sesión), los avisos en vivo comparten una sola conexión entre pantallas, esperan 55 s entre sondeos (antes 25 s) y se
cierran con la pestaña oculta.

## Qué hacer si algo falla

| Síntoma                                                                               | Causa y solución                                                                                         |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm demo:verificar` dice qué falta                                                  | Corrige `.env.demo` o `.env` según el mensaje (contraseña de semilla, `https`, claves de ejemplo)        |
| El enlace carga pero iniciar sesión falla con «Esta solicitud no viene de RecicloMap» | `WEB_ORIGEN` no coincide exactamente con la dirección del túnel: cámbiala y reinicia `pnpm demo:iniciar` |
| El túnel de Cloudflare cambió de dirección                                            | Es normal al reiniciarlo: actualiza `WEB_ORIGEN` y reinicia `pnpm demo:iniciar`                          |
| Muchas personas reciben «demasiados intentos»                                         | Comprueba `CONFIAR_PROXY=1` en `.env.demo`; sin él todos comparten el mismo límite                       |
| ngrok muestra una página de advertencia                                               | Es de ngrok la primera vez; pulsa «Visit Site»                                                           |
| Los avisos en vivo no llegan                                                          | Revisa que la pestaña esté visible (con la pestaña oculta se pausan) y que el túnel esté arriba          |
