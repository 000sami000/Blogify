import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const TopStrip = () => {
  return (
    <div className="relative z-50 border-b border-ft-border/70 bg-ft-bg text-[11px] text-ft-muted">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-center px-3 py-2 sm:px-6 lg:px-8">
        <Link
          href="/blogs"
          className="inline-flex items-center gap-1.5 tracking-wide transition hover:text-ft-text"
        >
          Subscribe to our newsletter for new and latest blogs and resources
          <ArrowUpRight className="size-3.5 text-ft-accent" />
        </Link>
      </div>
    </div>
  );
};

export default TopStrip;
