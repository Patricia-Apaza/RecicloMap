// Estado de mantenimiento que consultan las tareas automáticas sin necesidad de inyección: lo mantiene al día OperativoService.
// Durante un mantenimiento las tareas no corren; al terminar, los plazos vigentes se corren lo que duró (extender_plazos_mantenimiento)
let activo = false;

export const enMantenimiento = (): boolean => activo;
export const fijarMantenimiento = (valor: boolean): void => {
  activo = valor;
};
