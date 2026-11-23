'use client';

import '@/acceso/acceso.css';
import {
  CODIGOS_MATERIAL,
  type CodigoMaterial,
  esquemaNuevaPublicacion,
  LARGO_NOTA_PUBLICACION,
  NOMBRE_MATERIAL,
} from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { SelectorFotos } from '@/app/registro/_negocio/campos-negocio';
import { useAviso, Ventana } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { clases } from '@/diseno/clases';
import { Icono } from '@/diseno/icono';
import { FILTROS_INICIALES } from '@/mapa/filtros';
import { PedirUbicacion, TextoUbicacion } from '@/mapa/pedir-ubicacion';
import { useResultados } from '@/mapa/resultados';
import { cabecerasDeUbicacion, useUbicacion } from '@/mapa/ubicacion';
import { InvitacionRegistro, MOTIVO_INVITADO } from '@/navegacion/invitacion-registro';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { borrarPendiente, guardarPendiente, sinConexion, usePendiente } from '@/publicaciones/pendiente';
import { FONDO_MATERIAL, kilos, soles } from '@/publicaciones/piezas';
import type { Publicacion } from '@/publicaciones/tipos';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

type Errores = Partial<Record<'material' | 'kg' | 'precioEsperado' | 'nota' | 'fotos', string>>;
type Resultado = { tipo: 'publicada'; texto: string } | { tipo: 'guardada'; texto: string };

const numero = (texto: string) => Number(texto.replace(',', '.'));

function useAlcance(activo: boolean): number | null {
  const [negocios, setNegocios] = useState<number | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    pedir<{ negocios: number }>('/publicaciones/alcance')
      .then((respuesta) => vigente && setNegocios(respuesta.negocios))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [activo]);
  return negocios;
}

// Estimado con los compradores a 5 km que pagan ese material, desde la ubicación de la persona
function Estimado({ material, kg, precio }: { material: CodigoMaterial | null; kg: number; precio: number }) {
  const { ubicacion } = useUbicacion();
  const filtros = useMemo(() => ({ ...FILTROS_INICIALES, material: material ?? 'pet', radio: 5 as const }), [material]);
  const { datos } = useResultados(filtros, material ? ubicacion : null);
  const opciones = material && datos?.material.codigo === material ? datos.opciones : [];
  if (!material || !(kg > 0) || opciones.length === 0) {
    return (
      <>
        <h3>Lo que podrías recibir</h3>
        <p className="mini">
          {material && kg > 0
            ? 'No hay precios publicados a 5 km para este material.'
            : 'Elige material y kilos para estimarlo.'}
        </p>
      </>
    );
  }
  const medio =
    opciones.reduce((suma, o) => suma + (Number(o.precio.min) + Number(o.precio.max)) / 2, 0) / opciones.length;
  const mejor = Math.max(...opciones.map((o) => Number(o.precio.max)));
  return (
    <>
      <h3>Lo que podrías recibir</h3>
      <div style={{ font: '800 34px/1 var(--head)', letterSpacing: '-.04em', color: 'var(--ink)' }}>
        {soles(medio * kg)}
        <span style={{ fontSize: 18, color: 'var(--muted)' }}> aprox.</span>
      </div>
      <p className="mini" style={{ marginTop: 6 }}>
        Promedio de {opciones.length} {opciones.length === 1 ? 'comprador' : 'compradores'} a 5 km. El mejor rango llega
        hasta {soles(mejor * kg)}.
      </p>
      <hr className="divl" />
      <div className="row g8 wr">
        <span className="pill" style={{ background: 'var(--lime)', color: 'var(--ink)' }}>
          <Icono nombre="i-star" tamano="sm" />+{Math.floor(kg)} puntos al completar
        </span>
      </div>
      {precio > mejor && (
        <div className="note warn" style={{ marginTop: 12 }}>
          <Icono nombre="i-alert" />
          <span>Pides más que el mejor precio publicado cerca ({soles(mejor)}). Puede que recibas menos ofertas.</span>
        </div>
      )}
    </>
  );
}

