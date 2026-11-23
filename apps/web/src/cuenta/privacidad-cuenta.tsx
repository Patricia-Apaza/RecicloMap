'use client';

import { ELIMINACION_GRACIA_DIAS } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { useEffect, useState } from 'react';
import { CampoContrasena } from '@/acceso/campos';
import { useAviso, Ventana } from '@/diseno/avisos';
import { Campo } from '@/diseno/formulario';
import { useConfiguracionPublica } from '@/mapa/configuracion';
import { RUTAS } from '@/navegacion/rutas';
import { ErrorApi, pedir } from '@/sesion/api';

export type Bloqueo = { tipo: string; cantidad: number; titulo: string; que: string; donde: string };
export type ResumenPrivacidad = {
  tieneContrasena: boolean;
  textos: { versionVigente: string; pendientes: string[] };
  exportacion: { disponible: boolean; ultimaEn: string | null };
  eliminacion: {
    enEliminacion: boolean;
    programadaEn: string | null;
    graciaDias: number;
    puedeEliminar: boolean;
    bloqueos: Bloqueo[];
  };
};

export function useResumenPrivacidad(version = 0) {
  const [resumen, setResumen] = useState<ResumenPrivacidad | null>(null);
  useEffect(() => {
    let vigente = true;
    pedir<ResumenPrivacidad>('/yo/privacidad')
      .then((r) => vigente && setResumen(r))
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [version]);
  return resumen;
}

function descargar(nombre: string, datos: unknown) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

const fechaLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const soloDigitos = (valor: string) => valor.replace(/\D/g, '');

// Pantalla 39: copia de los propios datos
export function PanelMisDatos() {
  const aviso = useAviso();
  const { configuracion } = useConfiguracionPublica();
  const [version, setVersion] = useState(0);
  const resumen = useResumenPrivacidad(version);
  const [abierta, setAbierta] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const correo = configuracion?.soporte?.correo ?? 'soporte@reciclomap.pe';
  // Quien entra solo con Google confirma con un código al teléfono, no con una contraseña
  const conCodigo = resumen !== null && !resumen.tieneContrasena;

  const enviarCodigo = async () => {
    setEnviando(true);
    try {
      await pedir('/yo/exportacion/codigo', { cuerpo: {} });
      setCodigoEnviado(true);
      setError(null);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviar el código.');
    } finally {
      setEnviando(false);
    }
  };

  const exportar = async () => {
    if (conCodigo ? codigo.length !== 6 : !contrasena) {
      setError(conCodigo ? 'Escribe el código de 6 dígitos.' : 'Escribe tu contraseña.');
      return;
    }
    setEnviando(true);
    try {
      const datos = await pedir<unknown>('/yo/exportacion', { cuerpo: conCodigo ? { codigo } : { contrasena } });
      descargar(`reciclomap-datos-${fechaLima()}.json`, datos);
      aviso('Descargamos tus datos.');
      setAbierta(false);
      setContrasena('');
      setCodigo('');
      setCodigoEnviado(false);
      setVersion((v) => v + 1);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos preparar tus datos.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="panel" data-panel="mis-datos">
      <h3>Tus datos</h3>
      <p className="mini" style={{ marginTop: 0 }}>
        Descarga una copia de tus datos en un archivo JSON, que se puede leer y llevar a otro servicio. Incluye solo lo
        tuyo: no trae teléfonos, correos ni ubicaciones de otras personas. Puedes pedir una por día.
      </p>
      <button
        type="button"
        className="btn"
        style={{ width: '100%' }}
        disabled={resumen !== null && !resumen.exportacion.disponible}
        onClick={() => {
          setError(null);
          setAbierta(true);
        }}
      >
        Descargar mis datos
      </button>
      {resumen && !resumen.exportacion.disponible && (
        <p className="mini" style={{ marginBottom: 0 }}>
          Ya descargaste tus datos hoy. Podrás pedir otra copia mañana.
        </p>
      )}
      <p className="mini" style={{ marginBottom: 0 }}>
        Para acceder, rectificar, cancelar u oponerte al uso de tus datos escríbenos a{' '}
        <a
          className="ac-enlace"
          style={{ display: 'inline' }}
          href={`mailto:${correo}?subject=${encodeURIComponent('Derechos sobre mis datos')}`}
        >
          {correo}
        </a>
        . Lee los{' '}
        <Link className="ac-enlace" style={{ display: 'inline' }} href={RUTAS.terminos}>
          Términos y la Política de privacidad
        </Link>
        .
      </p>
      <Ventana
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        antetitulo="TUS DATOS"
        titulo={conCodigo ? 'Confirma con un código' : 'Confirma tu contraseña'}
      >
        {conCodigo ? (
          <>
            <p className="mini">
              Tu cuenta entra con Google y no tiene contraseña. Te enviamos un código por SMS a tu teléfono verificado.
            </p>
            {codigoEnviado ? (
              <Campo
                etiqueta="Código que te enviamos por SMS"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => {
                  setCodigo(soloDigitos(e.target.value));
                  setError(null);
                }}
                error={error ?? undefined}
              />
            ) : (
              <>
                {error && (
                  <p className="mini" role="alert">
                    {error}
                  </p>
                )}
                <button type="button" className="btn p" disabled={enviando} onClick={() => void enviarCodigo()}>
                  Enviarme un código
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <p className="mini">Por seguridad, escribe tu contraseña para descargar tus datos.</p>
            <CampoContrasena
              valor={contrasena}
              alCambiar={(v) => {
                setContrasena(v);
                setError(null);
              }}
              error={error ?? undefined}
            />
          </>
        )}
        <div className="row g8 wr">
          {(!conCodigo || codigoEnviado) && (
            <button type="button" className="btn p" disabled={enviando} onClick={() => void exportar()}>
              Descargar
            </button>
          )}
          <button type="button" className="btn" onClick={() => setAbierta(false)}>
            Cancelar
          </button>
        </div>
      </Ventana>
    </div>
  );
}

// Zona de riesgo del prototipo 39: eliminar la cuenta, con gracia de 7 días
export function ZonaDeRiesgo() {
  const resumen = useResumenPrivacidad();
  const [abierta, setAbierta] = useState(false);
  const [paso, setPaso] = useState<'info' | 'codigo'>('info');
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [palabra, setPalabra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (resumen && !resumen.eliminacion.puedeEliminar) return null;
  const bloqueos = resumen?.eliminacion.bloqueos ?? [];
  const sinContrasena = resumen !== null && !resumen.tieneContrasena;

  const abrir = () => {
    setPaso('info');
    setContrasena('');
    setCodigo('');
    setPalabra('');
    setError(null);
    setAbierta(true);
  };
  const pedirCodigo = async () => {
    if (!sinContrasena && !contrasena) {
      setError('Escribe tu contraseña.');
      return;
    }
    setEnviando(true);
    try {
      await pedir('/yo/eliminacion/codigo', { cuerpo: sinContrasena ? {} : { contrasena } });
      setPaso('codigo');
      setError(null);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos enviar el código.');
    } finally {
      setEnviando(false);
    }
  };
  const eliminar = async () => {
    if (palabra.trim().toUpperCase() !== 'ELIMINAR') {
      setError('Escribe ELIMINAR para confirmar.');
      return;
    }
    setEnviando(true);
    try {
      await pedir('/yo/eliminacion', {
        cuerpo: { ...(sinContrasena ? {} : { contrasena }), codigo, entiendo: true },
      });
      // El servidor ya cerró todas las sesiones: se sale con una carga completa para que ninguna pantalla protegida lo desvíe
      window.location.assign(`${RUTAS.iniciarSesion}?aviso=eliminacion`);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.message : 'No pudimos eliminar tu cuenta.');
      setEnviando(false);
    }
  };

  return (
    <div className="panel" style={{ borderColor: '#A83226' }} data-panel="zona-de-riesgo">
      <h3 style={{ color: '#A83226' }}>Zona de riesgo</h3>
      <p className="mini" style={{ marginBottom: 12 }}>
        Eliminar tu cuenta borra tu nombre, teléfono, correo, foto y ubicación. Tus operaciones y reseñas ya hechas se
        conservan como «Usuario eliminado». Tienes {ELIMINACION_GRACIA_DIAS} días para arrepentirte; después no se puede
        deshacer.
      </p>
      <button type="button" className="btn dn" style={{ width: '100%' }} onClick={abrir}>
        Eliminar mi cuenta
      </button>
      <Ventana
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        antetitulo="ELIMINAR CUENTA"
        titulo="¿Seguro que quieres irte?"
      >
        {bloqueos.length > 0 ? (
          <>
            <p className="mini">Antes de eliminar tu cuenta resuelve lo que sigue pendiente:</p>
            <ul className="list" style={{ paddingLeft: 18 }} data-bloqueos>
              {bloqueos.map((b) => (
                <li key={b.tipo} data-bloqueo={b.tipo}>
                  <b>
                    {b.titulo} ({b.cantidad}).
                  </b>{' '}
                  {b.que}
                  {b.tipo === 'premios'
                    ? ' También puedes renunciar al premio desde Mis premios y eliminar tu cuenta sin esperar.'
                    : ''}{' '}
                  <Link
                    className="ac-enlace"
                    style={{ display: 'inline' }}
                    href={b.donde}
                    onClick={() => setAbierta(false)}
                  >
                    Ir ahí
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => setAbierta(false)}>
              Entendido
            </button>
          </>
        ) : (
          <>
            <ul className="list mini" style={{ paddingLeft: 18, marginTop: 0 }}>
              <li>Tu cuenta quedará inactiva ya: saldrás del mapa y del ranking y no podrás operar.</li>
              <li>
                Tienes {ELIMINACION_GRACIA_DIAS} días: si inicias sesión en ese plazo, puedes cancelar la eliminación.
              </li>
              <li>
                Pasado el plazo se borran tu nombre, teléfono, correo, foto, ubicación, sesiones, favoritos y búsquedas,
                sin posibilidad de recuperarlos. Podrás registrarte de nuevo con el mismo teléfono como cuenta nueva,
                sin historial.
              </li>
              <li>Tus puntos, operaciones y reseñas ya hechas se conservan sin tu nombre.</li>
            </ul>
            {paso === 'info' ? (
              <>
                {sinContrasena ? (
                  <p className="mini">
                    Tu cuenta entra con Google y no tiene contraseña: confirmarás con el código que enviaremos a tu
                    teléfono verificado.
                  </p>
                ) : (
                  <CampoContrasena
                    etiqueta="Tu contraseña"
                    valor={contrasena}
                    alCambiar={(v) => {
                      setContrasena(v);
                      setError(null);
                    }}
                    error={error ?? undefined}
                  />
                )}
                {sinContrasena && error && (
                  <p className="mini" role="alert">
                    {error}
                  </p>
                )}
                <div className="row g8 wr">
                  <button type="button" className="btn dn" disabled={enviando} onClick={() => void pedirCodigo()}>
                    Enviarme un código al teléfono
                  </button>
                  <button type="button" className="btn" onClick={() => setAbierta(false)}>
                    Me quedo
                  </button>
                </div>
              </>
            ) : (
              <>
                <Campo
                  etiqueta="Código que te enviamos por SMS"
                  inputMode="numeric"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(soloDigitos(e.target.value));
                    setError(null);
                  }}
                />
                <Campo
                  etiqueta="Para confirmar, escribe ELIMINAR"
                  placeholder="ELIMINAR"
                  value={palabra}
                  onChange={(e) => {
                    setPalabra(e.target.value);
                    setError(null);
                  }}
                  error={error ?? undefined}
                />
                <div className="row g8 wr">
                  <button
                    type="button"
                    className="btn dn"
                    disabled={enviando || codigo.length !== 6}
                    onClick={() => void eliminar()}
                  >
                    Eliminar mi cuenta
                  </button>
                  <button type="button" className="btn" onClick={() => setAbierta(false)}>
                    Me quedo
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Ventana>
    </div>
  );
}
