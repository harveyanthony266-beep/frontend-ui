import './globals.css'; import { AppFrame } from '@/components/app-frame'; import { Toaster } from 'sonner';
export const metadata={title:'Magicheart Nexus — Operations',description:'Enterprise invoice intelligence workspace'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body><AppFrame>{children}</AppFrame><Toaster theme="dark" position="bottom-right"/></body></html> }

