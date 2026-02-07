// test-connection.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    // اختبار الاتصال
    await prisma.$connect()
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح!')
    
    // يمكنك إضافة اختبار بسيط هنا
    const result = await prisma.$queryRaw`SELECT version()`
    console.log('إصدار PostgreSQL:', result)
    
  } catch (error) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()