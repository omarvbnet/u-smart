import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'

// دالة لدمج عدة middlewares
function composeMiddlewares(...middlewares: Function[]) {
  return (request: NextRequest) => {
    let result: any = { request }
    
    for (const middleware of middlewares) {
      result = middleware(result.request || request)
      if (result instanceof NextResponse) {
        return result
      }
    }
    
    return result.request ? NextResponse.next() : NextResponse.next()
  }
}

// 1. middleware للتحقق من قاعدة البيانات
function checkDatabase(request: NextRequest) {
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ DATABASE_URL غير موجود')
  }
  
  const headers = new Headers(request.headers)
  headers.set('x-db-checked', 'true')
  
  return {
    request: new NextRequest(request, { headers })
  }
}

// 2. middleware للغات
const handleLocales = createIntlMiddleware({
  locales: ['ar', 'en', 'ku', 'tr'],
  defaultLocale: 'ar'
})

// 3. middleware لتحسين الأمان
function securityHeaders(request: NextRequest) {
  const response = handleLocales(request)
  
  if (response) {
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-XSS-Protection', '1; mode=block')
  }
  
  return response
}

// Middleware الرئيسي المدمج
const composedMiddleware = composeMiddlewares(
  checkDatabase,
  securityHeaders
)

export default composedMiddleware

export const config = {
  matcher: [
    '/((?!api|admin|_next|.*\\..*).*)',
  ]
}