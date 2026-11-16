'use client';

import { useCallback, useEffect, useState } from 'react';
import { pedir } from '@/sesion/api';
import { useSesion } from '@/sesion/sesion';

let cache: Promise<Set<string>> | null = null;

// Los ids de los favoritos del reciclador, para marcar el corazón; el invitado no tiene favoritos
export function useFavoritos() {
  const { usuario } = useSesion();
  const activo = usuario?.rol === 'RECICLADOR';
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    cache ??= pedir<{ ids: string[] }>('/favoritos/ids')
      .then((respuesta) => new Set(respuesta.ids))
      .catch(() => {
        cache = null;
        return new Set<string>();
      });
    void cache.then((conjunto) => vigente && setIds(new Set(conjunto)));
    return () => {
      vigente = false;
    };
  }, [activo]);

  const alternar = useCallback(
    async (compradorId: string): Promise<boolean> => {
      const guardado = ids.has(compradorId);
      if (guardado) await pedir(`/favoritos/${compradorId}`, { metodo: 'DELETE' });
      else await pedir(`/favoritos/${compradorId}`, { metodo: 'PUT' });
      const siguiente = new Set(ids);
      if (guardado) siguiente.delete(compradorId);
      else siguiente.add(compradorId);
      cache = Promise.resolve(siguiente);
      setIds(siguiente);
      return !guardado;
    },
    [ids],
  );

  return { activo, ids, alternar };
}

export function olvidarFavoritos(): void {
  cache = null;
}
