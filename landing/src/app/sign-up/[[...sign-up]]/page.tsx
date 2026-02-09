import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center transition-colors">
      <SignUp 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800",
            headerTitle: "text-zinc-900 dark:text-white",
            headerSubtitle: "text-zinc-500 dark:text-zinc-400",
            socialButtonsBlockButton: "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700",
            formFieldLabel: "text-zinc-700 dark:text-zinc-300",
            formFieldInput: "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white",
            footerActionLink: "text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300",
            formButtonPrimary: "bg-purple-600 hover:bg-purple-500",
          },
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/pricing?welcome=true"
      />
    </div>
  );
}
