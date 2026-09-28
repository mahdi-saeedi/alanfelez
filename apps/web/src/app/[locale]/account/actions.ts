"use server";

import { revalidatePath } from "next/cache";
import { requestRefund } from "@/lib/account";

export async function refundAction(form: FormData) {
  const id = String(form.get("order") ?? "");
  const reason = String(form.get("reason") ?? "").slice(0, 1000);
  await requestRefund(id, reason);
  revalidatePath("/[locale]/account", "page");
}
