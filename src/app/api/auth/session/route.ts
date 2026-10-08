import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSecret } from "@/lib/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  secret: z.string().min(1),
});

export async function POST(request: Request) {
  const body = bodySchema.parse(await request.json());
  if (body.secret !== getOwnerSecret()) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set("fye_session", body.secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}
