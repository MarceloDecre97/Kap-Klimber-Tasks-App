import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";

export function EmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 px-5 text-center">
      <ClipboardList aria-hidden className="size-10 text-sub" strokeWidth={1.5} />
      {hasFilters ? (
        <>
          <p className="text-section-heading text-pretty">No tasks match these filters</p>
          <Button variant="secondary" onClick={onClearFilters} className="w-auto px-6">
            Clear filters
          </Button>
        </>
      ) : (
        <p className="text-section-heading text-pretty">No tasks yet — add the first one below</p>
      )}
    </div>
  );
}
