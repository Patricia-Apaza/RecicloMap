# Accesibilidad, rendimiento y modo sin conexión (Fase 13B)

## Accesibilidad AA

**Verificador automático** (axe, reglas WCAG 2.0 y 2.1 A y AA) sobre las pantallas clave, a 360 px y en escritorio: bienvenida, ingreso, registro, términos, ayuda, mapa, lista, ficha del negocio, publicar, historial, ruleta, configuración, panel y precios del negocio, y panel y configuración de administración. **Cero fallos graves o críticos.** La prueba es `apps/web/e2e/flujos/accesibilidad.spec.ts`.

Lo que el verificador encontró y se corrigió: contraste insuficiente (texto atenuado sobre tarjetas de color, filas canceladas con transparencia, el aviso «siempre activo» de la configuración, el nombre de la marca en el pie), tablas con desplazamiento sin acceso por teclado, el contenedor del mapa marcado como imagen con controles dentro, indicadores de carga con etiqueta pero sin rol, y un enlace de perfil sin nombre en el celular.

**Revisión manual** (lista de comprobación):

| Punto                            | Cómo se comprobó                                                                                                                           | Resultado |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Teclado                          | Prueba automática: la primera tecla Tab llega a un control, se puede seguir avanzando y el foco se ve (contorno de al menos 2 px o sombra) | Cumple    |
| Foco visible                     | Prueba automática sobre el primer control enfocado                                                                                         | Cumple    |
| Etiquetas                        | Verificador (campos, botones, enlaces) y revisión del nombre accesible de los controles solo con icono                                     | Cumple    |
| Contraste                        | Verificador (4,5:1 texto normal, 3:1 grande) y la prueba de contraste de los colores del sistema de diseño                                 | Cumple    |
| Áreas táctiles de al menos 44 px | Prueba automática en el celular (ingreso): ningún control propio mide menos                                                                | Cumple    |
| Texto ampliado al 200 %          | Prueba automática: sin desborde horizontal y el botón principal sigue visible                                                              | Cumple    |
| Errores anunciados               | Prueba automática: el mensaje aparece, se asocia al campo (`aria-invalid`) y lleva texto, no solo color                                    | Cumple    |
| Nada depende solo del color      | El semáforo siempre lleva texto («Mejor precio», «Precio intermedio», «Precio bajo»); los estados llevan texto                             | Cumple    |
| Reducir movimiento               | Prueba automática: con `prefers-reduced-motion: reduce` la ruleta no tiene transición                                                      | Cumple    |
| Cambios de estado                | Avisos y errores en regiones `role="status"` o `role="alert"`                                                                              | Cumple    |

Limitación: la revisión con lector de pantalla real (VoiceOver, TalkBack) no se hizo en esta fase; queda para la Fase 14.

## Peso de la primera carga (3G simulado)

Máximo del producto: **1 MB** por pantalla clave en la primera carga (sin caché ni service worker), con 3G rápida simulada (1,6 Mbps de bajada, 750 kbps de subida, 150 ms de latencia). Se mide con los bytes transferidos (comprimidos) en `apps/web/e2e/flujos/rendimiento.spec.ts`.

| Pantalla                                    | Celular (360 px) | Escritorio | Presupuesto |
| ------------------------------------------- | ---------------- | ---------- | ----------- |
| Bienvenida                                  | 359 KB           | 428 KB     | 1000 KB     |
| Ingreso                                     | 426 KB           | 426 KB     | 1000 KB     |
| Mapa y lista                                | 528 KB           | 623 KB     | 1000 KB     |
| Mapa con teselas (lista, Leaflet y teselas) | 709 KB           | 881 KB     | 1000 KB     |
| Ficha del negocio (lista y ficha)           | 535 KB           | 629 KB     | 1000 KB     |
| Publicar                                    | 491 KB           | 558 KB     | 1000 KB     |
| Historial                                   | 479 KB           | 556 KB     | 1000 KB     |
| Panel del negocio                           | 465 KB           | 483 KB     | 1000 KB     |

**Mapa (Fase 14.1).** Leaflet y sus estilos (~45 KB) se piden solo en las pantallas con mapa y después de que la lista sea usable. Una tesela real de OpenStreetMap sobre Juliaca pesa entre 15 y 38 KB (medido con 12 teselas, promedio 28 KB); la fila «Mapa con teselas» se mide con teselas de 38 KB. En 3G (o con ahorro de datos) el mapa pide teselas de un nivel menos, cuatro veces menos imágenes: sin esa medida, el escritorio llegaba a 1262 KB. Las imágenes del mapa nunca se guardan para usar sin conexión (prueba `mapa-sin-claves.spec.ts`).

El script de Google Maps **no se carga** en bienvenida, ingreso, historial ni panel del negocio (prueba automática); se pide solo en las pantallas que muestran un mapa. Con el proveedor Google (opcional) el peso de su script no está medido: no hay clave real. La lista del mapa se pinta sin esperar a Google Maps: el script se pide solo cuando la lista ya es usable y el navegador está libre, y si falla o está bloqueado la lista sigue funcionando (prueba `mapa.spec.ts`). Queda por medir con la clave real.

## Modo sin conexión (aplicación instalable)

Alcance, dentro de las reglas del producto:

- **Se puede leer lo ya visto.** El service worker guarda, solo en este dispositivo, las páginas que se abrieron y las lecturas (GET) de: mapa, lista y fichas de compradores, catálogos, ciudades, publicaciones propias, operaciones, precios, perfil, favoritos, avisos y negocio. Sin señal se muestran con el aviso **«Sin conexión · datos de [fecha y hora]»** (hora de Lima). Tras recargar sin señal se recuerda quién era la persona (nombre, rol y estado; nunca un token) para poder seguir leyendo.
- **No se guarda para después ninguna escritura.** Operaciones, ofertas, precios, publicaciones, reseñas, premios o cualquier cambio de estado fallan sin conexión con el aviso «Sin conexión: esta acción necesita internet y no se guarda para después». Los botones de enviar se desactivan mientras no hay señal y no se repite nada al volver (prueba automática: no sale ninguna escritura al recuperar la conexión).
- **Borradores locales.** Publicar sin señal deja un **borrador** en el celular (material, kilos, precio y nota; sin fotos ni ubicación). **No se publica solo**: al volver la señal la persona lo revisa y toca Publicar. (Antes se enviaba solo; se cambió porque era una escritura en cola.)
- **Al cerrar la sesión** se borran los datos guardados del dispositivo.
- **No se guardan**: fotos, la exportación de datos, la privacidad, el acceso ni nada de eso.
