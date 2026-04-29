import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Cookie Policy | U-SMART",
  description:
    "Understand how U-SMART uses cookies and similar technologies to improve website functionality, analytics, and user experience.",
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CookiePolicyPage({ params }: Props) {
  const { locale } = await params;
  const isRtl = locale === "ar" || locale === "ku";
  const t = await getTranslations("CookiePolicy");

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#05080b] via-[#060b10] to-black text-white"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-36 right-1/2 h-80 w-80 translate-x-1/2 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-64 w-64 translate-y-1/4 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/90">
              {t("legal")}
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              {t("title")}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-gray-400">{t("subtitle")}</p>
          </div>
          <p className="hidden sm:block text-xs text-gray-400">
            {t("lastUpdatedLabel")}{" "}
            <span className="font-medium text-gray-200">{t("lastUpdatedValue")}</span>
          </p>
        </div>

        <div className="mb-8 sm:hidden">
          <p className="text-xs text-gray-400">
            {t("lastUpdatedLabel")}{" "}
            <span className="font-medium text-gray-200">{t("lastUpdatedValue")}</span>
          </p>
        </div>

        <div className="mb-10 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-gray-400">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            {t("companyName")}
          </span>
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:border-cyan-500/60 hover:text-white hover:bg-cyan-500/10 transition-colors"
          >
            <span className="text-sm">{isRtl ? "→" : "←"}</span>
            {t("backToHomepage")}
          </Link>
        </div>

        <div className="space-y-8">
          <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] via-white/[0.02] to-black/40 p-5 sm:p-7 backdrop-blur-xl">
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">{t("intro")}</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold">{t("sections.whatAreCookies.title")}</h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.whatAreCookies.body")}
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold">{t("sections.howWeUse.title")}</h2>
            <ul className="mt-3 space-y-2 text-sm sm:text-base text-gray-300 leading-relaxed list-disc list-inside sm:list-outside sm:ml-5">
              <li>{t("sections.howWeUse.points.0")}</li>
              <li>{t("sections.howWeUse.points.1")}</li>
              <li>{t("sections.howWeUse.points.2")}</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold">{t("sections.types.title")}</h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">{t("sections.types.body")}</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold">{t("sections.control.title")}</h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">{t("sections.control.body")}</p>
          </section>

          <section className="rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold">{t("sections.contact.title")}</h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">{t("sections.contact.lead")}</p>
            <div className="mt-4 space-y-2 text-sm sm:text-base text-gray-200">
              <p>
                <span className="font-medium text-gray-300">{t("sections.contact.emailLabel")}</span>{" "}
                <a
                  href="mailto:Contact@usmart-iot.com"
                  className="text-cyan-300 hover:text-cyan-200 underline decoration-cyan-400/60 decoration-dotted"
                >
                  Contact@usmart-iot.com
                </a>
              </p>
              <p>
                <span className="font-medium text-gray-300">{t("sections.contact.addressLabel")}</span>{" "}
                {t("sections.contact.addressValue")}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

