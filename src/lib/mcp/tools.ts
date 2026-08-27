import type { Actor } from "@/lib/crm/types";
import { crm } from "@/lib/crm/service";
import { ACTIVITY_TYPES, CUSTOMER_SOURCES, CUSTOMER_STAGES } from "@/lib/crm/validation";

type JsonSchema = Record<string, unknown>;
export type ToolDefinition = { name:string;description:string;inputSchema:JsonSchema;execute:(actor:Actor,args:Record<string,unknown>)=>unknown };

const searchProperties={query:{type:"string",description:"名称、联系方式或正文关键词"},includeArchived:{type:"boolean",default:false},pageSize:{type:"integer",minimum:1,maximum:100,default:50},pageToken:{type:"string"}};
const customerWritable={name:{type:"string"},stage:{type:"string",enum:CUSTOMER_STAGES},industry:{type:["string","null"]},source:{type:["string","null"],enum:[...CUSTOMER_SOURCES,null]},phone:{type:["string","null"]},email:{type:["string","null"]},website:{type:["string","null"]},address:{type:["string","null"]},notes:{type:["string","null"]},ownerId:{type:"string"},lastFollowUpAt:{type:["string","null"],format:"date-time"},nextFollowUpAt:{type:["string","null"],format:"date-time"},archived:{type:"boolean"}};
const contactWritable={name:{type:"string"},customerId:{type:"string"},title:{type:["string","null"]},phone:{type:["string","null"]},email:{type:["string","null"]},wechat:{type:["string","null"]},primary:{type:"boolean"},notes:{type:["string","null"]},archived:{type:"boolean"}};
const activityWritable={subject:{type:"string"},customerId:{type:"string"},contactId:{type:["string","null"]},type:{type:"string",enum:ACTIVITY_TYPES},content:{type:["string","null"]},occurredAt:{type:"string",format:"date-time"},nextFollowUpAt:{type:["string","null"],format:"date-time"},archived:{type:"boolean"}};
const object=(properties:Record<string,unknown>,required:string[]=[]):JsonSchema=>({type:"object",additionalProperties:false,properties,...(required.length?{required}:{})});

export const tools:ToolDefinition[]=[
  {name:"crm_summary_get",description:"获取当前用户可见的 CRM 汇总、近期跟进数和待跟进客户。",inputSchema:object({}),execute:(actor)=>crm.summary(actor)},
  {name:"crm_customer_search",description:"按权限搜索 CRM 客户。销售只能看到本人负责的客户。",inputSchema:object({...searchProperties,stage:{type:"string",enum:CUSTOMER_STAGES},ownerId:{type:"string"}}),execute:(actor,args)=>crm.customerSearch(actor,args)},
  {name:"crm_customer_get",description:"读取单个客户详情。",inputSchema:object({customerId:{type:"string"}},["customerId"]),execute:(actor,args)=>crm.customerGet(actor,String(args.customerId))},
  {name:"crm_customer_create",description:"创建客户。销售创建时负责人固定为本人。",inputSchema:object(customerWritable,["name"]),execute:(actor,args)=>crm.customerCreate(actor,args)},
  {name:"crm_customer_update",description:"修改或归档客户，不支持硬删除。",inputSchema:object({customerId:{type:"string"},patch:object(customerWritable)},["customerId","patch"]),execute:(actor,args)=>crm.customerUpdate(actor,String(args.customerId),args.patch as Record<string,unknown>)},
  {name:"crm_contact_search",description:"搜索联系人，可按客户筛选。",inputSchema:object({...searchProperties,customerId:{type:"string"}}),execute:(actor,args)=>crm.contactSearch(actor,args)},
  {name:"crm_contact_create",description:"为有权访问的客户创建联系人。",inputSchema:object(contactWritable,["name","customerId"]),execute:(actor,args)=>crm.contactCreate(actor,args)},
  {name:"crm_contact_update",description:"修改或归档联系人。",inputSchema:object({contactId:{type:"string"},patch:object(contactWritable)},["contactId","patch"]),execute:(actor,args)=>crm.contactUpdate(actor,String(args.contactId),args.patch as Record<string,unknown>)},
  {name:"crm_activity_search",description:"搜索客户跟进记录。",inputSchema:object({...searchProperties,customerId:{type:"string"},contactId:{type:"string"},type:{type:"string",enum:ACTIVITY_TYPES}}),execute:(actor,args)=>crm.activitySearch(actor,args)},
  {name:"crm_activity_add",description:"新增跟进记录，并同步客户最近/下次跟进时间。",inputSchema:object(activityWritable,["subject","customerId","type"]),execute:(actor,args)=>crm.activityCreate(actor,args)},
  {name:"crm_activity_update",description:"修改或归档跟进记录。",inputSchema:object({activityId:{type:"string"},patch:object(activityWritable)},["activityId","patch"]),execute:(actor,args)=>crm.activityUpdate(actor,String(args.activityId),args.patch as Record<string,unknown>)},
];
