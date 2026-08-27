import { appBaseUrl, feishuCallbackUrl, feishuOauthConfigured } from "@/lib/config";
import { DemoConsole } from "@/components/demo-console";

export default function DemoPage(){return <DemoConsole baseUrl={appBaseUrl()} callbackUrl={feishuCallbackUrl()} initialFeishuConfigured={feishuOauthConfigured()}/>;}
