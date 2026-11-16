'use client';

import { esquemaCorreoCuenta, formatearTelefono } from '@reciclomap/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { CampoContrasena } from '@/acceso/campos';
import { CambiarTelefono } from '@/cuenta/cambiar-telefono';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Nota } from '@/diseno/bloques';
import { Campo, Interruptor } from '@/diseno/formulario';
import { PanelPreferencias } from '@/notificaciones/preferencias';
import { MarcoApp } from '@/navegacion/marco-app';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, fijarSesion, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { useSesion } from '@/sesion/sesion';

type Perfil = {
  rol: string;
  telefono: string;
  correo: string | null;
  correoVerificado: boolean;
  visibleEnRanking: boolean;
  ciudad: { id: number; nombre: string };
};
type Ciudad = { id: number; nombre: string; estado: 'ACTIVA' | 'PROXIMAMENTE' };

function CambiarCorreo({
  actual,
  abierta,
  alCerrar,
  alCambiar,
}: {
  actual: string | null;
  abierta: boolean;
  alCerrar: () => void;
  alCambiar: (perfil: Perfil) => void;
}) {
  const aviso = useAviso();
  const [correo, setCorreo] = useState(actual ?? '');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    const lectura = esquemaCorreoCuenta.safeParse({ correo });
    if (!lectura.success) {
      setError(lectura.error.issues[0]?.message ?? 'Revisa el correo.');
      return;
    }
    setEnviando(true);
    try {
      alCambiar(await pedir<Perfil>('/yo/correo', { metodo: 'PATCH', cuerpo: lectura.data }));
      aviso(lectura.data.correo ? 'Correo actualizado' : 'Quitamos tu correo');
      alCerrar();
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar el correo.');
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Ventana abierta={abierta} alCerrar={alCerrar} antetitulo="CORREO" titulo="Tu correo">
      <p className="mini">
        Es opcional: sirve para entrar con correo y recuperar tu contraseña. Déjalo vacío para quitarlo.
      </p>
      <Campo
        etiqueta="Correo"
        type="email"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        error={error ?? undefined}
      />
      <button type="button" className="btn p" disabled={enviando} onClick={() => void guardar()}>
        {enviando ? 'Guardando…' : 'Guardar correo'}
      </button>
      <button type="button" className="btn ghost" onClick={alCerrar}>
        Volver
      </button>
    </Ventana>
  );
}

function CambiarContrasena({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const router = useRouter();
  const aviso = useAviso();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errores, setErrores] = useState<{ actual?: string; nueva?: string; repetida?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    const nuevos = {
      actual: actual ? undefined : 'Escribe tu contraseña actual.',
      nueva: nueva.length < 8 ? 'Debe tener al menos 8 caracteres.' : undefined,
      repetida: nueva !== repetida ? 'Las contraseñas no coinciden.' : undefined,
    };
    setErrores(nuevos);
    setError(null);
    if (nuevos.actual || nuevos.nueva || nuevos.repetida) return;
    setEnviando(true);
    try {
      await pedir('/auth/contrasena', { metodo: 'PUT', cuerpo: { actual, nueva } });
      // Cambiar la contraseña cierra todas las sesiones, también esta
      fijarSesion(null);
      aviso('Contraseña actualizada. Vuelve a iniciar sesión.');
      router.replace(RUTAS.iniciarSesion);
    } catch (causa) {
      if (causa instanceof ErrorApi && causa.campo('actual')) setErrores({ actual: causa.campo('actual') });
      else setError(causa instanceof ErrorApi ? causa.message : 'No pudimos cambiar tu contraseña.');
      setEnviando(false);
    }
  };

  return (
    <Ventana abierta={abierta} alCerrar={alCerrar} antetitulo="CONTRASEÑA" titulo="Cambia tu contraseña">
      <form className="stack" style={{ gap: 14 }} onSubmit={(evento) => void guardar(evento)} noValidate>
        <p>Al cambiarla, cerraremos tu sesión en todos tus dispositivos.</p>
        {error && <Nota tono="atencion">{error}</Nota>}
        <CampoContrasena etiqueta="Contraseña actual" valor={actual} alCambiar={setActual} error={errores.actual} />
        <CampoContrasena
          etiqueta="Nueva contraseña"
          nueva
          medidor
          valor={nueva}
          alCambiar={setNueva}
          error={errores.nueva}
        />
        <CampoContrasena
          etiqueta="Repite la nueva contraseña"
          nueva
          valor={repetida}
          alCambiar={setRepetida}
          error={errores.repetida}
        />
        <button className="btn p" type="submit" disabled={enviando}>
          Guardar contraseña
        </button>
        <button className="btn ghost" type="button" onClick={alCerrar}>
          Volver
        </button>
      </form>
    </Ventana>
  );
}

