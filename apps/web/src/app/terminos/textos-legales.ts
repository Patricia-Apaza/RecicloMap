// Texto provisional, pendiente de revisión legal: cambiarlo no requiere tocar la pantalla
export const ACTUALIZADO = 'noviembre de 2026';

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
    titulo: '2. Cuentas y verificación',
    parrafos: [
      'Puedes explorar sin cuenta. Para publicar, ofertar, calificar o guardar necesitas registrarte con tu teléfono, que verificamos con un código por SMS. El correo es opcional.',
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
      'Con tu permiso, usamos la ubicación de tu celular solo para calcular la distancia a centros y compradores. Si no das permiso, eliges tu zona a mano y la app funciona igual.',
      'Tu ubicación exacta nunca se muestra a otras personas ni sale de nuestros servidores. Los compradores solo ven tu ciudad y una distancia aproximada: menos de 1 km, de 1 a 2 km, de 2 a 5 km o más de 5 km.',
      'Tu WhatsApp y el punto de encuentro que tú escribes se comparten únicamente con quien aceptaste una oferta, para coordinar la entrega. Los compradores móviles aparecen en el mapa con una ubicación aproximada, nunca en tiempo real.',
    ],
  },
  {
    id: 'google',
    titulo: '5. Servicios de Google',
    parrafos: [
      'Para mostrar el mapa usamos Google Maps Platform, un servicio de Google. Al ver el mapa, Google recibe datos técnicos de tu navegador, como tu dirección IP, y la zona del mapa que estás mirando, y los trata según su propia política de privacidad. No compartimos con Google tus datos de cuenta ni tu ubicación exacta.',
      'Si entras con tu cuenta de Google, recibimos tu nombre y tu correo verificado. Nunca recibimos tu contraseña de Google.',
    ],
  },
  {
    id: 'datos',
    titulo: '6. Qué datos guardamos y para qué',
    parrafos: [
      'Guardamos tu nombre, teléfono, correo si lo das, foto de perfil si la subes, zona, materiales, publicaciones, ofertas, operaciones, puntos y calificaciones. De los centros y compradores, además, la dirección o zona de trabajo, horarios, métodos de pago, precios y fotos del negocio.',
      'Toda foto que subes se vuelve a procesar antes de guardarla: le quitamos la ubicación y los demás datos ocultos que agrega la cámara.',
      'Usamos estos datos solo para que RecicloMap funcione: mostrar precios y distancias, conectar a recicladores con compradores, verificar negocios, enviarte códigos y avisos, y prevenir fraudes. No vendemos tus datos.',
    ],
  },
  {
    id: 'tratamiento',
    titulo: '7. Tratamiento de datos personales',
    parrafos: [
      'Tratamos tus datos personales conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento. Al crear tu cuenta das tu consentimiento para el tratamiento descrito aquí; guardamos la versión de estos términos que aceptaste.',
      'Puedes pedir el acceso, la rectificación, la cancelación o la oposición al tratamiento de tus datos. Los códigos por SMS y los avisos los envía un proveedor de mensajería que solo recibe tu número y el texto del mensaje.',
      'Google y el proveedor de mensajería pueden tratar datos en servidores fuera del Perú (flujo transfronterizo de datos personales), con las garantías que exige la ley.',
    ],
    pendiente: '[Responsable del tratamiento y plazo de conservación: pendiente de revisión legal]',
  },
  {
    id: 'puntos',
    titulo: '8. Puntos y premios',
    parrafos: [
      'Ganas 1 punto por cada kilo de una operación completada. También sumas puntos por desafíos, por invitar a otras personas y en la ruleta, pero solo los puntos por kilo reciclado dan giros: 1 giro cada 500 de esos puntos, más 1 giro extra al cumplir la Meta del mes.',
      'Las probabilidades de cada premio se muestran en la ruleta. Los puntos no tienen valor en dinero. Los premios pueden agotarse y cambiar con aviso.',
    ],
  },
  {
    id: 'conducta',
    titulo: '9. Conducta y reportes',
    parrafos: [
      'No publiques información falsa ni suplantes a otra persona. Puedes reportar precios o negocios con información incorrecta. Los casos reiterados pueden llevar a la suspensión de la cuenta, siempre con motivo registrado.',
    ],
  },
  {
    id: 'derechos',
    titulo: '10. Tus derechos',
    parrafos: [
      'Puedes ver y corregir tus datos, y cerrar tu sesión en todos tus dispositivos desde Configuración.',
      'Al eliminar tu cuenta, tu perfil y tus datos personales se borran o se anonimizan. Las operaciones, las calificaciones y el historial de precios se conservan sin ningún dato que te identifique, porque forman parte de la historia de otras personas y del mercado.',
    ],
  },
  {
    id: 'contacto',
    titulo: '11. Contacto',
    parrafos: ['Escríbenos desde el Centro de ayuda para cualquier consulta sobre estos términos o sobre tus datos.'],
  },
];
