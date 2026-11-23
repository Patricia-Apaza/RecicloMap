import {
  avanzarOperacion,
  cerrarConexiones,
  codigoDeError,
  crearOferta,
  crearOperacion,
  crearPublicacion,
  crearReciclador,
  negocio,
  propietario,
  RESTRICCION,
} from './apoyo.js';

const cambiar = (tabla: string, id: string, asignaciones: string) =>
  propietario.query(`UPDATE ${tabla} SET ${asignaciones} WHERE id = $1`, [id]);

describe('Transiciones de estado', () => {
  afterAll(cerrarConexiones);

  describe('publicación', () => {
    it('no pasa de DISPONIBLE a EN_NEGOCIACION ni a FINALIZADA', async () => {
      const id = await crearPublicacion(await crearReciclador());
      expect(await codigoDeError(cambiar('publicacion', id, "estado = 'EN_NEGOCIACION'"))).toBe('RM010');
      expect(await codigoDeError(cambiar('publicacion', id, "estado = 'FINALIZADA'"))).toBe('RM010');
    });

    it('vuelve a DISPONIBLE cuando ya no quedan ofertas', async () => {
      const id = await crearPublicacion(await crearReciclador());
      await crearOferta(id, (await negocio('Acopio Titicaca')).id);
      expect(await codigoDeError(cambiar('publicacion', id, "estado = 'DISPONIBLE'"))).toBeUndefined();
    });

    it('cancelar exige un motivo', async () => {
      const id = await crearPublicacion(await crearReciclador());
      expect(await codigoDeError(cambiar('publicacion', id, "estado = 'CANCELADA'"))).toBe(RESTRICCION);
      expect(
        await codigoDeError(
          cambiar('publicacion', id, "estado = 'CANCELADA', motivo_cancelacion = 'Ya vendí el material'"),
        ),
      ).toBeUndefined();
    });

    it('una publicación cerrada no se reabre', async () => {
      const id = await crearPublicacion(await crearReciclador());
      await cambiar('publicacion', id, "estado = 'VENCIDA'");
      expect(await codigoDeError(cambiar('publicacion', id, "estado = 'DISPONIBLE'"))).toBe('RM010');
    });

    it('acepta entre 1 y 5 000 kg', async () => {
      const id = await crearPublicacion(await crearReciclador());
      expect(await codigoDeError(cambiar('publicacion', id, 'cantidad_kg = 0.5'))).toBe(RESTRICCION);
      expect(await codigoDeError(cambiar('publicacion', id, 'cantidad_kg = 5001'))).toBe(RESTRICCION);
    });
  });

  describe('oferta', () => {
    it('guarda el total calculado con los kilos de la publicación', async () => {
      const publicacion = await crearPublicacion(await crearReciclador(), { kg: 35 });
      const oferta = await crearOferta(publicacion, (await negocio('Acopio Titicaca')).id, 2.5);
      const fila = await propietario.query('SELECT total FROM oferta WHERE id = $1', [oferta]);
      expect(fila.rows[0].total).toBe('87.50');
    });

    it('una oferta resuelta no cambia de estado', async () => {
      const publicacion = await crearPublicacion(await crearReciclador());
      const oferta = await crearOferta(publicacion, (await negocio('Acopio Titicaca')).id);
      await cambiar('oferta', oferta, "estado = 'NO_SELECCIONADA'");
      expect(await codigoDeError(cambiar('oferta', oferta, "estado = 'ACEPTADA'"))).toBe('RM011');
    });
  });

  describe('operación', () => {
    it('sigue la secuencia sin saltos', async () => {
      const { operacionId } = await crearOperacion();
      expect(await codigoDeError(cambiar('operacion', operacionId, "estado = 'ENTREGADA'"))).toBe('RM012');
      expect(await codigoDeError(cambiar('operacion', operacionId, "estado = 'COMPLETADA'"))).toBe('RM012');
      await avanzarOperacion(operacionId, 'COMPLETADA');
      const fila = await propietario.query('SELECT estado FROM operacion WHERE id = $1', [operacionId]);
      expect(fila.rows[0].estado).toBe('COMPLETADA');
    });

    it('confirmar la recepción exige los kilos recibidos', async () => {
      const { operacionId } = await crearOperacion();
      await avanzarOperacion(operacionId, 'ENTREGADA');
      expect(await codigoDeError(cambiar('operacion', operacionId, "estado = 'CONFIRMADA'"))).toBe(RESTRICCION);
    });

    it('se cancela con motivo antes de la entrega, no después', async () => {
      const antes = await crearOperacion();
      expect(await codigoDeError(cambiar('operacion', antes.operacionId, "estado = 'CANCELADA'"))).toBe(RESTRICCION);
      expect(
        await codigoDeError(
          cambiar(
            'operacion',
            antes.operacionId,
            "estado = 'CANCELADA', motivo_cancelacion = 'No llegamos a un acuerdo'",
          ),
        ),
      ).toBeUndefined();

      const despues = await crearOperacion();
      await avanzarOperacion(despues.operacionId, 'ENTREGADA');
      expect(
        await codigoDeError(
          cambiar('operacion', despues.operacionId, "estado = 'CANCELADA', motivo_cancelacion = 'Tarde'"),
        ),
      ).toBe('RM012');
    });

    it('en disputa no se completa hasta que se resuelva, y solo entonces puede anularse', async () => {
      const { operacionId } = await crearOperacion();
      await avanzarOperacion(operacionId, 'CONFIRMADA');
      await cambiar('operacion', operacionId, 'en_disputa = true');
      expect(await codigoDeError(cambiar('operacion', operacionId, "estado = 'COMPLETADA'"))).toBe(RESTRICCION);
      expect(
        await codigoDeError(
          cambiar(
            'operacion',
            operacionId,
            "estado = 'CANCELADA', en_disputa = false, motivo_cancelacion = 'Anulada por el administrador'",
          ),
        ),
      ).toBeUndefined();
    });

    it('la disputa solo existe en ENTREGADA o CONFIRMADA', async () => {
      const { operacionId } = await crearOperacion();
      expect(await codigoDeError(cambiar('operacion', operacionId, 'en_disputa = true'))).toBe(RESTRICCION);
    });

    it('una operación completada ya no se modifica', async () => {
      const { operacionId } = await crearOperacion();
      await avanzarOperacion(operacionId, 'COMPLETADA');
      expect(await codigoDeError(cambiar('operacion', operacionId, 'kg_final = 500'))).toBe('RM012');
    });
  });

  describe('calificación', () => {
    it('solo tras una operación completada', async () => {
      const { operacionId, recicladorId, negocioUsuarioId } = await crearOperacion();
      await avanzarOperacion(operacionId, 'CONFIRMADA');
      const intento = propietario.query(
        'INSERT INTO calificacion (operacion_id, autor_id, destino_id, estrellas) VALUES ($1, $2, $3, 5)',
        [operacionId, recicladorId, negocioUsuarioId],
      );
      expect(await codigoDeError(intento)).toBe('RM020');
    });

    it('solo entre las partes de la operación y de 1 a 5 estrellas', async () => {
      const { operacionId, recicladorId, negocioUsuarioId } = await crearOperacion();
      await avanzarOperacion(operacionId, 'COMPLETADA');
      const ajeno = await crearReciclador();
      const calificar = (autor: string, destino: string, estrellas: number) =>
        propietario.query(
          'INSERT INTO calificacion (operacion_id, autor_id, destino_id, estrellas) VALUES ($1, $2, $3, $4)',
          [operacionId, autor, destino, estrellas],
        );
      expect(await codigoDeError(calificar(ajeno, negocioUsuarioId, 5))).toBe('RM021');
      expect(await codigoDeError(calificar(recicladorId, recicladorId, 5))).toBe('RM021');
      expect(await codigoDeError(calificar(recicladorId, negocioUsuarioId, 6))).toBe(RESTRICCION);
    });

    it('actualiza la reputación de quien la recibe', async () => {
      const { operacionId, recicladorId, negocioUsuarioId } = await crearOperacion('Triciclo Marcos');
      await avanzarOperacion(operacionId, 'COMPLETADA');
      await propietario.query(
        'INSERT INTO calificacion (operacion_id, autor_id, destino_id, estrellas) VALUES ($1, $2, $3, 4)',
        [operacionId, negocioUsuarioId, recicladorId],
      );
      const perfil = await propietario.query(
        'SELECT calif_prom, calif_cant FROM reciclador_perfil WHERE usuario_id = $1',
        [recicladorId],
      );
      expect(perfil.rows[0]).toEqual({ calif_prom: '4.00', calif_cant: 1 });
    });
  });
});
