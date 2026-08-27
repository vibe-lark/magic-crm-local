import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { id } from "@/lib/ids";
import { CrmError } from "./error";
import type { Activity, Actor, Contact, Customer, PageResult } from "./types";
import {
  ACTIVITY_TYPES,
  CUSTOMER_SOURCES,
  CUSTOMER_STAGES,
  booleanValue,
  dateValue,
  enumValue,
  optionalString,
  requiredString,
} from "./validation";

type SearchInput = { query?: string; includeArchived?: boolean; pageSize?: number; pageToken?: string };
type Row = Record<string, unknown>;

const CUSTOMER_SELECT = `SELECT c.*, u.name AS owner_name FROM customers c JOIN users u ON u.id = c.owner_id`;
const CONTACT_SELECT = `SELECT c.*, customer.name AS customer_name FROM contacts c JOIN customers customer ON customer.id = c.customer_id`;
const ACTIVITY_SELECT = `SELECT a.*, customer.name AS customer_name, contact.name AS contact_name
  FROM activities a JOIN customers customer ON customer.id = a.customer_id
  LEFT JOIN contacts contact ON contact.id = a.contact_id`;

function bool(value: unknown): boolean { return Boolean(Number(value)); }
function asString(value: unknown): string { return String(value ?? ""); }
function nullable(value: unknown): string | null { return value == null ? null : String(value); }

function customer(row: Row): Customer {
  return {
    id: asString(row.id), name: asString(row.name), stage: row.stage as Customer["stage"],
    industry: nullable(row.industry), source: nullable(row.source), phone: nullable(row.phone), email: nullable(row.email),
    website: nullable(row.website), address: nullable(row.address), notes: nullable(row.notes), ownerId: asString(row.owner_id),
    ownerName: asString(row.owner_name), lastFollowUpAt: nullable(row.last_follow_up_at), nextFollowUpAt: nullable(row.next_follow_up_at),
    archived: bool(row.archived), demo: bool(row.demo), createdAt: asString(row.created_at), updatedAt: asString(row.updated_at),
  };
}

function contact(row: Row): Contact {
  return {
    id: asString(row.id), customerId: asString(row.customer_id), customerName: asString(row.customer_name), name: asString(row.name),
    title: nullable(row.title), phone: nullable(row.phone), email: nullable(row.email), wechat: nullable(row.wechat), primary: bool(row.is_primary),
    notes: nullable(row.notes), ownerId: asString(row.owner_id), archived: bool(row.archived), demo: bool(row.demo),
    createdAt: asString(row.created_at), updatedAt: asString(row.updated_at),
  };
}

function activity(row: Row): Activity {
  return {
    id: asString(row.id), customerId: asString(row.customer_id), customerName: asString(row.customer_name),
    contactId: nullable(row.contact_id), contactName: nullable(row.contact_name), subject: asString(row.subject),
    type: row.type as Activity["type"], content: nullable(row.content), occurredAt: asString(row.occurred_at),
    nextFollowUpAt: nullable(row.next_follow_up_at), ownerId: asString(row.owner_id), archived: bool(row.archived),
    demo: bool(row.demo), createdAt: asString(row.created_at), updatedAt: asString(row.updated_at),
  };
}

function paginate<T>(items: T[], input: SearchInput): PageResult<T> {
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 50));
  const offset = Math.max(0, Number(input.pageToken) || 0);
  const page = items.slice(offset, offset + pageSize);
  return { items: page, total: items.length, nextPageToken: offset + page.length < items.length ? String(offset + page.length) : null };
}

