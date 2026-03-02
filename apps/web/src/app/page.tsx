import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/learn");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">The Primer</h1>
        <p className="text-xl text-muted-foreground">
          Personalized, mastery-based education for every kid.
        </p>

        <SignedOut>
          <div className="flex justify-center">
            <SignInButton mode="modal">
              <button className="rounded-lg bg-primary px-6 py-3 text-lg font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
                Get Started
              </button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <p className="text-muted-foreground">Redirecting to your playlist...</p>
        </SignedIn>

        <div className="pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground">
            AI tutoring produces the largest gains for the students with the
            least resources.
          </p>
        </div>
      </div>
    </main>
  );
}
