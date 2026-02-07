import { PrismaClient } from '@prisma/client'
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
    }
  ]

  for (const service of services) {
    await prisma.service.upsert({
      where: { slug: service.slug },
      update: { title: service.title, description: service.description, content: service.content, icon: service.icon, features: service.features, category: service.category, priceRange: service.priceRange, duration: service.duration, featured: service.featured, translations: (service as any).translations },
      create: service
    })
    console.log(`✅ Service: ${service.title}`)
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