function matches(query: string | undefined, values: unknown[]): boolean {
  if (!query?.trim()) return true;
  const needle = query.trim().toLowerCase();
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function ensureOwner(actor: Actor, ownerId: string): void {
  if (!actor.isAdmin && actor.id !== ownerId) throw new CrmError("FORBIDDEN", "无权访问其他销售负责的数据", 403);
}

function actorFromRow(row: Row): Actor {
  const role = asString(row.role);
  if (role !== "admin" && role !== "sales") throw new CrmError("FORBIDDEN", "当前用户角色无效", 403);
  return {
    id: asString(row.id), name: asString(row.name), role, isAdmin: role === "admin",
    feishuOpenId: nullable(row.feishu_open_id) ?? undefined,
    avatarUrl: nullable(row.avatar_url) ?? undefined,
  };
}

function activeUser(db: Database, userId: string): Actor {
  const row = db.prepare("SELECT id,name,role,feishu_open_id,avatar_url FROM users WHERE id=? AND active=1").get(userId) as Row | undefined;
  if (!row) throw new CrmError("FORBIDDEN", "当前用户不存在或已停用", 403);
  return actorFromRow(row);
}

function patchSql(table: string, recordId: string, values: Record<string, unknown>, db: Database): void {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (!entries.length) throw new CrmError("VALIDATION_ERROR", "没有可更新的字段");
  const setters = entries.map(([key]) => `${key}=@${key}`).join(", ");
  db.prepare(`UPDATE ${table} SET ${setters}, updated_at=@updated_at WHERE id=@id`).run({ id: recordId, updated_at: new Date().toISOString(), ...Object.fromEntries(entries) });
}

export class CrmService {
  constructor(private readonly db: Database = getDb()) {}

  users(): Actor[] {
    return (this.db.prepare("SELECT id,name,role FROM users WHERE active=1 ORDER BY role,name").all() as Row[])
      .map((row) => ({ id: asString(row.id), name: asString(row.name), role: row.role as Actor["role"], isAdmin: row.role === "admin" }));
  }

  actor(userId: string): Actor { return activeUser(this.db, userId); }

  actorByFeishu(profile: { openId: string; name?: string; avatarUrl?: string }): Actor {
    const openId = requiredString(profile.openId, "飞书 Open ID");
    const displayName = optionalString(profile.name, "飞书用户名", 200);
    const avatarUrl = optionalString(profile.avatarUrl, "飞书头像", 2000);

    return this.db.transaction(() => {
      let row = this.db.prepare("SELECT * FROM users WHERE feishu_open_id=?").get(openId) as Row | undefined;
      if (row) {
        if (!bool(row.active)) throw new CrmError("FORBIDDEN", "当前飞书用户绑定的 CRM 账号已停用", 403);
        this.db.prepare("UPDATE users SET name=COALESCE(?,name), avatar_url=COALESCE(?,avatar_url) WHERE id=?")
          .run(displayName ?? null, avatarUrl ?? null, row.id);
        return activeUser(this.db, asString(row.id));
      }

      const boundCount = Number((this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE feishu_open_id IS NOT NULL").get() as { count: number }).count);
      if (boundCount === 0) {
        row = this.db.prepare("SELECT * FROM users WHERE id='user_admin'").get() as Row | undefined;
      } else {
        row = this.db.prepare(`SELECT * FROM users
          WHERE id IN ('user_alice','user_bob') AND feishu_open_id IS NULL
          ORDER BY CASE id WHEN 'user_alice' THEN 1 ELSE 2 END LIMIT 1`).get() as Row | undefined;
      }

      if (row) {
        if (!bool(row.active)) throw new CrmError("FORBIDDEN", "待绑定的 CRM 账号已停用", 403);
        this.db.prepare("UPDATE users SET feishu_open_id=?, name=COALESCE(?,name), avatar_url=? WHERE id=?")
          .run(openId, displayName ?? null, avatarUrl ?? null, row.id);
        return activeUser(this.db, asString(row.id));
      }

      const userId = id("user");
      this.db.prepare("INSERT INTO users (id,name,role,active,feishu_open_id,avatar_url) VALUES (?,?, 'sales',1,?,?)")
        .run(userId, displayName || "飞书销售用户", openId, avatarUrl ?? null);
      return activeUser(this.db, userId);
    }).immediate();
  }

  bootstrap(userId: string) {
    const actor = this.actor(userId);
    return { actor, users: this.users(), summary: this.summary(actor) };
  }

  customerSearch(actor: Actor, input: SearchInput & { stage?: string; ownerId?: string } = {}): PageResult<Customer> {
    let items = (this.db.prepare(`${CUSTOMER_SELECT} ORDER BY c.updated_at DESC`).all() as Row[]).map(customer);
    items = items.filter((item) => actor.isAdmin || item.ownerId === actor.id);
    if (!input.includeArchived) items = items.filter((item) => !item.archived);
    if (input.stage) items = items.filter((item) => item.stage === input.stage);
    if (input.ownerId && actor.isAdmin) items = items.filter((item) => item.ownerId === input.ownerId);
    items = items.filter((item) => matches(input.query, [item.name, item.industry, item.phone, item.email, item.notes]));
    return paginate(items, input);
  }

  customerGet(actor: Actor, customerId: string): Customer {
    const row = this.db.prepare(`${CUSTOMER_SELECT} WHERE c.id=?`).get(requiredString(customerId, "客户 ID")) as Row | undefined;
    if (!row) throw new CrmError("NOT_FOUND", "客户不存在", 404);
    const item = customer(row); ensureOwner(actor, item.ownerId); return item;
  }

  customerCreate(actor: Actor, input: Record<string, unknown>): Customer {
    const ownerId = actor.isAdmin && input.ownerId ? requiredString(input.ownerId, "负责人") : actor.id;
    activeUser(this.db, ownerId);
    const recordId = id("cust"); const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO customers
      (id,name,stage,industry,source,phone,email,website,address,notes,owner_id,last_follow_up_at,next_follow_up_at,archived,demo,created_at,updated_at)
      VALUES (@id,@name,@stage,@industry,@source,@phone,@email,@website,@address,@notes,@owner,@last,@next,0,0,@now,@now)`)
      .run({ id:recordId, name:requiredString(input.name,"客户名称"), stage:enumValue(input.stage,"客户阶段",CUSTOMER_STAGES,"线索"),
        industry:optionalString(input.industry,"行业"), source:input.source ? enumValue(input.source,"来源",CUSTOMER_SOURCES) : null,
        phone:optionalString(input.phone,"联系电话",100), email:optionalString(input.email,"邮箱",200), website:optionalString(input.website,"官网",500),
        address:optionalString(input.address,"地址",500), notes:optionalString(input.notes,"备注",5000), owner:ownerId,
        last:dateValue(input.lastFollowUpAt,"最近跟进时间") ?? null, next:dateValue(input.nextFollowUpAt,"下次跟进时间") ?? null, now });
    return this.customerGet(actor, recordId);
  }

  customerUpdate(actor: Actor, customerId: string, input: Record<string, unknown>): Customer {
    this.customerGet(actor, customerId);
    const ownerId = input.ownerId === undefined ? undefined : (actor.isAdmin ? requiredString(input.ownerId,"负责人") : actor.id);
    if (ownerId) activeUser(this.db, ownerId);
    patchSql("customers", customerId, {
      name: input.name === undefined ? undefined : requiredString(input.name,"客户名称"),
      stage: input.stage === undefined ? undefined : enumValue(input.stage,"客户阶段",CUSTOMER_STAGES),
      industry:optionalString(input.industry,"行业"), source:input.source === undefined ? undefined : input.source ? enumValue(input.source,"来源",CUSTOMER_SOURCES) : null,
      phone:optionalString(input.phone,"联系电话",100), email:optionalString(input.email,"邮箱",200), website:optionalString(input.website,"官网",500),
      address:optionalString(input.address,"地址",500), notes:optionalString(input.notes,"备注",5000), owner_id:ownerId,
      last_follow_up_at:dateValue(input.lastFollowUpAt,"最近跟进时间"), next_follow_up_at:dateValue(input.nextFollowUpAt,"下次跟进时间"),
      archived:booleanValue(input.archived) === undefined ? undefined : Number(booleanValue(input.archived)),
    }, this.db);
    return this.customerGet(actor, customerId);
  }

  contactSearch(actor: Actor, input: SearchInput & { customerId?: string } = {}): PageResult<Contact> {
    let items = (this.db.prepare(`${CONTACT_SELECT} ORDER BY c.updated_at DESC`).all() as Row[]).map(contact);
    items = items.filter((item) => actor.isAdmin || item.ownerId === actor.id);
    if (!input.includeArchived) items = items.filter((item) => !item.archived);
    if (input.customerId) items = items.filter((item) => item.customerId === input.customerId);
    items = items.filter((item) => matches(input.query, [item.name,item.title,item.phone,item.email,item.wechat,item.notes]));
    return paginate(items,input);
  }

  contactCreate(actor: Actor, input: Record<string, unknown>): Contact {
    const parent = this.customerGet(actor, requiredString(input.customerId,"客户 ID"));
    const recordId=id("contact"); const now=new Date().toISOString();
    this.db.prepare(`INSERT INTO contacts
      (id,customer_id,name,title,phone,email,wechat,is_primary,notes,owner_id,archived,demo,created_at,updated_at)
      VALUES (@id,@customer,@name,@title,@phone,@email,@wechat,@primary,@notes,@owner,0,0,@now,@now)`)
      .run({id:recordId,customer:parent.id,name:requiredString(input.name,"联系人姓名"),title:optionalString(input.title,"职位"),
        phone:optionalString(input.phone,"手机",100),email:optionalString(input.email,"邮箱",200),wechat:optionalString(input.wechat,"微信",200),
        primary:Number(Boolean(input.primary)),notes:optionalString(input.notes,"备注",5000),owner:parent.ownerId,now});
    return this.contactGet(actor,recordId);
  }

  contactGet(actor: Actor, contactId: string): Contact {
    const row=this.db.prepare(`${CONTACT_SELECT} WHERE c.id=?`).get(requiredString(contactId,"联系人 ID")) as Row|undefined;
    if(!row) throw new CrmError("NOT_FOUND","联系人不存在",404); const item=contact(row); ensureOwner(actor,item.ownerId); return item;
  }

  contactUpdate(actor: Actor, contactId: string, input: Record<string, unknown>): Contact {
    const current=this.contactGet(actor,contactId);
    const parent=input.customerId===undefined ? null : this.customerGet(actor,requiredString(input.customerId,"客户 ID"));
    patchSql("contacts",contactId,{
      customer_id:parent?.id,name:input.name===undefined?undefined:requiredString(input.name,"联系人姓名"),title:optionalString(input.title,"职位"),
      phone:optionalString(input.phone,"手机",100),email:optionalString(input.email,"邮箱",200),wechat:optionalString(input.wechat,"微信",200),
      is_primary:input.primary===undefined?undefined:Number(Boolean(input.primary)),notes:optionalString(input.notes,"备注",5000),
      owner_id:parent?.ownerId,archived:input.archived===undefined?undefined:Number(Boolean(input.archived)),
    },this.db);
    return this.contactGet(actor,current.id);
  }

  activitySearch(actor: Actor, input: SearchInput & { customerId?: string; contactId?: string; type?: string } = {}): PageResult<Activity> {
    let items=(this.db.prepare(`${ACTIVITY_SELECT} ORDER BY a.occurred_at DESC`).all() as Row[]).map(activity);
    items=items.filter((item)=>actor.isAdmin||item.ownerId===actor.id);
    if(!input.includeArchived) items=items.filter((item)=>!item.archived);
    if(input.customerId) items=items.filter((item)=>item.customerId===input.customerId);
    if(input.contactId) items=items.filter((item)=>item.contactId===input.contactId);
    if(input.type) items=items.filter((item)=>item.type===input.type);
    items=items.filter((item)=>matches(input.query,[item.subject,item.content,item.type,item.customerName]));
    return paginate(items,input);
  }

  activityCreate(actor: Actor,input:Record<string,unknown>):Activity {
    const parent=this.customerGet(actor,requiredString(input.customerId,"客户 ID"));
    const contactId=input.contactId?requiredString(input.contactId,"联系人 ID"):null;
    if(contactId&&this.contactGet(actor,contactId).customerId!==parent.id) throw new CrmError("VALIDATION_ERROR","联系人不属于所选客户");
    const recordId=id("activity");const now=new Date().toISOString();const occurred=dateValue(input.occurredAt??now,"发生时间")!;
    const next=dateValue(input.nextFollowUpAt,"下次跟进时间")??null;
    this.db.transaction(()=>{
      this.db.prepare(`INSERT INTO activities
        (id,customer_id,contact_id,subject,type,content,occurred_at,next_follow_up_at,owner_id,archived,demo,created_at,updated_at)
        VALUES (@id,@customer,@contact,@subject,@type,@content,@occurred,@next,@owner,0,0,@now,@now)`)
        .run({id:recordId,customer:parent.id,contact:contactId,subject:requiredString(input.subject,"跟进主题"),
          type:enumValue(input.type,"跟进类型",ACTIVITY_TYPES,"其他"),content:optionalString(input.content,"跟进内容",10000),occurred,next,owner:parent.ownerId,now});
      this.db.prepare("UPDATE customers SET last_follow_up_at=?, next_follow_up_at=?, updated_at=? WHERE id=?").run(occurred,next,now,parent.id);
    })();
    return this.activityGet(actor,recordId);
  }

  activityGet(actor:Actor,activityId:string):Activity {
    const row=this.db.prepare(`${ACTIVITY_SELECT} WHERE a.id=?`).get(requiredString(activityId,"跟进 ID")) as Row|undefined;
    if(!row) throw new CrmError("NOT_FOUND","跟进记录不存在",404);const item=activity(row);ensureOwner(actor,item.ownerId);return item;
  }

  activityUpdate(actor:Actor,activityId:string,input:Record<string,unknown>):Activity {
    const current=this.activityGet(actor,activityId);
    const customerId=input.customerId===undefined?current.customerId:requiredString(input.customerId,"客户 ID");
    const parent=this.customerGet(actor,customerId);
    const contactId=input.contactId===undefined?current.contactId:(input.contactId?requiredString(input.contactId,"联系人 ID"):null);
    if(contactId&&this.contactGet(actor,contactId).customerId!==parent.id) throw new CrmError("VALIDATION_ERROR","联系人不属于所选客户");
    const occurred=dateValue(input.occurredAt,"发生时间");const next=dateValue(input.nextFollowUpAt,"下次跟进时间");
    this.db.transaction(()=>{
      patchSql("activities",activityId,{customer_id:input.customerId===undefined?undefined:parent.id,contact_id:input.contactId===undefined?undefined:contactId,
        subject:input.subject===undefined?undefined:requiredString(input.subject,"跟进主题"),type:input.type===undefined?undefined:enumValue(input.type,"跟进类型",ACTIVITY_TYPES),
        content:optionalString(input.content,"跟进内容",10000),occurred_at:occurred,next_follow_up_at:next,owner_id:input.customerId===undefined?undefined:parent.ownerId,
        archived:input.archived===undefined?undefined:Number(Boolean(input.archived))},this.db);
      if(occurred!==undefined||next!==undefined) this.db.prepare(`UPDATE customers SET last_follow_up_at=COALESCE(?,last_follow_up_at), next_follow_up_at=?, updated_at=? WHERE id=?`)
        .run(occurred??null,next===undefined?parent.nextFollowUpAt:next,new Date().toISOString(),parent.id);
    })();
    return this.activityGet(actor,activityId);
  }

  summary(actor:Actor) {
    const customers=this.customerSearch(actor,{pageSize:100}).items;
    const contacts=this.contactSearch(actor,{pageSize:100});
    const activities=this.activitySearch(actor,{pageSize:100}).items;
    const now=Date.now();const cutoff=now-30*86_400_000;
    return {customerCount:customers.length,leadCount:customers.filter((item)=>item.stage==="线索"||item.stage==="意向").length,
      contactCount:contacts.total,recentActivityCount:activities.filter((item)=>Date.parse(item.occurredAt)>=cutoff).length,
      upcomingFollowUps:customers.filter((item)=>item.nextFollowUpAt&&Date.parse(item.nextFollowUpAt)>=now)
        .sort((a,b)=>Date.parse(a.nextFollowUpAt!)-Date.parse(b.nextFollowUpAt!)).slice(0,5)
        .map((item)=>({id:item.id,name:item.name,nextFollowUpAt:item.nextFollowUpAt}))};
  }

  archiveDemo(actor:Actor):{archivedCount:number} {
    if(!actor.isAdmin) throw new CrmError("FORBIDDEN","只有管理员可以归档示例数据",403);
    let count=0;this.db.transaction(()=>{for(const table of ["activities","contacts","customers"]){const result=this.db.prepare(`UPDATE ${table} SET archived=1,updated_at=? WHERE demo=1 AND archived=0`).run(new Date().toISOString());count+=result.changes;}})();
    return {archivedCount:count};
  }
}

export const crm = new CrmService();
