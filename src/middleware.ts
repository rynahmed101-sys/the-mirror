import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/auth";

function deny() {
  return new NextResponse("THE MIRROR admin authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="THE MIRROR", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) return deny();

  try {
    const decoded = atob(header.slice(6).trim());
    const split = decoded.indexOf(":");
    if (split < 0) return deny();

    const username = decoded.slice(0, split);
    const credential = decoded.slice(split + 1);

    if (!(await verifyAdminCredentials(username, credential))) {
      return deny();
    }

    return NextResponse.next();
  } catch {
    return deny();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
