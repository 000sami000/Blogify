import SideBar from "@/components/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import React, { ReactNode } from "react";

interface BlogsProps {
  children: ReactNode;
}

const HomeLayout: React.FC<BlogsProps> = ({ children }) => {
  return (
    <SidebarProvider>
      <SideBar />
      <main className="w-full">
        <div className="min-h-[calc(100vh-110px)] w-full">{children}</div>
      </main>
    </SidebarProvider>
  );
};

export default HomeLayout;
