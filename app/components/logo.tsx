import { Link } from "react-router";

export function Logo({ home = "/" }: { home?: string }) {
  return (
    <Link to={home} className="logo" aria-label="Zen Coffee Lab">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 30c7-1 10-8 11-16 9 3 15 9 17 18-9 3-19 2-28-2Z" />
        <path d="M16 34c5-5 10-10 17-15" />
      </svg>
      <span><strong>Zen</strong><small>Coffee Lab</small></span>
    </Link>
  );
}
