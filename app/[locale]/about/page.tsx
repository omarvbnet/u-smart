"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Target,
  Wifi,
  Code2,
  Home,
  Mail,
  Phone,
  MessageCircle,
  MapPin,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const Section = ({
  children,
  id,
  className = "",
  padding = "py-14 sm:py-16 md:py-24",
}: {
  children: React.ReactNode;
  id: string;
  className?: string;
  padding?: string;
}) => {
  const locale = useLocale();
  const isRTL = locale === "ar";

  return (
    <section
      id={id}
      className={`${padding} w-full relative overflow-hidden ${className}`}
      style={{ direction: isRTL ? "rtl" : "ltr" }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-blue-500/8 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-40 w-[400px] h-[400px] bg-gradient-to-tr from-purple-500/6 via-transparent to-transparent rounded-full blur-3xl" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10"
      >
        {children}
      </motion.div>
    </section>
  );
};

const ServiceCard = ({
  icon: Icon,
  title,
  description,
  href,
  index,
  gradient,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  index: number;
  gradient: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: index * 0.1, duration: 0.5 }}
  >
    <Link href={href} className="block h-full group">
      <div className="h-full p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-sm border border-white/10 hover:border-white/20 hover:from-white/[0.12] hover:to-white/[0.04] hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300">
        <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${gradient} border border-white/5 mb-5`}>
          <Icon className="w-7 h-7 text-white/90" />
        </div>
        <h3 className="text-xl font-bold text-white mb-3 group-hover:text-blue-300 transition-colors">
          {title}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed mb-4">
          {description}
        </p>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
          Learn more
          <ChevronRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  </motion.div>
);

export default function AboutPage() {
  const t = useTranslations("About");
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ku";

  const services = [
    {
      key: "quality",
      icon: Target,
      title: t("qualityTitle"),
      description: t("qualityDescription"),
      href: "/services/quality-control-supervision",
      gradient: "from-emerald-500/25 to-teal-500/15",
    },
    {
      key: "telecommunication",
      icon: Wifi,
      title: t("telecommunicationTitle"),
      description: t("telecommunicationDescription"),
      href: "/services/enterprise-networking",
      gradient: "from-cyan-500/25 to-blue-500/15",
    },
    {
      key: "programming",
      icon: Code2,
      title: t("programmingTitle"),
      description: t("programmingDescription"),
      href: "/services/custom-software",
      gradient: "from-violet-500/25 to-purple-500/15",
    },
    {
      key: "smartHomes",
      icon: Home,
      title: t("smartHomesTitle"),
      description: t("smartHomesDescription"),
      href: "/services/smart-home-automation",
      gradient: "from-amber-500/20 to-orange-500/15",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      {/* Hero */}
      <Section id="about-hero" padding="pt-10 pb-14 sm:pt-14 sm:pb-20 md:pt-20 md:pb-24">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="space-y-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className={`w-4 h-4 ${isRTL ? "rotate-180" : ""}`} />
              {t("backToHome")}
            </Link>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/15 to-cyan-500/10 border border-blue-500/25">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-blue-300">
                {t("heroSubtitle")}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                {t("heroTitle")}
              </span>
            </h1>
            <p className="text-lg text-gray-400 max-w-2xl leading-relaxed">
              {t("heroDescription")}
            </p>
          </div>
          <div className="hidden md:block w-64 h-64 rounded-3xl bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-transparent border border-white/10 flex items-center justify-center">
            <Target className="w-24 h-24 text-blue-400/40" />
          </div>
        </div>
      </Section>

      {/* Vision */}
      <Section id="vision">
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/10 border border-white/10 p-8 sm:p-10 md:p-12 lg:p-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400 mb-4">
            {t("visionSubtitle")}
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 text-white">
            {t("visionTitle")}
          </h2>
          <p className="text-gray-400 text-base sm:text-lg leading-relaxed max-w-3xl">
            {t("visionText")}
          </p>
        </div>
      </Section>

      {/* Services */}
      <Section id="about-services">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400 mb-4">
          {t("servicesSubtitle")}
        </p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-12 text-white">
          {t("servicesTitle")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, index) => (
            <ServiceCard
              key={service.key}
              icon={service.icon}
              title={service.title}
              description={service.description}
              href={service.href}
              index={index}
              gradient={service.gradient}
            />
          ))}
        </div>
      </Section>

      {/* Contact */}
      <Section id="about-contact" padding="py-14 sm:py-16 md:py-24">
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 p-8 sm:p-10 md:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400 mb-4">
            {t("contactSubtitle")}
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-white">
            {t("contactTitle")}
          </h2>
          <p className="text-gray-400 text-base mb-10 max-w-xl">
            {t("contactDescription")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <a
              href="mailto:contact@usmart-iot.com"
              className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all group"
            >
              <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 group-hover:scale-105 transition-transform">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("email")}
                </p>
                <p className="text-white font-medium">contact@usmart-iot.com</p>
              </div>
            </a>
            <a
              href="tel:+9647760777659"
              className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all group"
            >
              <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("phone")}
                </p>
                <p className="text-white font-medium">+964 776 077 7659</p>
              </div>
            </a>
            <a
              href="https://wa.me/9647760777659"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all group"
            >
              <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("whatsapp")}
                </p>
                <p className="text-white font-medium">+964 776 077 7659</p>
              </div>
            </a>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("location")}
                </p>
                <p className="text-white font-medium">{t("locationValue")}</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Back CTA */}
      <Section id="back-cta" padding="pb-20">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all"
          >
            <ArrowLeft className={`w-5 h-5 ${isRTL ? "rotate-180" : ""}`} />
            {t("backToHome")}
          </Link>
        </div>
      </Section>
    </div>
  );
}
