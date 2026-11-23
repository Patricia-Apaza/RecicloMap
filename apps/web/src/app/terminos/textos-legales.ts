import { ELIMINACION_GRACIA_DIAS, RETENCION_DIAS, VERSION_TEXTOS_LEGALES } from '@reciclomap/shared';

// Texto provisional, pendiente de revisión legal: cambiarlo no requiere tocar la pantalla.
// Si cambia el fondo de un texto, sube VERSION_TEXTOS_LEGALES en packages/shared para pedir una nueva aceptación.
export const ACTUALIZADO = 'diciembre de 2026';
export const VERSION = VERSION_TEXTOS_LEGALES;
// En el texto, {correo} se reemplaza por el correo de soporte configurado
export const MARCA_CORREO = '{correo}';

export const SECCIONES: Array<{ id: string; titulo: string; parrafos: string[]; pendiente?: string }> = [
  {
    id: 'uso',
    titulo: '1. Qué es RecicloMap',
    parrafos: [
      'RecicloMap es una plataforma que conecta a recicladores con centros de acopio y compradores móviles en Juliaca. Muestra precios, horarios y publicaciones. No compra ni vende material, no cobra comisiones y no procesa pagos: cada trato se paga en persona, fuera de la app.',
    ],
  },
  {
    id: 'cuentas',
    titulo: '2. Cuentas, edad y verificación',
    parrafos: [
      'Puedes explorar sin cuenta. Para publicar, ofertar, calificar o guardar necesitas registrarte con tu teléfono, que verificamos con un código por SMS. El correo es opcional.',
      'Al registrarte aceptas estos Términos y la Política de privacidad, y declaras ser mayor de 18 años. Guardamos qué versión aceptaste y cuándo. Si cambiamos estos textos, te pediremos aceptarlos de nuevo antes de seguir usando la app.',
      'Los centros de acopio y compradores móviles deben ser verificados por un administrador antes de aparecer en el mapa.',
    ],
  },
  {
    id: 'precios',
    titulo: '3. Precios y semáforo',
    parrafos: [
      'Cada negocio fija y actualiza sus propios precios. El semáforo solo compara un precio con los demás visibles; no es una opinión sobre si es justo. Los administradores pueden marcar un precio, pedir su corrección o suspender su visibilidad con un motivo registrado, pero nunca lo modifican.',
    ],
  },
  {
    id: 'ubicacion',
    titulo: '4. Ubicación',
    parrafos: [
      'Te pedimos la ubicación de tu celular solo en el momento en que la necesitas (por ejemplo, al abrir el mapa o al publicar material) y te explicamos para qué: calcular la distancia a centros y compradores. Si no das permiso, eliges tu zona a mano y la app funciona igual.',
      'Tu ubicación exacta nunca se muestra a otras personas ni sale de nuestros servidores. Los compradores ven tu ciudad y una distancia aproximada: menos de 1 km, de 1 a 2 km, de 2 a 5 km o más de 5 km. El punto de cada publicación se guarda en el servidor solo para calcular esas distancias.',
      'Tu WhatsApp y el punto de encuentro que tú escribes se comparten únicamente con quien aceptaste una oferta, para coordinar la entrega. Los compradores móviles aparecen en el mapa con una ubicación aproximada, nunca en tiempo real, y solo si ellos lo permiten.',
    ],
  },
  {
    id: 'datos',
    titulo: '5. Qué datos recogemos y para qué',
    parrafos: [
      'Cuenta: nombre, teléfono, correo si lo das, contraseña (la guardamos cifrada con un método de un solo sentido, nunca en claro), foto de perfil si la subes, ciudad, zona, materiales que reciclas y el texto «sobre ti». De los centros y compradores, además: nombre comercial, descripción, dirección o zona de trabajo, ubicación del local, teléfonos, horarios, métodos de pago, precios, avisos y fotos del negocio.',
      'Actividad: publicaciones, ofertas, operaciones (con kilos, montos acordados y el punto de encuentro), calificaciones y reseñas, reportes que hagas, puntos, giros, premios, insignias, desafíos, favoritos, búsquedas guardadas y tus preferencias de avisos.',
      'Técnicos: las sesiones abiertas (con el tipo de dispositivo o navegador), las suscripciones a avisos del navegador y una huella anónima por persona o dispositivo y por día cuando miras la ficha de un negocio, para contar visitas. Los registros técnicos del servidor guardan la dirección IP, el tipo de navegador y la ruta de cada solicitud para detectar fallos y abusos; no incluyen tu sesión ni tu posición. Toda foto que subes se vuelve a procesar antes de guardarla: le quitamos la ubicación y los demás datos ocultos que agrega la cámara.',
      'Usamos estos datos solo para que RecicloMap funcione: mostrar precios y distancias, conectar a recicladores con compradores, verificar negocios, enviarte códigos y avisos, calcular puntos y premios, y prevenir fraudes. No vendemos tus datos ni los usamos para publicidad.',
    ],
  },
  {
    id: 'quien-ve',
    titulo: '6. Quién ve tus datos',
    parrafos: [
      'Otras personas: ven lo que ya muestra la app. De un reciclador, su nombre y la inicial de su apellido, su nivel y su reputación, y su WhatsApp solo si aceptaste su oferta. Del negocio con el que operas ves su nombre comercial, su contacto y su dirección si es un centro. Aparecer en el ranking es opcional: puedes quitarte en Configuración.',
      'La administración: los administradores pueden ver tu nombre, teléfono, correo, ciudad, situación de la cuenta y tu actividad para verificar negocios, atender reportes e incidencias y suspender cuentas, siempre con un motivo que queda registrado. No ven tu contraseña ni tu ubicación exacta, no pueden editar tus datos, tus precios, tus puntos ni tus reseñas, y no pueden eliminar tu cuenta.',
      'No compartimos tus datos con terceros para fines comerciales.',
    ],
  },
  {
    id: 'terceros',
    titulo: '7. Servicios de terceros',
    parrafos: [
      'Mapa: para mostrar el mapa tu navegador pide imágenes al proveedor de mapas configurado. Por defecto es OpenStreetMap (servidores de la Fundación OpenStreetMap, con atribución visible en el mapa); el equipo puede cambiarlo a otro proveedor, como MapTiler. Ese proveedor recibe datos técnicos de tu navegador, como tu dirección IP, y la zona que estás mirando. No le damos tus datos de cuenta. Google no recibe nada por ver el mapa.',
      'Búsqueda de direcciones: cuando tocas «Buscar» para colocar el pin de un local o un punto de encuentro, nuestro servidor consulta el servicio Nominatim de OpenStreetMap solo con el texto que escribiste. No le enviamos tu dirección IP ni datos de tu cuenta; guardamos las búsquedas repetidas unas horas para no repetirlas.',
      'Google Maps («Abrir en Google Maps»): solo si tocas ese botón, se abre Google Maps en tu teléfono con el destino. Google recibe únicamente el destino; la ruta la calcula tu teléfono. Si el equipo activa el trazo de la ruta dentro de RecicloMap, nuestro servidor pide la ruta a Google con un origen redondeado (a unos 110 metros), no con tu punto exacto. Google trata esos datos según su propia política de privacidad.',
      'Google (inicio de sesión): si entras con tu cuenta de Google, recibimos tu nombre y tu correo verificado. Nunca recibimos tu contraseña de Google.',
      'Proveedor de SMS y de correo: los códigos de verificación y algunos avisos se envían por un proveedor de mensajería que recibe tu número (o correo) y el texto del mensaje. Hoy el envío está simulado y no sale a ningún proveedor; cuando se active, lo indicaremos aquí.',
      'Avisos del navegador (push): si los activas, los entrega el servicio de notificaciones de tu navegador, que recibe un identificador de tu dispositivo y el mensaje.',
      'Almacenamiento de fotos: las fotos se guardan en nuestro almacén de archivos.',
      'El proveedor del mapa, Google (si lo usas) y el proveedor de mensajería pueden tratar datos en servidores fuera del Perú (flujo transfronterizo de datos personales).',
    ],
    pendiente:
      '[Responsables, contratos con terceros y garantías para el flujo transfronterizo: pendiente de revisión legal]',
  },
  {
    id: 'conservacion',
    titulo: '8. Cuánto tiempo guardamos tus datos',
    parrafos: [
      `Códigos de verificación: se borran ${RETENCION_DIAS.codigosUsados} día después de usarse o vencer. Sesiones vencidas o cerradas: ${RETENCION_DIAS.sesionesVencidas} días. Avisos leídos: ${RETENCION_DIAS.notificacionesLeidas} días; sin leer: ${RETENCION_DIAS.notificacionesSinLeer} días.`,
      `Huellas de visitas: ${RETENCION_DIAS.visitas} días. Solicitudes de «Cómo llegar»: ${RETENCION_DIAS.solicitudesLlegada} días. Avisos de apertura de ciudad ya entregados: ${RETENCION_DIAS.listaEsperaAvisada} días. Fotos que ninguna publicación ni perfil usa: ${RETENCION_DIAS.archivosHuerfanos} días.`,
      'Tu perfil, publicaciones, favoritos y búsquedas se conservan mientras tengas la cuenta y se borran al eliminarla. El punto de encuentro, la referencia y el mensaje de una operación cerrada se borran pasado un plazo (24 meses por ahora); la operación se conserva.',
      'Registros técnicos del servidor (dirección IP, navegador y ruta de cada solicitud): el plazo está por definirse.',
      'Operaciones, calificaciones, puntos, giros, premios y el registro de acciones de administración son historiales que no se editan: se conservan sin datos que te identifiquen cuando eliminas tu cuenta.',
    ],
    pendiente:
      '[Plazos de conservación de operaciones, registros de administración y registros técnicos: propuesta pendiente de revisión legal]',
  },
  {
    id: 'derechos',
    titulo: '9. Tus derechos y cómo ejercerlos',
    parrafos: [
      'Tienes derecho a acceder a tus datos, rectificarlos, cancelarlos y oponerte a su tratamiento.',
      'Acceso: en Configuración → «Tus datos» puedes descargar una copia en JSON con tu pedido de contraseña (una por día). Incluye solo tus datos; no trae teléfonos, correos ni ubicaciones de otras personas.',
      'Rectificación: puedes cambiar tu nombre, foto, correo, teléfono y contraseña en la app. Para otros datos escríbenos.',
      `Cancelación: en Configuración → «Zona de riesgo» puedes eliminar tu cuenta. Pedimos tu contraseña y un código al teléfono. Tu cuenta queda inactiva ${ELIMINACION_GRACIA_DIAS} días, durante los cuales puedes cancelar iniciando sesión; pasado ese plazo, borramos tu nombre, teléfono, correo, foto, ubicación, sesiones, favoritos y búsquedas sin posibilidad de recuperarlos. Tus operaciones y reseñas ya hechas se conservan como «Usuario eliminado» o «Negocio eliminado». No se puede eliminar mientras tengas operaciones en curso, incidencias abiertas, entregas directas pendientes o premios por reclamar o entregar. Las cuentas de administración no se eliminan desde la app. Si eliminas tu cuenta, puedes registrarte de nuevo con el mismo teléfono como una cuenta nueva, sin historial.`,
      'Oposición y cualquier otra solicitud sobre tus datos: escríbenos a {correo}. Respondemos en horario de oficina.',
    ],
  },
  {
    id: 'seguridad',
    titulo: '10. Seguridad',
    parrafos: [
      'Guardamos las contraseñas cifradas, protegemos tu sesión con códigos de acceso de corta duración y puedes cerrarla en todos tus dispositivos desde Configuración. Ningún sistema es perfecto: si detectamos un problema que afecte tus datos, te avisaremos.',
    ],
  },
  {
    id: 'puntos',
    titulo: '11. Puntos y premios',
    parrafos: [
      'Ganas 1 punto por cada kilo de una operación completada. También sumas puntos por desafíos, por invitar a otras personas y en la ruleta, pero solo los puntos por kilo reciclado dan giros: 1 giro cada 500 de esos puntos, más 1 giro extra al cumplir la Meta del mes.',
      'Las probabilidades de cada premio se muestran en la ruleta. Los puntos no tienen valor en dinero y los premios no son dinero. Los premios pueden agotarse y cambiar con aviso, y la ruleta puede pausarse; mientras tanto conservas tus giros y puedes reclamar lo que ya ganaste.',
    ],
  },
  {
    id: 'conducta',
    titulo: '12. Conducta y reportes',
    parrafos: [
      'No publiques información falsa ni suplantes a otra persona. Puedes reportar precios o negocios con información incorrecta. Los casos reiterados pueden llevar a la suspensión de la cuenta, siempre con motivo registrado.',
    ],
  },
  {
    id: 'cambios',
    titulo: '13. Cambios en estos textos',
    parrafos: [
      `Estos textos tienen versión (hoy ${VERSION}). Cuando cambien en lo importante, te pediremos aceptarlos de nuevo antes de seguir usando RecicloMap.`,
    ],
  },
  {
    id: 'contacto',
    titulo: '14. Contacto',
    parrafos: [
      'Para cualquier consulta sobre estos términos o sobre tus datos, y para ejercer tus derechos, escríbenos a {correo} o desde el Centro de ayuda.',
    ],
    pendiente: '[Responsable del tratamiento y registro del banco de datos personales: pendiente de revisión legal]',
  },
];
