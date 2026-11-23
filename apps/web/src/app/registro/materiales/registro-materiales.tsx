'use client';

import type { CodigoMaterial } from '@reciclomap/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AvisoAcceso, BarraAcceso, Girando, MarcoAcceso, Progreso } from '@/acceso/marco-acceso';
import { DESCRIPCION_MATERIAL, ICONO_MATERIAL, type Material } from '@/acceso/materiales';
import { clases } from '@/diseno/clases';
import { Icono } from '@/diseno/icono';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';
import { PantallaCargando, Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

const LADO = {
  antetitulo: 'Paso 2 · Tus materiales',
  titulo: 'Cuéntanos',
  resaltado: 'qué recolectas.',
  texto: 'Te mostraremos primero los mejores precios para cada uno de tus materiales.',
  enColumna: false,
  chips: [
    { icono: 'm-pet' as const, texto: 'PET' },
    { icono: 'm-box' as const, texto: 'Cartón' },
    { icono: 'm-paper' as const, texto: 'Papel' },
    { icono: 'm-plastic' as const, texto: 'Plástico duro' },
    { icono: 'm-metal' as const, texto: 'Metales' },
  ],
};

function Contenido() {
  const router = useRouter();
  const { actualizar } = useSesion();
  const [materiales, setMateriales] = useState<Material[] | null>(null);
  const [elegidos, setElegidos] = useState<CodigoMaterial[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [insignia, setInsignia] = useState(false);

  useEffect(() => {
    pedir<{ datos: Material[] }>('/materiales')
      .then((respuesta) => setMateriales(respuesta.datos))
      .catch(() => setError('No pudimos cargar los materiales. Recarga la página.'));
  }, []);

  const alternar = (codigo: CodigoMaterial) =>
    setElegidos((actuales) =>
      actuales.includes(codigo) ? actuales.filter((c) => c !== codigo) : [...actuales, codigo],
    );

  const nombres = (materiales ?? []).filter((m) => elegidos.includes(m.codigo)).map((m) => m.nombre);

  const finalizar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await pedir('/yo/materiales', { metodo: 'PUT', cuerpo: { materiales: elegidos } });
      setInsignia(true);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar tus materiales.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoAcceso lado={LADO}>
      <BarraAcceso derecha={<span className="ac-paso-texto">Paso 2 de 2</span>} />
      <Progreso porcentaje={100} etiqueta="Paso 2 de 2" />
      <div className="ac-pad crece">
        <div className="ac-titulo">
          <h1>¿Qué materiales sueles recolectar?</h1>
          <p>Elige uno o varios. Te mostraremos los mejores precios para cada uno.</p>
        </div>
        {error && <AvisoAcceso tono="err">{error}</AvisoAcceso>}
        {!materiales && !error ? (
          <PantallaCargando />
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {(materiales ?? []).map((material) => {
              const elegido = elegidos.includes(material.codigo);
              return (
                <label key={material.codigo} className={clases('ac-mat', elegido && 'on')}>
                  <input
                    type="checkbox"
                    checked={elegido}
                    onChange={() => alternar(material.codigo)}
                    aria-label={material.nombre}
                  />
                  <span className="em">
                    <Icono nombre={ICONO_MATERIAL[material.codigo]} tamano="lg" />
                  </span>
                  <div>
                    <h3>{material.nombre}</h3>
                    <p>{DESCRIPCION_MATERIAL[material.codigo]}</p>
                  </div>
                  <span className="ck">
                    <Icono nombre="i-check" tamano="sm" />
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <p className="mini" style={{ margin: 0, fontSize: 13 }} aria-live="polite">
          {nombres.length === 0
            ? 'Aún no elegiste ningún material.'
            : `Elegiste ${nombres.length} ${nombres.length === 1 ? 'material' : 'materiales'}: ${nombres.join(', ')}.`}
        </p>
      </div>
      <div className="ac-pie">
        <button
          className="btn p bloque"
          type="button"
          disabled={elegidos.length === 0 || enviando}
          onClick={() => void finalizar()}
        >
          {enviando ? <Girando /> : null}
          Finalizar registro
        </button>
      </div>

      {insignia && (
        <div className="ov">
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-insignia"
            style={{ textAlign: 'center', alignItems: 'center' }}
          >
            <span className="ac-heroe bien" style={{ borderRadius: '50%', margin: '0 auto' }}>
              <Icono nombre="i-leaf" />
            </span>
            <span className="pill open" style={{ alignSelf: 'center' }}>
              <i />
              Insignia desbloqueada
            </span>
            <h3 id="titulo-insignia">¡Bienvenido a RecicloMap!</h3>
            <p style={{ margin: 0 }}>
              Ganaste <b>Semilla</b>, tu primera insignia. Ahora busca quién paga mejor por tu material.
            </p>
            <button
              className="btn p"
              type="button"
              autoFocus
              onClick={() => void actualizar().then(() => router.replace(RUTAS.mapa))}
            >
              Ir al mapa
            </button>
          </div>
        </div>
      )}
    </MarcoAcceso>
  );
}

export function RegistroMateriales() {
  return (
    <Protegida roles={['RECICLADOR']} pasos={['ELEGIR_MATERIALES']}>
      <Contenido />
    </Protegida>
  );
}