function Formulario() {
  const aviso = useAviso();
  const router = useRouter();
  const consulta = useSearchParams();
  const { usuario } = useSesion();
  const { ubicacion } = useUbicacion();
  const inicial = consulta.get('m');
  const [material, setMaterial] = useState<CodigoMaterial | null>(
    CODIGOS_MATERIAL.includes(inicial as CodigoMaterial) ? (inicial as CodigoMaterial) : null,
  );
  const [kg, setKg] = useState(consulta.get('kg') ?? '');
  const [precio, setPrecio] = useState('');
  const [nota, setNota] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [invitacion, setInvitacion] = useState<string | null>(null);
  const pendiente = usePendiente();
  const loVeran = useAlcance(Boolean(usuario));

  const reiniciar = () => {
    setMaterial(null);
    setKg('');
    setPrecio('');
    setNota('');
    setFotos([]);
    setErrores({});
    setResultado(null);
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!usuario) {
      setInvitacion(MOTIVO_INVITADO.pub ?? 'Para publicar tu material necesitas una cuenta.');
      return;
    }
    const lectura = esquemaNuevaPublicacion.safeParse({ material, kg, precioEsperado: precio, nota, fotos });
    if (!lectura.success) {
      const encontrados: Errores = {};
      for (const problema of lectura.error.issues) {
        const campo = String(problema.path[0]) as keyof Errores;
        encontrados[campo] ??= problema.message;
      }
      setErrores(encontrados);
      document.querySelector('.field.err')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setErrores({});
    const datos = lectura.data;
    const titulo = `${NOMBRE_MATERIAL[datos.material]} · ${kilos(datos.kg)} kg`;
    const guardarSinSenal = () => {
      const guardado = guardarPendiente({
        material: datos.material,
        kg: datos.kg,
        precioEsperado: datos.precioEsperado ?? null,
        nota: datos.nota ?? null,
      });
      if (!guardado) {
        aviso('Sin señal y sin espacio en este celular: inténtalo cuando vuelva la conexión.');
        return;
      }
      setResultado({
        tipo: 'guardada',
        texto: `${titulo}. No hay señal: guardamos un borrador en este celular. No se publica solo: cuando vuelva la conexión, abre Publicar, revísalo y toca Publicar. Las fotos se agregan después, desde Mis publicaciones.`,
      });
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      guardarSinSenal();
      return;
    }
    setEnviando(true);
    try {
      const respuesta = await pedir<{ publicacion: Publicacion; loVeran: number }>('/publicaciones', {
        cuerpo: datos,
        cabeceras: cabecerasDeUbicacion(ubicacion),
      });
      borrarPendiente();
      setResultado({
        tipo: 'publicada',
        texto: `${titulo}. Lo verán ${respuesta.loVeran} compradores y centros de tu ciudad durante 7 días. Te avisaremos cuando llegue una oferta.`,
      });
    } catch (causa) {
      if (sinConexion(causa)) {
        guardarSinSenal();
      } else if (causa instanceof ErrorApi) {
        setErrores({
          material: causa.campo('material'),
          kg: causa.campo('kg'),
          precioEsperado: causa.campo('precioEsperado'),
          fotos: causa.campo('fotos'),
        });
        aviso(causa.message);
      }
    } finally {
      setEnviando(false);
    }
  };

  const kgNumero = numero(kg);
  const precioNumero = precio.trim() ? numero(precio) : 0;

  return (
    <>
      <EncabezadoPagina
        antetitulo="Publicar material"
        titulo="Publica lo que tienes y"
        resaltado="recibe ofertas"
        descripcion="Los compradores y centros verificados de tu ciudad lo ven y te ofertan. Dura 7 días."
      />
      {pendiente && (
        <div className="note warn" role="status" style={{ marginBottom: 20 }} data-pendiente>
          <Icono nombre="i-clock" />
          <span>
            Tienes un borrador guardado sin señal:{' '}
            <b>
              {NOMBRE_MATERIAL[pendiente.material]} · {kilos(pendiente.kg)} kg
            </b>
            . No se publica solo: revísalo y toca Publicar cuando vuelva la conexión.{' '}
            <button
              type="button"
              className="btn sm"
              data-usar-borrador
              onClick={() => {
                setMaterial(pendiente.material);
                setKg(String(pendiente.kg));
                setPrecio(pendiente.precioEsperado === null ? '' : String(pendiente.precioEsperado));
                setNota(pendiente.nota ?? '');
              }}
            >
              Usar borrador
            </button>{' '}
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                borrarPendiente();
              }}
            >
              Descartar
            </button>
          </span>
        </div>
      )}
      <form className="cols" onSubmit={(evento) => void enviar(evento)} noValidate>
        <section className="panel stack" style={{ gap: 22 }}>
          <div className={clases('field', errores.material && 'err')}>
            <div className="lbl" id="titulo-material">
              1. ¿Qué material es?
            </div>
            <div className="mt" role="group" aria-labelledby="titulo-material">
              {CODIGOS_MATERIAL.map((codigo) => (
                <button
                  key={codigo}
                  type="button"
                  aria-pressed={material === codigo}
                  onClick={() => {
                    setMaterial(codigo);
                    setErrores((actuales) => ({ ...actuales, material: undefined }));
                  }}
                >
                  <span className="mi" style={{ background: FONDO_MATERIAL[codigo] }}>
                    <Icono nombre={ICONO_MATERIAL[codigo]} />
                  </span>
                  {NOMBRE_MATERIAL[codigo]}
                </button>
              ))}
            </div>
            {errores.material && (
              <span className="msg" role="alert">
                {errores.material}
              </span>
            )}
          </div>
          <div className="grid2" style={{ gap: 18 }}>
            <div className={clases('field', errores.kg && 'err')}>
              <label htmlFor="kg">2. Kilos aproximados</label>
              <div className="inp">
                <input
                  id="kg"
                  inputMode="decimal"
                  placeholder="Ej. 35"
                  value={kg}
                  onChange={(e) => setKg(e.target.value)}
                />
                <span className="u">kg</span>
              </div>
              {errores.kg && (
                <span className="msg" role="alert">
                  {errores.kg}
                </span>
              )}
            </div>
            <div className={clases('field', errores.precioEsperado && 'err')}>
              <label htmlFor="precio">
                Precio que esperas <span className="opt">(opcional)</span>
              </label>
              <div className="inp">
                <span className="u">S/</span>
                <input
                  id="precio"
                  inputMode="decimal"
                  placeholder="Ej. 2.60"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                />
                <span className="u">por kg</span>
              </div>
              {errores.precioEsperado && (
                <span className="msg" role="alert">
                  {errores.precioEsperado}
                </span>
              )}
            </div>
          </div>
          <div className="field">
            <span className="lbl">
              3. Fotos <span className="opt">(opcional, ayudan a recibir mejores ofertas)</span>
            </span>
            {usuario ? (
              <SelectorFotos
                fotos={fotos}
                alCambiar={setFotos}
                proposito="PUBLICACION"
                etiquetas={['Foto 1', 'Foto 2', 'Foto 3']}
              />
            ) : (
              <span className="hint">Con una cuenta puedes agregar hasta 3 fotos.</span>
            )}
            <span className="hint">Se comprimen para gastar pocos datos y se les quita la ubicación.</span>
          </div>
          <div className="field">
            <label htmlFor="nota">
              Nota para los compradores <span className="opt">(opcional)</span>
            </label>
            <div className="inp ta">
              <textarea
                id="nota"
                maxLength={LARGO_NOTA_PUBLICACION}
                placeholder="Ej. Botellas limpias y aplastadas, en costales."
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>
            <span className="hint">
              {nota.length} de {LARGO_NOTA_PUBLICACION}
            </span>
          </div>
          {usuario && (
            <div className="field">
              <span className="lbl">4. ¿Desde dónde publicas?</span>
              {ubicacion ? <TextoUbicacion /> : <PedirUbicacion compacto />}
            </div>
          )}
          <div className="note">
            <Icono nombre="i-lock" />
            <span>
              <b>Tu ubicación exacta no se publica.</b> Solo se ve tu ciudad y una distancia aproximada. Tu contacto se
              comparte cuando aceptes una oferta.
            </span>
          </div>
          <button
            className="btn p"
            type="submit"
            data-permite-sin-conexion
            disabled={enviando}
            style={{ alignSelf: 'flex-start', height: 54, padding: '0 30px' }}
          >
            {enviando ? 'Publicando…' : 'Publicar material'}
          </button>
        </section>
        <aside className="stack" style={{ position: 'sticky', top: 92 }}>
          <div className="panel">
            <h3>Así lo verán los compradores</h3>
            {material ? (
              <div
                style={{
                  border: '2px solid var(--ink)',
                  borderRadius: 18,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  background: '#fff',
                  boxShadow: '3px 3px 0 var(--ink)',
                }}
              >
                <div className="row g16">
                  <span className="mi" style={{ width: 48, height: 48, background: FONDO_MATERIAL[material] }}>
                    <Icono nombre={ICONO_MATERIAL[material]} tamano="lg" />
                  </span>
                  <div>
                    <b style={{ font: '800 20px var(--head)', color: 'var(--ink)' }}>
                      {NOMBRE_MATERIAL[material]} · {kgNumero > 0 ? `${kilos(kgNumero)} kg` : '— kg'}
                    </b>
                    <div className="mini row g8 wr" style={{ marginTop: 2 }}>
                      <Icono nombre="i-pin" tamano="sm" /> Juliaca{' '}
                      <span className="pill grey">Distancia aproximada</span>
                    </div>
                  </div>
                </div>
                <div className="row sp wr">
                  <span className="mono" style={{ font: '600 16px var(--mono)', color: 'var(--ink)' }}>
                    {precioNumero > 0 ? `${soles(precioNumero)} por kg` : 'Precio a ofertar'}
                  </span>
                  <span className="pill blue">
                    <Icono nombre="i-clock" tamano="sm" /> 7 días
                  </span>
                </div>
              </div>
            ) : (
              <div className="empty" style={{ padding: 22 }}>
                <p className="mini">Elige un material para ver la vista previa.</p>
              </div>
            )}
            {loVeran !== null && (
              <p className="mini" style={{ marginTop: 10 }} data-lo-veran>
                Lo verán {loVeran} compradores y centros verificados de tu ciudad.
              </p>
            )}
          </div>
          <div className="panel">
            <Estimado material={material} kg={kgNumero} precio={precioNumero} />
          </div>
        </aside>
      </form>
      <Ventana
        abierta={resultado !== null}
        alCerrar={() => setResultado(null)}
        antetitulo={resultado?.tipo === 'guardada' ? 'SIN SEÑAL' : 'LISTO'}
        titulo={resultado?.tipo === 'guardada' ? 'La guardamos en tu celular' : 'Tu material ya está publicado'}
      >
        <p>{resultado?.texto}</p>
        <Link className="btn p" href={RUTAS.misPublicaciones}>
          Ver mis publicaciones
        </Link>
        <button type="button" className="btn ghost" onClick={reiniciar}>
          Publicar otro material
        </button>
      </Ventana>
      <InvitacionRegistro
        motivo={invitacion}
        alCerrar={() => {
          setInvitacion(null);
          router.replace(RUTAS.publicar);
        }}
      />
    </>
  );
}

export function PublicarMaterial() {
  return (
    <Protegida roles={['RECICLADOR']} invitado>
      <MarcoApp activa="pub">
        <Formulario />
      </MarcoApp>
    </Protegida>
  );
}
