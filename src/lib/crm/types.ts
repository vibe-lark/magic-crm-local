export type Role = "admin" | "sales";
export type CustomerStage = "线索" | "意向" | "客户" | "停用";
export type ActivityType = "电话" | "会议" | "邮件" | "拜访" | "其他";

export type Actor = { id: string; name: string; role: Role; isAdmin: boolean };

export type Customer = {
  id: string;
  name: string;
  stage: CustomerStage;
  industry: string | null;
  source: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  ownerId: string;
  ownerName: string;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
  archived: boolean;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Contact = {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  wechat: string | null;
  primary: boolean;
  notes: string | null;
  ownerId: string;
  archived: boolean;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Activity = {
  id: string;
  customerId: string;
  customerName: string;
  contactId: string | null;
  contactName: string | null;
  subject: string;
  type: ActivityType;
  content: string | null;
  occurredAt: string;
  nextFollowUpAt: string | null;
  ownerId: string;
  archived: boolean;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PageResult<T> = { items: T[]; total: number; nextPageToken: string | null };
