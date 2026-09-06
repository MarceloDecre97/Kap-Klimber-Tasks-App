import { redirect } from "next/navigation";

/**
 * Companies stopped being a page of their own and became the other half of
 * the address book's switch. The route stays so old links, bookmarks and the
 * back button still land somewhere sensible rather than on a 404.
 */
export default function CompaniesPage() {
  redirect("/contacts?book=companies");
}
