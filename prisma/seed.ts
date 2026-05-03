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

  console.log('🔧 Provisor QC / maintenance techniques...')
  const inspectionSeeds = [
    { slug: 'inspection', labelAr: 'الفحص', labelEn: 'Inspection', sortOrder: 0 },
    { slug: 'supervision', labelAr: 'الإشراف', labelEn: 'Supervision', sortOrder: 1 },
    { slug: 'building', labelAr: 'البناء', labelEn: 'Building', sortOrder: 2 },
    { slug: 'hse', labelAr: 'الصحة والسلامة', labelEn: 'HSE', sortOrder: 3 },
    { slug: 'investigation', labelAr: 'التحقيق', labelEn: 'Investigation', sortOrder: 4 },
    { slug: 'tracking', labelAr: 'التتبع', labelEn: 'Tracking', sortOrder: 5 },
  ]
  const maintenanceSeeds = [
    { slug: 'fiber_route', labelAr: 'مسار الألياف', labelEn: 'Fiber route', sortOrder: 0 },
    { slug: 'fiber_site', labelAr: 'موقع الألياف', labelEn: 'Fiber site', sortOrder: 1 },
    { slug: 'electrical', labelAr: 'كهرباء', labelEn: 'Electrical', sortOrder: 2 },
    { slug: 'telecom', labelAr: 'اتصالات', labelEn: 'Telecom', sortOrder: 3 },
    { slug: 'ftth', labelAr: 'FTTH', labelEn: 'FTTH', sortOrder: 4 },
  ]
  for (const row of inspectionSeeds) {
    await prisma.provisorTechnique.upsert({
      where: {
        category_slug: { category: 'INSPECTION_QC', slug: row.slug },
      },
      update: { labelAr: row.labelAr, labelEn: row.labelEn, sortOrder: row.sortOrder, active: true },
      create: {
        category: 'INSPECTION_QC',
        slug: row.slug,
        labelAr: row.labelAr,
        labelEn: row.labelEn,
        sortOrder: row.sortOrder,
        active: true,
      },
    })
  }
  for (const row of maintenanceSeeds) {
    await prisma.provisorTechnique.upsert({
      where: {
        category_slug: { category: 'MAINTENANCE', slug: row.slug },
      },
      update: { labelAr: row.labelAr, labelEn: row.labelEn, sortOrder: row.sortOrder, active: true },
      create: {
        category: 'MAINTENANCE',
        slug: row.slug,
        labelAr: row.labelAr,
        labelEn: row.labelEn,
        sortOrder: row.sortOrder,
        active: true,
      },
    })
  }
  console.log('✅ Provisor techniques seeded')

  console.log('🏢 Seeding provider coordinator sample data...')
  const coordinatorCompanyDelegate = (prisma as any).coordinatorCompany
  const coordinatorUserDelegate = (prisma as any).coordinatorUser
  const checklistDelegate = (prisma as any).inspectionChecklist
  const companyRequestDelegate = (prisma as any).companyRequest

  const sampleCompanySlug = 'sample-provider-company'
  const sampleCompanyName = 'Sample Provider Company'
  const sampleOwnerUsername = 'sampleowner'
  const sampleOwnerEmail = 'owner.sample@usmart.com'
  const sampleOwnerPassword = 'Owner@12345'
  const sampleOwnerPasswordHash = await bcrypt.hash(sampleOwnerPassword, 10)

  if (coordinatorCompanyDelegate?.upsert && coordinatorUserDelegate?.upsert) {
    let sampleCompany
    try {
      sampleCompany = await coordinatorCompanyDelegate.upsert({
        where: { slug: sampleCompanySlug },
        update: {
          name: sampleCompanyName,
          freeTicketsLimit: 50,
          freeTicketsUsed: 0,
          activeTicketPlan: null,
        },
        create: {
          slug: sampleCompanySlug,
          name: sampleCompanyName,
          freeTicketsLimit: 50,
          freeTicketsUsed: 0,
        },
      })
    } catch {
      sampleCompany = await coordinatorCompanyDelegate.upsert({
        where: { slug: sampleCompanySlug },
        update: { name: sampleCompanyName },
        create: {
          slug: sampleCompanySlug,
          name: sampleCompanyName,
        },
      })
    }

    try {
      await coordinatorUserDelegate.upsert({
        where: { username: sampleOwnerUsername },
        update: {
          email: sampleOwnerEmail,
          name: 'Sample Company Owner',
          passwordHash: sampleOwnerPasswordHash,
          role: 'COMPANY_OWNER',
          status: 'ACTIVE',
          mustChangePassword: false,
          companyId: sampleCompany.id,
        },
        create: {
          username: sampleOwnerUsername,
          email: sampleOwnerEmail,
          name: 'Sample Company Owner',
          passwordHash: sampleOwnerPasswordHash,
          role: 'COMPANY_OWNER',
          status: 'ACTIVE',
          mustChangePassword: false,
          companyId: sampleCompany.id,
        },
      })
    } catch {
      await coordinatorUserDelegate.upsert({
        where: { username: sampleOwnerUsername },
        update: {
          email: sampleOwnerEmail,
          name: 'Sample Company Owner',
          passwordHash: sampleOwnerPasswordHash,
          role: 'COORDINATOR',
          companyId: sampleCompany.id,
        },
        create: {
          username: sampleOwnerUsername,
          email: sampleOwnerEmail,
          name: 'Sample Company Owner',
          passwordHash: sampleOwnerPasswordHash,
          role: 'COORDINATOR',
          companyId: sampleCompany.id,
        },
      })
    }

    const sampleCoordPasswordHash = await bcrypt.hash('Coord@12345', 10)
    try {
      await coordinatorUserDelegate.upsert({
        where: { username: 'samplecoord' },
        update: {
          email: 'coord.sample@usmart.com',
          name: 'Sample Coordinator',
          passwordHash: sampleCoordPasswordHash,
          role: 'COORDINATOR',
          status: 'ACTIVE',
          mustChangePassword: false,
          companyId: sampleCompany.id,
        },
        create: {
          username: 'samplecoord',
          email: 'coord.sample@usmart.com',
          name: 'Sample Coordinator',
          passwordHash: sampleCoordPasswordHash,
          role: 'COORDINATOR',
          status: 'ACTIVE',
          mustChangePassword: false,
          companyId: sampleCompany.id,
        },
      })
    } catch {
      await coordinatorUserDelegate.upsert({
        where: { username: 'samplecoord' },
        update: {
          email: 'coord.sample@usmart.com',
          name: 'Sample Coordinator',
          passwordHash: sampleCoordPasswordHash,
          role: 'COORDINATOR',
          companyId: sampleCompany.id,
        },
        create: {
          username: 'samplecoord',
          email: 'coord.sample@usmart.com',
          name: 'Sample Coordinator',
          passwordHash: sampleCoordPasswordHash,
          role: 'COORDINATOR',
          companyId: sampleCompany.id,
        },
      })
    }

    const sampleQualityPasswordHash = await bcrypt.hash('Quality@12345', 10)
    try {
      await coordinatorUserDelegate.upsert({
        where: { username: 'samplequality' },
        update: {
          email: 'quality.sample@usmart.com',
          name: 'Sample Quality Engineer',
          passwordHash: sampleQualityPasswordHash,
          role: 'QUALITY_ENGINEER',
          status: 'ACTIVE',
          mustChangePassword: false,
          companyId: sampleCompany.id,
        },
        create: {
          username: 'samplequality',
          email: 'quality.sample@usmart.com',
          name: 'Sample Quality Engineer',
          passwordHash: sampleQualityPasswordHash,
          role: 'QUALITY_ENGINEER',
          status: 'ACTIVE',
          mustChangePassword: false,
          companyId: sampleCompany.id,
        },
      })
    } catch {
      await coordinatorUserDelegate.upsert({
        where: { username: 'samplequality' },
        update: {
          email: 'quality.sample@usmart.com',
          name: 'Sample Quality Engineer',
          passwordHash: sampleQualityPasswordHash,
          role: 'COORDINATOR',
          companyId: sampleCompany.id,
        },
        create: {
          username: 'samplequality',
          email: 'quality.sample@usmart.com',
          name: 'Sample Quality Engineer',
          passwordHash: sampleQualityPasswordHash,
          role: 'COORDINATOR',
          companyId: sampleCompany.id,
        },
      })
    }

    if (checklistDelegate?.upsert) {
      await checklistDelegate.upsert({
        where: { id: 'sample-qc-checklist' },
        update: {
          name: 'Sample QC Checklist',
          companyId: sampleCompany.id,
          taskCategory: 'QUALITY',
          techniqueTypes: ['inspection', 'supervision'],
          items: [
            { id: 'item-1', label: 'Check site safety', weight: 'major' },
            { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
            { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
          ],
        },
        create: {
          id: 'sample-qc-checklist',
          name: 'Sample QC Checklist',
          companyId: sampleCompany.id,
          taskCategory: 'QUALITY',
          techniqueTypes: ['inspection', 'supervision'],
          items: [
            { id: 'item-1', label: 'Check site safety', weight: 'major' },
            { id: 'item-2', label: 'Validate cable quality', weight: 'major' },
            { id: 'item-3', label: 'Capture evidence photos', weight: 'minor' },
          ],
        },
      })
    }

    console.log('✅ Sample provider company seeded')
    console.log(`✅ Sample company owner login: ${sampleOwnerUsername} / ${sampleOwnerPassword}`)
  } else {
    console.log('⚠️ Coordinator delegates not available in Prisma client; skipped provider sample seed')
  }

  if (companyRequestDelegate?.upsert) {
    await companyRequestDelegate.upsert({
      where: { id: 'sample-company-request-pending' },
      update: {
        companyName: 'Pending Demo Telecom',
        pocName: 'Ali Demo',
        pocEmail: 'ali.demo@company.com',
        pocPhone: '+9647711111111',
        certificateUrl: null,
        serviceSlug: 'quality-control-supervision',
        status: 'PENDING',
      },
      create: {
        id: 'sample-company-request-pending',
        companyName: 'Pending Demo Telecom',
        pocName: 'Ali Demo',
        pocEmail: 'ali.demo@company.com',
        pocPhone: '+9647711111111',
        certificateUrl: null,
        serviceSlug: 'quality-control-supervision',
        status: 'PENDING',
      },
    })
    console.log('✅ Pending company request seeded for admin page testing')
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