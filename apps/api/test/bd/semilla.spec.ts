import { spawnSync } from 'node:child_process';
import { cerrarConexiones, propietario } from './apoyo.js';

async function numero(sql: string): Promise<number> {
  const resultado = await propietario.query(sql);
  return Number(Object.values(resultado.rows[0])[0]);
}

describe('Datos semilla', () => {
  afterAll(cerrarConexiones);

  it('solo Juliaca está activa', async () => {
    const resultado = await propietario.query('SELECT nombre, estado FROM ciudad ORDER BY id');
    expect(resultado.rows).toEqual([
      { nombre: 'Juliaca', estado: 'ACTIVA' },
      { nombre: 'Puno', estado: 'PROXIMAMENTE' },
      { nombre: 'Arequipa', estado: 'PROXIMAMENTE' },
      { nombre: 'Cusco', estado: 'PROXIMAMENTE' },
      { nombre: 'Tacna', estado: 'PROXIMAMENTE' },
    ]);
  });

  it('hay 5 materiales, con "Plástico duro"', async () => {
    const resultado = await propietario.query('SELECT nombre FROM material ORDER BY orden');
    expect(resultado.rows.map((fila) => fila.nombre)).toEqual(['PET', 'Cartón', 'Papel', 'Plástico duro', 'Metales']);
  });

  it('hay 5 centros y 5 compradores móviles verificados en Juliaca', async () => {
    const resultado = await propietario.query(
      `SELECT c.tipo, count(*)::int AS total FROM comprador c
         JOIN usuario u ON u.id = c.usuario_id JOIN ciudad ci ON ci.id = u.ciudad_id
        WHERE c.estado_verificacion = 'APROBADO' AND ci.nombre = 'Juliaca' AND u.nombre NOT LIKE '%prueba%'
        GROUP BY c.tipo ORDER BY c.tipo`,
    );
    expect(resultado.rows).toEqual([
      { tipo: 'CENTRO', total: 5 },
      { tipo: 'MOVIL', total: 5 },
    ]);
  });

  it('todo negocio tiene al menos un precio y demanda', async () => {
    expect(
      await numero(
        'SELECT count(*) FROM comprador c WHERE NOT EXISTS (SELECT 1 FROM precio_material p WHERE p.comprador_id = c.id)',
      ),
    ).toBe(0);
  });

  it('los niveles son los 6 del prototipo', async () => {
    const resultado = await propietario.query('SELECT nombre, kg_min::int AS kg FROM nivel ORDER BY id');
    expect(resultado.rows).toEqual([
      { nombre: 'Semilla', kg: 0 },
      { nombre: 'Brote', kg: 50 },
      { nombre: 'Recolector', kg: 200 },
      { nombre: 'Guardián', kg: 500 },
      { nombre: 'Maestro', kg: 1000 },
      { nombre: 'Leyenda', kg: 2500 },
    ]);
  });

  it('hay 12 insignias, 4 de ellas destacadas en el perfil', async () => {
    expect(await numero('SELECT count(*) FROM insignia')).toBe(12);
    const destacadas = await propietario.query('SELECT nombre FROM insignia WHERE destacada ORDER BY orden');
    expect(destacadas.rows.map((fila) => fila.nombre)).toEqual([
      'Racha de 4 semanas',
      'Reciclador Confiable',
      'Cazador de precios',
      'Embajador',
    ]);
  });

  it('las plantillas de desafío tienen una sola Meta del mes, de 100 kg', async () => {
    expect(await numero('SELECT count(*) FROM plantilla_desafio')).toBe(6);
    const meta = await propietario.query(
      'SELECT nombre, meta::int AS meta, puntos FROM plantilla_desafio WHERE es_meta_mes',
    );
    expect(meta.rows).toEqual([{ nombre: 'Recicla 100 kg este mes', meta: 100, puntos: 30 }]);
    expect(await numero('SELECT count(*) FROM desafio WHERE es_meta_mes')).toBe(1);
  });

  it('las probabilidades de los premios activos suman 100 %', async () => {
    expect(await numero('SELECT sum(probabilidad) FROM premio WHERE activo')).toBe(100);
    expect(
      await numero(
        "SELECT count(*) FROM premio WHERE tipo = 'OBJETO' AND (punto_entrega IS NULL OR vigencia_canje_dias IS NULL OR stock IS NULL)",
      ),
    ).toBe(0);
  });

  it('los parámetros iniciales son los aprobados', async () => {
    const resultado = await propietario.query('SELECT clave, valor FROM parametro');
    const parametros = Object.fromEntries(resultado.rows.map((fila) => [fila.clave, fila.valor]));
    expect(parametros).toMatchObject({
      vigencia_publicacion_dias: '7',
      plazo_aviso_entrega_horas: '72',
      plazo_conformidad_horas: '72',
      tope_diario_registro_directo: '150',
      puntos_por_giro: '500',
      dias_precio_al_dia: '7',
      precio_kg_minimo: '0.10',
      precio_kg_maximo: '50.00',
      meta_mes_kg: '100',
    });
  });

  it('Marco Quispe es el reciclador de ejemplo, en el nivel Recolector', async () => {
    const resultado = await propietario.query(
      `SELECT u.nombre, p.kg_total::int AS kg, n.nombre AS nivel, p.puntos_reciclaje
         FROM usuario u JOIN reciclador_perfil p ON p.usuario_id = u.id JOIN nivel n ON n.id = p.nivel_id
        WHERE u.nombre = 'Marco Quispe'`,
    );
    expect(resultado.rows).toEqual([{ nombre: 'Marco Quispe', kg: 468, nivel: 'Recolector', puntos_reciclaje: 468 }]);
  });

  it('ningún dato de contacto puede pertenecer a una persona real', async () => {
    // Una cuenta anonimizada ya no guarda ningún dato de contacto
    const semilla = "nombre NOT LIKE '%prueba%' AND estado <> 'ELIMINADO'";
    expect(await numero(`SELECT count(*) FROM usuario WHERE ${semilla} AND telefono NOT LIKE '9000000%'`)).toBe(0);
    expect(await numero(`SELECT count(*) FROM usuario WHERE ${semilla} AND correo NOT LIKE '%@reciclomap.test'`)).toBe(
      0,
    );
  });

  it('el mapa muestra a los 10 negocios verificados', async () => {
    expect(await numero('SELECT count(DISTINCT comprador_id) FROM v_mapa')).toBe(10);
  });

  it('el comando de semilla se niega a correr en producción y no toca la base', async () => {
    const antes = await numero('SELECT count(*) FROM usuario');
    const resultado = spawnSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      shell: true,
    });
    expect(resultado.status).not.toBe(0);
    expect(resultado.stderr).toContain('solo se cargan en desarrollo o pruebas');
    expect(await numero('SELECT count(*) FROM usuario')).toBe(antes);
  }, 60_000);
});
