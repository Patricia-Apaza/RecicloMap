'use client';

import Link from '@/diseno/enlace';
import { useEffect, useRef, useState } from 'react';
import { ChipPuntos } from '@/diseno/bloques';
import { clases } from '@/diseno/clases';
import { Icono } from '@/diseno/icono';
import { Marca } from '@/diseno/logo';
import { InvitacionRegistro, MOTIVO_INVITADO, PESTANAS_INVITADO } from './invitacion-registro';
import { INICIO, MAS, PESTANAS, type RolNavegacion, tieneCampana, usaMenuCompacto } from './menus';
import { RUTAS } from './rutas';

export type UsuarioNavegacion = {
  nombre: string;
  iniciales: string;
  rolTexto: string;
  puntos?: number;
};

const FONDO_AVATAR: Record<RolNavegacion, string> = {
  reciclador: 'var(--sky)',
  invitado: 'var(--sky)',
  centro: 'var(--sand)',
  comprador: 'var(--mint)',
  admin: 'var(--lilac)',
};

function Campana({ sinLeer }: { sinLeer: number }) {
  const texto = sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones';
  return (
    <Link className="ib" href={RUTAS.notificaciones} aria-label={texto} title="Notificaciones">
      <Icono nombre="i-bell" />
      {sinLeer > 0 && (
        <b className="bd" aria-hidden="true">
          {sinLeer > 99 ? '99+' : sinLeer}
        </b>
      )}
    </Link>
  );
}

