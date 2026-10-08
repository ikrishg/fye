import { NextResponse } from "next/server";
import { allowDevAutoLogin } from "@/lib/auth-policy";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    allowDevAutoLogin: allowDevAutoLogin(),
  });
}
