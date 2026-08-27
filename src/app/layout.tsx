import type { Metadata } from "next";
import "./globals.css";

export const metadata:Metadata={title:"妙笔 CRM",description:"独立运行的 CRM 网页与 MCP 客户演示项目"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
