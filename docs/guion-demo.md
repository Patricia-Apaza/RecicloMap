# Guion de demostración (unos 15 minutos)

Recorre el flujo central con las cuentas de la semilla: un reciclador publica, un comprador móvil oferta, la operación
se completa, se califican, se suman puntos, se gira la ruleta y la administración ve el resultado.

El guion se comprueba de punta a punta con `apps/web/e2e/flujos/guion-demo.spec.ts` (`pnpm web:flujos`), a 360 px y en
escritorio.

## Preparación (5 minutos antes)

1. Docker Desktop abierto y servicios en marcha: `pnpm servicios:levantar`.
2. Base de datos limpia con la semilla: `pnpm db:reiniciar` (con la API detenida).
3. Arranca todo: `pnpm dev` y espera a ver `✓ Ready` y la línea de la API.
4. Abre **dos ventanas**: una normal y una privada (o dos navegadores). En la ventana normal inicia sesión como Marco; en
   la privada, como Compras Rubén. Una tercera ventana privada servirá para la administración.
5. Mantén abierto el buzón de pruebas en http://localhost:8025 por si hace falta un código.

Cuentas (todas con la contraseña `SEMILLA_CLAVE` del archivo `.env`):

| Persona        | Rol             | Teléfono  | Ventana                                                            |
| -------------- | --------------- | --------- | ------------------------------------------------------------------ |
| Marco          | Reciclador      | 900000001 | Normal                                                             |
| Compras Rubén  | Comprador móvil | 900000021 | Privada                                                            |
| Administración | Administrador   | 900000099 | Otra ventana privada; pide el código que llega al buzón de pruebas |

## Recorrido

| Min   | Quién          | Qué se hace                                                                                                         | Qué mostrar                                                                                                                                                    |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–1   | —              | Presentar el problema: recicladores y compradores no saben quién paga mejor ni quién está cerca                     | El mapa con el semáforo y el texto «Mejor precio»                                                                                                              |
| 1–3   | Marco          | **Publicar**: `/publicar`, material Cartón, unos 200 kg, precio 0,60, zona «Barrio Santa Rosa», «Publicar material» | El aviso «Tu material ya está publicado» y que lo verán todos los negocios cercanos. La ubicación exacta no se comparte                                        |
| 3–5   | Rubén          | **Ofertar**: `/negocio/publicaciones`, filtrar Cartón, «Hacer oferta», 0,70 por kilo                                | Solo ve la distancia por tramos, nunca la dirección de Marco                                                                                                   |
| 5–6   | Marco          | **Aceptar**: `/ofertas`, abrir la publicación, «Aceptar oferta»                                                     | La oferta se acepta y el resto quedaría descartado; aparece la operación                                                                                       |
| 6–8   | Marco          | **Coordinar**: «Definir el punto de encuentro», referencia «Frente al mercado Santa Bárbara, puerta 2», día Mañana  | «Tu ubicación no se comparte». Rubén recibe el aviso al instante                                                                                               |
| 8–9   | Marco          | **Entregar**: «Ya entregué el material»                                                                             | El estado pasa a Entregada                                                                                                                                     |
| 9–10  | Rubén          | **Confirmar**: `/comprador/compras`, «Confirmar recepción», kilos recibidos                                         | El monto es solo informativo: el pago ocurre fuera de RecicloMap                                                                                               |
| 10–11 | Marco          | **Dar conformidad**: en la operación, «Conforme»                                                                    | Estado Completada y los puntos ganados (1 por kilo). Los puntos se suman una sola vez                                                                          |
| 11–12 | Ambos          | **Calificar** en ambos sentidos: 5 estrellas de Marco y 4 de Rubén                                                  | La reseña del reciclador es pública con «Marco Q.»; Rubén puede responder una vez                                                                              |
| 12–13 | Marco          | **Puntos**: `/puntos` y `/historial`                                                                                | Nivel, puntos y la operación en su historial                                                                                                                   |
| 13–14 | Marco          | **Ruleta**: `/puntos/desafios` para reclamar la «Meta del mes» (da un giro) y `/puntos/ruleta` para girar           | El resultado lo decide el servidor; la nota aclara que el tamaño de los segmentos no refleja la probabilidad                                                   |
| 14–15 | Administración | **Panel**: `/admin`                                                                                                 | Pendientes por atender, usuarios, operaciones completadas y kilos por material. Luego `/admin/auditoria`: toda acción de la administración queda con su motivo |

## Qué decir en cada tramo

- **Semáforo:** compara solo el precio con las demás opciones visibles; la demanda es una señal aparte.
- **Privacidad:** el reciclador nunca expone su ubicación; los negocios ven un tramo de distancia.
- **Plan Pro:** da estadísticas ampliadas y una pequeña ventaja de orden; no cambia precio, semáforo ni demanda.
- **Administración:** modera y atiende incidencias, pero no puede editar precios ni kilos.

## Si algo no sale como se espera

| Situación                                  | Qué hacer                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| El mapa no aparece                         | Es normal sin clave de Google: la lista muestra los mismos resultados. Dilo y sigue                       |
| La «Meta del mes» ya figura como reclamada | Ocurre si se repite la demo sin reiniciar la base. Ejecuta `pnpm db:reiniciar` antes de cada demostración |
| La ruleta no tiene giros                   | Sin giros disponibles el botón queda desactivado: reinicia la base de datos                               |
| No llega el código de la administración    | Abre http://localhost:8025 y copia el código más reciente                                                 |
| `pnpm dev` dice que un puerto está en uso  | Cierra el programa que usa el 3000 o el 3001 y vuelve a ejecutar                                          |
