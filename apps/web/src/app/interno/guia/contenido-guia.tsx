'use client';

import {
  type CodigoMaterial,
  formatearFecha,
  formatearFechaHora,
  formatearHace,
  formatearKg,
  formatearPrecioPorKg,
  formatearRangoPrecio,
  formatearSoles,
  formatearTelefono,
  NOMBRE_MATERIAL,
} from '@reciclomap/shared';
import { type ReactNode, useState } from 'react';
import { ProveedorAvisos, useAviso, Ventana } from '@/diseno/avisos';
import {
  BarraProgreso,
  ChipPuntos,
  EncabezadoPagina,
  EstadoVacio,
  Estrellas,
  Kpi,
  Nota,
  Panel,
  Reputacion,
} from '@/diseno/bloques';
import { Boton } from '@/diseno/boton';
import { EtiquetaDemanda, EtiquetaSemaforo, Pildora, PildoraPro } from '@/diseno/etiquetas';
import { Campo, Casilla, EstrellasEditables, Ficha, Interruptor, Segmentado } from '@/diseno/formulario';
import { Icono, type NombreIcono, NOMBRES_ICONO } from '@/diseno/icono';
import { BarraNavegacion, type UsuarioNavegacion } from '@/navegacion/barra-navegacion';
import { FranjaInvitado } from '@/navegacion/franja-invitado';
import type { RolNavegacion } from '@/navegacion/menus';
import { ESTADOS, type Muestra, PALETA } from './paleta';

const SECCIONES = [
  ['reglas', 'Reglas'],
  ['color', 'Color'],
  ['tipo', 'Tipografía'],
  ['forma', 'Forma'],
  ['botones', 'Botones'],
  ['formularios', 'Formularios'],
  ['etiquetas', 'Etiquetas'],
  ['tarjetas', 'Tarjetas'],
  ['tablas', 'Tablas'],
  ['navegacion', 'Navegación'],
  ['avisos', 'Avisos'],
  ['iconos', 'Iconos'],
  ['formatos', 'Formatos de Perú'],
] as const;

const ICONO_MATERIAL: Record<CodigoMaterial, NombreIcono> = {
  pet: 'm-pet',
  carton: 'm-box',
  papel: 'm-paper',
  plastico: 'm-plastic',
  metal: 'm-metal',
};

const USUARIOS: Record<RolNavegacion, UsuarioNavegacion | undefined> = {
  reciclador: { nombre: 'Marco Q.', iniciales: 'MQ', rolTexto: 'Reciclador', puntos: 468 },
  invitado: undefined,
  centro: { nombre: 'Acopio Titicaca', iniciales: 'AT', rolTexto: 'Centro de acopio' },
  comprador: { nombre: 'Compras Rubén', iniciales: 'CR', rolTexto: 'Comprador móvil' },
  admin: { nombre: 'Administración', iniciales: 'AD', rolTexto: 'Administrador' },
};

const ACTIVA: Record<RolNavegacion, string> = {
  reciclador: 'mapa',
  invitado: 'mapa',
  centro: 'res',
  comprador: 'ini',
  admin: 'dash',
};

// Fecha fija para que la muestra no cambie entre visitas
const FECHA_EJEMPLO = '2026-10-12T14:12:00Z';

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-14 scroll-mt-24">
      <h2 className="mb-[18px] flex items-center gap-3 font-head text-[28px] font-extrabold after:h-0.5 after:flex-1 after:bg-line after:content-['']">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Rejilla({ columnas, children }: { columnas: 2 | 3 | 4; children: ReactNode }) {
  const clase = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columnas];
  return <div className={`grid grid-cols-1 gap-5 ${clase} [&>*]:min-w-0`}>{children}</div>;
}

