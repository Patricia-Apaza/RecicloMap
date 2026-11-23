# Deuda técnica y pendientes

Registro de lo que queda por hacer antes y después de un piloto. «Responsable» es el rol que debe decidir o ejecutar; el
equipo asigna a la persona.

Prioridad: **Alta** = antes de abrir la plataforma a personas reales; **Media** = en el primer mes del piloto;
**Baja** = cuando el volumen o el producto lo pida.

## 1. Antes del piloto (prioridad alta)

| #   | Pendiente                                                            | Motivo                                                                                                                                                                                                                                                      | Impacto si no se hace                                                                                       | Responsable                                           |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Claves reales de Google: mapa (navegador), Routes (servidor) y OAuth | En desarrollo no hay claves reales; el mapa y «Cómo llegar» se probaron con un sustituto local y la lista funciona sin mapa                                                                                                                                 | Sin mapa visible ni rutas reales; el peso real de la página del mapa con Google Maps no está medido         | Producto / quien administre la cuenta de Google Cloud |
| 2   | Proveedor real de SMS o WhatsApp para el código de verificación      | Hoy el código se simula y llega al buzón de pruebas                                                                                                                                                                                                         | Nadie puede verificar su teléfono en producción; la API se niega a arrancar si se intenta mostrar el código | Producto + técnico                                    |
| 3   | Código de la administración: hoy depende del SMS simulado            | El segundo paso de las cuentas de administración reutiliza el canal de SMS. Dos opciones: (a) proveedor real de SMS, con el costo y la demora de entrega que implica; (b) aplicación autenticadora (TOTP), sin costo por mensaje y sin depender de la señal | Sin esta decisión, la administración no puede entrar en producción                                          | Producto (decide) + técnico                           |
| 4   | Almacén de fotos de producción                                       | En local se usa SeaweedFS compatible con S3. Falta elegir el servicio, crear el bucket privado y las claves, y definir copias y retención                                                                                                                   | Sin fotos de negocios ni de publicaciones                                                                   | Técnico                                               |
| 5   | Coordenadas reales de zonas y negocios                               | La semilla usa puntos de ejemplo en Juliaca                                                                                                                                                                                                                 | Las distancias y los tramos serían falsos; los negocios reales deben registrar su pin                       | Producto + equipo de campo                            |
| 6   | Revisión legal de términos, privacidad y retención                   | Los textos describen lo que hace el sistema, pero no los revisó un abogado                                                                                                                                                                                  | Riesgo legal frente a la Ley de Protección de Datos Personales                                              | Legal (externo)                                       |
| 7   | Claves de notificaciones push probadas con un dispositivo real       | El código está listo y probado con simulación; no se probó con claves reales ni con celulares reales                                                                                                                                                        | Los avisos podrían no llegar con la pantalla apagada                                                        | Técnico                                               |
| 8   | Probar en Mac y en celulares reales                                  | Las pruebas corrieron en una sola computadora (macOS) y en navegadores simulados a 360 px; el CI corre en Linux                                                                                                                                             | Diferencias de Windows, Mac o de modelos de celular sin descubrir                                           | Técnico + testers                                     |
| 9   | Prueba con lector de pantalla real                                   | Hay pruebas automáticas de accesibilidad (axe, contraste, foco), pero ningún lector de pantalla probó las pantallas                                                                                                                                         | Posibles problemas de lectura que ninguna herramienta automática detecta                                    | Producto + persona usuaria de lector de pantalla      |

| 1b | Proveedor de mapas para el piloto | El servidor público de OpenStreetMap solo sirve para clase y pruebas y la API no arranca en producción con él | Sin otro proveedor (MapTiler gratuito solo para uso no comercial, o teselas propias) no hay mapa en producción | Producto + técnico |
| 1c | Logo de MapTiler | Su plan gratuito exige mostrar su logo además de la atribución | Incumplimiento de licencia si se elige MapTiler sin logo | Técnico |

## 2. Primer mes del piloto (prioridad media)

| #   | Pendiente                                                                           | Motivo                                                                                                                                                                                                                                  | Impacto si no se hace                                                                                                                                         | Responsable        |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 10  | Límite de intentos compartido entre procesos (Redis)                                | El límite de peticiones y de intentos de acceso vive en la memoria de cada proceso de la API. Se evaluó pasarlo a Redis: requiere agregar una dependencia de almacenamiento al arranque y probar su caída, y hoy hay una sola instancia | Con varias instancias, cada una cuenta por separado y el límite efectivo se multiplica. El bloqueo por cuenta sí está en la base de datos y no se ve afectado | Técnico            |
| 11  | Política de seguridad de contenido (CSP) con nonce                                  | Hoy permite estilos y scripts en línea necesarios para Next.js. Un nonce por solicitud obliga a renderizar todas las páginas en el servidor y desactiva su caché, lo que choca con el presupuesto de 3G y con el modo sin conexión      | Una falla de XSS tendría algo más de margen; las demás defensas (escape de React, validación, cookies httpOnly) siguen activas                                | Técnico            |
| 12  | Límites y seguridad de la lista 13B (ubicaciones propias, controles, mantenimiento) | Los límites actuales (por ejemplo, una exportación por día y cinco intentos de código) son valores razonables, no medidos con tráfico real                                                                                              | Podrían ser demasiado estrictos o demasiado laxos                                                                                                             | Técnico + producto |
| 13  | Cobro del plan Pro                                                                  | El plan se activa a mano y no hay pagos: `pago_plan` y `medio_pago_plan` existen sin uso                                                                                                                                                | La administración debe llevar el registro del cobro fuera del sistema                                                                                         | Producto + legal   |
| 14  | Persistencia de las ofertas retiradas por una suspensión                            | Las ofertas retiradas no vuelven al reactivar la cuenta, por decisión de producto; la persona debe ofertar de nuevo                                                                                                                     | Fricción menor para quien fue suspendido                                                                                                                      | Producto           |
| 15  | Seguimiento de errores y métricas de operación (monitor, alertas)                   | No hay servicio externo de monitoreo; los registros salen a consola                                                                                                                                                                     | Errores en producción que nadie ve                                                                                                                            | Técnico            |
| 16  | Copias de seguridad y restauración de la base de datos                              | Aún no hay política ni práctica                                                                                                                                                                                                         | Pérdida de datos ante una falla                                                                                                                               | Técnico            |

