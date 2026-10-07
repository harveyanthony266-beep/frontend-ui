import './globals.css';
import { AppFrame } from '@/components/app-frame';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'Magicheart Nexus — Operations',
  description: 'Enterprise invoice intelligence workspace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <AppFrame>{children}</AppFrame>
        </WorkspaceProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
