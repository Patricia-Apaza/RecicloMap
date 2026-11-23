import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Estrellas, Kpi, Reputacion } from './bloques';
import { Boton } from './boton';
import { EtiquetaDemanda, EtiquetaDestacadoPro, EtiquetaSemaforo, Pildora } from './etiquetas';
import { Campo, Segmentado } from './formulario';

afterEach(cleanup);

describe('EtiquetaSemaforo', () => {
  it.each([
    ['MEJOR', 'Mejor precio'],
    ['INTERMEDIO', 'Precio intermedio'],
    ['BAJO', 'Precio bajo'],
    ['SIN_COMPARACION', 'Sin comparación'],
  ] as const)('%s siempre muestra el texto "%s"', (semaforo, texto) => {
    render(<EtiquetaSemaforo semaforo={semaforo} />);
    expect(screen.getByText(texto)).toBeTruthy();
  });

  it('la versión corta también lleva texto', () => {
    render(<EtiquetaSemaforo semaforo="INTERMEDIO" corto />);
    expect(screen.getByText('Intermedio')).toBeTruthy();
  });

  it('usa los íconos de la guía de estilo', () => {
    const { container } = render(<EtiquetaSemaforo semaforo="MEJOR" />);
    expect(container.querySelector('use')?.getAttribute('href')).toBe('/iconos.svg#i-tick');
  });
});

describe('EtiquetaDemanda', () => {
  it.each([
    ['ALTA', 'Demanda alta', 'd3'],
    ['MEDIA', 'Demanda media', 'd2'],
    ['BAJA', 'Demanda baja', 'd1'],
  ] as const)('%s muestra "%s" con barras azules', (demanda, texto, clase) => {
    const { container } = render(<EtiquetaDemanda demanda={demanda} />);
    expect(screen.getByText(texto)).toBeTruthy();
    expect(container.firstElementChild?.classList.contains(clase)).toBe(true);
    expect(container.firstElementChild?.classList.contains('tag')).toBe(false);
  });

  it('sin texto visible, sigue siendo legible para lectores de pantalla', () => {
    render(<EtiquetaDemanda demanda="ALTA" conTexto={false} />);
    expect(screen.getByRole('img', { name: 'Demanda alta' })).toBeTruthy();
  });
});

describe('Boton', () => {
  it('aplica la variante y el tamaño', () => {
    render(
      <Boton variante="principal" pequeno>
        Publicar
      </Boton>,
    );
    const boton = screen.getByRole('button', { name: 'Publicar' });
    expect(boton.className).toBe('btn p sm');
    expect(boton.getAttribute('type')).toBe('button');
  });

  it('deshabilitado no responde', () => {
    const alPresionar = vi.fn();
    render(
      <Boton disabled onClick={alPresionar}>
        Girar
      </Boton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Girar' }));
    expect(alPresionar).not.toHaveBeenCalled();
  });
});

describe('Pildora y reputación', () => {
  it('la píldora Pro usa su estilo propio', () => {
    const { container } = render(<Pildora tono="pro">Pro</Pildora>);
    expect(container.firstElementChild?.className).toBe('pill pro');
  });

  it('con menos de 3 calificaciones muestra "Nuevo"', () => {
    render(<Reputacion promedio={5} cantidad={2} />);
    expect(screen.getByText('Nuevo')).toBeTruthy();
  });

  it('con 3 o más muestra el promedio', () => {
    render(<Reputacion promedio={4.66} cantidad={23} />);
    expect(screen.getByText('4.7')).toBeTruthy();
  });

  it('las estrellas describen el valor', () => {
    render(<Estrellas valor={4.6} cantidad={23} />);
    expect(screen.getByRole('img', { name: '4.6 de 5 estrellas, 23 calificaciones' })).toBeTruthy();
  });
});

describe('Kpi', () => {
  it('muestra etiqueta, valor y detalle', () => {
    render(<Kpi etiqueta="Kg reciclados" valor="468" detalle="solo completadas" fondo="sky" />);
    expect(screen.getByText('Kg reciclados')).toBeTruthy();
    expect(screen.getByText('468')).toBeTruthy();
    expect(screen.getByText('solo completadas')).toBeTruthy();
  });
});

describe('Campo', () => {
  it('asocia la etiqueta y anuncia el error', () => {
    render(<Campo etiqueta="Kilos" error="Escribe un peso entre 1 y 5 000 kg." />);
    const entrada = screen.getByLabelText('Kilos');
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    const idError = entrada.getAttribute('aria-describedby');
    expect(document.getElementById(idError ?? '')?.textContent).toContain('Escribe un peso');
  });
});

describe('Segmentado', () => {
  it('marca la opción elegida y avisa el cambio', () => {
    const alCambiar = vi.fn();
    render(
      <Segmentado
        etiqueta="Periodo"
        valor="7"
        alCambiar={alCambiar}
        opciones={[
          { valor: '7', texto: '7 días' },
          { valor: '30', texto: '30 días' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: '7 días' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '30 días' }));
    expect(alCambiar).toHaveBeenCalledWith('30');
  });
});

describe('EtiquetaDestacadoPro', () => {
  it('tiene siempre el mismo texto y aclara que es un plan, no una recomendación neutral', () => {
    render(<EtiquetaDestacadoPro />);
    const etiqueta = screen.getByText('Destacado · Plan Pro');
    expect(etiqueta.getAttribute('title')).toContain('no una recomendación neutral');
  });
});