## 3. Más adelante (prioridad baja)

| #   | Pendiente                                      | Motivo                                                                                                   | Impacto                                                | Responsable |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------- |
| 18  | Entorno de pruebas compartido (staging) y nube | Pospuestos por decisión del equipo                                                                       | Hasta entonces, todo se prueba en local y en el CI     | Equipo      |
| 19  | Exportar la auditoría (CSV)                    | La pantalla 64 del prototipo lo muestra; se dejó fuera a propósito                                       | La administración no puede descargar la auditoría      | Producto    |
| 20  | Métricas agregadas por día                     | El panel calcula al consultar                                                                            | Con mucho volumen, el panel será lento                 | Técnico     |
| 21  | Cola de escritura sin conexión                 | Sin conexión solo se lee lo último guardado, por decisión de producto (no hay cola)                      | Una persona sin señal debe repetir la acción al volver | Producto    |
| 22  | Más ciudades                                   | La plataforma está diseñada para escalar, pero hoy solo Juliaca tiene datos y lista de espera para otras | —                                                      | Producto    |

## 4. Medidas ya cumplidas que conviene recordar

- La auditoría de dependencias de producción está limpia. En desarrollo queda 1 aviso alto (`picomatch`, herramientas de eslint) cuya versión corregida aún no se publica: repetir `pnpm audit` cada mes y subir el `override` en `pnpm-workspace.yaml` cuando exista.
- La lista del mapa se pinta sin esperar a Google Maps; el mapa se pide cuando la lista ya es usable y, si falla o está
  bloqueado, la lista sigue funcionando.
- El plazo de reclamo de desafíos se corre durante el mantenimiento como los demás plazos personales. El cambio de mes
  y las fechas del plan Pro no se corren; al activar el mantenimiento la pantalla avisa si falta menos de un día para
  el cambio de mes o si hay planes Pro que vencen en las próximas 24 horas.

## 5. Sustituto vacío de `@faker-js/faker` (herramientas de desarrollo)

- **Motivo:** `@faker-js/faker` ≤ 10.4.0 tenía un aviso alto de ejecución de código; la versión corregida (≥ 10.4.1) rompe Newman, que la carga solo para las variables aleatorias de Postman. `herramientas/faker-vacio` la reemplaza por un objeto vacío.
- **Qué afecta:** solo las pruebas de Postman en desarrollo y en CI; nada que se despliegue. La colección no usa variables aleatorias.
- **Estado de la auditoría:** el aviso está **silenciado con sustituto**, no corregido.
- **Condición para retirarlo:** cuando Newman (o `postman-collection`) dependa de un faker corregido; entonces se quita el `override` de `pnpm-workspace.yaml` y la carpeta.
- **Responsable:** técnico.

## 6. Sin trazo de ruta dentro de la app

«Abrir en Google Maps» (solo destino) es el camino por defecto. Dibujar la ruta exige la clave de servidor de Google (facturación). Alternativa gratuita sin tarjeta: OpenRouteService (cuenta con clave gratuita); el servidor demo de OSRM no es para uso continuo. Responsable: producto decide.

## 7. Camino a un despliegue en la nube gratuito (no ejecutado)

El staging y la nube siguen pospuestos. Para publicar un entorno compartido sin presupuesto haría falta, como mínimo:

- **Un servidor que no se duerma:** la API tiene tareas programadas (vencimientos, cierres automáticos, planes) y el servicio de
  avisos en vivo mantiene sondeos largos abiertos; un servicio gratuito que se apaga por inactividad los rompe.
- **PostgreSQL 16 con PostGIS** y los tres usuarios con permisos distintos (propietario, `rm_api`, `rm_admin`), con las migraciones
  aplicadas por el propietario y copias de seguridad.
- **Redis** (hoy los límites de solicitudes viven en la memoria de cada proceso; con más de una instancia hay que compartirlos).
- **Almacén de fotos permanente** compatible con S3 (hoy SeaweedFS local), con bucket privado y claves propias.
- **Un dominio con HTTPS**, y esa misma dirección en `WEB_ORIGEN`, en Google OAuth y en el servidor de teselas.
- **Un proveedor de mapas** que permita el uso (el servidor público de OpenStreetMap no se permite en producción).
- Las mismas reglas de arranque: sin claves de ejemplo, sin cuentas de la semilla, sin código de verificación en pantalla.

Los servicios gratuitos sin tarjeta que cumplan todo lo anterior son escasos; la decisión y el responsable son del equipo.
