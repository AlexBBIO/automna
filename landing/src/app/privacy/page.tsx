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
        <p className="text-gray-400 mb-8">Last updated: January 28, 2026</p>

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
              <li><strong>API Keys:</strong> Your AI provider API keys, stored encrypted and used solely to operate your agent.</li>
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
              Each Automna agent runs in an isolated container. Your conversations, files, and data are 
              stored separately from other users. We use encryption at rest and in transit. Your API keys 
              are encrypted with AES-256 and never logged or exposed.
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
              You have the right to access, correct, or delete your personal data. You can export your 
              agent&apos;s data at any time through your dashboard. To exercise these rights or for any 
              privacy-related questions, contact us at privacy@automna.ai.
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
              <a href="mailto:privacy@automna.ai" className="text-purple-400 hover:text-purple-300">privacy@automna.ai</a>
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
