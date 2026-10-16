import type { ReactNode } from "react";
export function StickyCTA({
  children,
  end,
  onClick,
  disabled,
  yellow,
  form,
}: {
  children: ReactNode;
  end?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  yellow?: boolean;
  form?: string;
}) {
  return (
    <div className="sticky-wrap">
      <button
        form={form}
        type={form ? "submit" : "button"}
        className={`sticky-cta ${yellow ? "yellow" : ""}`}
        onClick={onClick}
        disabled={disabled}
      >
        <span>{children}</span>
        <span className="num">{end ?? "→"}</span>
      </button>
    </div>
  );
}