function Contenido() {
  const router = useRouter();
  const { cerrar, cerrarTodas } = useSesion();
  const aviso = useAviso();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [editandoCorreo, setEditandoCorreo] = useState(false);
  const [editandoTelefono, setEditandoTelefono] = useState(false);
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [enEspera, setEnEspera] = useState<number[]>([]);

  useEffect(() => {
    let vigente = true;
    pedir<Perfil>('/yo')
      .then((respuesta) => vigente && setPerfil(respuesta))
      .catch(() => undefined);
    pedir<{ datos: Ciudad[] }>('/ciudades')
      .then((respuesta) => vigente && setCiudades(respuesta.datos))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  const cerrarEnTodos = async () => {
    setCerrando(true);
    try {
      await cerrarTodas();
      aviso('Cerramos tu sesión en todos tus dispositivos.');
      router.replace(RUTAS.iniciarSesion);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos cerrar tus sesiones.');
      setCerrando(false);
      setConfirmando(false);
    }
  };

  const avisarCiudad = async (ciudad: Ciudad) => {
    try {
      await pedir(`/yo/lista-espera/${ciudad.id}`, { cuerpo: {} });
      setEnEspera((lista) => [...lista, ciudad.id]);
      aviso(`Listo. Te avisaremos cuando RecicloMap abra en ${ciudad.nombre}.`);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos anotarte.');
    }
  };
  const cambiarRanking = async (visible: boolean) => {
    try {
      setPerfil(await pedir<Perfil>('/yo/preferencias', { metodo: 'PUT', cuerpo: { visibleEnRanking: visible } }));
      aviso(visible ? 'Apareces en el ranking' : 'Ya no apareces en el ranking');
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos guardar tu preferencia.');
    }
  };
  const recargarPerfil = () => {
    void pedir<Perfil>('/yo')
      .then(setPerfil)
      .catch(() => undefined);
  };
  const fila = { padding: '12px 0', borderBottom: '1.5px solid var(--line)' };
  return (
    <MarcoApp>
      <div className="ph">
        <div>
          <span className="kick">Mi cuenta</span>
          <h1>Configuración</h1>
          <p>Elige qué avisos recibir, qué ven los demás y en qué ciudad usas RecicloMap.</p>
        </div>
      </div>
      <div className="cols">
        <section className="stack">
          <div className="panel">
            <h2>Cuenta</h2>
            <div className="list" style={{ gap: 0 }}>
              <div className="row sp" style={fila}>
                <span>
                  <b>Teléfono</b>
                  <div className="mini">{perfil ? formatearTelefono(perfil.telefono) : '…'}</div>
                </span>
                <span className="row g8">
                  <span className="pill open">
                    <i />
                    Verificado
                  </span>
                  <button type="button" className="btn sm" onClick={() => setEditandoTelefono(true)}>
                    Cambiar
                  </button>
                </span>
              </div>
              <div className="row sp" style={fila}>
                <span>
                  <b>Correo</b>
                  <div className="mini">{perfil ? (perfil.correo ?? 'Sin correo') : '…'}</div>
                </span>
                <span className="row g8">
                  {perfil?.correo && (
                    <span className={perfil.correoVerificado ? 'pill open' : 'pill grey'}>
                      <i />
                      {perfil.correoVerificado ? 'Verificado' : 'Sin verificar'}
                    </span>
                  )}
                  <button type="button" className="btn sm" onClick={() => setEditandoCorreo(true)}>
                    {perfil?.correo ? 'Cambiar' : 'Agregar'}
                  </button>
                </span>
              </div>
              <div className="row sp" style={{ padding: '12px 0' }}>
                <span>
                  <b>Contraseña</b>
                  <div className="mini">Cámbiala cuando quieras</div>
                </span>
                <button type="button" className="btn sm" onClick={() => setCambiando(true)}>
                  Cambiar
                </button>
              </div>
            </div>
          </div>
          {perfil?.rol === 'RECICLADOR' && (
            <div className="panel">
              <h2>Privacidad</h2>
              <Interruptor
                etiqueta="Aparecer en el ranking"
                marcado={perfil.visibleEnRanking}
                alCambiar={(valor) => void cambiarRanking(valor)}
              />
            </div>
          )}
          <Nota>Tu ubicación exacta nunca se muestra, sin importar estos ajustes.</Nota>
          <div className="panel" data-ciudades>
            <h2>Ciudad</h2>
            <div className="list" style={{ gap: 0 }}>
              {ciudades.map((ciudad) => (
                <div key={ciudad.id} className="row sp" style={fila}>
                  <span>
                    <b>{ciudad.nombre}</b>
                    <div className="mini">
                      {ciudad.estado === 'ACTIVA'
                        ? perfil?.ciudad.id === ciudad.id
                          ? 'Tu ciudad'
                          : 'Disponible'
                        : 'Próximamente'}
                    </div>
                  </span>
                  {ciudad.estado === 'PROXIMAMENTE' &&
                    (enEspera.includes(ciudad.id) ? (
                      <span className="pill open">
                        <i />
                        Te avisaremos
                      </span>
                    ) : (
                      <button type="button" className="btn sm" onClick={() => void avisarCiudad(ciudad)}>
                        Avisarme cuando abra
                      </button>
                    ))}
                </div>
              ))}
            </div>
            <p className="mini" style={{ marginTop: 10 }}>
              Por ahora RecicloMap funciona solo en Juliaca. El idioma de la app es español.
            </p>
          </div>
        </section>
        <aside className="stack">
          {perfil && perfil.rol !== 'ADMIN' && <PanelPreferencias />}
          <div className="panel">
            <h3>Sesión</h3>
            <div className="stack" style={{ gap: 10 }}>
              <button
                type="button"
                className="btn"
                style={{ width: '100%' }}
                onClick={() => void cerrar().then(() => router.replace(RUTAS.bienvenida))}
              >
                Cerrar sesión
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ width: '100%' }}
                onClick={() => setConfirmando(true)}
              >
                Cerrar sesión en todos los dispositivos
              </button>
              <p className="mini" style={{ margin: 0 }}>
                Úsalo si entraste desde un celular prestado o crees que alguien más usa tu cuenta.
              </p>
            </div>
          </div>
          {perfil && perfil.rol !== 'ADMIN' && (
            <div className="panel">
              <h3>Tus datos</h3>
              <p className="mini" style={{ margin: 0 }}>
                Pronto podrás descargar tus datos y eliminar tu cuenta desde aquí. Mientras tanto, escríbenos desde el
                Centro de ayuda.
              </p>
            </div>
          )}
        </aside>
      </div>

      <CambiarCorreo
        key={perfil?.correo ?? 'sin-correo'}
        actual={perfil?.correo ?? null}
        abierta={editandoCorreo}
        alCerrar={() => setEditandoCorreo(false)}
        alCambiar={setPerfil}
      />
      <CambiarTelefono
        abierta={editandoTelefono}
        alCerrar={() => setEditandoTelefono(false)}
        alCambiar={recargarPerfil}
      />
      <CambiarContrasena abierta={cambiando} alCerrar={() => setCambiando(false)} />
      <Ventana
        abierta={confirmando}
        alCerrar={() => setConfirmando(false)}
        antetitulo="SESIONES"
        titulo="¿Cerrar sesión en todos los dispositivos?"
      >
        <p>
          Se cerrará tu sesión en este celular o computadora y en todos los demás. Tendrás que volver a entrar con tu
          contraseña.
        </p>
        <button type="button" className="btn dn" disabled={cerrando} onClick={() => void cerrarEnTodos()}>
          Cerrar en todos
        </button>
        <button type="button" className="btn ghost" onClick={() => setConfirmando(false)}>
          Volver
        </button>
      </Ventana>
    </MarcoApp>
  );
}

export function Configuracion() {
  return (
    <Protegida pasos={['LISTO', 'ESPERAR_VERIFICACION', 'ELEGIR_MATERIALES', 'COMPLETAR_NEGOCIO']}>
      <Contenido />
    </Protegida>
  );
}
