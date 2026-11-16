import './globals.css';

export const metadata = {
  title: {
    default: 'SchoolOS Admin',
    template: '%s | SchoolOS Admin',
  },
  description: 'School operations management portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
