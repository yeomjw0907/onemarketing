import Link from "next/link";
import styles from "./public-breadcrumbs.module.css";
export type Breadcrumb = { name: string; path: string };
export default function PublicBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="현재 위치" className={styles.trail}>
      <ol>
        {items.map((item, i) => (
          <li key={item.path}>
            {i > 0 && <span aria-hidden="true">›</span>}
            {i === items.length - 1 ? (
              <span aria-current="page">{item.name}</span>
            ) : (
              <Link href={item.path}>{item.name}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
