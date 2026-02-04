import Link from 'next/link';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-black text-white">
      <main className="container mx-auto px-6 pt-20 pb-32 max-w-3xl">
        <nav className="flex justify-between items-center mb-20">
          <Link href="/" className="text-2xl font-bold">
            <span className="text-purple-400">Auto</span>mna
          </Link>
        </nav>

        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: February 4, 2026</p>

        <div className="prose prose-invert prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Overview</h2>
            <p className="text-gray-300 leading-relaxed">
              Automna (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, and safeguard your information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li><strong>Account Information:</strong> Email address and payment information when you sign up.</li>
              <li><strong>API Keys:</strong> If you provide API keys, they are stored in your isolated instance and used solely to operate your agent.</li>
              <li><strong>Agent Data:</strong> Files, conversations, and data your agent processes, stored in your isolated instance.</li>
              <li><strong>Usage Data:</strong> Basic analytics like login times and feature usage to improve our service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>To provide and maintain the Automna service</li>
              <li>To process payments and manage your subscription</li>
              <li>To send important service updates and security notices</li>
              <li>To respond to your support requests</li>
              <li>To improve our service based on aggregated, anonymized usage patterns</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Data Isolation & Security</h2>
            <p className="text-gray-300 leading-relaxed">
              Each Automna agent runs in an isolated container with its own encrypted storage. Your conversations, 
              files, and data are stored separately from other users. All data is encrypted in transit and at rest 
              at the infrastructure level. API keys stored in your instance are never logged or transmitted outside your agent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">What We Don&apos;t Do</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>We do not read your agent&apos;s conversations or files</li>
              <li>We do not sell your personal information to third parties</li>
              <li>We do not use your data to train AI models</li>
              <li>We do not share your API keys with anyone</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Third-Party Services</h2>
            <p className="text-gray-300 leading-relaxed">
              Automna integrates with third-party services you choose to connect (Discord, Telegram, etc.). 
              Your use of these services is governed by their respective privacy policies. We only access 
              these services on your behalf using credentials you provide.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Data Retention</h2>
            <p className="text-gray-300 leading-relaxed">
              Your agent data is retained while your subscription is active. Upon cancellation, we retain 
              your data for 30 days before permanent deletion, allowing you time to export or reactivate. 
              You can request immediate deletion at any time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
            <p className="text-gray-300 leading-relaxed">
              You have the right to access, correct, or delete your personal data. To exercise these rights, 
              request a data export, or for any privacy-related questions, contact us at alex@automna.ai.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Changes to This Policy</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by 
              posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have questions about this Privacy Policy, please contact us at:<br />
              <a href="mailto:alex@automna.ai" className="text-purple-400 hover:text-purple-300">alex@automna.ai</a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <Link href="/" className="text-purple-400 hover:text-purple-300">← Back to Home</Link>
        </div>
      </main>
    </div>
  );
}
