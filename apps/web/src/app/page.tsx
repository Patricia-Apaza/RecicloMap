import type { CodigoMaterial } from '@reciclomap/shared';
import Link from '@/diseno/enlace';
import { clases } from '@/diseno/clases';
import { Icono, type NombreIcono } from '@/diseno/icono';
import { LogoMarca } from '@/diseno/logo';
import { RUTAS } from '@/navegacion/rutas';
import { AccionesPortada, BotonInvitado, Contador, Revelar } from './bienvenida-cliente';
import { CintaPrecios, RangoMaterial } from './precios-hoy';
import s from './bienvenida.module.css';

const MATERIALES: Array<{ codigo: CodigoMaterial; nombre: string; icono: NombreIcono }> = [
  { codigo: 'pet', nombre: 'PET', icono: 'm-pet' },
  { codigo: 'carton', nombre: 'Cartón', icono: 'm-box' },
  { codigo: 'papel', nombre: 'Papel', icono: 'm-paper' },
  { codigo: 'plastico', nombre: 'Plástico duro', icono: 'm-plastic' },
  { codigo: 'metal', nombre: 'Metales', icono: 'm-metal' },
];

const PARADAS = [
  { titulo: 'Publicas', texto: 'Eliges material y cantidad. Tu publicación dura 7 días.' },
  { titulo: 'Comparas', texto: 'Precio por kg, demanda y distancia, en un solo mapa.' },
  { titulo: 'Recibes ofertas', texto: 'Centros y compradores móviles te ofertan por lo que tienes.' },
  { titulo: 'Aceptas una', texto: 'Eliges la que más te conviene.', candado: true },
  { titulo: 'Coordinas', texto: 'Acuerdan por WhatsApp y cierran el trato fuera de la app.' },
];

// Insignias reales del catálogo: Semilla y tres de las destacadas del perfil
const INSIGNIAS: Array<{ nombre: string; icono: NombreIcono; clase: string | undefined; bloqueada?: boolean }> = [
  { nombre: 'Semilla', icono: 'i-leaf', clase: s.b1 },
  { nombre: 'Racha de 4 semanas', icono: 'i-recycle', clase: s.b2 },
  { nombre: 'Reciclador Confiable', icono: 'i-star', clase: s.b3 },
  { nombre: 'Cazador de precios', icono: 'i-trophy', clase: s.b4, bloqueada: true },
];

function Contorno({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 600" fill="none" aria-hidden="true" focusable="false">
      <use href="/contorno.svg#contour" />
    </svg>
  );
}

