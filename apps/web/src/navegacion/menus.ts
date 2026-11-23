import type { NombreIcono } from '@/diseno/icono';
import { RUTAS } from './rutas';

export type RolNavegacion = 'reciclador' | 'invitado' | 'centro' | 'comprador' | 'admin';

export type Pestana = { clave: string; texto: string; ruta: string; icono: NombreIcono };
export type GrupoMas = { grupo: string; enlaces: Array<{ texto: string; ruta: string }> };

const PESTANAS_RECICLADOR: Pestana[] = [
  { clave: 'mapa', texto: 'Mapa', ruta: RUTAS.mapa, icono: 'i-map' },
  { clave: 'calc', texto: 'Calculadora', ruta: RUTAS.calculadora, icono: 'i-calc' },
  { clave: 'pub', texto: 'Publicar', ruta: RUTAS.publicar, icono: 'i-plus' },
  { clave: 'ofe', texto: 'Ofertas', ruta: RUTAS.ofertas, icono: 'i-gift' },
  { clave: 'pun', texto: 'Puntos', ruta: RUTAS.puntos, icono: 'i-trophy' },
  { clave: 'his', texto: 'Historial', ruta: RUTAS.historial, icono: 'i-clock' },
];

// Pestañas y menú "Más" del prototipo; lo que depende de un negocio u operación se abre desde su contexto
export const PESTANAS: Record<RolNavegacion, Pestana[]> = {
  reciclador: PESTANAS_RECICLADOR,
  invitado: PESTANAS_RECICLADOR,
  centro: [
    { clave: 'res', texto: 'Resumen', ruta: RUTAS.centroResumen, icono: 'i-activity' },
    { clave: 'pre', texto: 'Precios y demanda', ruta: RUTAS.preciosDemanda, icono: 'i-cash' },
    { clave: 'pubs', texto: 'Publicaciones', ruta: RUTAS.publicacionesCercanas, icono: 'i-recycle' },
    { clave: 'plan', texto: 'Plan y avisos', ruta: RUTAS.planAvisos, icono: 'i-star' },
  ],
  comprador: [
    { clave: 'ini', texto: 'Inicio', ruta: RUTAS.compradorInicio, icono: 'i-truck' },
    { clave: 'pubs', texto: 'Publicaciones', ruta: RUTAS.publicacionesCercanas, icono: 'i-recycle' },
    { clave: 'pre', texto: 'Mis precios', ruta: RUTAS.preciosDemanda, icono: 'i-cash' },
    { clave: 'com', texto: 'Mis compras', ruta: RUTAS.compradorCompras, icono: 'i-recycle' },
    { clave: 'est', texto: 'Estadísticas', ruta: RUTAS.compradorEstadisticas, icono: 'i-activity' },
  ],
  admin: [
    { clave: 'dash', texto: 'Panel', ruta: RUTAS.adminPanel, icono: 'i-activity' },
    { clave: 'ver', texto: 'Verificaciones', ruta: RUTAS.adminVerificaciones, icono: 'i-shield' },
    { clave: 'pri', texto: 'Precios', ruta: RUTAS.adminPrecios, icono: 'i-alert' },
    { clave: 'usr', texto: 'Usuarios', ruta: RUTAS.adminUsuarios, icono: 'i-user' },
    { clave: 'rul', texto: 'Premios y puntos', ruta: RUTAS.adminPremios, icono: 'i-gift' },
    { clave: 'ciu', texto: 'Ciudades', ruta: RUTAS.adminCiudades, icono: 'i-map' },
  ],
};

const AYUDA: GrupoMas = {
  grupo: 'Ayuda',
  enlaces: [
    { texto: 'Centro de ayuda', ruta: RUTAS.ayuda },
    { texto: 'Configuración', ruta: RUTAS.configuracion },
    { texto: 'Términos y privacidad', ruta: RUTAS.terminos },
  ],
};

