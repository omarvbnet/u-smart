'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Loader2,
  HardHat,
  Wrench,
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

const UPLOAD_URL = '/api/upload/registration-evidence';
const MAX_CERTIFICATES = 6;

type Lang = 'ar' | 'en' | 'ku' | 'tr';
const SUPPORTED_LANGS: Lang[] = ['ar', 'en', 'ku', 'tr'];
const RTL_LANGS: Lang[] = ['ar', 'ku'];
const LANG_NAMES: Record<Lang, string> = {
  ar: 'العربية',
  ku: 'کوردی',
  tr: 'Türkçe',
  en: 'English',
};

const PROVINCE_VALUES = [
  'Baghdad',
  'Basra',
  'Nineveh',
  'Erbil',
  'Sulaymaniyah',
  'Duhok',
  'Kirkuk',
  'Diyala',
  'Anbar',
  'Babylon',
  'Karbala',
  'Najaf',
  'Wasit',
  'Maysan',
  'Dhi Qar',
  'Muthanna',
  'Qadisiyyah',
  'Saladin',
  'Halabja',
];

const PROVINCE_LABELS: Record<Lang, Record<string, string>> = {
  en: Object.fromEntries(PROVINCE_VALUES.map((p) => [p, p])),
  ar: {
    Baghdad: 'بغداد',
    Basra: 'البصرة',
    Nineveh: 'نينوى',
    Erbil: 'أربيل',
    Sulaymaniyah: 'السليمانية',
    Duhok: 'دهوك',
    Kirkuk: 'كركوك',
    Diyala: 'ديالى',
    Anbar: 'الأنبار',
    Babylon: 'بابل',
    Karbala: 'كربلاء',
    Najaf: 'النجف',
    Wasit: 'واسط',
    Maysan: 'ميسان',
    'Dhi Qar': 'ذي قار',
    Muthanna: 'المثنى',
    Qadisiyyah: 'القادسية',
    Saladin: 'صلاح الدين',
    Halabja: 'حلبجة',
  },
  ku: {
    Baghdad: 'بەغدا',
    Basra: 'بەسرە',
    Nineveh: 'نەینەوا',
    Erbil: 'هەولێر',
    Sulaymaniyah: 'سلێمانی',
    Duhok: 'دهۆک',
    Kirkuk: 'کەرکوک',
    Diyala: 'دیالە',
    Anbar: 'ئەنبار',
    Babylon: 'بابل',
    Karbala: 'کەربەلا',
    Najaf: 'نەجەف',
    Wasit: 'واسیت',
    Maysan: 'مەیسان',
    'Dhi Qar': 'زیقار',
    Muthanna: 'موسەنا',
    Qadisiyyah: 'قادسیە',
    Saladin: 'سەلاحەدین',
    Halabja: 'هەڵەبجە',
  },
  tr: {
    Baghdad: 'Bağdat',
    Basra: 'Basra',
    Nineveh: 'Ninova',
    Erbil: 'Erbil',
    Sulaymaniyah: 'Süleymaniye',
    Duhok: 'Dohuk',
    Kirkuk: 'Kerkük',
    Diyala: 'Diyala',
    Anbar: 'Anbar',
    Babylon: 'Babil',
    Karbala: 'Kerbela',
    Najaf: 'Necef',
    Wasit: 'Vasıt',
    Maysan: 'Meysan',
    'Dhi Qar': 'Zikar',
    Muthanna: 'Müsenna',
    Qadisiyyah: 'Kadisiye',
    Saladin: 'Selahaddin',
    Halabja: 'Halepçe',
  },
};

