/** app/layout.tsx - Eleeveon Schools */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Providers from "./providers";
import GlobalBrandingRuntime from "./components/GlobalBrandingRuntime";
import SupportUnreadRuntime from "./components/role-portals/SupportUnreadRuntime";
export const metadata: Metadata = {
  applicationName:"Eleeveon Schools",
  title:{default:"Eleeveon Schools",template:"%s · Eleeveon Schools"},
  description:"A connected, offline-first school management workspace.",
  manifest:"/manifest.json",
  icons:{icon:[{url:"/favicon.ico"},{url:"/icons/icon-192.png",sizes:"192x192",type:"image/png"},{url:"/icons/icon-512.png",sizes:"512x512",type:"image/png"}],shortcut:"/favicon.ico",apple:[{url:"/apple-touch-icon.png",sizes:"180x180",type:"image/png"}]},
  appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"Eleeveon"},
  formatDetection:{telephone:false},
  other:{"msapplication-config":"/browserconfig.xml","msapplication-TileColor":"#2f6fed"},
};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:[{media:"(prefers-color-scheme: light)",color:"#f8fafc"},{media:"(prefers-color-scheme: dark)",color:"#0f172a"}],colorScheme:"light dark"};
export default function RootLayout({children}:{children:ReactNode}){
 return <html lang="en" suppressHydrationWarning><body style={{margin:0,minHeight:"100dvh",background:"var(--bg, #f7f8fb)",color:"var(--text, #111111)",fontFamily:"var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",fontSize:"var(--font-size, 16px)",transition:"background .3s ease, color .3s ease"}}><Providers><GlobalBrandingRuntime/><SupportUnreadRuntime/>{children}</Providers></body></html>;
}
