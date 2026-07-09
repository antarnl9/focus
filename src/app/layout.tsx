import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegisterSW } from '@/app/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Focus — T1',
  description: 'Centro de comando del COO: agenda, dudas, grabaciones y Daily.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Focus',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0b0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('focus-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
