const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export type Horario = { dia: number; abre: string; cierra: string };

// [1,2,3,4,5,6] con 08:00–18:00 → "Lun–Sáb 08:00–18:00"; si las horas cambian por día, se listan aparte
export function formatearHorario(horarios: Horario[]): string {
  if (horarios.length === 0) return 'No indicado';
  const grupos = new Map<string, number[]>();
  for (const horario of [...horarios].sort((a, b) => a.dia - b.dia)) {
    const clave = `${horario.abre}–${horario.cierra}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), horario.dia]);
  }
  return [...grupos.entries()]
    .map(([horas, dias]) => {
      const tramos: string[] = [];
      let inicio = dias[0]!;
      let anterior = inicio;
      for (const dia of [...dias.slice(1), Number.NaN]) {
        if (dia === anterior + 1) {
          anterior = dia;
          continue;
        }
        tramos.push(inicio === anterior ? DIAS[inicio]! : `${DIAS[inicio]}–${DIAS[anterior]}`);
        inicio = dia;
        anterior = dia;
      }
      return `${dias.length === 7 ? 'Todos los días' : tramos.join(', ')} ${horas}`;
    })
    .join(' · ');
}

export const TEXTO_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TRANSFERENCIA: 'Transferencia',
};

export const TEXTO_VEHICULO: Record<string, string> = {
  MOTO: 'Moto',
  TRICICLO: 'Triciclo',
  CAMIONETA: 'Camioneta',
  CAMION: 'Camión',
};
