import { ImageResponse } from 'next/og';

const LOGO = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 44">' +
    '<path d="M20 42S5 29 5 17a15 15 0 0130 0c0 12-15 25-15 25z" fill="#2F9B66" stroke="#12301F" stroke-width="2"/>' +
    '<path d="M12 25c0-9 5-14 16-14 0 10-5 15-16 14z" fill="#F6F1E4"/>' +
    '<path d="M13 24c4-5 8-8 12-10" stroke="#12301F" stroke-width="1.8" stroke-linecap="round" fill="none"/>' +
    '</svg>',
);

// Logo sobre papel crema; la versión adaptable deja margen para la máscara de Android
export function iconoApp(lado: number, adaptable = false): ImageResponse {
  const logo = Math.round(lado * (adaptable ? 0.5 : 0.68));
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F6F1E4',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- el generador de imágenes solo admite <img> */}
      <img src={`data:image/svg+xml,${LOGO}`} width={Math.round(logo / 1.1)} height={logo} alt="" />
    </div>,
    { width: lado, height: lado },
  );
}
