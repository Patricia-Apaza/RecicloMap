import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

type Pagina = {
  nombre: string;
  ruta: string;
  limiteKb: number | null;
  activa: boolean;
  almacenamiento?: Record<string, string>;
  bloquear?: string[];
};
type Recurso = { url: string; tipo: string; bytes: number };
type Medicion = { pagina: Pagina; totalKb: number; porTipo: Record<string, number>; fuentes: Recurso[] };

const PUERTO = 3200;
const BASE = `http://localhost:${PUERTO}`;
const RAIZ = path.resolve(import.meta.dirname, '..');
const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

const TIPOS: Record<string, string> = {
  document: 'HTML',
  script: 'JavaScript',
  stylesheet: 'CSS',
  font: 'Tipografías',
  image: 'Imágenes',
  fetch: 'Precarga',
};

async function esperarServidor(): Promise<void> {
  for (let intento = 0; intento < 60; intento++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // Todavía arrancando
    }
    await new Promise((resolver) => setTimeout(resolver, 1000));
  }
  throw new Error('La web no arrancó. ¿Ejecutaste "pnpm build" antes?');
}

async function medir(pagina: Pagina): Promise<Medicion> {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ serviceWorkers: 'block' });
  // Estado previo de la visita (por ejemplo, modo invitado con una zona elegida)
  if (pagina.almacenamiento) {
    await contexto.addInitScript((valores: Record<string, string>) => {
      for (const [clave, valor] of Object.entries(valores)) localStorage.setItem(clave, valor);
    }, pagina.almacenamiento);
  }
  for (const patron of pagina.bloquear ?? []) await contexto.route(patron, (ruta) => ruta.abort());
  const pestana = await contexto.newPage();
  const respuestas: Promise<Recurso | null>[] = [];

  pestana.on('requestfinished', (solicitud) => {
    respuestas.push(
      solicitud
        .sizes()
        .then((tamanos) => ({
          url: solicitud.url(),
          tipo: solicitud.resourceType(),
          bytes: tamanos.responseBodySize + tamanos.responseHeadersSize,
        }))
        .catch(() => null),
    );
  });

  await pestana.goto(BASE + pagina.ruta, { waitUntil: 'load' });
  // Margen para lo que la página pide justo después de cargar
  await pestana.waitForTimeout(3000);
  const recursos = (await Promise.all(respuestas)).filter((recurso): recurso is Recurso => recurso !== null);
  await navegador.close();

  const porTipo: Record<string, number> = {};
  for (const recurso of recursos) {
    const tipo = TIPOS[recurso.tipo] ?? 'Otros';
    porTipo[tipo] = (porTipo[tipo] ?? 0) + recurso.bytes;
  }
  return {
    pagina,
    totalKb: kb(recursos.reduce((suma, recurso) => suma + recurso.bytes, 0)),
    porTipo: Object.fromEntries(Object.entries(porTipo).map(([tipo, bytes]) => [tipo, kb(bytes)])),
    fuentes: recursos.filter((recurso) => recurso.tipo === 'font'),
  };
}

function informe(mediciones: Medicion[]): { texto: string; fallas: string[] } {
  const lineas: string[] = ['## Peso de las páginas', ''];
  const fallas: string[] = [];
  lineas.push('| Página | Total | Límite | HTML | JS | CSS | Tipografías | Imágenes | Precarga | Otros |');
  lineas.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const { pagina, totalKb, porTipo } of mediciones) {
    const excedida = pagina.limiteKb !== null && totalKb > pagina.limiteKb;
    if (excedida) fallas.push(`${pagina.nombre}: ${totalKb} KB, límite ${pagina.limiteKb} KB`);
    const limite = pagina.limiteKb === null ? 'solo informa' : `${pagina.limiteKb} KB${excedida ? ' ❌' : ' ✅'}`;
    const celda = (tipo: string) => `${porTipo[tipo] ?? 0} KB`;
    lineas.push(
      `| ${pagina.nombre} (\`${pagina.ruta}\`) | **${totalKb} KB** | ${limite} | ${celda('HTML')} | ${celda('JavaScript')} | ${celda('CSS')} | ${celda('Tipografías')} | ${celda('Imágenes')} | ${celda('Precarga')} | ${celda('Otros')} |`,
    );
  }
  const primera = mediciones[0];
  if (primera) {
    lineas.push('', `### Tipografías descargadas en ${primera.pagina.nombre}`, '');
    lineas.push('| Archivo | Peso |', '|---|---|');
    for (const fuente of primera.fuentes) {
      lineas.push(`| \`${path.basename(new URL(fuente.url).pathname)}\` | ${kb(fuente.bytes)} KB |`);
    }
    lineas.push(`| **Total** | **${kb(primera.fuentes.reduce((suma, fuente) => suma + fuente.bytes, 0))} KB** |`);
  }
  return { texto: lineas.join('\n'), fallas };
}

// El servidor corre dentro de un intérprete de comandos: hay que cerrar todo el árbol de procesos
function detener(servidor: ChildProcess): void {
  if (!servidor.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(servidor.pid), '/T', '/F']);
  } else {
    process.kill(-servidor.pid, 'SIGTERM');
  }
}

async function principal(): Promise<void> {
  const presupuesto = JSON.parse(readFileSync(path.join(RAIZ, 'presupuesto-peso.json'), 'utf8')) as {
    paginas: Pagina[];
  };
  const servidor = spawn(`pnpm exec next start --port ${PUERTO}`, {
    cwd: RAIZ,
    shell: true,
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });
  try {
    await esperarServidor();
    const mediciones: Medicion[] = [];
    for (const pagina of presupuesto.paginas.filter((candidata) => candidata.activa)) {
      mediciones.push(await medir(pagina));
    }
    const { texto, fallas } = informe(mediciones);
    console.log(texto);
    mkdirSync(path.join(RAIZ, '.peso'), { recursive: true });
    writeFileSync(path.join(RAIZ, '.peso', 'informe.json'), JSON.stringify(mediciones, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`);
    const pendientes = presupuesto.paginas.filter((pagina) => !pagina.activa).map((pagina) => pagina.nombre);
    if (pendientes.length) console.log(`\nAún sin construir, se medirán cuando existan: ${pendientes.join(', ')}.`);
    if (fallas.length) {
      console.error(`\nSe superó el presupuesto de peso:\n- ${fallas.join('\n- ')}`);
      process.exitCode = 1;
    }
  } finally {
    detener(servidor);
  }
}

await principal();
