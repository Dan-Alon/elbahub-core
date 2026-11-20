import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ElbaApp - Equipo de Animación',
    short_name: 'ElbaApp',
    description: 'Agenda diaria, cuadrante semanal y saldos HR para el equipo.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0052cc',
    orientation: 'portrait',
    icons: [
      {
        src: '/elba-logo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/elba-logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}