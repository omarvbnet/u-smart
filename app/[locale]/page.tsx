"use client";

import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, PerspectiveCamera, Icosahedron, MeshDistortMaterial } from "@react-three/drei";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import * as THREE from "three";
import {
  Smartphone, Network, CheckCircle2, GraduationCap, Boxes,
  Code2, Cloud, ExternalLink, Sparkles,
  Zap, Globe, ArrowRight, Shield, Home, Wifi,
  Rocket, Users, BarChart3, Cpu,
  Briefcase, MapPin, Clock, Building,
  ChevronRight, ChevronDown, Award, Target, Layers,
  ShieldCheck, Database, Server, Code,
  GitBranch, CloudLightning, MessageSquare,
  Mail, Phone, Map, Linkedin, Twitter,
  Github, Instagram, Globe as GlobeIcon,
  Facebook, MessageCircle, FileDown
} from "lucide-react";
import { getServiceIcon } from "@/lib/service-icons";
import { Link } from "@/i18n/routing";
import Navigation from "@/components/Navbar";

/* ================= ENHANCED HERO VISUAL ================= */
function EnhancedTechHero() {
  const meshRef = useRef<THREE.Mesh>(null!);
  
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    meshRef.current.rotation.y = time * 0.15;
    meshRef.current.rotation.x = Math.sin(time * 0.1) * 0.1;
    
    const pulse = Math.sin(time * 1.5) * 0.02 + 1;
    meshRef.current.scale.set(pulse, pulse, pulse);
  });

  return (
    <group>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.6} color="#3b82f6" />
      <pointLight position={[-5, -5, 5]} intensity={0.3} color="#8b5cf6" />
      
      <Float speed={1.2} rotationIntensity={0.5} floatIntensity={0.8}>
        <Icosahedron ref={meshRef} args={[1.8, 2]}>
          <MeshDistortMaterial
            color="#3b82f6"
            emissive="#1d4ed8"
            emissiveIntensity={0.2}
            speed={1.5}
            distort={0.3}
            wireframe
            wireframeLinewidth={1.2}
            opacity={0.35}
            transparent
          />
        </Icosahedron>
      </Float>
    </group>
  );
}

