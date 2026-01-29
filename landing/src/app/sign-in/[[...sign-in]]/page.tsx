import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black flex items-center justify-center">
      <SignIn 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-gray-900 border border-gray-800",
            headerTitle: "text-white",
            headerSubtitle: "text-gray-400",
            socialButtonsBlockButton: "bg-gray-800 border-gray-700 text-white hover:bg-gray-700",
            formFieldLabel: "text-gray-300",
            formFieldInput: "bg-gray-800 border-gray-700 text-white",
            footerActionLink: "text-purple-400 hover:text-purple-300",
            formButtonPrimary: "bg-purple-600 hover:bg-purple-500",
          },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
      />
    </div>
  );
}
