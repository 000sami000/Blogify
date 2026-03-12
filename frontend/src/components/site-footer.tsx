import Link from "next/link";

const footerColumns = [
  {
    title: "Home",
    links: ["Features", "Blogs", "Resources", "Testimonials", "Newsletter"],
  },
  {
    title: "News",
    links: ["Trending", "Technology", "Health", "Finance", "Environment"],
  },
  {
    title: "Blogs",
    links: ["AI Ethics", "Space Exploration", "Biotechnology", "Renewable Energy"],
  },
  {
    title: "Resources",
    links: ["Whitepapers", "Ebooks", "Reports", "Research Papers"],
  },
];

const SiteFooter = () => {
  return (
    <footer className="relative z-10 mt-10 border-t border-ft-border/70 bg-ft-bg">
      <div className="mx-auto w-full max-w-[1600px] space-y-8 px-3 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {footerColumns.map((column) => (
            <div key={column.title} className="space-y-3">
              <h4 className="text-sm font-semibold text-ft-text">{column.title}</h4>
              <ul className="space-y-2 text-sm text-ft-muted">
                {column.links.map((link) => (
                  <li key={link}>
                    <Link href="/blogs" className="transition hover:text-ft-accent">
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ft-border/70 pt-6 text-xs text-ft-muted">
          <p>Terms & Conditions</p>
          <p>Privacy Policy</p>
          <p>(c) 2026 The Reading Retreat. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
