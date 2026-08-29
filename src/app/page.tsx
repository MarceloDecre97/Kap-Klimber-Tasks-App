import { redirect } from "next/navigation";

/**
 * The Dashboard is the front door: it answers "what needs me today?", which
 * is the question someone opening the app is actually asking. The Tasklist
 * is one tap away for when the answer is "let me go work on something".
 */
export default function RootPage() {
  redirect("/dashboard");
}
