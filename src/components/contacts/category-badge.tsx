import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON } from "@/lib/contacts-view";
import { cn } from "@/lib/utils";
import type { ContactCategory } from "@/lib/data/contacts";

/**
 * What kind of contact this is.
 *
 * Deliberately quieter than a status badge: muted fill, muted text, one
 * treatment for every value. A contact row can sit beside a task card, and
 * two badges competing for the same attention is how somebody stops reading
 * either. The icon is always paired with the word, so nothing here depends
 * on colour.
 */
export function CategoryBadge({
  category,
  className,
}: {
  category: ContactCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category.icon] ?? DEFAULT_CATEGORY_ICON;
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5",
        "border-[1.5px] border-line bg-muted text-[15px] leading-5 font-bold text-muted-fg",
        className
      )}
    >
      <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
      {category.label}
    </span>
  );
}
