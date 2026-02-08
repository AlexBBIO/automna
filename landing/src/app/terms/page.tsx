import Link from 'next/link';

export default function Terms() {
  return (
    <div className="min-h-screen bg-black text-white">
      <main className="container mx-auto px-6 pt-20 pb-32 max-w-3xl">
        <nav className="flex justify-between items-center mb-20">
          <Link href="/" className="text-2xl font-bold">
            <span className="text-purple-400">Auto</span>mna
          </Link>
        </nav>

        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <p className="text-gray-400 mb-8">Last updated: February 8, 2026</p>

        <div className="prose prose-invert prose-gray max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing or using Automna (&quot;the Service&quot;), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-gray-300 leading-relaxed">
              Automna provides hosted AI agent infrastructure. We provision and manage isolated computing 
              environments where AI agents operate on your behalf, with AI capabilities included in your subscription.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Your Responsibilities</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              You are solely responsible for your use of the Service and any actions taken by your AI agent. 
              By using Automna, you agree to the following:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>You must comply with all applicable local, state, federal, and international laws and regulations in connection with your use of the Service</li>
              <li>You must comply with the terms of service of any third-party services you connect</li>
              <li>You must not use the Service for any unlawful purpose or to facilitate illegal activities of any kind</li>
              <li>You must not attempt to access other users&apos; data or systems</li>
              <li>You must use the Service within reasonable usage limits for your plan</li>
              <li>You are solely responsible for the actions your AI agent takes on your behalf, including any consequences resulting from those actions</li>
              <li>You accept full liability for any harm, damages, or legal consequences arising from your use of the Service or your agent&apos;s actions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Engage in, facilitate, or promote any illegal activity under applicable local, state, federal, or international law</li>
              <li>Generate spam, malware, or harmful content</li>
              <li>Harass, abuse, threaten, or harm others</li>
              <li>Infringe on intellectual property rights</li>
              <li>Attempt to circumvent security measures</li>
              <li>Abuse compute resources (e.g., cryptocurrency mining, excessive automated requests)</li>
              <li>Conduct fraud, money laundering, or other financial crimes</li>
              <li>Resell or redistribute the Service without authorization</li>
            </ul>
            <p className="text-gray-300 leading-relaxed mt-4">
              We reserve the right to suspend or terminate accounts that violate these terms without notice. 
              You agree to indemnify and hold Automna harmless from any claims, damages, or expenses arising 
              from your violation of these terms or misuse of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Payment & Billing</h2>
            <p className="text-gray-300 leading-relaxed">
              Subscriptions are billed monthly. You authorize us to charge your payment method on a recurring 
              basis. Refunds are provided at our discretion. We reserve the right to change pricing with 
              30 days notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Service Availability</h2>
            <p className="text-gray-300 leading-relaxed">
              We strive for high availability but do not guarantee uninterrupted service. We may perform 
              maintenance with reasonable notice. We are not liable for downtime or data loss.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
            <p className="text-gray-300 leading-relaxed">
              You retain ownership of your data and any content you create using the Service. We retain 
              ownership of the Automna platform, branding, and underlying technology. The Service incorporates 
              open-source software components.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE ARE NOT LIABLE FOR 
              INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES. OUR TOTAL LIABILITY IS LIMITED 
              TO THE AMOUNT YOU PAID US IN THE PAST 12 MONTHS.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Termination</h2>
            <p className="text-gray-300 leading-relaxed">
              You may cancel your subscription at any time. We may terminate or suspend your account for 
              violation of these terms. Upon termination, your data will be retained for 30 days before deletion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              We may modify these terms at any time. Material changes will be communicated via email or 
              prominent notice on the Service. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact</h2>
            <p className="text-gray-300 leading-relaxed">
              Questions about these Terms? Contact us at:<br />
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
