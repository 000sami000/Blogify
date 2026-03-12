import React from "react";
import { LoaderCircle } from "lucide-react";

const Loading = () => {
  return (
    <div className="flex min-h-[35vh] w-full items-center justify-center">
      <div className="glass-card animate-fade-up flex items-center gap-3 rounded-full px-6 py-3 text-ft-text">
        <LoaderCircle className="size-5 animate-spin text-ft-accent" />
        <p className="text-sm font-medium tracking-wide">Loading content</p>
      </div>
    </div>
  );
};

export default Loading;
