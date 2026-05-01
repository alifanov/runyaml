import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'runyaml dashboard',
  description: 'Debug dashboard for runyaml workflows',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <header className="topbar">
            <a href="/" className="brand">runyaml</a>
            <span className="subtle">debug dashboard</span>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