function MapaIlustrado() {
  return (
    <div className={s.mapa} aria-label="Mapa de ejemplo con precios" role="img">
      <span className={s.sello}>Ejemplo</span>
      <div className={s.hoja}>
        <svg viewBox="0 0 560 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="560" height="540" fill="#EAEFD7" />
          <g style={{ color: 'rgba(31,90,72,.2)' }}>
            <use href="/contorno.svg#contour" x="-90" y="-90" width="740" height="740" />
          </g>
          <path
            d="M-10 380C70 340 120 420 200 430S300 470 280 560H-10z"
            fill="#BFDDEE"
            stroke="#12301F"
            strokeOpacity=".25"
            strokeWidth="2"
          />
          <g fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round">
            <path d="M-10 190C110 170 200 240 330 200S500 150 570 190" />
            <path d="M180 -10C200 120 150 260 210 400" />
            <path d="M400 -10C390 100 440 240 420 400S470 520 480 560" />
          </g>
          <g fill="none" stroke="#12301F" strokeOpacity=".08" strokeWidth="2">
            <path d="M0 110H560M0 300H560M300 0V540M90 0V540" />
          </g>
          <path
            d="M112 392C150 300 220 270 290 278S420 190 452 160"
            fill="none"
            stroke="#1E8A57"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="1 12"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="1.1s" repeatCount="indefinite" />
          </path>
        </svg>
      </div>
      <div className={`${s.burbuja} ${s.p1}`}>
        <span className={s.etiqueta}>
          <b>Tú</b>
          <small>Reciclador · PET 40 kg</small>
        </span>
        <span className={s.pin}>
          <Icono nombre="i-recycle" />
        </span>
        <span className={s.anillo} />
      </div>
      <div className={`${s.burbuja} ${s.p2}`}>
        <span className={s.etiqueta}>
          <b>S/ 2.60</b>
          <span className="tag best">
            <Icono nombre="i-check" tamano="sm" />
            Mejor precio
          </span>
        </span>
        <span className={s.pin}>
          <Icono nombre="i-building" />
        </span>
        <span className={s.anillo} />
      </div>
      <div className={`${s.burbuja} ${s.p3}`}>
        <span className={s.etiqueta}>
          <b>S/ 2.40</b>
          <span className="tag mid">
            <Icono nombre="i-activity" tamano="sm" />
            Precio intermedio
          </span>
        </span>
        <span className={s.pin}>
          <Icono nombre="i-truck" />
        </span>
        <span className={s.anillo} />
      </div>
      <div className={`${s.calco} ${s.k1}`}>
        <Icono nombre="i-star" tamano="sm" />
        +1 punto por kg
      </div>
      <div className={`${s.calco} ${s.k2}`}>
        <Icono nombre="i-lock" tamano="sm" />
        Ubicación aproximada
      </div>
      <div className={s.ticket}>
        <div className={s.ticketCabeza}>
          <span>
            <i className={s.vivo} />
            Oferta recibida
          </span>
          <span>≈ 1,2 km</span>
        </div>
        <div className={s.ticketFila}>
          <span className={s.ticketAvatar}>
            <Icono nombre="i-building" />
          </span>
          <span className={s.ticketTexto}>
            <b>Acopio Titicaca</b>
            <span>Centro de acopio</span>
          </span>
          <span className={s.ticketPrecio}>
            <b>S/ 2.60/kg</b>
            <span className="dem d3">
              <span className="bars">
                <i />
                <i />
                <i />
              </span>
              Demanda
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Bienvenida() {
  return (
    <div className={s.pagina}>
      <header className={s.nav}>
        <div className={s.wrap}>
          <Link className={s.marca} href={RUTAS.bienvenida} aria-label="RecicloMap, inicio">
            <LogoMarca />
            <span>
              Reciclo<em>Map</em>
            </span>
          </Link>
          <nav className={s.enlaces} aria-label="Secciones">
            <a href="#roles">Roles</a>
            <a href="#ruta">La ruta</a>
            <a href="#datos">Datos</a>
            <a href="#materiales">Materiales</a>
            <a href="#puntos">Puntos</a>
          </nav>
          <div className={s.acciones}>
            <AccionesPortada
              claseBlanco={`${s.boton} ${s.blanco} ${s.chico}`}
              clasePrincipal={`${s.boton} ${s.principal} ${s.chico}`}
            />
          </div>
        </div>
      </header>

      <Revelar>
        <main>
          <section className={s.hero}>
            <Contorno className={s.contorno} />
            <div className={s.wrap}>
              <div>
                <span className={`${s.kicker} ${s.aparece} ${s.d1}`}>Economía circular · Juliaca, Puno</span>
                <h1 className={`${s.aparece} ${s.d2}`}>
                  Sabe quién compra tu material,{' '}
                  <span className={s.marcado}>
                    <svg viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M3 10C60 3 110 14 160 8S250 4 297 9" />
                    </svg>
                    <b>cuánto paga</b>
                  </span>{' '}
                  y dónde.
                </h1>
                <p className={`${s.lead} ${s.aparece} ${s.d3}`}>
                  Compara precios y demanda en el mapa. Publica lo que tienes y recibe ofertas de centros de acopio y
                  compradores móviles.
                </p>
                <div className={`${s.cta} ${s.aparece} ${s.d4}`}>
                  <a className={`${s.boton} ${s.principal}`} href="#roles">
                    Crear mi cuenta
                    <Icono nombre="i-arrow-right" tamano="sm" />
                  </a>
                  <BotonInvitado className={`${s.boton} ${s.blanco}`} />
                </div>
                <div className={`${s.chips} ${s.aparece} ${s.d5}`}>
                  {MATERIALES.map((material) => (
                    <span key={material.nombre} className={s.chip}>
                      <Icono nombre={material.icono} />
                      {material.nombre}
                    </span>
                  ))}
                </div>
              </div>
              <MapaIlustrado />
            </div>
          </section>

          <CintaPrecios clases={{ cinta: s.cinta, fila: s.cintaFila, item: s.cintaItem }} />

          <section className={s.seccion} id="roles">
            <div className={s.wrap}>
              <span className={`${s.kicker} ${s.revela}`} data-revela>
                Elige tu rol
              </span>
              <h2 className={`${s.revela} ${s.s1}`} data-revela>
                ¿Cómo vas a usar <br />
                RecicloMap?
              </h2>
              <p className={`${s.sub} ${s.revela} ${s.s2}`} data-revela>
                Cada rol tiene su propio registro. Si solo quieres mirar, entra como invitado.
              </p>
              <div className={s.roles}>
                <Link className={`${s.rol} ${s.r1} ${s.revela}`} href={RUTAS.registroReciclador} data-revela>
                  <svg className={s.grande} aria-hidden="true">
                    <use href="/iconos.svg#i-recycle" />
                  </svg>
                  <span className={s.rolIcono}>
                    <Icono nombre="i-user" tamano="lg" />
                  </span>
                  <h3>Soy reciclador</h3>
                  <p>
                    Compara precios cerca de ti, publica lo que tienes y recibe ofertas. Tu ubicación exacta nunca es
                    pública.
                  </p>
                  <span className={s.ir}>
                    Crear mi cuenta
                    <i>
                      <Icono nombre="i-arrow-right" tamano="sm" />
                    </i>
                  </span>
                </Link>
                <Link className={`${s.rol} ${s.r2} ${s.revela} ${s.s1}`} href={RUTAS.registroCentro} data-revela>
                  <svg className={s.grande} aria-hidden="true">
                    <use href="/iconos.svg#i-store" />
                  </svg>
                  <span className={s.rolIcono}>
                    <Icono nombre="i-building" tamano="lg" />
                  </span>
                  <h3>Soy centro de acopio</h3>
                  <p>Muestra tus precios y tu demanda, y recibe material cerca. Los precios los mantienes tú.</p>
                  <span className={s.ir}>
                    Registrar mi centro
                    <i>
                      <Icono nombre="i-arrow-right" tamano="sm" />
                    </i>
                  </span>
                </Link>
                <Link className={`${s.rol} ${s.r3} ${s.revela} ${s.s2}`} href={RUTAS.registroComprador} data-revela>
                  <svg className={s.grande} aria-hidden="true">
                    <use href="/iconos.svg#i-truck" />
                  </svg>
                  <span className={s.rolIcono}>
                    <Icono nombre="i-truck" tamano="lg" />
                  </span>
                  <h3>Soy comprador móvil</h3>
                  <p>
                    Ofrece por el material de tu zona de trabajo. Apareces con ubicación aproximada, no en tiempo real.
                  </p>
                  <span className={s.ir}>
                    Crear mi perfil
                    <i>
                      <Icono nombre="i-arrow-right" tamano="sm" />
                    </i>
                  </span>
                </Link>
              </div>
              <div className={`${s.invitado} ${s.revela}`} data-revela>
                <p>
                  <b>¿Solo quieres mirar?</b> Como invitado ves el mapa, los precios y la calculadora. Para publicar y
                  ganar puntos necesitas cuenta.
                </p>
                <BotonInvitado className={`${s.boton} ${s.blanco} ${s.chico}`} />
              </div>
            </div>
          </section>

          <section className={s.seccion} id="ruta">
            <div className={s.wrap}>
              <span className={`${s.kicker} ${s.revela}`} data-revela>
                La ruta del material
              </span>
              <h2 className={`${s.revela} ${s.s1}`} data-revela>
                Del saco al trato, <br />
                en cinco paradas.
              </h2>
              <p className={`${s.sub} ${s.revela} ${s.s2}`} data-revela>
                Sin pagos dentro de la app y sin seguimiento en tiempo real: tú decides con quién cerrar el trato.
              </p>
              <div className={`${s.ruta} ${s.revela}`} data-revela>
                <div className={s.rutaLinea} />
                <div className={s.rutaRelleno} />
                <ol className={s.paradas} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {PARADAS.map((parada, indice) => (
                    <li key={parada.titulo} className={s.parada}>
                      <div className={s.paradaPin}>
                        <b>{indice + 1}</b>
                      </div>
                      <h3>{parada.titulo}</h3>
                      <p>{parada.texto}</p>
                      {parada.candado && (
                        <span className={s.candado}>
                          <Icono nombre="i-lock" tamano="sm" />
                          Ahí ves el punto exacto
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section className={s.datos} id="datos">
            <Contorno className={s.contornoDatos} />
            <div className={s.wrap}>
              <span className={`${s.kicker} ${s.revela}`} data-revela>
                Los datos de Juliaca
              </span>
              <h2 className={`${s.revela} ${s.s1}`} data-revela>
                Vender sin saber el precio cuesta dinero.
              </h2>
              <div className={s.cifras}>
                <div className={`${s.cifra} ${s.revela}`} data-revela>
                  <div className={s.numero}>
                    <Contador valor={76} />
                    <small>%</small>
                  </div>
                  <p>no conoce el precio del material antes de salir a venderlo.</p>
                </div>
                <div className={`${s.cifra} ${s.revela} ${s.s1}`} data-revela>
                  <div className={s.numero}>
                    <Contador valor={92} />
                    <small>%</small>
                  </div>
                  <p>de los recicladores encuestados valora tener una herramienta como RecicloMap.</p>
                </div>
                <div className={`${s.cifra} ${s.revela} ${s.s2}`} data-revela>
                  <div className={s.numero}>
                    <Contador valor={4.06} decimales={2} />
                    <small>/5</small>
                  </div>
                  <p>fue la utilidad promedio que le dieron a la idea.</p>
                </div>
              </div>
              <p className={s.fuente}>
                Fuente: encuesta propia, 17 respuestas en Juliaca (25/08 al 05/09/2026): 12 recicladores, 3 centros de
                acopio y 2 de otros perfiles. El 76 % se calcula sobre las 17 respuestas y el 92 % sobre los 12
                recicladores.
              </p>
            </div>
          </section>

          <section className={s.seccion} id="materiales">
            <div className={s.wrap}>
              <span className={`${s.kicker} ${s.revela}`} data-revela>
                Materiales
              </span>
              <h2 className={`${s.revela} ${s.s1}`} data-revela>
                Cinco materiales, <br />
                un solo mapa.
              </h2>
              <p className={`${s.sub} ${s.revela} ${s.s2}`} data-revela>
                El semáforo compara el precio de un material entre quienes lo compran. La demanda se muestra aparte, con
                barras azules.
              </p>
              <div className={s.materiales}>
                {MATERIALES.map((material, indice) => {
                  return (
                    <div
                      key={material.nombre}
                      className={`${s.material} ${s.revela} ${[s.s1, s.s2, s.s3, s.s4][indice - 1] ?? ''}`}
                      data-revela
                    >
                      <div className={s.materialIcono}>
                        <Icono nombre={material.icono} tamano="lg" />
                      </div>
                      <h3>{material.nombre}</h3>
                      <RangoMaterial codigo={material.codigo} clase={s.precio} />
                    </div>
                  );
                })}
              </div>
              <p className={s.nota}>
                Rangos de hoy en Juliaca, entre los precios que publican los centros y compradores verificados. El
                semáforo compara un mismo material entre quienes lo compran, nunca un material con otro.
              </p>
            </div>
          </section>

          <section className={s.seccion} id="puntos">
            <div className={s.wrap}>
              <span className={`${s.kicker} ${s.revela}`} data-revela>
                Recicla y gana
              </span>
              <h2 className={`${s.revela} ${s.s1}`} data-revela>
                Cada kilo suma. <br />
                Cada 500 puntos, un giro.
              </h2>
              <div className={s.puntos}>
                <div className={`${s.ruleta} ${s.revela}`} data-revela>
                  <div className={s.rueda}>
                    <span className={s.puntero} />
                    <div className={s.disco} />
                    <div className={s.eje}>
                      <Icono nombre="i-gift" tamano="lg" />
                    </div>
                  </div>
                  <h3>1 giro por cada 500 puntos</h3>
                  <p>Reciclas, sumas puntos y giras la rueda para ganar premios.</p>
                </div>
                <div className={s.reglas}>
                  <div className={`${s.progreso} ${s.revela} ${s.s1}`} data-revela>
                    <div className={s.progresoCabeza}>
                      <b>468</b>
                      <span>de 500 puntos · te faltan 32 · ejemplo</span>
                    </div>
                    <div className={s.pista}>
                      <i />
                    </div>
                    <div className={s.reglasPuntos}>
                      <div className={s.regla}>
                        <span className={s.reglaIcono}>
                          <Icono nombre="i-recycle" />
                        </span>
                        <span>
                          <b>1 punto</b> por cada kg que reciclas
                        </span>
                      </div>
                      <div className={s.regla}>
                        <span className={s.reglaIcono}>
                          <Icono nombre="i-gift" />
                        </span>
                        <span>
                          <b>1 giro</b> por cada 500 puntos
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`${s.insignias} ${s.revela} ${s.s2}`} data-revela>
                    <h4>Insignias que puedes ganar</h4>
                    {INSIGNIAS.map((insignia) => (
                      <div key={insignia.nombre} className={clases(s.insignia, insignia.clase)}>
                        <i>
                          <Icono nombre={insignia.icono} tamano="lg" />
                        </i>
                        {insignia.nombre}
                        {insignia.bloqueada && <span className="sr-only"> (aún bloqueada)</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={s.final}>
            <div className={s.wrap}>
              <div className={`${s.tarjetaFinal} ${s.revela}`} data-revela>
                <div>
                  <h2>Empieza a reciclar con mejor información.</h2>
                  <p>Crea tu cuenta gratis o entra como invitado para ver el mapa y los precios.</p>
                  <div className={s.accionesFinal}>
                    <a className={`${s.boton} ${s.principal}`} href="#roles">
                      Crear mi cuenta
                      <Icono nombre="i-arrow-right" tamano="sm" />
                    </a>
                    <Link className={`${s.boton} ${s.blanco}`} href={RUTAS.iniciarSesion}>
                      Iniciar sesión
                    </Link>
                  </div>
                </div>
                <div className={s.arte} aria-hidden="true">
                  <LogoMarca tamano={230} />
                  <span className={s.sombra} />
                </div>
              </div>
            </div>
          </section>
        </main>
      </Revelar>

      <footer className={s.pie}>
        <div className={s.wrap}>
          <div className={s.pieRejilla}>
            <div>
              <Link className={s.marca} href={RUTAS.bienvenida}>
                <LogoMarca />
                <span>
                  Reciclo<em>Map</em>
                </span>
              </Link>
              <p>Mercado local de reciclaje en Juliaca, Puno. Hecho con datos de recicladores locales.</p>
            </div>
            <div>
              <h4>Producto</h4>
              <a href="#ruta">La ruta</a>
              <a href="#materiales">Materiales</a>
              <a href="#puntos">Puntos e insignias</a>
            </div>
            <div>
              <h4>Roles</h4>
              <Link href={RUTAS.registroReciclador}>Reciclador</Link>
              <Link href={RUTAS.registroCentro}>Centro de acopio</Link>
              <Link href={RUTAS.registroComprador}>Comprador móvil</Link>
            </div>
            <div>
              <h4>Cuenta</h4>
              <Link href={RUTAS.iniciarSesion}>Iniciar sesión</Link>
              <Link href={RUTAS.recuperar}>Recuperar contraseña</Link>
              <Link href={RUTAS.terminos}>Términos y privacidad</Link>
            </div>
          </div>
          <div className={s.legal}>
            <span>SIN PAGOS NI GPS EN TIEMPO REAL</span>
            <span>HECHO EN JULIACA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
