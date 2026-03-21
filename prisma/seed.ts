import { Prisma, PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')
  
  // اختبار الاتصال أولاً
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ Database connection verified')
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    process.exit(1)
  }

  // إنشاء المستخدمين
  console.log('👤 Creating users...')
  
  const adminPassword = await bcrypt.hash('Admin@123', 10)
  const editorPassword = await bcrypt.hash('Editor@123', 10)
  const userPassword = await bcrypt.hash('User@123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@usmart.com' },
    update: { password: adminPassword, name: 'Admin User', role: 'ADMIN' },
    create: {
      email: 'admin@usmart.com',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN'
    }
  })
  console.log('✅ Admin user: admin@usmart.com / Admin@123')

  const editor = await prisma.user.upsert({
    where: { email: 'editor@usmart.com' },
    update: {},
    create: {
      email: 'editor@usmart.com',
      name: 'Editor User',
      password: editorPassword,
      role: 'EDITOR'
    }
  })

  const user = await prisma.user.upsert({
    where: { email: 'user@usmart.com' },
    update: {},
    create: {
      email: 'user@usmart.com',
      name: 'Regular User',
      password: userPassword,
      role: 'USER'
    }
  })

  console.log('✅ Users created')

  // إنشاء إحصائيات الهيرو (إن لم تكن موجودة)
  console.log('📊 Creating hero statistics...')
  const statKeys = ['projects', 'clients', 'uptime', 'countries']
  const defaultStats = [
    { key: 'projects', value: 150, label: 'مشروع مكتمل', suffix: '+', icon: '📁', order: 1 },
    { key: 'clients', value: 85, label: 'عميل راضٍ', suffix: '+', icon: '👥', order: 2 },
    { key: 'uptime', value: 5, label: 'سنة خبرة', suffix: '+', icon: '⏱️', order: 3 },
    { key: 'countries', value: 12, label: 'دولة', suffix: '+', icon: '🌍', order: 4 },
  ]
  for (const stat of defaultStats) {
    await prisma.statistic.upsert({
      where: { key: stat.key },
      update: {},
      create: stat,
    })
  }
  // Clean energy price per watt (value in cents, e.g. 50 = $0.50/watt)
  await prisma.statistic.upsert({
    where: { key: 'clean_energy_price_per_watt' },
    update: {},
    create: {
      key: 'clean_energy_price_per_watt',
      value: 50,
      label: 'Price per watt (cents)',
      suffix: '¢',
      icon: '⚡',
      isActive: true,
      order: 99,
    },
  })
  console.log('✅ Hero statistics ready')

  // إنشاء الخدمات
  console.log('🛠️ Creating services...')
  
  const services = [
    {
      title: 'Smart Home Automation',
      slug: 'smart-home-automation',
      description: 'Complete home automation solutions with IoT integration',
      content: 'Transform your home into a smart living space.',
      icon: 'Home',
      features: ['Voice Control', 'Energy Management'],
      category: 'Home Automation',
      priceRange: '$5,000 - $50,000',
      duration: '2-6 weeks',
      featured: true,
      userId: admin.id
    },
    {
      title: 'Enterprise Networking',
      slug: 'enterprise-networking',
      description: 'Professional networking infrastructure for businesses',
      content: 'Robust and secure networking solutions.',
      icon: 'Wifi',
      features: ['Network Design', 'Security Setup'],
      category: 'Networking',
      priceRange: '$10,000 - $100,000',
      duration: '4-8 weeks',
      featured: true,
      userId: admin.id
    },
    {
      title: 'Custom Software & Programming',
      slug: 'custom-software',
      description: 'Custom software development with Node.js, Flutter, Python, and modern databases',
      content: 'Bespoke software solutions designed to meet your unique business requirements.',
      icon: 'Code',
      features: ['Web & Mobile Apps', 'APIs', 'Database Design'],
      category: 'Programming',
      priceRange: '$5,000 - $100,000',
      duration: '2-12 weeks',
      featured: true,
      userId: admin.id
    },
    {
      title: 'Quality Control & Supervision',
      slug: 'quality-control-supervision',
      description: 'Rigorous testing, quality assurance and supervision for flawless delivery.',
      content: 'Quality control and supervision services to ensure the highest standards in every project.',
      icon: 'ShieldCheck',
      features: ['Inspection', 'Supervision', 'HSE', 'Investigation', 'Tracking'],
      category: 'Quality',
      priceRange: 'Custom',
      duration: 'Ongoing',
      featured: true,
      userId: admin.id,
      translations: {
        ar: {
          title: 'ضبط الجودة والإشراف',
          description: 'فحوصات صارمة وضمان جودة وإشراف للتسليم بلا عيوب.',
          content: 'خدمات ضبط الجودة والإشراف لضمان أعلى المعايير في كل مشروع.',
          features: ['الفحص', 'الإشراف', 'الصحة والسلامة والبيئة', 'التحقيق', 'التتبع'],
          priceRange: 'مخصص',
          duration: 'مستمر',
          category: 'الجودة'
        },
        ku: {
          title: 'کۆنترۆڵی کوالیتی و چاودێری',
          description: 'پشکنین و دڵنیایی کوالیتی و چاودێری بۆ گەیاندنی بێ کەموکوڕی.',
          content: 'خزمەتگوزاریەکانی کۆنترۆڵی کوالیتی و چاودێری بۆ دڵنیابوون لە بەرزترین ستانداردەکان.',
          features: ['پشکنین', 'چاودێری', 'تەندروستی و سەلامەتی و ژینگە', 'لێکۆڵینەوە', 'شوێنکەوتن'],
          priceRange: 'تایبەت',
          duration: 'بەردەوام',
          category: 'کوالیتی'
        },
        tr: {
          title: 'Kalite Kontrol ve Denetim',
          description: 'Kusursuz teslimat için titiz testler, kalite güvencesi ve denetim.',
          content: 'Projelerinizde en yüksek standartları sağlamak için kalite kontrol ve denetim hizmetleri.',
          features: ['Denetim', 'Gözetim', 'İSG', 'İnceleme', 'İzleme'],
          priceRange: 'Özel',
          duration: 'Devam Eden',
          category: 'Kalite'
        }
      }
    },
    {
      title: 'Clean Energy',
      slug: 'clean-energy',
      description: 'Solar and clean energy solutions for homes, industrial, and farms. We offer installation, maintenance, deployment, and purchasing with high standards and specifications.',
      content: 'Complete clean energy solutions including solar panels, battery storage, and inverters. We serve residential, commercial, industrial, and agricultural sectors with certified installations and ongoing maintenance.',
      icon: 'Zap',
      features: ['Solar Installation', 'Battery Storage', 'Maintenance & Support', 'Deployment', 'Purchase Options'],
      category: 'Clean Energy',
      priceRange: 'Custom',
      duration: '2-8 weeks',
      featured: true,
      userId: admin.id,
      translations: {
        ar: {
          title: 'الطاقة النظيفة',
          description: 'حلول الطاقة الشمسية والنظيفة للمنازل والصناعات والمزارع. نقدم التركيب والصيانة والنشر والشراء بمعايير ومواصفات عالية.',
          content: 'حلول طاقة نظيفة شاملة تشمل الألواح الشمسية وتخزين البطاريات والمحولات. نخدم القطاعات السكنية والتجارية والصناعية والزراعية بتركيبات معتمدة وصيانة مستمرة.',
          features: ['تركيب الطاقة الشمسية', 'تخزين البطاريات', 'الصيانة والدعم', 'النشر', 'خيارات الشراء'],
          priceRange: 'مخصص',
          duration: '2-8 أسابيع',
          category: 'الطاقة النظيفة'
        },
        ku: {
          title: 'وزەی پاک',
          description: 'چارەسەرەکانی وزەی خۆر و وزەی پاک بۆ خانوو و پیشەسازی و جووتیارەکان. دابینکردنی نۆرکردن، چاککردنەوە، جێبەجێکردن و کڕین بە ستاندارد و تایبەتمەندیی بەرز.',
          content: 'چارەسەری تەواوی وزەی پاک لەوانە تەختەکانی خۆر، کۆگای بەتری و گۆڕینی وزە. خزمەتگوزاری بۆ سەکتۆرە نیشتەجێبووەکان، بازرگانی، پیشەسازی و کشتوکاڵی بە دامەزراندنی ئەوراق و چاککردنەوەی بەردەوام.',
          features: ['دامەزراندنی وزەی خۆر', 'کۆگای بەتری', 'چاککردنەوە و پشتگیری', 'جێبەجێکردن', 'هەڵبژاردنی کڕین'],
          priceRange: 'تایبەت',
          duration: '2-8 هەفتە',
          category: 'وزەی پاک'
        },
        tr: {
          title: 'Temiz Enerji',
          description: 'Evler, endüstri ve çiftlikler için güneş ve temiz enerji çözümleri. Yüksek standartlar ve özelliklerle kurulum, bakım, devreye alma ve satın alma sunuyoruz.',
          content: 'Güneş panelleri, batarya depolama ve invertörler dahil eksiksiz temiz enerji çözümleri. Sertifikalı kurulumlar ve sürekli bakım ile konut, ticari, endüstriyel ve tarımsal sektörlere hizmet veriyoruz.',
          features: ['Güneş Enerjisi Kurulumu', 'Batarya Depolama', 'Bakım ve Destek', 'Devreye Alma', 'Satın Alma Seçenekleri'],
          priceRange: 'Özel',
          duration: '2-8 hafta',
          category: 'Temiz Enerji'
        }
      }
    }
  ]

  for (const service of services) {
    const { translations, ...base } = service as typeof service & { translations?: Record<string, unknown> };
    const translationsJson = translations && Object.keys(translations).length > 0 ? (translations as Prisma.InputJsonValue) : undefined;
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: {
        title: service.title,
        description: service.description,
        content: service.content ?? null,
        icon: service.icon,
        features: service.features,
        category: service.category,
        priceRange: service.priceRange ?? null,
        duration: service.duration ?? null,
        featured: service.featured,
        ...(translationsJson && { translations: translationsJson }),
      },
      create: {
        ...base,
        content: base.content ?? null,
        priceRange: base.priceRange ?? null,
        duration: base.duration ?? null,
        ...(translationsJson && { translations: translationsJson }),
      },
    });
    console.log(`✅ Service: ${service.title}`);
  }

  console.log('🎉 Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })