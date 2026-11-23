'use client';

import { formatearFecha } from '@reciclomap/shared';
import { useState } from 'react';
import { ICONO_MATERIAL } from '@/acceso/materiales';
import { useAviso } from '@/diseno/avisos';
import { BarraProgreso, EncabezadoPagina, EstadoVacio, Kpi } from '@/diseno/bloques';
import { Icono } from '@/diseno/icono';
import { MarcoApp } from '@/navegacion/marco-app';
import { FONDO_MATERIAL } from '@/publicaciones/piezas';
import { ErrorApi, pedir } from '@/sesion/api';
import { Protegida } from '@/sesion/protegida';
import { kg } from './piezas';
import type { DesafioMes, RespuestaDesafios } from './tipos';
import { useDatos } from './usar-datos';

// Pantalla 33: los desafíos son mensuales, el progreso se calcula en el servidor y cada uno se reclama una sola vez
function Contenido() {
  const aviso = useAviso();
  const [version, setVersion] = useState(0);
  const [reclamando, setReclamando] = useState<string | null>(null);
  const { datos, fallo } = useDatos<RespuestaDesafios>('/yo/desafios', version);
  if (!datos) {
    return fallo ? (
      <EstadoVacio icono="i-alert" titulo="No pudimos cargar tus desafíos" />
    ) : (
      <span className="girando" role="status" aria-label="Cargando" />
    );
  }
  const porReclamar = datos.datos.filter((d) => d.estado === 'COMPLETADO');
  const reclamados = datos.datos.filter((d) => d.estado === 'RECLAMADO');
  const enProgreso = datos.datos.filter((d) => d.estado === 'EN_PROGRESO');

  const reclamar = async (desafio: DesafioMes) => {
    setReclamando(desafio.id);
    try {
      await pedir(`/yo/desafios/${desafio.id}/reclamar`, { cuerpo: {} });
      aviso(
        desafio.otorgaGiro
          ? `+${desafio.puntos} puntos de bono y 1 giro de la ruleta`
          : `+${desafio.puntos} puntos sumados a tu cuenta`,
      );
      setVersion((v) => v + 1);
    } catch (causa) {
      aviso(causa instanceof ErrorApi ? causa.message : 'No pudimos reclamar el desafío.');
      setVersion((v) => v + 1);
    } finally {
      setReclamando(null);
    }
  };

  return (
    <>
      <EncabezadoPagina
        antetitulo="Puntos y niveles"
        titulo="Desafíos de"
        resaltado={datos.mesTexto}
        descripcion="Metas del mes con puntos extra. Se reinician el día 1 de cada mes."
        acciones={
          <span className="pill blue" style={{ height: 34, fontSize: 13 }}>
            <i />
            Se renuevan en {datos.renuevaEnDias} {datos.renuevaEnDias === 1 ? 'día' : 'días'}
          </span>
        }
      />
      <div className="grid3" style={{ marginBottom: 24 }}>
        <Kpi etiqueta="En progreso" icono="i-activity" valor={enProgreso.length} detalle="desafíos activos" />
        <Kpi
          etiqueta="Por reclamar"
          icono="i-gift"
          valor={porReclamar.length}
          detalle={`${porReclamar.reduce((suma, d) => suma + d.puntos, 0)} puntos listos`}
        />
        <Kpi etiqueta="Reclamados" icono="i-check" valor={reclamados.length} detalle="este mes" />
      </div>
      <div className="list" style={{ gap: 16 }}>
        {datos.datos.length === 0 && <EstadoVacio icono="i-trophy" titulo="Aún no hay desafíos este mes" />}
        {datos.datos.map((d) => {
          const listo = d.estado === 'COMPLETADO';
          const reclamado = d.estado === 'RECLAMADO';
          return (
            <div
              key={d.id}
              data-desafio={d.id}
              data-estado={d.estado}
              className="panel"
              style={{
                padding: '18px 22px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 18,
                alignItems: 'center',
                ...(listo ? { background: '#F3FAE6', boxShadow: '5px 5px 0 var(--g)' } : {}),
              }}
            >
              <span
                className="mi"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: d.material ? FONDO_MATERIAL[d.material.codigo] : 'var(--lime)',
                }}
              >
                <Icono nombre={d.material ? ICONO_MATERIAL[d.material.codigo] : 'i-trophy'} tamano="lg" />
              </span>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div className="row g8 wr">
                  <b style={{ font: '800 19px var(--head)' }}>{d.nombre}</b>
                  {d.esMetaMes && <span className="pill blue">Meta del mes · +1 giro</span>}
                  {d.delMesAnterior && <span className="pill grey">Del mes pasado</span>}
                  {reclamado ? (
                    <span className="pill grey">Reclamado</span>
                  ) : listo ? (
                    <span className="pill open">
                      <i />
                      Completado
                    </span>
                  ) : (
                    <span className="pill warn">
                      <i />
                      En progreso
                    </span>
                  )}
                </div>
                <div className="mini" style={{ margin: '3px 0 10px' }}>
                  {d.descripcion}
                </div>
                <div className="row g16">
                  <div style={{ flex: 1 }}>
                    <BarraProgreso valor={d.progreso} maximo={d.meta} etiqueta={d.nombre} />
                  </div>
                  <b className="mono" style={{ fontSize: 13 }}>
                    {kg(Math.min(d.progreso, d.meta))} / {kg(d.meta)} {d.unidad}
                  </b>
                </div>
                {listo && d.reclamableHasta && d.delMesAnterior && (
                  <p className="mini" style={{ marginTop: 8 }}>
                    Puedes reclamarlo hasta el {formatearFecha(d.reclamableHasta)}.
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'center', minWidth: 130, marginLeft: 'auto' }}>
                <div className="mono" style={{ font: '700 22px var(--mono)' }}>
                  +{d.puntos}
                </div>
                <div className="mini" style={{ marginBottom: 8 }}>
                  puntos
                </div>
                {listo ? (
                  <button
                    type="button"
                    className="btn p sm"
                    disabled={reclamando === d.id}
                    onClick={() => void reclamar(d)}
                    aria-label={`Reclamar ${d.nombre}`}
                  >
                    Reclamar
                  </button>
                ) : reclamado ? (
                  <span className="mini">
                    <Icono nombre="i-check" /> Sumados
                  </span>
                ) : (
                  <span className="mini">
                    Faltan {kg(d.meta - d.progreso)} {d.unidad}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mini" style={{ marginTop: 16 }}>
        Los puntos de los desafíos suman a tu saldo, pero no cuentan para subir de nivel.
      </p>
    </>
  );
}

export function DesafiosReciclador() {
  return (
    <Protegida roles={['RECICLADOR']}>
      <MarcoApp activa="pun">
        <Contenido />
      </MarcoApp>
    </Protegida>
  );
}
