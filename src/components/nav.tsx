import Link from "next/link";

const links = [
  { href: "/ingredients", label: "วัตถุดิบ" },
  { href: "/products", label: "เมนู" },
  { href: "/units", label: "หน่วย" },
  { href: "/channels", label: "ช่องทางขาย" },
];

export function Nav() {
  return (
    <header className="site-header">
      <p className="site-title">คิดต้นทุนเมนู</p>
      <nav>
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