function MenuMas({ rol }: { rol: RolNavegacion }) {
  const grupos = MAS[rol];
  const detalles = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const cerrarAlSalir = (evento: MouseEvent) => {
      if (detalles.current && !detalles.current.contains(evento.target as Node)) {
        detalles.current.open = false;
      }
    };
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && detalles.current) detalles.current.open = false;
    };
    document.addEventListener('mousedown', cerrarAlSalir);
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.removeEventListener('mousedown', cerrarAlSalir);
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, []);

  if (grupos.length === 0) return null;
  return (
    <details className="mas" ref={detalles}>
      <summary>
        Más <Icono nombre="i-down" tamano="sm" />
      </summary>
      <div className="mas-m">
        {grupos.map((grupo) => (
          <div key={grupo.grupo} style={{ display: 'contents' }}>
            <small>{grupo.grupo}</small>
            {grupo.enlaces.map((enlace) => (
              <Link key={enlace.ruta} href={enlace.ruta}>
                {enlace.texto}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

export function BarraNavegacion({
  rol,
  activa,
  usuario,
  sinLeer = 0,
}: {
  rol: RolNavegacion;
  activa?: string;
  usuario?: UsuarioNavegacion;
  sinLeer?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const esInvitado = rol === 'invitado';
  // El invitado solo mira: las acciones que exigen cuenta abren la invitación a registrarse
  const bloquear = (clave: string) => (evento: { preventDefault: () => void }) => {
    if (!esInvitado || PESTANAS_INVITADO.has(clave)) return;
    evento.preventDefault();
    setAbierto(false);
    setBloqueo(MOTIVO_INVITADO[clave] ?? 'Para usar esta función necesitas una cuenta. Es gratis y toma un minuto.');
  };
  const pestanas = PESTANAS[rol];

  useEffect(() => {
    if (!abierto) return;
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', cerrarConEscape);
    return () => document.removeEventListener('keydown', cerrarConEscape);
  }, [abierto]);

  const perfil = rol === 'reciclador' ? RUTAS.perfil : rol === 'comprador' ? RUTAS.compradorPerfil : undefined;

  return (
    <header className={clases('nav', usaMenuCompacto(rol) && 'nav-compacta')}>
      <Marca href={INICIO[rol]} />

      <nav className="tabs" aria-label="Principal">
        {pestanas.map((pestana) => (
          <Link
            key={pestana.clave}
            href={pestana.ruta}
            className={pestana.clave === activa ? 'on' : undefined}
            aria-current={pestana.clave === activa ? 'page' : undefined}
            onClick={bloquear(pestana.clave)}
          >
            <Icono nombre={pestana.icono} />
            {pestana.texto}
          </Link>
        ))}
        {!esInvitado && <MenuMas rol={rol} />}
      </nav>

      <div className="acts">
        {esInvitado ? (
          <>
            <Link className="btn sm ghost" href={RUTAS.iniciarSesion}>
              Iniciar sesión
            </Link>
            <Link className="btn sm p" href={RUTAS.registroReciclador}>
              Crear cuenta
            </Link>
          </>
        ) : (
          <>
            {rol === 'reciclador' && (
              <Link className="ib ib-favoritos" href={RUTAS.favoritos} aria-label="Favoritos" title="Favoritos">
                <Icono nombre="i-heart" />
              </Link>
            )}
            {tieneCampana(rol) && <Campana sinLeer={sinLeer} />}
            {rol === 'reciclador' && usuario?.puntos !== undefined && (
              <ChipPuntos puntos={usuario.puntos} href={RUTAS.puntos} />
            )}
            {usuario && <Avatar usuario={usuario} fondo={FONDO_AVATAR[rol]} href={perfil} />}
          </>
        )}
        <button
          type="button"
          className="burger"
          aria-label="Menú"
          aria-expanded={abierto}
          aria-controls="menu-movil"
          onClick={() => setAbierto((valor) => !valor)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className={clases('drw', abierto && 'open')} id="menu-movil">
        {pestanas.map((pestana) => (
          <Link
            key={pestana.clave}
            href={pestana.ruta}
            className={pestana.clave === activa ? 'on' : undefined}
            onClick={(evento) => {
              setAbierto(false);
              bloquear(pestana.clave)(evento);
            }}
          >
            <Icono nombre={pestana.icono} />
            {pestana.texto}
          </Link>
        ))}
        {rol === 'reciclador' && (
          <Link href={RUTAS.favoritos} onClick={() => setAbierto(false)}>
            <Icono nombre="i-heart" />
            Favoritos
          </Link>
        )}
        {tieneCampana(rol) && (
          <Link href={RUTAS.notificaciones} onClick={() => setAbierto(false)}>
            <Icono nombre="i-bell" />
            Notificaciones
          </Link>
        )}
        {esInvitado ? (
          <>
            <Link href={RUTAS.iniciarSesion}>Iniciar sesión</Link>
            <Link href={RUTAS.registroReciclador}>Crear cuenta</Link>
          </>
        ) : (
          MAS[rol].map((grupo) => (
            <div key={grupo.grupo} style={{ display: 'contents' }}>
              <small>{grupo.grupo}</small>
              {grupo.enlaces.map((enlace) => (
                <Link key={enlace.ruta} href={enlace.ruta} onClick={() => setAbierto(false)}>
                  {enlace.texto}
                </Link>
              ))}
            </div>
          ))
        )}
      </div>
      <InvitacionRegistro motivo={bloqueo} alCerrar={() => setBloqueo(null)} />
    </header>
  );
}

function Avatar({ usuario, fondo, href }: { usuario: UsuarioNavegacion; fondo: string; href?: string }) {
  const contenido = (
    <>
      <span className="av" style={{ background: fondo }} aria-hidden="true">
        {usuario.iniciales}
      </span>
      {/* El nombre siempre está disponible para quien usa lector de pantalla, aunque en el celular no se vea */}
      <span className="sr-only">Perfil de {usuario.nombre}</span>
      <span aria-hidden="true">
        {usuario.nombre}
        <small>{usuario.rolTexto}</small>
      </span>
    </>
  );
  return href ? (
    <Link className="me" href={href}>
      {contenido}
    </Link>
  ) : (
    <div className="me">{contenido}</div>
  );
}
