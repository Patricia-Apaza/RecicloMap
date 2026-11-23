'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { escucharSesion, fijarSesion, hayToken, pedir, renovarSesion, type ResumenUsuario, type Sesion } from './api';

const CLAVE_INVITADO = 'rm_invitado';

type ValorSesion = {
  cargando: boolean;
  usuario: ResumenUsuario | null;
  invitado: boolean;
  abrir: (sesion: Sesion) => void;
  actualizar: () => Promise<ResumenUsuario | null>;
  cerrar: () => Promise<void>;
  cerrarTodas: () => Promise<void>;
  entrarComoInvitado: () => void;
};

const Contexto = createContext<ValorSesion | null>(null);

let invitadoEnMemoria = false;
const oyentesInvitado = new Set<() => void>();

function leerInvitado(): boolean {
  try {
    return localStorage.getItem(CLAVE_INVITADO) === '1' || invitadoEnMemoria;
  } catch {
    return invitadoEnMemoria;
  }
}

function guardarInvitado(valor: boolean): void {
  invitadoEnMemoria = valor;
  try {
    if (valor) localStorage.setItem(CLAVE_INVITADO, '1');
    else localStorage.removeItem(CLAVE_INVITADO);
  } catch {
    // Sin almacenamiento el modo invitado dura solo esta visita
  }
  for (const oyente of oyentesInvitado) oyente();
}

function escucharInvitado(oyente: () => void): () => void {
  oyentesInvitado.add(oyente);
  window.addEventListener('storage', oyente);
  return () => {
    oyentesInvitado.delete(oyente);
    window.removeEventListener('storage', oyente);
  };
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState<ResumenUsuario | null>(null);
  const invitado = useSyncExternalStore(escucharInvitado, leerInvitado, () => false);

  useEffect(() => {
    const dejar = escucharSesion((sesion) => {
      setUsuario(sesion?.usuario ?? null);
      if (sesion) guardarInvitado(false);
    });
    void renovarSesion().finally(() => setCargando(false));
    // Al volver la señal se recupera la sesión de verdad (con su token) para poder escribir otra vez
    // Solo si la sesión se mostró sin token (recargó sin señal): con un token vivo renovar de más puede cruzarse con otra renovación
    const alVolver = () => {
      if (!hayToken()) void renovarSesion();
    };
    window.addEventListener('online', alVolver);
    return () => {
      dejar();
      window.removeEventListener('online', alVolver);
    };
  }, []);

  const abrir = useCallback((sesion: Sesion) => fijarSesion(sesion), []);

  const actualizar = useCallback(async () => {
    try {
      const perfil = await pedir<ResumenUsuario>('/yo');
      setUsuario(perfil);
      return perfil;
    } catch {
      return null;
    }
  }, []);

  const cerrar = useCallback(async () => {
    try {
      await pedir('/auth/logout', { metodo: 'POST' });
    } finally {
      fijarSesion(null);
    }
  }, []);

  const cerrarTodas = useCallback(async () => {
    await pedir('/auth/logout-todas', { metodo: 'POST' });
    fijarSesion(null);
  }, []);

  const entrarComoInvitado = useCallback(() => guardarInvitado(true), []);

  const valor = useMemo(
    () => ({
      cargando,
      usuario,
      invitado: invitado && !usuario,
      abrir,
      actualizar,
      cerrar,
      cerrarTodas,
      entrarComoInvitado,
    }),
    [cargando, usuario, invitado, abrir, actualizar, cerrar, cerrarTodas, entrarComoInvitado],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion necesita ProveedorSesion');
  return valor;
}
