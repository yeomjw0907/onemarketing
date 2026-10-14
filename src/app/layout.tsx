import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'One Marketing · 운영 대시보드',description:'마케팅 제작과 운영을 한 곳에서',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
