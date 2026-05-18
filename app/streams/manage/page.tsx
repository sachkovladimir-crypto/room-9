import { redirect } from "next/navigation";

export default function ManageStreamsRedirectPage() {
  redirect("/dashboard/streams");
}