export const MAS: Record<RolNavegacion, GrupoMas[]> = {
  reciclador: [
    {
      grupo: 'Buscar',
      enlaces: [
        { texto: 'Lista de resultados', ruta: RUTAS.lista },
        { texto: 'Búsqueda y filtros', ruta: RUTAS.filtros },
        { texto: 'Comparar compradores', ruta: RUTAS.comparar },
        { texto: 'Avisos de negocios', ruta: RUTAS.avisos },
      ],
    },
    {
      grupo: 'Mis cosas',
      enlaces: [
        { texto: 'Mis publicaciones', ruta: RUTAS.misPublicaciones },
        { texto: 'Entrega directa', ruta: RUTAS.entregasDirectas },
        { texto: 'Reportar problema', ruta: RUTAS.reportarProblema },
        { texto: 'Mis reseñas', ruta: RUTAS.misResenas },
        { texto: 'Mis premios', ruta: RUTAS.misPremios },
        { texto: 'Favoritos', ruta: RUTAS.favoritos },
        { texto: 'Editar perfil', ruta: RUTAS.editarPerfil },
      ],
    },
    {
      grupo: 'Juego',
      enlaces: [
        { texto: 'Mis puntos', ruta: RUTAS.puntos },
        { texto: 'Ruleta', ruta: RUTAS.ruleta },
        { texto: 'Mis premios', ruta: RUTAS.misPremios },
        { texto: 'Mi perfil e insignias', ruta: RUTAS.perfil },
        { texto: 'Niveles', ruta: RUTAS.niveles },
        { texto: 'Desafíos', ruta: RUTAS.desafios },
        { texto: 'Ranking', ruta: RUTAS.ranking },
        { texto: 'Insignias', ruta: RUTAS.insignias },
      ],
    },
    AYUDA,
  ],
  invitado: [],
  centro: [
    {
      grupo: 'Negocio',
      enlaces: [
        { texto: 'Mis ofertas enviadas', ruta: RUTAS.ofertasEnviadas },
        { texto: 'Entregas directas', ruta: RUTAS.entregasRecibidas },
        { texto: 'Datos y horarios', ruta: RUTAS.datosHorarios },
        { texto: 'Reseñas recibidas', ruta: RUTAS.resenasRecibidas },
        { texto: 'Reportes sobre mi negocio', ruta: RUTAS.reportesNegocio },
        { texto: 'Estadísticas', ruta: RUTAS.estadisticasNegocio },
        { texto: 'Historial de compras', ruta: RUTAS.historialCompras },
      ],
    },
    AYUDA,
  ],
  comprador: [
    {
      grupo: 'Mi día',
      enlaces: [
        { texto: 'Zona y ruta del día', ruta: RUTAS.zonaRuta },
        { texto: 'Mis ofertas enviadas', ruta: RUTAS.ofertasEnviadas },
        { texto: 'Entregas directas', ruta: RUTAS.entregasRecibidas },
        { texto: 'Reseñas recibidas', ruta: RUTAS.resenasRecibidas },
        { texto: 'Historial de compras', ruta: RUTAS.historialCompras },
        { texto: 'Mi perfil', ruta: RUTAS.compradorPerfil },
        { texto: 'Plan y avisos', ruta: RUTAS.planAvisos },
      ],
    },
    AYUDA,
  ],
  admin: [
    {
      grupo: 'Control',
      enlaces: [
        { texto: 'Plan Pro', ruta: RUTAS.adminPlan },
        { texto: 'Incidencias de operaciones', ruta: RUTAS.adminIncidencias },
        { texto: 'Reportes de usuarios', ruta: RUTAS.adminReportes },
        { texto: 'Avisos de negocios', ruta: RUTAS.adminAvisos },
        { texto: 'Auditoría', ruta: RUTAS.adminAuditoria },
        { texto: 'Configuración general', ruta: RUTAS.adminConfiguracion },
      ],
    },
    { grupo: 'Ayuda', enlaces: [{ texto: 'Centro de ayuda', ruta: RUTAS.ayuda }] },
  ],
};

export const INICIO: Record<RolNavegacion, string> = {
  reciclador: RUTAS.mapa,
  invitado: RUTAS.mapa,
  centro: RUTAS.centroResumen,
  comprador: RUTAS.compradorInicio,
  admin: RUTAS.adminPanel,
};

// La campana existe para todos los roles con cuenta, también el centro (decisión de Fase 0)
export function tieneCampana(rol: RolNavegacion): boolean {
  return rol !== 'invitado' && rol !== 'admin';
}

// Reciclador e invitado tienen más pestañas: pasan al menú hamburguesa antes, por debajo de 1180 px
export function usaMenuCompacto(rol: RolNavegacion): boolean {
  return rol === 'reciclador' || rol === 'invitado';
}
