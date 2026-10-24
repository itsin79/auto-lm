import { headers } from "next/headers";
import { repository } from "../lib/repository";
import type { StoredRecord } from "../lib/repository";
import { summary } from "../lib/domain.mjs";
export const dynamic="force-dynamic";
export default async function Home() {
  const h=await headers(), owner=h.get("oai-authenticated-user-id");
  let records:StoredRecord[]=[], failed=false;
  if(owner)try{records=await repository.list(owner,"",20);}catch{failed=true;}
  return <main className="shell">
    <header className="brand"><img width="80" height="80" src="/assets/auto-ml-logo.png" alt="اتو ال‌ام"/><div><p>دستیار گزارش خودرو در ChatGPT</p><h1>توضیح بده، گزارش بگیر</h1></div><span className="badge">پلاگین اتو ال‌ام</span></header>
    <p className="lead">وضعیت خودرو را با زبان خودت بگو. اتو ال‌ام گفته‌هایت را در همان فرم کارشناسی ۱۶ موردی ثبت می‌کند و گزارش فارسی قابل چاپ می‌سازد.</p>
    <section className="card"><h2>با @اتو ال‌ام شروع کن</h2><p>در ChatGPT، پلاگین «اتو ال‌ام» را نصب کن. سپس در یک گفت‌وگو @ را تایپ و پلاگین را انتخاب کن.</p><blockquote className="example">پژو ۲۰۶ مدل ۱۳۹۹، کارکرد ۸۵ هزار کیلومتر. روی در سمت راننده خط و خش دارد، موتور صدای غیرعادی می‌دهد و لاستیک‌های جلو فرسوده‌اند. گزارش آماده کن.</blockquote><p className="small">مواردی که نگفته‌ای بررسی‌نشده می‌مانند. می‌توانی در پیام بعدی اطلاعات را تکمیل یا اصلاح کنی. گزارش و لینک چاپ در همان گفت‌وگو برمی‌گردد.</p></section>
    <section className="card"><h2>پرونده‌های من</h2>{!owner?<p><a href="/signin-with-chatgpt?return_to=%2F" target="_top">ورود با حساب ChatGPT</a></p>:failed?<p role="alert">خواندن پرونده‌ها انجام نشد. صفحه را دوباره باز کنید.</p>:!records.length?<p className="empty">هنوز گزارشی ثبت نشده است. اولین گزارش را از گفت‌وگوی ChatGPT بساز.</p>:<ul className="report-list">{records.map(r=>{const s=summary(r);return <li key={r.id}><a href={`/reports/${encodeURIComponent(r.id)}`}><strong>{r.vehicle.model}</strong><span>{s.answered} از ۱۶ مورد · {s.score===null?"مقدماتی":`${s.score} از ۱۰۰`}</span></a></li>;})}</ul>}</section>
    <section className="card"><h2>اتصال و انتقال گزارش</h2><p>این پلاگین ابزارهای ثبت، اصلاح، جست‌وجو و همگام‌سازی پرونده به پنل مدیریت را دارد.</p><code className="endpoint">https://auto-lm-car-reports.imsefidgari.chatgpt.site/mcp</code><p className="small">همگام‌سازی خودکار وقتی فعال است که اتصال امن پنل مدیریت پیکربندی شده باشد. در غیر این صورت، از صفحه گزارش «دریافت برای اپ اتو ال‌ام» را بزن و JSON را در تاریخچه اپ وارد کن.</p></section>
    <p className="notice">گزارش بر پایه گفته‌های کاربر تهیه می‌شود؛ جایگزین بازدید و کارشناسی حضوری یا گواهی ایمنی نیست.</p>
  </main>;
}
