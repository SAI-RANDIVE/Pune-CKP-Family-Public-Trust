import './fonts.css';
import './globals.css';

/**
 * Root shell shared by both sites. The public website's layout is
 * app/(site)/layout.js; the management system's is app/tms/layout.js.
 * Which one a request gets is decided by host in middleware.js.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
