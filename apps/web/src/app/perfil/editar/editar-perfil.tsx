'use client';

import {
  type CodigoMaterial,
  CODIGOS_MATERIAL,
  esquemaPerfilReciclador,
  formatearTelefono,
  NOMBRE_MATERIAL,
} from '@reciclomap/shared';
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from 'react';
import { subirFoto, useFotoProtegida } from '@/acceso/fotos';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { CambiarTelefono } from '@/cuenta/cambiar-telefono';
import { useAviso } from '@/diseno/avisos';
import { EncabezadoPagina } from '@/diseno/bloques';
import { Campo } from '@/diseno/formulario';
import { Icono } from '@/diseno/icono';
import { useZonasActivas } from '@/mapa/pedir-ubicacion';
import { MarcoApp } from '@/navegacion/marco-app';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { iniciales } from '@/sesion/rutas-sesion';
import { useSesion } from '@/sesion/sesion';

type Perfil = {
  nombre: string;
  telefono: string;
  correo: string | null;
  correoVerificado: boolean;
  fotoId: string | null;
  zona: { id: number; nombre: string } | null;
  sobreMi: string | null;
  ciudad: { nombre: string };
  materiales: Array<{ codigo: CodigoMaterial; nombre: string }>;
};

// Pantalla 22: lo que ven los negocios cuando les ofertas; la ubicación exacta nunca se muestra
function Contenido() {
  const aviso = useAviso();
  const { actualizar } = useSesion();
  const zonas = useZonasActivas();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [zonaId, setZonaId] = useState<number | null>(null);
  const [sobreMi, setSobreMi] = useState('');
  const [materiales, setMateriales] = useState<CodigoMaterial[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [telefonoAbierto, setTelefonoAbierto] = useState(false);
  const foto = useFotoProtegida(perfil?.fotoId);

  const llenar = useCallback((datos: Perfil) => {
    setPerfil(datos);
    setNombre(datos.nombre);
    setCorreo(datos.correo ?? '');
    setZonaId(datos.zona?.id ?? null);
    setSobreMi(datos.sobreMi ?? '');
    setMateriales(datos.materiales.map((m) => m.codigo));
    setErrores({});
  }, []);

  const cargar = useCallback(async () => llenar(await pedir<Perfil>('/yo')), [llenar]);

  useEffect(() => {
    let vigente = true;
    pedir<Perfil>('/yo')
      .then((datos) => vigente && llenar(datos))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [llenar]);

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    const lectura = esquemaPerfilReciclador.safeParse({ nombre, correo, zonaId: zonaId ?? undefined, sobreMi });
    const nuevos: Record<string, string> = {};
    if (!lectura.success) for (const p of lectura.error.issues) nuevos[String(p.path[0])] ??= p.message;
    if (materiales.length === 0) nuevos.materiales = 'Elige al menos un material.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0 || !lectura.success) return;
    setGuardando(true);
    try {
      await pedir('/yo/perfil', { metodo: 'PATCH', cuerpo: lectura.data });
      llenar(await pedir<Perfil>('/yo/materiales', { metodo: 'PUT', cuerpo: { materiales } }));
      await actualizar();
      aviso('Perfil actualizado');
    } catch (causa) {
      setErrores({ general: causa instanceof ErrorApi ? causa.message : 'No pudimos guardar tu perfil.' });
    } finally {
      setGuardando(false);
    }
  };

  const cambiarFoto = async (evento: ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    setSubiendo(true);
    try {
      await subirFoto(archivo, 'PERFIL');
      await cargar();
      aviso('Foto actualizada');
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos subir la foto.');
    } finally {
      setSubiendo(false);
    }
  };

  if (!perfil) return <span className="girando" role="status" aria-label="Cargando" />;
  return (
    <>
      <EncabezadoPagina
        antetitulo="Mi cuenta"
        titulo="Editar"
        resaltado="perfil"
        descripcion="Lo que ven los compradores cuando les ofertas: tu nombre como «Nombre I.», tu nivel y tu zona aproximada. Tu ubicación exacta nunca se muestra."
      />
      <div className="cols l">
        <aside className="stack">
          <div className="panel" style={{ textAlign: 'center' }}>
            <span
              style={{
                width: 104,
                height: 104,
                borderRadius: '50%',
                background: 'var(--sky)',
                border: '3px solid var(--ink)',
                display: 'grid',
                placeItems: 'center',
                font: '800 36px var(--head)',
                boxShadow: '4px 4px 0 var(--ink)',
                margin: '0 auto',
                overflow: 'hidden',
              }}
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida por la API */}
              {foto ? (
                <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                iniciales(perfil.nombre)
              )}
            </span>
            <h2 style={{ display: 'block', margin: '12px 0 4px', font: '800 24px var(--head)' }}>{perfil.nombre}</h2>
            <div className="mini">
              {perfil.zona?.nombre ?? 'Sin zona'} · {perfil.ciudad.nombre}
            </div>
            <label className="btn sm" style={{ marginTop: 12, cursor: 'pointer' }}>
              <Icono nombre="i-camera" />
              {subiendo ? 'Subiendo…' : perfil.fotoId ? 'Cambiar foto' : 'Subir foto'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => void cambiarFoto(e)}
              />
            </label>
            <hr className="divl" />
            <p className="mini">La foto es opcional; si no subes una, se usan tus iniciales para ahorrar datos.</p>
          </div>
        </aside>
        <form className="panel" onSubmit={(e) => void guardar(e)} noValidate>
          <h2>Tus datos</h2>
          <div className="stack" style={{ gap: 18 }}>
            <div className="grid2" style={{ gap: 16 }}>
              <Campo
                etiqueta="Nombre y apellido"
                maxLength={60}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                error={errores.nombre}
              />
              <div className="field">
                <span className="lbl">WhatsApp</span>
                <div className="row sp" style={{ minHeight: 48 }}>
                  <b className="mono">+51 {formatearTelefono(perfil.telefono)}</b>
                  <button type="button" className="btn sm" onClick={() => setTelefonoAbierto(true)}>
                    Cambiar
                  </button>
                </div>
                <span className="hint">Cambiarlo exige verificar el número nuevo con un código.</span>
              </div>
            </div>
            <div className="grid2" style={{ gap: 16 }}>
              <div className={errores.zonaId ? 'field err' : 'field'}>
                <label htmlFor="zona">Barrio o zona</label>
                <div className="inp">
                  <select id="zona" value={zonaId ?? ''} onChange={(e) => setZonaId(Number(e.target.value) || null)}>
                    <option value="">Elige tu zona</option>
                    {zonas?.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                {errores.zonaId ? (
                  <span className="msg">{errores.zonaId}</span>
                ) : (
                  <span className="hint">Los compradores solo ven una distancia aproximada.</span>
                )}
              </div>
              <Campo
                etiqueta="Correo"
                opcional
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                error={errores.correo}
                ayuda={perfil.correo && !perfil.correoVerificado ? 'Sin verificar' : undefined}
              />
            </div>
            <div className={errores.materiales ? 'field err' : 'field'}>
              <span className="lbl">Materiales que reciclas</span>
              <div className="mt" role="group" aria-label="Materiales que reciclas">
                {CODIGOS_MATERIAL.map((codigo) => (
                  <button
                    key={codigo}
                    type="button"
                    aria-pressed={materiales.includes(codigo)}
                    onClick={() =>
                      setMateriales((actuales) =>
                        actuales.includes(codigo) ? actuales.filter((c) => c !== codigo) : [...actuales, codigo],
                      )
                    }
                  >
                    <Icono nombre={ICONO_MATERIAL[codigo]} />
                    {NOMBRE_MATERIAL[codigo]}
                  </button>
                ))}
              </div>
              {errores.materiales && <span className="msg">{errores.materiales}</span>}
            </div>
            <div className="field">
              <label htmlFor="sobre">
                Sobre ti <span className="opt">(opcional)</span>
              </label>
              <div className="inp ta">
                <textarea
                  id="sobre"
                  rows={3}
                  maxLength={140}
                  placeholder="Ej. Recojo en el mercado todos los días."
                  value={sobreMi}
                  onChange={(e) => setSobreMi(e.target.value)}
                />
              </div>
            </div>
            {errores.general && (
              <div className="note warn" role="alert">
                {errores.general}
              </div>
            )}
            <div className="row g16 wr">
              <button className="btn p" type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button type="button" className="btn ghost" onClick={() => llenar(perfil)}>
                Descartar
              </button>
            </div>
          </div>
        </form>
      </div>
      <CambiarTelefono
        abierta={telefonoAbierto}
        alCerrar={() => setTelefonoAbierto(false)}
        alCambiar={() => void cargar()}
      />
    </>
  );
}

export function EditarPerfil() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp>
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
