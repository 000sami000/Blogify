import { NextRequest, NextResponse } from "next/server";
import {
  generateVisitorId,
  isValidVisitorId,
  VISITOR_ID_COOKIE,
} from "./src/lib/visitor-id";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const currentVisitorId = request.cookies.get(VISITOR_ID_COOKIE)?.value;
  const visitorId = isValidVisitorId(currentVisitorId)
    ? currentVisitorId
    : generateVisitorId();

  requestHeaders.set("x-visitor-id", visitorId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (!isValidVisitorId(currentVisitorId)) {
    response.cookies.set(VISITOR_ID_COOKIE, visitorId, {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