const SPEC_VALUES = ['ELECTRICAL', 'MECHANICAL', 'CIVIL', 'TELECOM', 'PROGRAMMER'] as const;
const SPEC_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    ELECTRICAL: 'Electrical',
    MECHANICAL: 'Mechanical',
    CIVIL: 'Civil',
    TELECOM: 'Telecom',
    PROGRAMMER: 'Programmer',
  },
  ar: {
    ELECTRICAL: 'كهربائي',
    MECHANICAL: 'ميكانيكي',
    CIVIL: 'مدني',
    TELECOM: 'اتصالات',
    PROGRAMMER: 'مبرمج',
  },
  ku: {
    ELECTRICAL: 'کارەبایی',
    MECHANICAL: 'میکانیکی',
    CIVIL: 'شارستانی',
    TELECOM: 'پەیوەندی',
    PROGRAMMER: 'بەرنامەنووس',
  },
  tr: {
    ELECTRICAL: 'Elektrik',
    MECHANICAL: 'Makine',
    CIVIL: 'İnşaat',
    TELECOM: 'Telekom',
    PROGRAMMER: 'Yazılımcı',
  },
};

type Dict = {
  brandBy: string;
  title: string; // contains literal "Provisor" for highlight
  subtitle: string;
  educationRole: string;
  engineer: string;
  technician: string;
  legalName: string;
  legalNamePlaceholder: string;
  dob: string;
  specialization: string;
  selectSpecialization: string;
  email: string;
  phone: string;
  province: string;
  selectProvince: string;
  idDocument: string;
  uploadId: string;
  uploading: string;
  certificates: string;
  certificatesHint: string;
  addCertificates: string;
  submit: string;
  submitting: string;
  privacyNote: string;
  alreadyAccount: string;
  signIn: string;
  // errors
  errFillAll: string;
  errSelectSpec: string;
  errAttachId: string;
  errUploadId: string;
  errUploadCert: string;
  errNetwork: string;
  errSubmit: string;
  // success
  successTitle: string;
  successBody1: string;
  successBody2: string;
  backToSignIn: string;
};

