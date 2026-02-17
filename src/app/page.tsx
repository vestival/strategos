import { getServerSession } from "next-auth";

import { LandingClient } from "@/components/landing/landing-client";
import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  return <LandingClient isSignedIn={Boolean(session?.user)} />;
}