function Muestras({ muestras }: { muestras: Muestra[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
      {muestras.map((muestra) => (
        <div key={muestra.token} className="flex flex-col gap-[3px]">
          <div
            className="mb-2 h-[78px] rounded-fila border-2 border-ink shadow-duro-3"
            style={{ background: muestra.hex }}
          />
          <b className="font-head text-sm text-ink">{muestra.nombre}</b>
          <span className="mono text-[11.5px] text-muted">
            {muestra.hex} · {muestra.token}
          </span>
          <small className="text-xs">{muestra.uso}</small>
        </div>
      ))}
    </div>
  );
}

function DemostracionAviso() {
  const mostrar = useAviso();
  return (
    <Boton pequeno onClick={() => mostrar('Oferta enviada a Marco Q.')}>
      Mostrar aviso flotante
    </Boton>
  );
}

export function ContenidoGuia() {
  const [rol, setRol] = useState<RolNavegacion>('reciclador');
  const [periodo, setPeriodo] = useState<'7' | '30' | '90'>('7');
  const [material, setMaterial] = useState<CodigoMaterial>('pet');
  const [pagos, setPagos] = useState<string[]>(['Efectivo']);
  const [casilla, setCasilla] = useState(true);
  const [interruptor, setInterruptor] = useState(true);
  const [calificacion, setCalificacion] = useState(4);
  const [ventana, setVentana] = useState(false);

  return (
    <ProveedorAvisos>
      <BarraNavegacion
        key={rol}
        rol={rol}
        activa={ACTIVA[rol]}
        usuario={USUARIOS[rol]}
        sinLeer={rol === 'admin' ? 0 : 5}
      />
      {rol === 'invitado' && <FranjaInvitado />}

      <main className="page">
        <EncabezadoPagina
          antetitulo="Sistema de diseño · página interna"
          titulo="Guía de estilo"
          resaltado="RecicloMap"
          descripcion="Componentes reales de la web, para comparar con la guía del prototipo. No es una pantalla del producto."
        />

        <nav aria-label="Contenido" className="-mt-1.5 mb-[34px] flex flex-wrap gap-2">
          {SECCIONES.map(([id, texto]) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex h-[34px] items-center rounded-pildora border-2 border-ink bg-white px-3.5 font-head text-[13px] font-semibold text-ink no-underline transition hover:-translate-y-0.5 hover:bg-lime"
            >
              {texto}
            </a>
          ))}
        </nav>

        <Seccion id="reglas" titulo="1 · Reglas que el diseño nunca rompe">
          <Rejilla columnas={2}>
            <Panel>
              <h3>Semáforo = precio relativo</h3>
              <p className="mb-3">
                Compara un material entre quienes lo compran cerca. Siempre con <b>ícono y texto</b>, nunca solo color.
              </p>
              <div className="row wr g8">
                <EtiquetaSemaforo semaforo="MEJOR" />
                <EtiquetaSemaforo semaforo="INTERMEDIO" />
                <EtiquetaSemaforo semaforo="BAJO" />
              </div>
            </Panel>
            <Panel>
              <h3>Demanda es independiente</h3>
              <p className="mb-3">Tres barras azules, aparte del semáforo. Un precio bajo puede tener demanda alta.</p>
              <div className="row wr g16">
                <EtiquetaDemanda demanda="BAJA" />
                <EtiquetaDemanda demanda="MEDIA" />
                <EtiquetaDemanda demanda="ALTA" />
              </div>
            </Panel>
            <Panel>
              <h3>Pro solo ordena</h3>
              <p className="mb-3">Cambia el orden por defecto y suma “Destacado”. Nunca toca precios ni semáforo.</p>
              <div className="row g8">
                <PildoraPro />
                <span className="mini">Orden por defecto</span>
              </div>
            </Panel>
            <Panel>
              <h3>Privacidad y control</h3>
              <p>
                Antes de aceptar una oferta, del reciclador solo se ven la ciudad y una distancia por tramos. El
                administrador marca, pide corrección o suspende, pero <b>nunca edita precios</b>.
              </p>
            </Panel>
          </Rejilla>
        </Seccion>

        <Seccion id="color" titulo="2 · Color">
          <Muestras muestras={PALETA} />
          <h3 className="mt-8 mb-4 font-head text-lg font-extrabold">Estados</h3>
          <Muestras muestras={ESTADOS} />
        </Seccion>

        <Seccion id="tipo" titulo="3 · Tipografía">
          <Rejilla columnas={3}>
            <Panel>
              <span className="mono text-[11px] tracking-[.1em] text-deep uppercase">
                Títulos · Bricolage Grotesque 800
              </span>
              <div className="my-2 font-head text-[46px] leading-none font-extrabold tracking-[-0.045em] text-ink">
                Aa <u className="mk">Reciclo</u>
              </div>
              <p className="mini">H1 46 px · H2 22–28 px · H3 18 px. Interletrado −0.045 em.</p>
            </Panel>
            <Panel>
              <span className="mono text-[11px] tracking-[.1em] text-deep uppercase">
                Cuerpo · Inter 400 / 500 / 600
              </span>
              <div className="my-2 text-[17px] text-ink">El PET limpio se paga mejor. Llévalo seco y sin tapas.</div>
              <p className="mini">Párrafo 15 / 23 · campos 16 px · notas 13 px · ayudas 12.5 px.</p>
            </Panel>
            <Panel>
              <span className="mono text-[11px] tracking-[.1em] text-deep uppercase">
                Datos · IBM Plex Mono 500 / 600
              </span>
              <div className="mono my-2 text-[22px] font-semibold text-ink">
                {formatearSoles(2.85)} · {formatearKg(35)}
              </div>
              <p className="mini">Precios, pesos, fechas, kickers en mayúsculas y etiquetas de tabla.</p>
            </Panel>
          </Rejilla>
        </Seccion>

        <Seccion id="forma" titulo="4 · Forma, borde y sombra">
          <Rejilla columnas={4}>
            <Panel>
              <b>Panel</b>
              <p className="mini">Radio 24 · borde 2 px tinta · sombra 5 px 5 px 0</p>
            </Panel>
            <div className="kpi sky">
              <b>KPI</b>
              <span className="mini">Radio 20 · sombra 4 px · fondo pastel</span>
            </div>
            <Panel variante="plano">
              <b>Panel plano</b>
              <p className="mini">Sin sombra, para listas dentro de paneles</p>
            </Panel>
            <Panel variante="oscuro">
              <b>Panel oscuro</b>
              <p className="mini" style={{ color: 'var(--color-nota-oscura)' }}>
                Sombra verde; para destacar un bloque
              </p>
            </Panel>
          </Rejilla>
          <p className="mini mono mt-4">
            Radios: 8 etiqueta · 12 botón chico · 14 botón/campo · 16 fila · 20 KPI · 24 panel · 26 modal · 99 píldora
          </p>
        </Seccion>

        <Seccion id="botones" titulo="5 · Botones">
          <Panel>
            <div className="row wr g16">
              <Boton variante="principal">Principal</Boton>
              <Boton>Secundario</Boton>
              <Boton variante="fantasma">Fantasma</Boton>
              <Boton variante="peligro">Peligro</Boton>
              <Boton variante="oscuro">Oscuro</Boton>
              <Boton disabled>Deshabilitado</Boton>
              <Boton variante="principal" pequeno>
                Pequeño
              </Boton>
              <Boton pequeno>Pequeño 2</Boton>
            </div>
            <p className="mini mt-3">
              Altura 46 (38 pequeño). Al pasar el cursor sube 2 px y crece la sombra; al presionar se hunde 1 px y la
              sombra baja a 1 px. Un solo botón principal por bloque. Peligro solo para suspender o rechazar.
            </p>
          </Panel>
        </Seccion>

        <Seccion id="formularios" titulo="6 · Formularios">
          <Rejilla columnas={2}>
            <Panel className="flex flex-col gap-5">
              <Campo etiqueta="Campo normal" opcional placeholder="Escribe aquí" ayuda="Texto de ayuda en gris" />
              <Campo etiqueta="Campo con error" defaultValue="abc" error="Mensaje claro, en la línea de abajo" />
              <Campo etiqueta="Con unidad" defaultValue="2.60" prefijo="S/" sufijo="por kg" inputMode="decimal" />
              <div className="field">
                <label htmlFor="zona-ejemplo">Selector</label>
                <div className="inp">
                  <select id="zona-ejemplo" defaultValue="Barrio Santa Rosa">
                    <option>Barrio Santa Rosa</option>
                    <option>Centro de Juliaca</option>
                  </select>
                </div>
              </div>
            </Panel>
            <Panel className="flex flex-col gap-5">
              <div>
                <span className="lbl">Selector segmentado</span>
                <div className="mt-2">
                  <Segmentado
                    etiqueta="Periodo"
                    valor={periodo}
                    alCambiar={setPeriodo}
                    opciones={[
                      { valor: '7', texto: '7 días' },
                      { valor: '30', texto: '30 días' },
                      { valor: '90', texto: '90 días' },
                    ]}
                  />
                </div>
              </div>
              <div>
                <span className="lbl">Fichas de material</span>
                <div className="mt mt-2" role="group" aria-label="Material">
                  {(Object.keys(NOMBRE_MATERIAL) as CodigoMaterial[]).map((codigo) => (
                    <button
                      key={codigo}
                      type="button"
                      aria-pressed={codigo === material}
                      onClick={() => setMaterial(codigo)}
                    >
                      <Icono nombre={ICONO_MATERIAL[codigo]} />
                      {NOMBRE_MATERIAL[codigo]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="lbl">Chips</span>
                <div className="row wr g8 mt-2">
                  {['Efectivo', 'Yape', 'Plin'].map((pago) => (
                    <Ficha
                      key={pago}
                      presionada={pagos.includes(pago)}
                      alPresionar={() =>
                        setPagos((actual) =>
                          actual.includes(pago) ? actual.filter((valor) => valor !== pago) : [...actual, pago],
                        )
                      }
                    >
                      {pago}
                    </Ficha>
                  ))}
                </div>
              </div>
              <div className="row wr g16">
                <Casilla etiqueta="Casilla" marcado={casilla} alCambiar={setCasilla} />
                <Interruptor etiqueta="Interruptor" marcado={interruptor} alCambiar={setInterruptor} />
              </div>
              <div className="field">
                <span className="lbl">Barra de progreso</span>
                <BarraProgreso valor={468} maximo={500} etiqueta="Puntos hacia el próximo giro" />
                <span className="hint">468 de 500 puntos · te faltan 32</span>
              </div>
              <div className="field">
                <span className="lbl">Estrellas</span>
                <EstrellasEditables valor={calificacion} alCambiar={setCalificacion} />
              </div>
            </Panel>
          </Rejilla>
          <p className="mini mt-4">
            Campo: 50 px, borde 2 px al 34 % de tinta; al enfocar, borde sólido y sombra lima. Error: borde rojo y
            mensaje bajo el campo. Teléfono con formato {formatearTelefono('951234567')}.
          </p>
        </Seccion>

        <Seccion id="etiquetas" titulo="7 · Etiquetas, semáforo y demanda">
          <Rejilla columnas={2}>
            <Panel>
              <h3>Semáforo (precio relativo)</h3>
              <div className="list">
                {(
                  [
                    ['MEJOR', 'El precio más alto del grupo (tercio superior)'],
                    ['INTERMEDIO', 'Tercio del medio'],
                    ['BAJO', 'Tercio inferior'],
                    ['SIN_COMPARACION', 'Una sola opción o precios iguales: no se compara'],
                  ] as const
                ).map(([semaforo, explicacion]) => (
                  <div className="row g16" key={semaforo}>
                    <EtiquetaSemaforo semaforo={semaforo} />
                    <span className="mini">{explicacion}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel>
              <h3>Demanda (independiente)</h3>
              <div className="list">
                {(
                  [
                    ['BAJA', 'Pocos compran ahora'],
                    ['MEDIA', 'Se compra con normalidad'],
                    ['ALTA', 'Se busca con urgencia'],
                  ] as const
                ).map(([demanda, explicacion]) => (
                  <div className="row g16" key={demanda}>
                    <EtiquetaDemanda demanda={demanda} />
                    <span className="mini">{explicacion}</span>
                  </div>
                ))}
              </div>
              <hr className="divl" />
              <h3>Estados</h3>
              <div className="row wr g8">
                <Pildora tono="abierto" punto>
                  Abierto ahora
                </Pildora>
                <Pildora tono="atencion" punto>
                  En ruta
                </Pildora>
                <Pildora tono="cerrado" punto>
                  Cerrado
                </Pildora>
                <Pildora tono="info" punto>
                  Info pedida
                </Pildora>
                <Pildora tono="gris">Próximamente</Pildora>
                <PildoraPro />
              </div>
            </Panel>
          </Rejilla>
        </Seccion>

        <Seccion id="tarjetas" titulo="8 · Tarjetas y bloques">
          <Rejilla columnas={4}>
            <Kpi
              etiqueta="Kg reciclados"
              icono="i-recycle"
              valor={formatearKg(468)}
              detalle="solo completadas"
              fondo="sky"
            />
            <Kpi etiqueta="Puntos" icono="i-star" valor="468" detalle="1 punto por kg" fondo="sand" />
            <Kpi etiqueta="Ofertas" icono="i-gift" valor="3" detalle="sin responder" fondo="mint" />
            <Kpi
              etiqueta="Ingresos"
              icono="i-cash"
              valor={formatearSoles(1234.5)}
              detalle="precios acordados"
              fondo="lilac"
            />
          </Rejilla>
          <div className="mt-6">
            <Rejilla columnas={2}>
              <div className="stack">
                <Nota>Nota informativa: borde punteado verde sobre fondo muy claro.</Nota>
                <Nota tono="atencion">Nota de atención: mismo formato en tono arena.</Nota>
                <div className="row wr g16">
                  <ChipPuntos puntos={1240} />
                  <Estrellas valor={4.6} cantidad={23} />
                  <Reputacion promedio={4.7} cantidad={23} />
                  <Reputacion promedio={0} cantidad={2} />
                </div>
              </div>
              <div className="row g16 rounded-fila border-2 border-ink bg-white p-3.5 shadow-duro-3">
                <span className="mi" style={{ background: 'var(--sky)' }}>
                  <Icono nombre="m-pet" />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="font-head text-ink">PET · {formatearKg(35)}</b>
                  <div className="mini">Juliaca · 1–2 km · {formatearHace('2026-10-12T13:57:00Z', FECHA_EJEMPLO)}</div>
                </div>
                <span className="mono font-semibold text-ink">{formatearSoles(2.6)}</span>
              </div>
            </Rejilla>
          </div>
        </Seccion>

        <Seccion id="tablas" titulo="9 · Tablas">
          <Panel>
            <table className="tbl" tabIndex={0}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Material</th>
                  <th>Peso</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Puntos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">{formatearFecha('2026-10-09T15:00:00Z')}</td>
                  <td>Cartón</td>
                  <td className="mono">{formatearKg(60)}</td>
                  <td className="mono">{formatearSoles(42)}</td>
                  <td>
                    <Pildora tono="abierto" punto>
                      Completada
                    </Pildora>
                  </td>
                  <td className="mono">+60</td>
                </tr>
                <tr>
                  <td className="mono">{formatearFecha('2026-09-18T15:00:00Z')}</td>
                  <td>Papel</td>
                  <td className="mono">{formatearKg(20)}</td>
                  <td className="mono">—</td>
                  <td>
                    <Pildora tono="cerrado" punto>
                      Cancelada
                    </Pildora>
                  </td>
                  <td className="mono">0</td>
                </tr>
              </tbody>
            </table>
            <p className="mini mt-3">
              Encabezado en mono mayúscula con línea de tinta; filas con línea tenue. Cifras siempre en mono.
            </p>
          </Panel>
        </Seccion>

        <Seccion id="navegacion" titulo="10 · Navegación">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="lbl">Ver la barra de</span>
            <Segmentado
              etiqueta="Rol"
              valor={rol}
              alCambiar={setRol}
              opciones={[
                { valor: 'reciclador', texto: 'Reciclador' },
                { valor: 'invitado', texto: 'Invitado' },
                { valor: 'centro', texto: 'Centro' },
                { valor: 'comprador', texto: 'Comprador móvil' },
                { valor: 'admin', texto: 'Administración' },
              ]}
            />
          </div>
          <Nota>
            La barra de arriba es la del rol elegido, a ancho completo como en la app. Pestañas por rol, menú “Más” y
            accesos a la derecha; por debajo de 1024 px las pestañas pasan al menú de la hamburguesa. La campana también
            aparece para el centro.
          </Nota>
        </Seccion>

        <Seccion id="avisos" titulo="11 · Avisos, ventanas y vacíos">
          <Rejilla columnas={3}>
            <Panel>
              <h3>Aviso flotante</h3>
              <div className="toast estatico mb-3">
                <Icono nombre="i-check" />
                Oferta enviada a Marco Q.
              </div>
              <DemostracionAviso />
              <p className="mini mt-3">Confirma cada acción durante 3.4 s. Dice qué pasó, no “éxito”.</p>
            </Panel>
            <Panel>
              <h3>Ventana</h3>
              <Boton pequeno onClick={() => setVentana(true)}>
                Abrir ejemplo
              </Boton>
              <p className="mini mt-3">Fondo de tinta al 50 % con desenfoque, radio 26. La tecla Esc la cierra.</p>
            </Panel>
            <EstadoVacio titulo="Estado vacío" descripcion="Borde punteado, ícono, una frase y una acción." />
          </Rejilla>
          <Ventana
            abierta={ventana}
            alCerrar={() => setVentana(false)}
            antetitulo="EJEMPLO DE VENTANA"
            titulo="¿Aceptar esta oferta?"
          >
            <p>
              Al aceptar, el comprador verá tu WhatsApp y el punto de encuentro que indiques. Las demás ofertas quedarán
              como “No seleccionada”.
            </p>
            <div className="row wr g8">
              <Boton variante="principal" onClick={() => setVentana(false)}>
                Sí, aceptar
              </Boton>
              <Boton onClick={() => setVentana(false)}>Volver</Boton>
            </div>
          </Ventana>
        </Seccion>

        <Seccion id="iconos" titulo="12 · Iconografía">
          <p className="mini mb-3">
            Trazo de 1.9 px, esquinas redondeadas, en una sola tinta. Prefijos: <b>i-</b> interfaz · <b>m-</b>{' '}
            materiales · <b>v-</b> vehículos.
          </p>
          <Panel>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5">
              {NOMBRES_ICONO.map((nombre) => (
                <div
                  key={nombre}
                  className="flex flex-col items-center gap-1.5 rounded-boton-sm border-[1.5px] border-line bg-white px-1.5 py-3 text-ink"
                >
                  <Icono nombre={nombre} />
                  <span className="mono text-[10.5px] text-muted">{nombre}</span>
                </div>
              ))}
            </div>
          </Panel>
        </Seccion>

        <Seccion id="formatos" titulo="13 · Formatos de Perú">
          <Panel>
            <table className="tbl" tabIndex={0}>
              <thead>
                <tr>
                  <th>Dato</th>
                  <th>Ejemplo</th>
                  <th>Regla</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Monto', formatearSoles(1234.5), '“S/ ”, coma de miles y dos decimales'],
                  ['Precio por kg', formatearPrecioPorKg(2.7), 'Siempre por kilo'],
                  ['Rango de precio', formatearRangoPrecio(2.5, 2.8), 'Mínimo y máximo, sin repetir “S/”'],
                  ['Peso', formatearKg(1240.5), 'Sin decimales innecesarios'],
                  ['Fecha', formatearFecha(FECHA_EJEMPLO), 'Día del calendario de Lima'],
                  ['Fecha y hora', formatearFechaHora(FECHA_EJEMPLO), 'Hora de Lima, 24 horas'],
                  ['Hace cuánto', formatearHace('2026-10-12T13:00:00Z', FECHA_EJEMPLO), 'Tiempo transcurrido'],
                  ['Teléfono', formatearTelefono('951234567'), 'Celular de 9 dígitos en grupos de tres'],
                ].map(([dato, ejemplo, regla]) => (
                  <tr key={dato}>
                    <td>{dato}</td>
                    <td className="mono">{ejemplo}</td>
                    <td className="mini">{regla}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Seccion>
      </main>
    </ProveedorAvisos>
  );
}