const DICT: Record<Lang, Dict> = {
  en: {
    brandBy: 'by U-SMART',
    title: 'Join Provisor as staff',
    subtitle:
      "Apply to register as a field engineer or technician. After our team reviews and approves your application, you'll receive sign-in credentials by email for the Provisor app.",
    educationRole: 'Education / role',
    engineer: 'Engineer',
    technician: 'Technician',
    legalName: 'Legal full name',
    legalNamePlaceholder: 'As written on your ID',
    dob: 'Date of birth',
    specialization: 'Specialization',
    selectSpecialization: 'Select specialization',
    email: 'Email',
    phone: 'Phone number',
    province: 'Province',
    selectProvince: 'Select province',
    idDocument: 'ID document',
    uploadId: 'Upload ID (PDF or image, max 5MB)',
    uploading: 'Uploading...',
    certificates: 'Certificates',
    certificatesHint: `optional, up to ${MAX_CERTIFICATES}`,
    addCertificates: 'Add certificates (PDF or images)',
    submit: 'Submit registration request',
    submitting: 'Submitting...',
    privacyNote: 'Your documents are used only to verify your application.',
    alreadyAccount: 'Already have an account?',
    signIn: 'Sign in',
    errFillAll: 'Please fill in all required fields.',
    errSelectSpec: 'Please select your specialization.',
    errAttachId: 'Please attach your ID document.',
    errUploadId: 'Could not upload the ID document.',
    errUploadCert: 'Could not upload a certificate.',
    errNetwork: 'Network error. Please try again.',
    errSubmit: 'Failed to submit your request.',
    successTitle: 'Request submitted',
    successBody1: 'Thank you. Our team will review your application and email you at',
    successBody2:
      "once a decision is made. If approved, you'll receive a username and password to sign in to the Provisor app.",
    backToSignIn: 'Back to sign in',
  },
  ar: {
    brandBy: 'من U-SMART',
    title: 'انضم إلى Provisor كموظف',
    subtitle:
      'قدّم طلباً للتسجيل كمهندس أو فني ميداني. بعد مراجعة فريقنا والموافقة على طلبك، ستصلك بيانات الدخول عبر البريد الإلكتروني لتطبيق Provisor.',
    educationRole: 'التحصيل / الدور',
    engineer: 'مهندس',
    technician: 'فني',
    legalName: 'الاسم القانوني الكامل',
    legalNamePlaceholder: 'كما هو مكتوب في الهوية',
    dob: 'تاريخ الميلاد',
    specialization: 'التخصص',
    selectSpecialization: 'اختر التخصص',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    province: 'المحافظة',
    selectProvince: 'اختر المحافظة',
    idDocument: 'وثيقة الهوية',
    uploadId: 'ارفع الهوية (PDF أو صورة، بحد أقصى 5 ميغابايت)',
    uploading: 'جارٍ الرفع...',
    certificates: 'الشهادات',
    certificatesHint: `اختياري، حتى ${MAX_CERTIFICATES}`,
    addCertificates: 'أضف الشهادات (PDF أو صور)',
    submit: 'إرسال طلب التسجيل',
    submitting: 'جارٍ الإرسال...',
    privacyNote: 'تُستخدم مستنداتك فقط للتحقق من طلبك.',
    alreadyAccount: 'لديك حساب بالفعل؟',
    signIn: 'تسجيل الدخول',
    errFillAll: 'يرجى ملء جميع الحقول المطلوبة.',
    errSelectSpec: 'يرجى اختيار تخصصك.',
    errAttachId: 'يرجى إرفاق وثيقة هويتك.',
    errUploadId: 'تعذّر رفع وثيقة الهوية.',
    errUploadCert: 'تعذّر رفع إحدى الشهادات.',
    errNetwork: 'خطأ في الشبكة. حاول مرة أخرى.',
    errSubmit: 'فشل إرسال طلبك.',
    successTitle: 'تم إرسال الطلب',
    successBody1: 'شكراً لك. سيراجع فريقنا طلبك ويراسلك على',
    successBody2:
      'بعد اتخاذ القرار. في حال الموافقة، ستصلك اسم مستخدم وكلمة مرور لتسجيل الدخول إلى تطبيق Provisor.',
    backToSignIn: 'العودة لتسجيل الدخول',
  },
  ku: {
    brandBy: 'لە U-SMART',
    title: 'وەک ستاف بەشداری Provisor بکە',
    subtitle:
      'داواکاری بکە بۆ تۆمارکردن وەک ئەندازیار یان تەکنیسیەنی مەیدانی. دوای پێداچوونەوە و پەسەندکردنی داواکاریەکەت لەلایەن تیمەکەمانەوە، زانیاری چوونەژوورەوەت بە ئیمەیل بۆ ئەپی Provisor دەگات.',
    educationRole: 'خوێندن / ڕۆڵ',
    engineer: 'ئەندازیار',
    technician: 'تەکنیسیەن',
    legalName: 'ناوی یاسایی تەواو',
    legalNamePlaceholder: 'وەک لە ناسنامەکەتدا نووسراوە',
    dob: 'بەرواری لەدایکبوون',
    specialization: 'پسپۆڕی',
    selectSpecialization: 'پسپۆڕی هەڵبژێرە',
    email: 'ئیمەیل',
    phone: 'ژمارەی مۆبایل',
    province: 'پارێزگا',
    selectProvince: 'پارێزگا هەڵبژێرە',
    idDocument: 'بەڵگەی ناسنامە',
    uploadId: 'ناسنامە باربکە (PDF یان وێنە، زۆرترین ٥MB)',
    uploading: 'بارکردن...',
    certificates: 'بڕوانامەکان',
    certificatesHint: `ئیختیاری، تا ${MAX_CERTIFICATES}`,
    addCertificates: 'بڕوانامە زیاد بکە (PDF یان وێنە)',
    submit: 'ناردنی داواکاری تۆمارکردن',
    submitting: 'ناردن...',
    privacyNote: 'بەڵگەنامەکانت تەنها بۆ پشتڕاستکردنەوەی داواکاریەکەت بەکاردێن.',
    alreadyAccount: 'پێشتر هەژمارت هەیە؟',
    signIn: 'چوونەژوورەوە',
    errFillAll: 'تکایە هەموو خانە پێویستەکان پڕبکەرەوە.',
    errSelectSpec: 'تکایە پسپۆڕیەکەت هەڵبژێرە.',
    errAttachId: 'تکایە بەڵگەی ناسنامەکەت هاوپێچ بکە.',
    errUploadId: 'نەتوانرا بەڵگەی ناسنامە باربکرێت.',
    errUploadCert: 'نەتوانرا بڕوانامەیەک باربکرێت.',
    errNetwork: 'هەڵەی تۆڕ. تکایە دووبارە هەوڵ بدەرەوە.',
    errSubmit: 'ناردنی داواکاریەکەت سەرکەوتوو نەبوو.',
    successTitle: 'داواکاری نێردرا',
    successBody1: 'سوپاس. تیمەکەمان داواکاریەکەت پێداچوونەوەی بۆ دەکات و لەسەر ئەم ئیمەیلە پەیوەندیت پێوە دەکات',
    successBody2:
      'دوای بڕیاردان. ئەگەر پەسەند کرا، ناوی بەکارهێنەر و وشەی نهێنیت بۆ چوونەژوورەوەی ئەپی Provisor دەگات.',
    backToSignIn: 'گەڕانەوە بۆ چوونەژوورەوە',
  },
  tr: {
    brandBy: 'U-SMART tarafından',
    title: 'Provisor ekibine katılın',
    subtitle:
      'Saha mühendisi veya teknisyeni olarak kaydolmak için başvurun. Ekibimiz başvurunuzu inceleyip onayladıktan sonra, Provisor uygulaması için giriş bilgilerinizi e-posta ile alacaksınız.',
    educationRole: 'Eğitim / rol',
    engineer: 'Mühendis',
    technician: 'Teknisyen',
    legalName: 'Yasal tam ad',
    legalNamePlaceholder: 'Kimliğinizde yazdığı gibi',
    dob: 'Doğum tarihi',
    specialization: 'Uzmanlık',
    selectSpecialization: 'Uzmanlık seçin',
    email: 'E-posta',
    phone: 'Telefon numarası',
    province: 'İl',
    selectProvince: 'İl seçin',
    idDocument: 'Kimlik belgesi',
    uploadId: 'Kimlik yükleyin (PDF veya görsel, en fazla 5MB)',
    uploading: 'Yükleniyor...',
    certificates: 'Sertifikalar',
    certificatesHint: `isteğe bağlı, en fazla ${MAX_CERTIFICATES}`,
    addCertificates: 'Sertifika ekleyin (PDF veya görsel)',
    submit: 'Kayıt talebini gönder',
    submitting: 'Gönderiliyor...',
    privacyNote: 'Belgeleriniz yalnızca başvurunuzu doğrulamak için kullanılır.',
    alreadyAccount: 'Zaten hesabınız var mı?',
    signIn: 'Giriş yap',
    errFillAll: 'Lütfen tüm zorunlu alanları doldurun.',
    errSelectSpec: 'Lütfen uzmanlığınızı seçin.',
    errAttachId: 'Lütfen kimlik belgenizi ekleyin.',
    errUploadId: 'Kimlik belgesi yüklenemedi.',
    errUploadCert: 'Bir sertifika yüklenemedi.',
    errNetwork: 'Ağ hatası. Lütfen tekrar deneyin.',
    errSubmit: 'Talebiniz gönderilemedi.',
    successTitle: 'Talep gönderildi',
    successBody1: 'Teşekkürler. Ekibimiz başvurunuzu inceleyecek ve size şu adresten e-posta gönderecek:',
    successBody2:
      'karar verildiğinde. Onaylanırsa, Provisor uygulamasına giriş yapmak için bir kullanıcı adı ve şifre alacaksınız.',
    backToSignIn: 'Girişe dön',
  },
};

