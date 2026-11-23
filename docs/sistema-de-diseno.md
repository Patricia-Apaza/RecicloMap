# Sistema de diseño

La web reproduce la guía de estilo aprobada del prototipo. Para compararlas lado a lado, abre la página interna `/interno/guia` con la web arrancada (`pnpm dev`, luego http://localhost:3000/interno/guia). Esa página no es una pantalla del producto y no se indexa en buscadores.

## Dónde está cada cosa

```
apps/web/src/
  app/globals.css     tokens (colores, radios, sombras, tipografías) y estilos de los componentes
  app/fuentes.ts      tipografías, servidas desde el propio dominio
  diseno/             componentes reutilizables
  navegacion/         barra por rol, menú "Más", menú móvil y franja de invitado
  pwa/                íconos de la app y registro del service worker
public/iconos.svg     íconos del prototipo
```

## Tokens

Los colores, radios y sombras están en `globals.css` dentro de `@theme`, así que sirven también como clases de Tailwind: `bg-paper`, `text-ink`, `rounded-panel`, `shadow-duro-5`.

| Grupo             | Tokens                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Paleta de la guía | `paper`, `paper2`, `ink`, `text`, `muted`, `g`, `btn`, `btn-d`, `deep`, `forest`, `lime`, `mint`, `sky`, `sand`, `lilac`, `ok`, `warn`, `bad`, `dem`                                                                                                         |
| Estados           | `mejor`, `intermedio`, `bajo`, `neutro`, `neutro-texto`, `info`, `info-texto`, `dem-apagada`, `peligro`, `estrella`, `estrella-apagada`, `foco`, `pista`, `apagado`, `apagado-texto`, `hoja`, `campo-error`, `nota`, `nota-atencion`, `nota-oscura`, `coral` |
| Radios            | `etiqueta` 8 · `boton-sm` 12 · `boton` 14 · `fila` 16 · `kpi` 20 · `panel` 24 · `modal` 26 · `pildora` 99                                                                                                                                                    |
| Sombras duras     | `duro-2`, `duro-3`, `duro-4`, `duro-5`, `duro-8` (sin difuminado)                                                                                                                                                                                            |
| Tipografías       | `font-head` Bricolage Grotesque · `font-body` Inter · `font-mono` IBM Plex Mono                                                                                                                                                                              |

No agregues colores nuevos sin pasar por el equipo: cada color nuevo es una decisión de diseño.

## Componentes

| Componente                                                                                                          | Archivo          | Variantes                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `Boton`, `BotonEnlace`                                                                                              | `boton.tsx`      | principal, secundario, fantasma, peligro, oscuro; pequeño; deshabilitado. Estado presionado al hacer clic |
| `EtiquetaSemaforo`                                                                                                  | `etiquetas.tsx`  | Mejor precio, Precio intermedio, Precio bajo, Sin comparación. **Siempre con ícono y texto**              |
| `EtiquetaDemanda`                                                                                                   | `etiquetas.tsx`  | Alta, Media, Baja, con barras azules; separada del semáforo                                               |
| `Pildora`, `PildoraPro`                                                                                             | `etiquetas.tsx`  | abierto, cerrado, atención, gris, info, Pro; con punto opcional                                           |
| `ChipPuntos`, `Kpi`, `Panel`, `Nota`, `EstadoVacio`, `BarraProgreso`, `Estrellas`, `Reputacion`, `EncabezadoPagina` | `bloques.tsx`    | —                                                                                                         |
| `Campo`, `Segmentado`, `Ficha`, `Casilla`, `Interruptor`, `EstrellasEditables`                                      | `formulario.tsx` | —                                                                                                         |
| `ProveedorAvisos` + `useAviso`, `Ventana`                                                                           | `avisos.tsx`     | —                                                                                                         |
| `Icono`                                                                                                             | `icono.tsx`      | 44 íconos del prototipo; tamaños sm, md, lg                                                               |
| `BarraNavegacion`, `FranjaInvitado`                                                                                 | `navegacion/`    | reciclador, invitado, centro, comprador móvil, administración                                             |

Reglas:

- El semáforo nunca se muestra solo con color.
- La demanda nunca usa el estilo del semáforo.
- La calificación con menos de 3 opiniones se muestra como "Nuevo".
- Los formatos de dinero, peso, fecha y teléfono salen de `@reciclomap/shared`, nunca se escriben a mano.

## Comportamiento responsivo

Sigue los cortes del prototipo: 640, 1024, 1180 y 1320 px. Por debajo de 1024 px las columnas se apilan. Las pestañas pasan al menú de la hamburguesa por debajo de 1024 px, o de 1180 px para el reciclador y el invitado, que tienen más pestañas.

Toda pantalla del reciclador y del invitado debe usarse a 360 px de ancho sin desplazamiento horizontal. Las pruebas de `apps/web/e2e` lo comprueban en dos tamaños (360 px y 1440 px).

## Peso de las páginas

`pnpm web:peso` no compila: mide la última compilación (`pnpm build`) con un navegador real y muestra cuánto descarga cada página, separado por tipo y con el detalle de las tipografías. El presupuesto está en `apps/web/presupuesto-peso.json`: la bienvenida y la carga inicial del mapa no pueden pasar de 1 MB. La integración continua falla si se excede.

## Aplicación instalable

- Manifiesto en `/manifest.webmanifest` con nombre, colores de la paleta e íconos de 192 y 512 px generados desde el logo.
- Service worker mínimo (`public/sw.js`): guarda solo recursos estáticos del sitio y muestra `/sin-conexion` si no hay red. Nunca guarda datos de la API. Solo se activa en producción.

## Pantallas de acceso y bienvenida

- Las pantallas de acceso (02 a 08, "Verifica tu teléfono" y "Completa tu cuenta") usan el marco `MarcoAcceso` (`src/acceso/`): tarjeta en el celular y, desde 1024 px, columna de marca a la izquierda, como el prototipo. Sus estilos están en `src/acceso/acceso.css`, con el prefijo `ac-` para no chocar con los de la app.
- La bienvenida (01) tiene sus propios estilos en `src/app/bienvenida.module.css`; los nombres de clase son locales a esa página.
- Las pantallas de la app (mapa provisional, 39, 40, 58) usan `MarcoApp`: barra por rol, franja del invitado y pie.
- El invitado puede abrir el mapa y la calculadora; las demás pestañas abren la invitación "Crea tu cuenta gratis" en lugar de navegar.
