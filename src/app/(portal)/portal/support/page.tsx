import { requireCustomer } from "@/components/customer-web/session";
import { PageHeader, Panel, Notice } from "@/components/customer-web/ui";
import { FAQ } from "@/components/customer-web/marketing";
import { ContactForm } from "@/components/customer-web/contact-form";
export const metadata = { title: "Help & support · Brightloop" };
export default async function SupportPage() { await requireCustomer(); return <><PageHeader eyebrow="A little help goes a long way" title="Help & support" description="Find an answer or prepare the details of your question."/><div className="support-grid"><div><Panel title="Frequently asked questions"><FAQ full/></Panel><Notice>Support request history is not connected. Preparing or copying a message does not create a support ticket.</Notice></div><ContactForm support/></div></>; }
