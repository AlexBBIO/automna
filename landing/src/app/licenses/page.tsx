import Link from 'next/link';

export default function Licenses() {
  return (
    <div className="min-h-screen bg-black text-white">
      <main className="container mx-auto px-6 pt-20 pb-32 max-w-3xl">
        <nav className="flex justify-between items-center mb-20">
          <Link href="/" className="text-2xl font-bold">
            <span className="text-purple-400">Auto</span>mna
          </Link>
        </nav>

        <h1 className="text-4xl font-bold mb-8">Open Source Licenses</h1>
        <p className="text-gray-400 mb-8">
          Automna is built on the shoulders of open source software. We&apos;re grateful to the 
          developers and communities who make their work freely available.
        </p>

        <div className="space-y-12">
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-semibold mb-2">Moltbot (formerly Clawdbot)</h2>
            <p className="text-gray-400 text-sm mb-4">Core agent infrastructure</p>
            <p className="text-gray-300 leading-relaxed mb-4">
              Automna&apos;s agent infrastructure is powered by Moltbot, an open-source AI agent framework.
            </p>
            <div className="bg-black rounded-lg p-4 font-mono text-sm text-gray-300 overflow-x-auto">
              <pre>{`MIT License

Copyright (c) 2025 Peter Steinberger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}</pre>
            </div>
            <p className="text-gray-400 text-sm mt-4">
              <a href="https://github.com/moltbot/moltbot" className="text-purple-400 hover:text-purple-300" target="_blank" rel="noopener noreferrer">
                View on GitHub →
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Other Open Source Software</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Automna also uses the following open source projects:
            </p>
            <ul className="space-y-3 text-gray-300">
              <li className="flex justify-between items-center py-2 border-b border-gray-800">
                <span>Next.js</span>
                <span className="text-gray-500 text-sm">MIT License</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-gray-800">
                <span>React</span>
                <span className="text-gray-500 text-sm">MIT License</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-gray-800">
                <span>Tailwind CSS</span>
                <span className="text-gray-500 text-sm">MIT License</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-gray-800">
                <span>Node.js</span>
                <span className="text-gray-500 text-sm">MIT License</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-gray-800">
                <span>Docker</span>
                <span className="text-gray-500 text-sm">Apache 2.0 License</span>
              </li>
              <li className="flex justify-between items-center py-2 border-b border-gray-800">
                <span>PostgreSQL</span>
                <span className="text-gray-500 text-sm">PostgreSQL License</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Our Commitment</h2>
            <p className="text-gray-300 leading-relaxed">
              We believe in giving back to the open source community. When we develop improvements 
              to open source components, we contribute them upstream where appropriate. We also 
              support open source maintainers through sponsorships and contributions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Questions?</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have questions about our use of open source software or licensing, please contact us at:<br />
              <a href="mailto:legal@automna.ai" className="text-purple-400 hover:text-purple-300">legal@automna.ai</a>
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