/* ================= CONSISTENT SECTION WRAPPER ================= */
const Section = ({ 
  children, 
  id, 
  className = "", 
  background = "",
  padding = "py-14 sm:py-16 md:py-24",
  container = true
}: { 
  children: React.ReactNode; 
  id: string; 
  className?: string;
  background?: string;
  padding?: string;
  container?: boolean;
}) => {
  const ref = useRef(null);
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ku";

  return (
    <section
      ref={ref}
      id={id}
      className={`${padding} w-full relative overflow-hidden ${className}`}
      style={{ 
        background: background || undefined,
        direction: isRTL ? "rtl" : "ltr"
      }}
    >
      {/* Ambient gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-blue-500/8 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-40 w-[400px] h-[400px] bg-gradient-to-tr from-purple-500/6 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-80 bg-gradient-to-r from-blue-500/4 via-cyan-500/4 to-purple-500/4 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0A0A0F]/50" />
      </div>
      
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`${container ? 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8' : 'w-full'} relative z-10`}
      >
        {children}
      </motion.div>
    </section>
  );
};

/* ================= CONSISTENT SECTION HEADER ================= */
const SectionHeader = ({ 
  subtitle, 
  title, 
  description, 
  centered = true,
  icon: Icon,
  gradient = "from-blue-500 to-cyan-500"
}: {
  subtitle: string;
  title: string;
  description?: string;
  centered?: boolean;
  icon?: any;
  gradient?: string;
}) => {
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ku";
  
  return (
    <div className={`${centered ? 'text-center' : 'text-left'} mb-10 sm:mb-14 md:mb-20`}>
      {/* Subtitle pill */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        className={`inline-flex items-center gap-2 mb-4 sm:mb-5 px-3 py-2 sm:px-4 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 backdrop-blur-sm ${centered ? '' : ''}`}
      >
        {Icon && <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />}
        <span className={`text-[10px] sm:text-xs font-bold text-blue-300/90 ${!isRTL ? 'uppercase tracking-[0.15em] sm:tracking-[0.2em]' : ''}`}>
          {subtitle}
        </span>
      </motion.div>
      
      {/* Title with gradient */}
      <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-4 sm:mb-6 leading-[1.15] tracking-tight">
        <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
          {title}
        </span>
      </h2>
      
      {/* Description */}
      {description && (
        <p className={`text-base sm:text-lg md:text-xl text-gray-400 max-w-3xl leading-relaxed ${centered ? 'mx-auto' : ''}`}>
          {description}
        </p>
      )}
    </div>
  );
};

/* ================= CARD COMPONENT ================= */
const Card = ({
  children,
  className = "",
  hoverable = true,
  padding = "p-6"
}: {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  padding?: string;
}) => {
  return (
    <div className={`
      ${padding}
      rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-sm border border-white/10
      ${hoverable ? 'hover:border-white/20 hover:from-white/[0.12] hover:to-white/[0.04] hover:shadow-xl hover:shadow-blue-500/5' : ''}
      transition-all duration-300
      ${className}
    `}>
      {children}
    </div>
  );
};

/* ================= SERVICE CARD (API data only) ================= */
const ServiceCard = ({
  icon: Icon,
  title,
  description,
  index = 0,
  href
}: {
  icon: any;
  title: string;
  description: string;
  index?: number;
  href?: string;
}) => {
  const t = useTranslations("Index");
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5 }}
      whileHover={{ y: -6 }}
      className="group h-full relative"
    >
      <div className="h-full rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 p-5 sm:p-6 md:p-8 backdrop-blur-sm transition-all duration-300 hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 overflow-hidden">
        {/* Subtle gradient glow on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-cyan-500/0 group-hover:from-blue-500/5 group-hover:to-cyan-500/5 transition-all duration-300 pointer-events-none" />
        <div className="relative flex flex-col h-full">
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 w-fit rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 group-hover:from-blue-500/30 group-hover:to-cyan-500/20 transition-all duration-300">
            <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3 text-white">{title}</h3>
          <p className="text-gray-400 text-sm leading-relaxed flex-1 line-clamp-3">
            {description}
          </p>
          <div className="mt-4 sm:mt-6 flex items-center gap-2 text-blue-400 font-medium text-sm group-hover:gap-3 transition-all">
            <span>{t("learnMore")}</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {card}
      </Link>
    );
  }
  return card;
};

/* ================= CONSISTENT STATS ================= */
type StatItem = { key: string; value: number; label: string; suffix: string | null };
const Stats = ({ apiStats }: { apiStats?: StatItem[] }) => {
  const t = useTranslations("Index");
  const [counts, setCounts] = useState({
    clients: 0,
    projects: 0,
    uptime: 0,
    countries: 0
  });

  useEffect(() => {
    const targets = apiStats?.length
      ? {
          clients: Number(apiStats.find((s) => s.key === "clients")?.value ?? 250),
          projects: Number(apiStats.find((s) => s.key === "projects")?.value ?? 500),
          uptime: Number(apiStats.find((s) => s.key === "uptime")?.value ?? 99.9),
          countries: Number(apiStats.find((s) => s.key === "countries")?.value ?? 25),
        }
      : { clients: 250, projects: 500, uptime: 99.9, countries: 25 };

    const animateValue = (
      key: keyof typeof counts,
      target: number,
      duration: number
    ) => {
      let start = 0;
      const increment = target / (duration / 16);
      const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
          setCounts((prev) => ({ ...prev, [key]: target }));
          clearInterval(timer);
        } else {
          const val = key === "uptime" ? Math.floor(start * 10) / 10 : Math.floor(start);
          setCounts((prev) => ({ ...prev, [key]: val }));
        }
      }, 16);
    };

    animateValue("clients", targets.clients, 1200);
    animateValue("projects", targets.projects, 1500);
    animateValue("uptime", targets.uptime, 1800);
    animateValue("countries", targets.countries, 2000);
  }, [apiStats]);

  const statsFromApi = apiStats?.length
    ? apiStats.map((s) => ({
        value: counts[s.key as keyof typeof counts] ?? s.value,
        suffix: s.suffix || "+",
        label: s.label,
        description: s.key === "projects" ? "Projects delivered" : s.key === "clients" ? "Satisfied clients" : s.key === "uptime" ? "System reliability" : "Global presence",
      }))
    : null;

  const stats =
    statsFromApi ??
    [
      { value: counts.clients, suffix: "+", label: t("clients"), description: "Satisfied clients" },
      { value: counts.projects, suffix: "+", label: t("projects"), description: "Projects delivered" },
      { value: counts.uptime, suffix: "%", label: t("uptime"), description: "System reliability" },
      { value: counts.countries, suffix: "+", label: "Countries", description: "Global presence" },
    ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
      {stats.map((stat, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card className="text-center p-4 sm:p-6">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1">
              {stat.value}{stat.suffix}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-gray-300 mb-1">
              {stat.label}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 line-clamp-1">
              {stat.description}
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
};

/* ================= CONSISTENT BUTTON COMPONENTS ================= */
const PrimaryButton = ({ children, icon: Icon, href }: {
  children: string;
  icon?: any;
  href: string;
}) => {
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ku";
  return (
  <Link href={href}>
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-200 flex items-center justify-center gap-2 ${!isRTL ? 'uppercase tracking-wider' : ''}`}
    >
      {children}
      {Icon && <Icon className="w-4 h-4" />}
    </motion.button>
  </Link>
  );
};

const SecondaryButton = ({ children, icon: Icon, href }: {
  children: string;
  icon?: any;
  href: string;
}) => {
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ku";
  return (
  <Link href={href}>
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`px-6 py-3 border border-white/20 rounded-lg font-medium text-sm hover:bg-white/5 transition-all duration-200 flex items-center justify-center gap-2 ${!isRTL ? 'uppercase tracking-wider' : ''}`}
    >
      {children}
      {Icon && <Icon className="w-4 h-4" />}
    </motion.button>
  </Link>
  );
};

/* ================= LANGUAGE SWITCHER ================= */
const LanguageSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const locale = useLocale();
  
  const languages = [
    { code: "en", name: "EN", flag: "🇺🇸" },
    { code: "ar", name: "AR", flag: "🇸🇦" },
    { code: "ku", name: "KU", flag: "🇮🇶" },
    { code: "tr", name: "TR", flag: "🇹🇷" }
  ];

  const currentLang = languages.find(l => l.code === locale) || languages[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all duration-200"
      >
        <span className="text-sm">{currentLang.flag}</span>
        <span className="text-xs font-medium">{currentLang.name}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            className="absolute top-full mt-2 right-0 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg p-2 min-w-[100px] z-50"
          >
            {languages.map((lang) => (
              <Link
                key={lang.code}
                href="/"
                locale={lang.code}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 rounded transition-all duration-150"
                onClick={() => setIsOpen(false)}
              >
                <span className="text-sm">{lang.flag}</span>
                <span>{lang.name}</span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ================= SCROLL INDICATOR ================= */
const ScrollIndicator = () => {
  const [isVisible, setIsVisible] = useState(true);
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ku";

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY < 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 hidden md:flex flex-col items-center gap-2"
    >
      <span className={`text-xs font-mono text-gray-500 ${!isRTL ? 'uppercase tracking-wider' : ''}`}>
        Scroll
      </span>
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="h-6 w-px bg-gradient-to-b from-blue-500/60 via-cyan-400/40 to-transparent"
      />
    </motion.div>
  );
};

type CareerItem = {
  id: string;
  title: string;
  slug?: string;
  description: string;
  department: string;
  location: string;
  type: string;
};

type HeroData = {
  statistics: StatItem[];
  featuredProjects: { id: string; slug?: string | null; title: string; description: string | null; category: string; imageUrl: string | null; client: { name: string; logo: string | null } | null }[];
  solutions: { id: string; slug?: string; title: string; description: string | null; icon: string | null; link: string | null }[];
  clients: { id: string; name: string; logo: string | null; industry: string | null }[];
  careers: CareerItem[];
};

export default function ProfessionalHomePage() {
  const t = useTranslations("Index");
  const tNav = useTranslations("Navbar");
  const tBrochure = useTranslations("Brochure");
  const locale = useLocale();
  const isRTL = locale === "ar" || locale === "ku";
  const { scrollYProgress } = useScroll();
  const [heroData, setHeroData] = useState<HeroData | null>(null);
  const [heroDataLoading, setHeroDataLoading] = useState(true);
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [subscribeResendLoading, setSubscribeResendLoading] = useState(false);
  const [subscribeMessage, setSubscribeMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = subscribeEmail.trim();
    if (!email) {
      setSubscribeMessage({ type: "error", text: t("footer.subscribeErrorRequired") });
      return;
    }
    setSubscribeLoading(true);
    setSubscribeMessage(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        const text = data.emailSent === false
          ? (t("footer.subscribeSuccessNoEmail") || "Subscribed. Confirmation email could not be sent — use Resend to try again.")
          : t("footer.subscribeSuccess");
        setSubscribeMessage({ type: "success", text });
      } else {
        setSubscribeMessage({ type: "error", text: data.message || t("footer.subscribeError") });
      }
    } catch {
      setSubscribeMessage({ type: "error", text: t("footer.subscribeError") });
    } finally {
      setSubscribeLoading(false);
    }
  };

  const handleResendSubscribeEmail = async () => {
    const email = subscribeEmail.trim();
    if (!email) return;
    setSubscribeResendLoading(true);
    setSubscribeMessage(null);
    try {
      const res = await fetch("/api/resend-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "subscription", email }),
      });
      const data = await res.json();
      if (data.success) {
        setSubscribeMessage({ type: "success", text: t("footer.subscribeResendSuccess") || "Confirmation email resent." });
      } else {
        setSubscribeMessage({ type: "error", text: data.message || t("footer.subscribeError") });
      }
    } catch {
      setSubscribeMessage({ type: "error", text: t("footer.subscribeError") });
    } finally {
      setSubscribeResendLoading(false);
    }
  };

  useEffect(() => {
    setHeroDataLoading(true);
    fetch(`/api/hero?locale=${encodeURIComponent(locale)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.statistics) {
          setHeroData({
            statistics: data.statistics,
            featuredProjects: data.featuredProjects || [],
            solutions: data.solutions || [],
            clients: data.clients || [],
            careers: data.careers || [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setHeroDataLoading(false));
  }, [locale]);

  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div className="bg-[#0A0A0F] text-white overflow-x-hidden min-h-screen">
      {/* Progress bar */}
      <motion.div 
        className="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 z-50 origin-left"
        style={{ scaleX }}
      />
      
      {/* Language switcher */}
      <div className={`fixed top-6 ${isRTL ? 'left-6' : 'right-6'} z-40`}>
        <LanguageSwitcher />
      </div>
      
      {/* Navigation */}
      <Navigation />
      
      <ScrollIndicator />

      {/* ================= HERO SECTION ================= */}
      <Section 
        id="hero" 
        padding="py-20 sm:py-24 md:py-32 lg:py-40"
      >
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-14 md:gap-20 items-center">
          {/* Content */}
          <div className="space-y-6 sm:space-y-8 md:space-y-10" dir={isRTL ? "rtl" : "ltr"}>
            {/* Badge */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-gradient-to-r from-blue-500/15 to-cyan-500/10 border border-blue-500/25 shadow-lg shadow-blue-500/5"
            >
              <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
              <span className={`text-[10px] sm:text-xs font-bold text-blue-300 ${!isRTL ? 'uppercase tracking-[0.15em] sm:tracking-[0.2em]' : ''}`}>
                {t("hero.subtitle")}
              </span>
            </motion.div>

            {/* Headline */}
            <div className="space-y-4 sm:space-y-6">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight">
                <span className="block bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                  {t("hero.title")}
                </span>
              </h1>
              
              <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-400 leading-relaxed max-w-xl">
                {t("hero.description")}
              </p>
            </div>

            {/* Stats */}
            <Stats apiStats={heroData?.statistics} />

            {/* CTA Buttons - full width on mobile for touch targets */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 sm:pt-6">
              <Link href="/projects" className="block w-full sm:w-auto group no-underline">
                <motion.span
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative w-full sm:w-auto inline-flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 py-4 min-h-[48px] bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 rounded-2xl font-semibold text-sm text-white overflow-hidden shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300 ${!isRTL ? 'uppercase tracking-wider' : ''}`}
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative">{t("hero.ctaPrimary")}</span>
                  <ArrowRight className="w-5 h-5 relative group-hover:translate-x-1 transition-transform shrink-0" />
                </motion.span>
              </Link>

              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}
                className={`w-full sm:w-auto px-6 sm:px-8 py-4 min-h-[48px] rounded-2xl font-semibold text-sm border-2 border-white/20 bg-white/5 backdrop-blur-sm hover:border-cyan-400/50 hover:bg-white/10 text-white transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 ${!isRTL ? 'uppercase tracking-wider' : ''}`}
              >
                {t("hero.ctaSecondary")}
                <ChevronDown className="w-5 h-5 shrink-0" />
              </motion.button>
            </div>
          </div>

          {/* 3D Visual - smaller on mobile */}
          <div className="relative h-[260px] sm:h-[320px] md:h-[400px] lg:h-[500px] xl:h-[550px] -mx-4 sm:mx-0 min-h-0">
            <Canvas shadows camera={{ position: [0, 0, 6], fov: 50 }}>
              <PerspectiveCamera makeDefault position={[0, 0, 6]} />
              <EnhancedTechHero />
            </Canvas>
          </div>
        </div>
      </Section>

      {/* ================= FEATURED PROJECTS (from API) ================= */}
      {heroData?.featuredProjects && heroData.featuredProjects.length > 0 && (
        <Section id="featured-projects">
          <SectionHeader
            subtitle={t("hero.ctaPrimary")}
            title={t("projects")}
            description=""
            icon={Briefcase}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {heroData.featuredProjects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={{ y: -6 }}
                className="group"
              >
                <Link href={project.slug ? `/projects/${project.slug}` : '/projects'} className="block h-full">
                  <Card className="h-full overflow-hidden">
                    {project.imageUrl && (
                      <div className="aspect-video rounded-t-2xl sm:rounded-xl overflow-hidden mb-4 sm:mb-5 -mx-5 -mt-5 sm:-mx-6 sm:-mt-6 bg-white/5">
                        <img src={project.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-3 py-1 text-xs font-semibold bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/20">
                        {project.category}
                      </span>
                      {project.client?.name && (
                        <span className="text-xs text-gray-500">{project.client.name}</span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold mb-2 group-hover:text-blue-400 transition-colors">{project.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{project.description}</p>
                    <div className="mt-4 flex items-center gap-2 text-blue-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>{t("learnMore")}</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
          <div className="text-center mt-8 sm:mt-12">
            <Link href="/projects" className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 min-h-[48px] rounded-xl border border-white/20 hover:border-blue-500/50 hover:bg-blue-500/10 text-white font-medium transition-all touch-manipulation">
              {t("viewAll")} {t("projects")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Section>
      )}

      {/* ================= SERVICES SECTION (API data only) ================= */}
      <Section id="services">
        <SectionHeader
          subtitle={t("services.subtitle")}
          title={t("services.title")}
          description={t("services.tagline")}
          icon={Zap}
        />

        {heroDataLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8 animate-pulse">
                <div className="w-14 h-14 rounded-2xl bg-white/10 mb-6" />
                <div className="h-6 bg-white/10 rounded-lg mb-3 w-3/4" />
                <div className="h-4 bg-white/10 rounded mb-2 w-full" />
                <div className="h-4 bg-white/10 rounded mb-2 w-5/6" />
                <div className="h-4 bg-white/10 rounded w-4/6" />
              </div>
            ))}
          </div>
        ) : heroData?.solutions && heroData.solutions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {heroData.solutions.map((sol, i) => (
              <ServiceCard
                key={sol.id}
                icon={getServiceIcon(sol.icon)}
                title={sol.title}
                description={sol.description || ''}
                index={i}
                href={sol.slug ? `/services/${sol.slug}` : sol.link || undefined}
              />
            ))}
          </div>
        ) : null}
      </Section>

      {/* ================= PRODUCTS SECTION (KNX, Buspro, Zigbee) ================= */}
      <Section id="products">
        <SectionHeader
          subtitle={t("products.subtitle")}
          title={t("products.title")}
          description={t("products.tagline")}
          icon={Boxes}
        />
        <div className="text-center">
          <Link href="/products">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 mx-auto"
            >
              {t("products.browseProducts")} <ArrowRight className="w-5 h-5" />
            </motion.button>
          </Link>
        </div>
      </Section>

      {/* ================= INDUSTRY SECTION ================= */}
      <Section id="industry">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-12 md:gap-16 items-center">
          <div>
            <SectionHeader
              subtitle={t("industry.subtitle")}
              title={t("industry.title")}
              icon={Globe}
              centered={false}
            />
            
            <div className="space-y-4 sm:space-y-6">
              {[
                { icon: Award, key: "quality", color: "text-emerald-400", bg: "from-emerald-500/20 to-teal-500/10" },
                { icon: Target, key: "energy", color: "text-cyan-400", bg: "from-cyan-500/20 to-blue-500/10" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: isRTL ? 24 : -24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  whileHover={{ x: isRTL ? -4 : 4 }}
                >
                  <Card className="group p-5 sm:p-6">
                    <div className="flex items-start gap-4 sm:gap-5">
                      <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br ${item.bg} border border-white/5 ${item.color} shrink-0`}>
                        <item.icon className="w-6 h-6 sm:w-7 sm:h-7" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold mb-2 group-hover:text-white transition-colors">
                          {t(`industry.${item.key}.title`)}
                        </h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                          {t(`industry.${item.key}.desc`)}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <Card className="p-8 overflow-hidden">
              <div className="aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500/15 via-cyan-500/10 to-blue-500/5 border border-white/5 flex items-center justify-center">
                <GlobeIcon className="w-56 h-56 text-emerald-400/25" />
              </div>
            </Card>
          </motion.div>
        </div>
      </Section>

      {/* ================= DEVELOPMENT SECTION ================= */}
      <Section id="development">
        <SectionHeader
          subtitle={t("development.subtitle")}
          title={t("development.title")}
          description={t("development.tagline")}
          icon={Code2}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {[
            { 
              icon: Code,
              key: "custom",
              tech: ["React", "Node.js", "TypeScript"]
            },
            { 
              icon: Cpu,
              key: "automation",
              tech: ["Python", "AI/ML", "Automation"]
            },
            { 
              icon: Cloud,
              key: "cloud",
              tech: ["AWS", "Docker", "Kubernetes"]
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ y: -6 }}
              className="group"
            >
              <Card className="h-full p-5 sm:p-6">
                <div className="flex flex-col h-full">
                  <div className="mb-4 sm:mb-6 p-3 sm:p-4 w-fit rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 group-hover:from-blue-500/30 group-hover:to-cyan-500/20 transition-all">
                    <item.icon className="w-8 h-8 text-blue-400" />
                  </div>
                  
                  <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3 group-hover:text-blue-400 transition-colors">
                    {t(`development.${item.key}.title`)}
                  </h3>
                  
                  <p className="text-gray-400 text-sm leading-relaxed mb-6 flex-1">
                    {t(`development.${item.key}.desc`)}
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-6">
                    {item.tech.map((tech, idx) => (
                      <span 
                        key={idx}
                        className="px-3 py-1.5 text-xs font-medium bg-white/5 rounded-lg text-gray-400 border border-white/5"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                  
                  <div className="pt-4 border-t border-white/10 flex items-center gap-2 text-blue-400/80 group-hover:text-blue-400 text-sm font-medium transition-colors">
                    {t("exploreMore")}
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ================= TRAINING SECTION ================= */}
      <Section id="training" padding="py-16 sm:py-20 md:py-32">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-14 md:gap-20 items-center">
          <div>
            <SectionHeader
              subtitle={t("training.subtitle")}
              title={t("training.title")}
              description={t("training.desc")}
              icon={GraduationCap}
              centered={false}
            />
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8 sm:mb-10">
              {[
                { label: t("handsOnLabs"), icon: Rocket },
                { label: t("certification"), icon: Shield },
                { label: t("mentorship"), icon: Users },
                { label: t("realProjects"), icon: BarChart3 },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-blue-500/20 transition-all"
                >
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold">{feature.label}</span>
                </motion.div>
              ))}
            </div>
            
            <Link href="/training" className="inline-flex items-center gap-2 group no-underline">
              <motion.span
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl font-semibold text-sm text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
              >
                {t("training.button")}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.span>
            </Link>
          </div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <Card className="p-10 overflow-hidden">
              <div className="aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-blue-500/15 via-purple-500/10 to-cyan-500/5 border border-white/5 flex items-center justify-center">
                <Boxes className="w-64 h-64 text-blue-400/25" />
              </div>
            </Card>
          </motion.div>
        </div>
      </Section>

      {/* ================= CAREERS SECTION (API data only) ================= */}
      <Section id="careers">
        <SectionHeader
          subtitle={t("careers.subtitle")}
          title={t("careers.title")}
          description={t("careers.tagline")}
          icon={Briefcase}
        />

        {heroDataLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8 animate-pulse">
                <div className="flex justify-between mb-4">
                  <div className="h-6 bg-white/10 rounded w-48" />
                  <div className="h-6 w-20 rounded-full bg-white/10" />
                </div>
                <div className="h-4 bg-white/10 rounded mb-2 w-full" />
                <div className="h-4 bg-white/10 rounded w-4/5 mb-6" />
                <div className="flex gap-4 mb-6">
                  <div className="h-4 bg-white/10 rounded w-24" />
                  <div className="h-4 bg-white/10 rounded w-28" />
                  <div className="h-4 bg-white/10 rounded w-20" />
                </div>
                <div className="h-12 bg-white/10 rounded-xl" />
              </div>
            ))}
          </div>
        ) : heroData?.careers && heroData.careers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {heroData.careers.map((job: any, i: number) => (
              <motion.div
                key={job.id ?? i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={{ y: -6 }}
                className="group"
              >
                <Link href={job.slug ? `/careers/${job.slug}` : '/careers'} className="block h-full">
                  <div className="relative h-full rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 p-5 sm:p-6 md:p-8 backdrop-blur-sm transition-all duration-300 hover:border-amber-500/30 hover:shadow-xl hover:shadow-amber-500/5 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 to-orange-500/0 group-hover:from-amber-500/5 group-hover:to-orange-500/5 transition-all duration-300 pointer-events-none" />
                    <div className="relative flex flex-col h-full">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold text-white pr-4">{job.title}</h3>
                        <span className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {(t.raw("careers.jobTypes") as Record<string, string>)?.[job.type ?? job.jobType ?? "FULL_TIME"] ?? job.type ?? job.jobType}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-2">
                        {job.description}
                      </p>
                      <div className="flex flex-wrap gap-3 sm:gap-4 mb-4 sm:mb-6 text-xs sm:text-sm text-gray-500">
                        <span className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-amber-500/60" />
                          {job.department}
                        </span>
                        <span className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-amber-500/60" />
                          {job.location}
                        </span>
                        <span className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-amber-500/60" />
                          {(t.raw("careers.jobTypes") as Record<string, string>)?.[job.type ?? job.jobType ?? "FULL_TIME"] ?? job.type ?? job.jobType}
                        </span>
                      </div>
                      <div className="mt-auto flex items-center gap-2 text-amber-400 font-semibold text-sm group-hover:gap-3 transition-all">
                        {t("careers.apply")}
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : null}

        <div className="text-center px-4 sm:px-0">
          <Link href="/careers" className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 min-h-[48px] rounded-xl border-2 border-white/20 hover:border-amber-500/50 hover:bg-amber-500/10 text-white font-semibold transition-all touch-manipulation">
            <ExternalLink className="w-4 h-4" />
            {t("careers.button")}
          </Link>
        </div>
      </Section>

      {/* ================= CLIENTS (from API) ================= */}
      {heroData?.clients && heroData.clients.length > 0 && (
        <Section id="clients">
          <SectionHeader
            subtitle="Trusted by"
            title={t("clients")}
            description=""
            icon={Users}
          />
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-10">
            {heroData.clients.map((client, i) => (
              <motion.div
                key={client.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4 }}
                className="flex flex-col items-center gap-2 sm:gap-3 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-white/20 hover:shadow-xl hover:shadow-blue-500/5 transition-all min-w-[100px] sm:min-w-[120px] md:min-w-[140px]"
              >
                {client.logo ? (
                  <img
                    src={client.logo}
                    alt={client.name}
                    className="h-14 w-auto object-contain grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
                  />
                ) : (
                  <div className="h-14 w-14 flex items-center justify-center rounded-xl bg-white/5 text-xl font-bold text-gray-400">
                    {client.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-gray-400 text-center font-medium">{client.name}</span>
              </motion.div>
            ))}
          </div>
        </Section>
      )}

      {/* ================= FOOTER ================= */}
      <footer className="relative py-12 sm:py-16 md:py-20 border-t border-white/10 bg-gradient-to-b from-[#0A0A0F] via-[#0A0A0F] to-black/80 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.05)_0%,transparent_50%)]" />
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 md:gap-12 mb-12 sm:mb-16">
            {/* Brand */}
            <div className="space-y-4 sm:space-y-5">
              <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">U-SMART</div>
              <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
                Pioneering digital transformation through innovation and excellence.
              </p>
              <div className="flex gap-2">
                <a
                  href="https://www.facebook.com/share/188KuyqCiX/?mibextid=wwXIfr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all touch-manipulation"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4 text-gray-400 hover:text-blue-400 transition-colors" />
                </a>
                <a
                  href="https://www.instagram.com/u.smar.t?igsh=bGc4MHdiamlhbjg5&utm_source=qr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 hover:border-pink-500/30 hover:bg-pink-500/10 transition-all touch-manipulation"
                  aria-label="Instagram"
                >
                  <Instagram className="w-4 h-4 text-gray-400 hover:text-pink-400 transition-colors" />
                </a>
                <a
                  href="https://wa.me/9647760777659"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all touch-manipulation"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4 text-gray-400 hover:text-emerald-400 transition-colors" />
                </a>
              </div>
            </div>

            {/* Links */}
            <div>
              <h3 className={`text-sm font-semibold text-gray-400 mb-4 ${!isRTL ? 'uppercase tracking-wider' : ''}`}>
                {t("footer.links")}
              </h3>
              <div className="space-y-2">
                <a href="#hero" className="block text-sm text-gray-300 hover:text-white transition-colors">
                  {tNav("home")}
                </a>
                <Link href="/about" className="block text-sm text-gray-300 hover:text-white transition-colors">
                  {tNav("about")}
                </Link>
                {["services", "industry", "development", "training", "careers"].map((key) => (
                  <a
                    key={key}
                    href={`#${key}`}
                    className="block text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    {tNav(key)}
                  </a>
                ))}
              </div>
            </div>

            {/* Contact */}
            <div>
              <h3 className={`text-sm font-semibold text-gray-400 mb-4 ${!isRTL ? 'uppercase tracking-wider' : ''}`}>
                {t("footer.contact")}
              </h3>
              <div className="space-y-3 text-sm text-gray-300">
                <a href="mailto:contact@usmart-iot.com" className="flex items-center gap-2 hover:text-white transition-colors">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span>contact@usmart-iot.com</span>
                </a>
                <a href="tel:+9647760777659" className="flex items-center gap-2 hover:text-white transition-colors">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <span>+964 776 077 7659</span>
                </a>
                <a href="https://wa.me/9647760777659" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
                  <MessageCircle className="w-4 h-4 text-gray-500" />
                  <span>+964 776 077 7659 (WhatsApp)</span>
                </a>
                <div className="flex items-center gap-2">
                  <Map className="w-4 h-4 text-gray-500" />
                  <span>Iraq, Kirkuk</span>
                </div>
                <Link
                  href="/brochure"
                  className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  {tBrochure("downloadPdf")}
                </Link>
              </div>
            </div>

            {/* Newsletter */}
            <div>
              <h3 className={`text-sm font-semibold text-gray-400 mb-4 ${!isRTL ? 'uppercase tracking-wider' : ''}`}>
                {t("footer.newsletter")}
              </h3>
              <div className="space-y-4">
                <p className="text-gray-400 text-sm">
                  {t("footer.newsletterDesc")}
                </p>
                <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={subscribeEmail}
                    onChange={(e) => setSubscribeEmail(e.target.value)}
                    placeholder={t("footer.newsletterPlaceholder")}
                    disabled={subscribeLoading}
                    className="flex-1 min-w-0 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all disabled:opacity-60"
                    aria-label={t("footer.newsletterPlaceholder")}
                  />
                  <button
                    type="submit"
                    disabled={subscribeLoading}
                    className="px-5 py-3 min-h-[48px] bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 touch-manipulation shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {subscribeLoading ? t("footer.subscribing") : t("footer.subscribe")}
                  </button>
                </form>
                {subscribeMessage && (
                  <p className={`text-sm ${subscribeMessage.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                    {subscribeMessage.text}
                  </p>
                )}
                {subscribeMessage?.type === "success" && subscribeEmail.trim() && (
                  <p className="text-sm text-gray-400 mt-1">
                    <button
                      type="button"
                      onClick={handleResendSubscribeEmail}
                      disabled={subscribeResendLoading}
                      className="underline hover:text-white disabled:opacity-60"
                    >
                      {subscribeResendLoading ? "…" : t("footer.resendEmail") || "Resend confirmation email"}
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="pt-6 sm:pt-8 border-t border-white/10">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
              <div className="text-sm text-gray-500">
                {t("footer.copyright")}
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs text-gray-500">{t("footer.status")}</span>
                </div>
                <div className="flex gap-4 text-sm text-gray-500">
                  <a href="#" className="hover:text-white transition-colors">{t("footer.privacy")}</a>
                  <a href="#" className="hover:text-white transition-colors">{t("footer.terms")}</a>
                  <a href="#" className="hover:text-white transition-colors">{t("footer.cookies")}</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}