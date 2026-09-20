import { BRAND_ENGLISH } from "../branding";

// Decorative document sleeve; actual titles and progress remain outside it.
export default function ArchiveCover({
  number,
  variant = 0,
}: {
  number: number;
  variant?: number;
}) {
  return (
    <div className={`archive-art variant-${variant % 6}`} aria-hidden="true">
      <div className="glass-file">
        <div className="glass-label">
          <b>RA / {String(number).padStart(3, "0")}</b>
          <img src="/brand/rhine-lab-mark.svg" alt="" />
        </div>
        <div className="lens lens-a" />
        <div className="lens lens-b" />
        <div className="lens-link" />
        <div className="file-lines" />
        <span className="glass-stamp">
          {BRAND_ENGLISH}
          <br />
          READING ARCHIVE
        </span>
        <i className="screw s1" />
        <i className="screw s2" />
        <span className="gold-bar" />
      </div>
      <span className="art-caption">
        {String(number).padStart(3, "0")} / PDF
      </span>
    </div>
  );
}
