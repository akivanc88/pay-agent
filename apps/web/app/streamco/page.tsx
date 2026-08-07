/** StreamCo index — there is one demo account, so send visitors straight to it. */
import { redirect } from "next/navigation";

export default function StreamCoIndex() {
  redirect("/streamco/acct_demo");
}
