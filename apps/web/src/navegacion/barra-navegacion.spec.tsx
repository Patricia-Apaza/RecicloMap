import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarraNavegacion } from './barra-navegacion';
import { FranjaInvitado } from './franja-invitado';

afterEach(cleanup);

const pestanas = () =>
  within(screen.getByRole('navigation', { name: 'Principal' }))
    .getAllByRole('link')
    .map((enlace) => enlace.textContent);

describe('BarraNavegacion', () => {
  it('reciclador: seis pestañas, favoritos, campana, puntos y perfil', () => {
    render(
      <BarraNavegacion
        rol="reciclador"
        activa="mapa"
        sinLeer={5}
        usuario={{ nombre: 'Marco Q.', iniciales: 'MQ', rolTexto: 'Reciclador', puntos: 468 }}
      />,
    );
    expect(pestanas().slice(0, 6)).toEqual(['Mapa', 'Calculadora', 'Publicar', 'Ofertas', 'Puntos', 'Historial']);
    expect(screen.getAllByRole('link', { name: 'Favoritos' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Notificaciones, 5 sin leer' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '468 puntos' })).toBeTruthy();
    expect(screen.getByText('Mapa', { selector: '.tabs a.on' })).toBeTruthy();
  });

  it('invitado: sin menú "Más", con iniciar sesión y crear cuenta', () => {
    render(<BarraNavegacion rol="invitado" activa="mapa" />);
    expect(screen.queryByText('Más')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Iniciar sesión' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Crear cuenta' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Notificaciones/ })).toBeNull();
  });

  it('centro: cuatro pestañas y campana', () => {
    render(
      <BarraNavegacion
        rol="centro"
        usuario={{ nombre: 'Acopio Titicaca', iniciales: 'AT', rolTexto: 'Centro de acopio' }}
      />,
    );
    expect(pestanas().slice(0, 4)).toEqual(['Resumen', 'Precios y demanda', 'Publicaciones', 'Plan y avisos']);
    expect(document.querySelector('.acts a.ib[href="/notificaciones"]')).toBeTruthy();
  });

  it('comprador móvil: cinco pestañas y su menú "Mi día"', () => {
    render(<BarraNavegacion rol="comprador" />);
    expect(pestanas().slice(0, 5)).toEqual(['Inicio', 'Publicaciones', 'Mis precios', 'Mis compras', 'Estadísticas']);
    expect(screen.getAllByText('Mi día').length).toBeGreaterThan(0);
  });

  it('administración: seis pestañas y sin campana', () => {
    render(<BarraNavegacion rol="admin" />);
    expect(pestanas().slice(0, 6)).toEqual([
      'Panel',
      'Verificaciones',
      'Precios',
      'Usuarios',
      'Premios y puntos',
      'Ciudades',
    ]);
    expect(screen.queryByRole('link', { name: /Notificaciones/ })).toBeNull();
  });

  it('la hamburguesa abre y cierra el menú', () => {
    const { container } = render(<BarraNavegacion rol="reciclador" />);
    const boton = screen.getByRole('button', { name: 'Menú' });
    const menu = container.querySelector('#menu-movil');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.classList.contains('open')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu?.classList.contains('open')).toBe(false);
  });
});

describe('FranjaInvitado', () => {
  it('invita a crear cuenta y se puede cerrar', () => {
    render(<FranjaInvitado />);
    expect(screen.getByText('Estás viendo como invitado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByText('Estás viendo como invitado.')).toBeNull();
  });
});

describe('Invitado intentando una acción que exige cuenta', () => {
  it('Publicar no navega: invita a crear una cuenta', () => {
    render(<BarraNavegacion rol="invitado" activa="mapa" />);
    const publicar = within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', {
      name: 'Publicar',
    });
    fireEvent.click(publicar);
    const ventana = screen.getByRole('dialog', { name: 'Crea tu cuenta gratis' });
    expect(within(ventana).getByText(/Para publicar tu material necesitas una cuenta/)).toBeTruthy();
    expect(within(ventana).getByRole('link', { name: 'Crear cuenta de reciclador' }).getAttribute('href')).toBe(
      '/registro/reciclador',
    );
    fireEvent.click(within(ventana).getByRole('button', { name: 'Seguir mirando como invitado' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el mapa y la calculadora siguen abiertos para el invitado', () => {
    render(<BarraNavegacion rol="invitado" activa="mapa" />);
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Calculadora' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
