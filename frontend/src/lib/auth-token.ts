import Cookies from "js-cookie";

const isLikelyJwt = (token: string) => token.split(".").length === 3;

export const getAuthToken = () => {
  const token = Cookies.get("token")?.trim();

  if (!token || token === "undefined" || token === "null" || !isLikelyJwt(token)) {
    Cookies.remove("token", { path: "/" });
    return null;
  }

  return token;
};

export const getSecureCookieFlag = () =>
  typeof window !== "undefined" && window.location.protocol === "https:";
