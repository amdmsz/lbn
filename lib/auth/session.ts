import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";

export async function auth() {
  const session = await getServerSession(authOptions);

  if (session?.user && session.user.accountValid === false) {
    return null;
  }

  return session;
}
