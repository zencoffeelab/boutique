import { Link } from "react-router";

export function Logo({ home = "/" }: { home?: string }) {
  return (
    <Link to={home} className="logo" aria-label="Zen Coffee Lab">
      <img src="/media/logo-black.svg" alt="" width="104" height="56" />
    </Link>
  );
}
