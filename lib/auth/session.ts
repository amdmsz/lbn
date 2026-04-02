import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";

export function auth() {
  return getServerSession(authOptions);
}
