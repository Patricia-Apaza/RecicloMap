# Configuración de claves y cuentas

Guía para que cualquier integrante del equipo (Windows o Mac) repita la configuración. **Ninguna clave se escribe en este
documento, en el chat, en commits ni en capturas.** Todo va al archivo `.env` de la raíz del proyecto, que Git no sube.

## 1. Inicio de sesión con Google (opcional, sin tarjeta)

1. Abre https://console.cloud.google.com con la cuenta de Google del proyecto. Si pide activar la «prueba gratuita» o la
   facturación, **no la actives**: no hace falta para esto.
2. Crea un proyecto (nombre: `reciclomap`). Comprueba que el país de la cuenta sea Perú.
3. Ve a **Google Auth Platform** → **Comenzar**. Nombre de la aplicación: `RecicloMap`. Correo de asistencia y de contacto:
   el del proyecto. Público: **Usuarios externos**. Marca tú la casilla de la política de datos y pulsa **Crear**.
4. En **Público** (estado «Prueba») agrega como **usuarios de prueba** los correos Gmail que usarán el botón de Google.
5. En **Clientes** → **Crear cliente**: tipo **Aplicación web**, nombre `RecicloMap local`, **Orígenes autorizados de
   JavaScript**: `http://localhost:3000`. No agregues URI de redireccionamiento.
6. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`; no es secreto) en `.env`:

   ```
   GOOGLE_CLIENT_ID=<ID de cliente>
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=<el mismo ID>
   ```

7. Compila de nuevo la web (`pnpm build`, la variable pública se fija al compilar) y reinicia la API. El botón «Continuar con
   Google» debe aparecer en el ingreso. Entra tú con un usuario de prueba.

La configuración puede tardar unos minutos en aplicarse. Cuando el dominio real exista, agrégalo como origen autorizado.

## 2. Avisos al celular (VAPID, opcional)

```bash
npx web-push generate-vapid-keys
```

Copia las dos claves a `.env` como `PUSH_CLAVE_PUBLICA` y `PUSH_CLAVE_PRIVADA` (la privada no se comparte) y completa
`PUSH_CONTACTO=mailto:correo-del-equipo`. Probar los avisos exige la web construida (`pnpm build` y `pnpm start`) o HTTPS.

## 3. Correo de soporte

`SOPORTE_CORREO=correo-del-equipo` en `.env`: es el que aparece en el Centro de ayuda y en la identidad con que el buscador de
direcciones se presenta ante Nominatim.

## 4. Mapa (no necesita clave)

Por defecto funciona con OpenStreetMap: no hay nada que configurar.

| Variable           | Valor                                    | Cuándo                                                                                                 |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `MAPA_PROVEEDOR`   | `osm` (por defecto)                      | Clase y pruebas. El servidor público tiene una política de uso justo: no es para un piloto con tráfico |
| `MAPA_PROVEEDOR`   | `maptiler` + `MAPTILER_CLAVE`            | Plan gratuito sin tarjeta, solo uso **no comercial**; exige atribución y logo de MapTiler              |
| `MAPA_PROVEEDOR`   | `google` + `GOOGLE_MAPS_CLAVE_NAVEGADOR` | Solo si algún día hay facturación; la clave se restringe por dominio                                   |
| `MAPA_TESELAS_URL` | `https://servidor/{z}/{x}/{y}.png`       | Servidor de teselas propio; agrega su dominio en `MAPA_IMG_ORIGENES` antes de compilar la web          |

Para cambiar de proveedor: edita `.env`, reinicia la API y, si agregaste un servidor propio, recompila la web. No hay que
tocar código. En producción la API se niega a arrancar con `osm` sin `MAPA_TESELAS_URL`.

Reglas del servidor público de OpenStreetMap que el código ya respeta: envía `Referer` (política `strict-origin-when-cross-origin`),
muestra la atribución, no precarga zonas y no guarda imágenes del mapa para uso sin conexión. La búsqueda de direcciones usa
Nominatim solo con el botón «Buscar», con 1 solicitud por segundo para toda la app y caché de 24 h.

## 5. Clave de demostración de Google Maps

No se obtiene sin facturación: la consola pide «finalizar la configuración de la cuenta» (tarjeta). Sin ella el mapa de
Google no se puede probar con una clave real; el código está probado con un sustituto local.

## 6. Dónde NO poner claves

Ni en el código, ni en `docs/`, ni en el resumen de fase, ni en mensajes de commit. Si una clave se filtra, se revoca en su
consola y se crea otra.
