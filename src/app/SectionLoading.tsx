/**
 * Full-height loading surface used while a lazily imported section (News) is
 * being fetched. It intentionally loads without any section CSS.
 */
export function SectionLoading({ label }: { label: string }) {
  return (
    <div className="section-loading" role="status" aria-live="polite">
      <img
        src={`${import.meta.env.BASE_URL}brand/fapplogo2.png`}
        alt=""
        width={46}
        height={46}
        className="section-loading__mark"
      />
      <span className="section-loading__label">{label}</span>
      <span className="section-loading__bar" aria-hidden="true" />
    </div>
  );
}
