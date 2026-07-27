import type { ReviewStatus } from "@avaliacoes/shared";
import clsx from "clsx";

const styles: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const labels: Record<ReviewStatus, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Reprovada",
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex px-2 py-0.5 rounded-full text-xs font-medium",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}