function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem('provisor_lang') as Lang | null;
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
  const candidates =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || 'en'];
  for (const raw of candidates) {
    const code = raw.toLowerCase().split('-')[0] as Lang;
    if (SUPPORTED_LANGS.includes(code)) return code;
    if (raw.toLowerCase().startsWith('ckb') || raw.toLowerCase().startsWith('kmr')) return 'ku';
  }
  return 'en';
}

type UploadedFile = { name: string; url: string };

async function uploadOne(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok || !data.success || !data.url) {
    throw new Error(data.message || 'Upload failed');
  }
  return data.url as string;
}

export default function StaffRegistrationPage() {
  const [lang, setLang] = useState<Lang>('en');
  const [role, setRole] = useState<'ENGINEER' | 'TECHNICIAN'>('ENGINEER');
  const [legalName, setLegalName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [province, setProvince] = useState('');

  const [idDoc, setIdDoc] = useState<UploadedFile | null>(null);
  const [idUploading, setIdUploading] = useState(false);
  const [certificates, setCertificates] = useState<UploadedFile[]>([]);
  const [certUploading, setCertUploading] = useState(false);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const idInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLang(detectLang());
  }, []);

  const t = DICT[lang];
  const dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';

  const changeLang = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem('provisor_lang', next);
    } catch {
      /* ignore */
    }
  };

  const [titleBefore, titleAfter] = useMemo(() => {
    const parts = t.title.split('Provisor');
    return [parts[0] ?? '', parts[1] ?? ''];
  }, [t.title]);

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setIdUploading(true);
    try {
      const url = await uploadOne(file);
      setIdDoc({ name: file.name, url });
    } catch {
      setError(t.errUploadId);
    } finally {
      setIdUploading(false);
      if (idInputRef.current) idInputRef.current.value = '';
    }
  };

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError('');
    setCertUploading(true);
    try {
      const room = MAX_CERTIFICATES - certificates.length;
      const toUpload = files.slice(0, Math.max(0, room));
      const uploaded: UploadedFile[] = [];
      for (const file of toUpload) {
        const url = await uploadOne(file);
        uploaded.push({ name: file.name, url });
      }
      setCertificates((prev) => [...prev, ...uploaded]);
    } catch {
      setError(t.errUploadCert);
    } finally {
      setCertUploading(false);
      if (certInputRef.current) certInputRef.current.value = '';
    }
  };

  const removeCertificate = (idx: number) => {
    setCertificates((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!legalName.trim() || !dateOfBirth || !email.trim() || !phone.trim() || !province) {
      setError(t.errFillAll);
      return;
    }
    if (!specialization) {
      setError(t.errSelectSpec);
      return;
    }
    if (!idDoc) {
      setError(t.errAttachId);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/staff-registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: legalName.trim(),
          dateOfBirth,
          email: email.trim(),
          phone: phone.trim(),
          role,
          specialization,
          province,
          idDocumentUrl: idDoc.url,
          certificateUrls: certificates.map((c) => c.url),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
      } else {
        setError(data.message || t.errSubmit);
      }
    } catch {
      setError(t.errNetwork);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition';
  const labelClass = 'block text-sm font-medium text-gray-300 mb-2';

  const LangSwitcher = (
    <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      {SUPPORTED_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => changeLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            lang === l ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
          }`}
        >
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );

  if (done) {
    return (
      <div dir={dir} lang={lang} className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold text-white">{t.successTitle}</h1>
          <p className="mt-3 text-gray-400">
            {t.successBody1} <span className="text-amber-300">{email}</span> {t.successBody2}
          </p>
          <Link
            href="/proviser/login"
            className="mt-8 inline-block rounded-xl bg-amber-500 px-6 py-3 font-semibold text-black hover:bg-amber-400"
          >
            {t.backToSignIn}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} lang={lang} className="relative min-h-screen overflow-hidden bg-[#0A0A0F] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[120px]" />
      </div>

      <div className="relative mx-auto w-full max-w-2xl px-4 py-8 sm:px-5 sm:py-14">
        {/* Top bar: brand + language switcher */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="text-lg font-bold tracking-wide text-amber-400">Provisor</span>
            <span className="hidden text-gray-600 sm:inline">{t.brandBy}</span>
          </div>
          {LangSwitcher}
        </div>

        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div className="absolute inset-0 -z-10 rounded-[24px] bg-amber-400/30 blur-2xl" />
            <Image
              src="/app/provisor-logo.png"
              alt="Provisor"
              width={88}
              height={88}
              className="h-20 w-20 rounded-[22px] border border-white/10 shadow-2xl"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            {titleBefore}
            <span className="text-amber-400">Provisor</span>
            {titleAfter}
          </h1>
          <p className="mt-3 max-w-lg text-sm text-gray-400 sm:text-base">{t.subtitle}</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-white/10 bg-[#0f1419] p-5 shadow-xl sm:p-8"
        >
          {error && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Education / role */}
          <div className="mb-6">
            <span className={labelClass}>{t.educationRole}</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('ENGINEER')}
                className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                  role === 'ENGINEER'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 text-gray-400 hover:border-white/25'
                }`}
              >
                <HardHat className="h-4 w-4 shrink-0" />
                {t.engineer}
              </button>
              <button
                type="button"
                onClick={() => setRole('TECHNICIAN')}
                className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                  role === 'TECHNICIAN'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 text-gray-400 hover:border-white/25'
                }`}
              >
                <Wrench className="h-4 w-4 shrink-0" />
                {t.technician}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="legalName">
                {t.legalName} <span className="text-amber-400">*</span>
              </label>
              <input
                id="legalName"
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder={t.legalNamePlaceholder}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="dob">
                {t.dob} <span className="text-amber-400">*</span>
              </label>
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className={`${inputClass} [color-scheme:dark]`}
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="specialization">
                {t.specialization} <span className="text-amber-400">*</span>
              </label>
              <select
                id="specialization"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className={inputClass}
                required
              >
                <option value="" disabled>
                  {t.selectSpecialization}
                </option>
                {SPEC_VALUES.map((s) => (
                  <option key={s} value={s} className="bg-[#0f1419]">
                    {SPEC_LABELS[lang][s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="email">
                {t.email} <span className="text-amber-400">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
                dir="ltr"
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="phone">
                {t.phone} <span className="text-amber-400">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+964..."
                className={inputClass}
                dir="ltr"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="province">
                {t.province} <span className="text-amber-400">*</span>
              </label>
              <select
                id="province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className={inputClass}
                required
              >
                <option value="" disabled>
                  {t.selectProvince}
                </option>
                {PROVINCE_VALUES.map((p) => (
                  <option key={p} value={p} className="bg-[#0f1419]">
                    {PROVINCE_LABELS[lang][p] ?? p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ID document */}
          <div className="mt-6">
            <span className={labelClass}>
              {t.idDocument} <span className="text-amber-400">*</span>
            </span>
            <input
              ref={idInputRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={handleIdUpload}
              className="hidden"
            />
            {idDoc ? (
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                <span className="flex items-center gap-2 truncate text-sm text-gray-200">
                  <FileText className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="truncate">{idDoc.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIdDoc(null)}
                  className="ms-3 shrink-0 text-gray-400 hover:text-red-400"
                  aria-label="remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => idInputRef.current?.click()}
                disabled={idUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-4 text-sm text-gray-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-50"
              >
                {idUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                <span className="truncate">{idUploading ? t.uploading : t.uploadId}</span>
              </button>
            )}
          </div>

          {/* Certificates */}
          <div className="mt-6">
            <span className={labelClass}>
              {t.certificates} <span className="text-gray-500">({t.certificatesHint})</span>
            </span>
            <input
              ref={certInputRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              multiple
              onChange={handleCertUpload}
              className="hidden"
            />
            {certificates.length > 0 && (
              <ul className="mb-3 space-y-2">
                {certificates.map((c, i) => (
                  <li
                    key={`${c.url}-${i}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-2.5"
                  >
                    <span className="flex items-center gap-2 truncate text-sm text-gray-200">
                      <FileText className="h-4 w-4 shrink-0 text-amber-400" />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCertificate(i)}
                      className="ms-3 shrink-0 text-gray-400 hover:text-red-400"
                      aria-label="remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {certificates.length < MAX_CERTIFICATES && (
              <button
                type="button"
                onClick={() => certInputRef.current?.click()}
                disabled={certUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-4 text-sm text-gray-400 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-50"
              >
                {certUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                <span className="truncate">{certUploading ? t.uploading : t.addCertificates}</span>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || idUploading || certUploading}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? t.submitting : t.submit}
          </button>

          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-gray-500">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
            {t.privacyNote}
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-gray-600">
          {t.alreadyAccount}{' '}
          <Link href="/proviser/login" className="text-amber-400 hover:underline">
            {t.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
