"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { ReactNode, useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { useAppDataStore } from "@/store/app-store";
import {
  author_service,
  blog_service,
  blogCategories,
  comments_service,
  google_client_id,
  notification_service,
  user_service,
  type Blog,
  type SavedBlogType,
  type User,
} from "./app-shared";

interface AppProviderProps {
  children: ReactNode;
}

let hasBootstrappedAppState = false;

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  useEffect(() => {
    if (hasBootstrappedAppState) {
      return;
    }

    hasBootstrappedAppState = true;
    void useAppDataStore.getState().initializeAppData();
  }, []);

  return (
    <GoogleOAuthProvider clientId={google_client_id}>
      {children}
      <Toaster />
    </GoogleOAuthProvider>
  );
};

export const useAppData = useAppDataStore;

export {
  user_service,
  author_service,
  blog_service,
  comments_service,
  notification_service,
  blogCategories,
  google_client_id,
};

export type { User, Blog, SavedBlogType };
