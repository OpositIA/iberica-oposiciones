type OppositionSelectLabelProps = {
  comingSoonLabel: string;
  isActive: boolean;
  name: string;
};

const OppositionSelectLabel = ({
  comingSoonLabel,
  isActive,
  name
}: OppositionSelectLabelProps) => (
  <span className="flex min-w-0 items-center gap-2">
    <span className="truncate">{name}</span>
    {!isActive ? (
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {comingSoonLabel}
      </span>
    ) : null}
  </span>
);

export default OppositionSelectLabel;
