import { redirect } from "next/navigation";

export default function EventManageRedirectPage() {
  redirect("/dashboard/events");
}
