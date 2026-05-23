import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Privacy Policy | U-SMART",
  description:
    "Privacy policy for U-SMART and Proviser, including how we collect and use location data (foreground and optional background) for field maps, QField, and site workflows.",
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PrivacyPolicyPage({ params }: Props) {
  const { locale } = await params;
  const isRtl = locale === "ar" || locale === "ku";
  const t = await getTranslations("PrivacyPolicy");

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#050509] via-[#050509] to-black text-white"
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-64 w-64 translate-y-1/3 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-400/80">
              {t("legal")}
            </p>
            <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              {t("title")}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-gray-400">
              {t("subtitle")}
            </p>
          </div>

          <div className="hidden sm:flex flex-col items-end gap-2 text-right">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t("secureByDesign")}
            </span>
            <p className="text-xs text-gray-400">
              {t("lastUpdatedLabel")}{" "}
              <span className="font-medium text-gray-200">{t("lastUpdatedValue")}</span>
            </p>
          </div>
        </div>

        <div className="sm:hidden mb-6">
          <p className="text-xs text-gray-400">
            {t("lastUpdatedLabel")}{" "}
            <span className="font-medium text-gray-200">{t("lastUpdatedValue")}</span>
          </p>
        </div>

        <div className="mb-10 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-gray-400">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            {t("companyName")}
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:border-blue-500/60 hover:text-white hover:bg-blue-500/10 transition-colors"
          >
            <span className="text-sm">{isRtl ? "→" : "←"}</span>
            {t("backToHomepage")}
          </Link>
        </div>

        <div className="space-y-8 sm:space-y-10">
          <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] via-white/[0.02] to-black/40 p-5 sm:p-7 shadow-xl shadow-black/40 backdrop-blur-xl">
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("intro")}
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {t("sections.collect.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.collect.body")}
            </p>
          </section>

          <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {t("sections.location.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.location.body")}
            </p>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.location.whenLead")}
            </p>
            <ul className="mt-2 space-y-2 text-sm sm:text-base text-gray-300 leading-relaxed list-disc list-inside sm:list-outside sm:ml-5">
              <li>{t("sections.location.whenPoints.0")}</li>
              <li>{t("sections.location.whenPoints.1")}</li>
            </ul>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.location.whyLead")}
            </p>
            <ul className="mt-2 space-y-2 text-sm sm:text-base text-gray-300 leading-relaxed list-disc list-inside sm:list-outside sm:ml-5">
              <li>{t("sections.location.whyPoints.0")}</li>
              <li>{t("sections.location.whyPoints.1")}</li>
              <li>{t("sections.location.whyPoints.2")}</li>
              <li>{t("sections.location.whyPoints.3")}</li>
            </ul>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.location.control")}
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {t("sections.usage.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.usage.lead")}
            </p>
            <ul className="mt-3 space-y-2 text-sm sm:text-base text-gray-300 leading-relaxed list-disc list-inside sm:list-outside sm:ml-5">
              <li>{t("sections.usage.points.0")}</li>
              <li>{t("sections.usage.points.1")}</li>
              <li>{t("sections.usage.points.2")}</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {t("sections.security.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.security.body")}
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {t("sections.sharing.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.sharing.body")}
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {t("sections.deletion.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.deletion.body")}
            </p>
          </section>

          <section className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 sm:p-7">
            <h2 className="text-lg sm:text-xl font-semibold text-white">
              {t("sections.contact.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-300 leading-relaxed">
              {t("sections.contact.lead")}
            </p>
            <div className="mt-4 space-y-2 text-sm sm:text-base text-gray-200">
              <p>
                <span className="font-medium text-gray-300">{t("sections.contact.emailLabel")}</span>{" "}
                <a
                  href="mailto:Contact@usmart-iot.com"
                  className="text-emerald-300 hover:text-emerald-200 underline decoration-emerald-400/60 decoration-dotted"
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

