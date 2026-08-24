import { redirect } from "next/navigation";

export default function LegacyAutomationOrdersPage() {
  redirect("/automations/abandoned-carts?section=orders");
}
