import { appBaseUrl } from "@/lib/config";
import { DemoConsole } from "@/components/demo-console";

export default function DemoPage(){const base=appBaseUrl();return <DemoConsole baseUrl={base}/>;}
