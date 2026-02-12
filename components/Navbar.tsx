"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, usePathname } from "@/i18n/routing";
import { useLocale, useTranslations } from "next-intl";
import { Menu, X, ChevronDown, Globe } from "lucide-react";
import SmartLogo from "@/components/SmartLogo";

export default function ProfessionalNavbar() {
  const t = useTranslations("Navbar");
  const locale = useLocale();
  const pathname = usePathname();
  const isRTL = locale === "ar" || locale === "ku";

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [activeLink, setActiveLink] = useState("");
  const navbarRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
      updateActiveLink();
    };
    window.addEventListener("scroll", handleScroll);
    updateActiveLink(); // Initial check
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- updateActiveLink depends on pathname

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    // إصلاح مشكلة المساحة البيضاء - التأكد من أن الخلفية تغطي كامل المساحة

  }, []);

  const updateActiveLink = () => {
    if (pathname?.includes('/about')) {
      setActiveLink('about');
      return;
    }
    const sections = ['home', 'hero', 'services', 'industry', 'development', 'training', 'careers'];
    const currentScroll = window.scrollY + 100;

    for (const section of sections) {
      const element = document.getElementById(section);
      if (element) {
        const { offsetTop, offsetHeight } = element;
        if (currentScroll >= offsetTop && currentScroll < offsetTop + offsetHeight) {
          setActiveLink(section === 'hero' ? 'home' : section);
          return;
        }
      }
    }
    setActiveLink('');
  };

  const navLinks = [
    { key: "home", href: "#home", label: t("home") },
    { key: "about", href: "/about", label: t("about") },
    { key: "services", href: "#services", label: t("services") },
    { key: "industry", href: "#industry", label: t("industry") },
    { key: "development", href: "#development", label: t("development") },
    { key: "training", href: "#training", label: t("training") },
    { key: "careers", href: "#careers", label: t("careers") },
  ];

  const languages = [
    { code: "ar", name: "العربية", flag: "🇸🇦", short: "AR" },
    { code: "en", name: "English", flag: "🇺🇸", short: "EN" },
    { code: "ku", name: "کوردی", flag: "🇮🇶", short: "KU" },
    { code: "tr", name: "Türkçe", flag: "🇹🇷", short: "TR" }
  ];

  const currentLang = languages.find(l => l.code === locale) || languages[1];

  const scrollToSection = (href: string) => {
    const sectionId = href.replace('#', '');
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* ================= NAVBAR ================= */}
      <motion.nav
        ref={navbarRef}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        dir={isRTL ? "rtl" : "ltr"}
        className={`fixed top-0 left-0 right-0 z-[9999] transition-all duration-300 ${
          isScrolled
            ? "bg-[#0A0A0F]/90 shadow-2xl shadow-black/20"
            : "bg-[#0A0A0F]/70"
        }`}
        style={{
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: isScrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
        }}
      >
        {/* Top accent line when scrolled */}
        {isScrolled && (
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        )}

        {/* Main Navigation Bar */}
        <div className="max-w-7xl mx-auto h-16 sm:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="shrink-0"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <SmartLogo showTagline={false} variant="default" />
            </motion.div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden lg:flex items-center h-full gap-1">
            <div className="flex items-center h-full">
              {navLinks.map((link) => {
                const isPageLink = link.href.startsWith('/');
                return (
                  <div key={link.key} className="relative h-full flex items-center group">
                    {isPageLink ? (
                      <Link
                        href={link.href}
                        className={`px-4 py-2 h-full flex items-center text-sm font-medium tracking-wide transition-colors duration-200 rounded-lg mx-0.5 ${
                          activeLink === link.key
                            ? "text-white"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <button
                        onClick={() => scrollToSection(link.href)}
                        className={`px-4 py-2 h-full flex items-center text-sm font-medium tracking-wide transition-colors duration-200 rounded-lg mx-0.5 ${
                          activeLink === link.key
                            ? "text-white"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {link.label}
                      </button>
                    )}
                    {activeLink === link.key && (
                      <motion.div
                        layoutId="navbar-indicator"
                        className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    {activeLink !== link.key && !isPageLink && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300 group-hover:w-2/3" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="w-px h-6 bg-white/10 mx-2" />

            {/* Language Switcher */}
            <div className="relative ml-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200"
              >
                <span className="text-sm font-semibold text-white">{currentLang.short}</span>
                <motion.div animate={{ rotate: isLangDropdownOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {isLangDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-2 right-0 bg-[#0A0A0F]/95 backdrop-blur-xl border border-white/10 rounded-xl py-2 min-w-[160px] z-50 shadow-xl shadow-black/40"
                    style={{ backdropFilter: "blur(20px)" }}
                  >
                    {languages.map((lang) => (
                      <Link
                        key={lang.code}
                        href={pathname}
                        locale={lang.code}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors duration-150 mx-1 rounded-lg"
                        onClick={() => setIsLangDropdownOpen(false)}
                      >
                        <span className="text-lg">{lang.flag}</span>
                        <span className="text-sm font-medium text-white flex-1 text-left">{lang.name}</span>
                        {lang.code === locale && (
                          <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full shrink-0" />
                        )}
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* CTA Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => scrollToSection("#services")}
              className="ml-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-sm font-semibold text-white transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
            >
              {t("cta")}
            </motion.button>
          </div>

          {/* Mobile Menu Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Menu className="w-6 h-6 text-white" />
          </motion.button>
        </div>
      </motion.nav>

      {/* ================= MOBILE MENU ================= */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ x: isRTL ? "-100%" : "100%" }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? "-100%" : "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 250 }}
              className={`fixed top-0 ${isRTL ? "left-0" : "right-0"} h-full w-full max-w-[320px] sm:max-w-sm z-[10001] bg-[#0A0A0F] border ${isRTL ? "border-r" : "border-l"} border-white/10 shadow-2xl shadow-black/50 flex flex-col`}
              dir={isRTL ? "rtl" : "ltr"}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 sm:p-6 border-b border-white/10">
                <SmartLogo showTagline={false} variant="compact" />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </motion.button>
              </div>

              {/* Nav Links */}
              <div className="flex-1 overflow-y-auto py-4 px-3">
                <div className="space-y-1">
                  {navLinks.map((link, index) => {
                    const isPageLink = link.href.startsWith('/');
                    return isPageLink ? (
                      <Link key={link.key} href={link.href} onClick={() => setIsMobileMenuOpen(false)}>
                        <motion.div
                          initial={{ opacity: 0, x: isRTL ? -16 : 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`w-full text-left px-4 py-3.5 rounded-xl text-base font-medium transition-all duration-200 flex items-center justify-between min-h-[48px] ${
                            activeLink === link.key
                              ? "bg-gradient-to-r from-blue-500/15 to-cyan-500/10 text-white border border-blue-500/20"
                              : "text-gray-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <span>{link.label}</span>
                          {activeLink === link.key ? (
                            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" />
                          ) : (
                            <ChevronDown className={`w-4 h-4 text-gray-500 ${isRTL ? "rotate-90" : "-rotate-90"}`} />
                          )}
                        </motion.div>
                      </Link>
                    ) : (
                      <motion.button
                        key={link.key}
                        initial={{ opacity: 0, x: isRTL ? -16 : 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => scrollToSection(link.href)}
                        className={`w-full text-left px-4 py-3.5 rounded-xl text-base font-medium transition-all duration-200 flex items-center justify-between min-h-[48px] ${
                          activeLink === link.key
                            ? "bg-gradient-to-r from-blue-500/15 to-cyan-500/10 text-white border border-blue-500/20"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>{link.label}</span>
                        {activeLink === link.key ? (
                          <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" />
                        ) : (
                          <ChevronDown className={`w-4 h-4 text-gray-500 ${isRTL ? "rotate-90" : "-rotate-90"}`} />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Footer: Language + CTA */}
              <div className="p-4 sm:p-5 border-t border-white/10 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
                    {t("language") || "Language"}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {languages.map((lang) => (
                      <Link
                        key={lang.code}
                        href={pathname}
                        locale={lang.code}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all duration-200 min-h-[56px] justify-center ${
                          locale === lang.code
                            ? "bg-blue-500/10 border-blue-500/30 text-white"
                            : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                        }`}
                      >
                        <span className="text-lg">{lang.flag}</span>
                        <span className="text-xs font-medium">{lang.short}</span>
                      </Link>
                    ))}
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    scrollToSection("#services");
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-sm font-semibold text-white transition-all duration-200 shadow-lg shadow-blue-500/20"
                >
                  {t("cta")}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}