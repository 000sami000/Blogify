"use client";

import { AlertTriangle, X } from "lucide-react";
import { Button } from "./ui/button";
import { useAppData } from "@/context/AppContext";

const ErrorBanner = () => {
  const { apiError, clearApiError } = useAppData();

  if (!apiError) {
    return null;
  }

  return (
    <div className="sticky top-[92px] z-40 mx-auto mt-3 w-[95%] max-w-6xl animate-slide-down rounded-xl border border-red-300 bg-red-50/95 px-4 py-3 text-red-800 shadow-lg backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-5" />
          <div>
            <p className="text-sm font-semibold">Server Error</p>
            <p className="text-sm">{apiError}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-700 hover:bg-red-100"
          onClick={clearApiError}
          aria-label="Dismiss error"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};

export default ErrorBanner;
