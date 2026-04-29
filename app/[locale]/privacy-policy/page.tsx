import { Link } from "@/i18n/routing";

export const metadata = {
  title: "Privacy Policy | U-SMART",
  description:
    "Learn how Smart Cities For Intelligent Systems handles and protects your personal data across our smart automation and energy management platforms.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050509] via-[#050509] to-black text-white">
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-64 w-64 translate-y-1/3 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-400/80">
              Legal
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm sm:text-base text-gray-400">
              How we collect, use, and protect your data across our smart
              automation and energy management platforms.
            </p>
          </div>

          <div className="hidden sm:flex flex-col items-end gap-2 text-right">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Secure by design
            </span>
            <p className="text-xs text-gray-400">
              Last Updated: <span className="font-medium text-gray-200">April 2026</span>
            </p>
          </div>
        </div>

        <div className="sm:hidden mb-6">
          <p className="text-xs text-gray-400">
            Last Updated: <span className="font-medium text-gray-200">April 2026</span>
          </p>
        </div>

        <div className="mb-10 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-gray-400">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Smart Cities For Intelligent Systems, Trading and Installation of Renewable Energy Systems LLC
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:border-blue-500/60 hover:text-white hover:bg-blue-500/10 transition-colors"
          >
            <span className="text-sm">←</span>
            Back to homepage
          </Link>
        </div>

        <div className="space-y-8 sm:space-y-10">
          <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] via-white/[0.02] to-black/40 p-5 sm:p-7 shadow-xl shadow-black/40 backdrop-blur-xl">
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Smart Cities For Intelligent Systems, Trading and Installation of Renewable Energy Systems Limited
              Liability Company (<span className="font-medium">&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;</span>) operates
              the website <span className="font-mono text-gray-100">usmart-iot.com</span> and our associated mobile
              applications. We are committed to protecting your privacy and ensuring that your personal data is handled
              in a safe and responsible manner.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              1. Information We Collect
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              We may collect personal information that you provide directly to us, such as your name, email address, and
              contact details, specifically when you register an account or use our smart automation and energy
              management services.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              2. How We Use Your Information
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              We use the collected data to:
            </p>
            <ul className="mt-3 space-y-2 text-sm sm:text-base text-gray-300 leading-relaxed list-disc list-inside sm:list-outside sm:ml-5">
              <li>Provide, operate, and maintain our smart systems and services.</li>
              <li>Improve and personalize user experience.</li>
              <li>Communicate with you regarding technical updates or support.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              3. Data Security
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              We implement industry-standard security measures to protect your information from unauthorized access,
              alteration, or disclosure. While we strive to use commercially acceptable means to protect your personal
              data, no method of transmission over the internet or method of electronic storage is 100% secure.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              4. Data Sharing
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              We do not sell or share your personal data with third parties, except as required by law or to provide the
              core functionality of our services (for example, secure cloud hosting, infrastructure, or payment
              processing providers that help us deliver our solutions).
            </p>
          </section>

          <section className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              5. Contact Us
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <div className="mt-4 space-y-2 text-sm sm:text-base text-gray-200">
              <p>
                <span className="font-medium text-gray-300">Email:</span>{" "}
                <a
                  href="mailto:Contact@usmart-iot.com"
                  className="text-emerald-300 hover:text-emerald-200 underline decoration-emerald-400/60 decoration-dotted"
                >
                  Contact@usmart-iot.com
                </a>
              </p>
              <p>
                <span className="font-medium text-gray-300">Address:</span> Kirkuk, Iraq.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

