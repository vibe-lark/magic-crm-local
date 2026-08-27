import type Database from "better-sqlite3";

const now = new Date();
const iso = (days = 0) => new Date(now.getTime() + days * 86_400_000).toISOString();

function insertSeedData(db: Database.Database): void {
  const insertUser = db.prepare("INSERT OR IGNORE INTO users (id, name, role, active) VALUES (?, ?, ?, 1)");
  insertUser.run("user_admin", "林然（管理员）", "admin");
  insertUser.run("user_alice", "陈晓（销售）", "sales");
  insertUser.run("user_bob", "周明（销售）", "sales");

  const count = Number((db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count);
  if (count) return;

  const customer = db.prepare(`INSERT INTO customers
    (id,name,stage,industry,source,phone,email,website,address,notes,owner_id,last_follow_up_at,next_follow_up_at,archived,demo,created_at,updated_at)
    VALUES (@id,@name,@stage,@industry,@source,@phone,@email,@website,@address,@notes,@owner, @last,@next,0,1,@created,@updated)`);
  const contact = db.prepare(`INSERT INTO contacts
    (id,customer_id,name,title,phone,email,wechat,is_primary,notes,owner_id,archived,demo,created_at,updated_at)
    VALUES (@id,@customer,@name,@title,@phone,@email,@wechat,@primary,@notes,@owner,0,1,@created,@updated)`);
  const activity = db.prepare(`INSERT INTO activities
    (id,customer_id,contact_id,subject,type,content,occurred_at,next_follow_up_at,owner_id,archived,demo,created_at,updated_at)
    VALUES (@id,@customer,@contact,@subject,@type,@content,@occurred,@next,@owner,0,1,@created,@updated)`);

  const customers = [
    { id:"cust_acme", name:"远景科技", stage:"客户", industry:"企业服务", source:"客户转介绍", phone:"010-8888-1200", email:"hello@vision.example", website:"https://vision.example", address:"北京市海淀区", notes:"年度重点客户，关注知识管理与 AI 办公。", owner:"user_alice", last:iso(-2), next:iso(2) },
    { id:"cust_orbit", name:"星环零售", stage:"意向", industry:"新零售", source:"市场活动", phone:"021-6688-1001", email:"it@orbit.example", website:"https://orbit.example", address:"上海市徐汇区", notes:"正在评估销售协同方案。", owner:"user_alice", last:iso(-5), next:iso(5) },
    { id:"cust_green", name:"青禾制造", stage:"线索", industry:"智能制造", source:"官网", phone:"0755-2299-3300", email:"contact@green.example", website:"https://green.example", address:"深圳市南山区", notes:"需要先完成需求访谈。", owner:"user_bob", last:iso(-12), next:iso(1) },
    { id:"cust_cloud", name:"云帆教育", stage:"客户", industry:"教育科技", source:"主动开发", phone:"0571-8899-6655", email:"ops@cloudsail.example", website:"https://cloudsail.example", address:"杭州市西湖区", notes:"计划扩展到三个业务团队。", owner:"user_bob", last:iso(-1), next:iso(8) }
  ];
  for (const item of customers) customer.run({ ...item, created:iso(-60), updated:item.last });

  const contacts = [
    { id:"contact_li", customer:"cust_acme", name:"李薇", title:"信息化负责人", phone:"13800001001", email:"liwei@vision.example", wechat:"liwei-demo", primary:1, notes:"决策人", owner:"user_alice" },
    { id:"contact_chen", customer:"cust_orbit", name:"陈宇", title:"零售运营总监", phone:"13800001002", email:"chenyu@orbit.example", wechat:"chenyu-demo", primary:1, notes:"关注落地周期", owner:"user_alice" },
    { id:"contact_wang", customer:"cust_green", name:"王珂", title:"数字化经理", phone:"13800001003", email:"wangke@green.example", wechat:"wangke-demo", primary:1, notes:"技术评估人", owner:"user_bob" },
    { id:"contact_zhao", customer:"cust_cloud", name:"赵宁", title:"业务副总裁", phone:"13800001004", email:"zhaoning@cloudsail.example", wechat:"zhaoning-demo", primary:1, notes:"预算负责人", owner:"user_bob" }
  ];
  for (const item of contacts) contact.run({ ...item, created:iso(-45), updated:iso(-3) });

  const activities = [
    { id:"act_1", customer:"cust_acme", contact:"contact_li", subject:"年度方案复盘", type:"会议", content:"确认二期范围与关键里程碑。", occurred:iso(-2), next:iso(2), owner:"user_alice" },
    { id:"act_2", customer:"cust_orbit", contact:"contact_chen", subject:"发送产品资料", type:"邮件", content:"补充安全白皮书和报价说明。", occurred:iso(-5), next:iso(5), owner:"user_alice" },
    { id:"act_3", customer:"cust_green", contact:"contact_wang", subject:"首次需求沟通", type:"电话", content:"对方希望先从销售团队试点。", occurred:iso(-12), next:iso(1), owner:"user_bob" },
    { id:"act_4", customer:"cust_cloud", contact:"contact_zhao", subject:"现场工作坊", type:"拜访", content:"完成核心流程梳理。", occurred:iso(-1), next:iso(8), owner:"user_bob" }
  ];
  for (const item of activities) activity.run({ ...item, created:item.occurred, updated:item.occurred });
}

export function seed(db: Database.Database): void {
  db.transaction(() => insertSeedData(db)).immediate();
}
