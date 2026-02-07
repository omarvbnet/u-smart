import { prisma } from './prisma'

export class DatabaseService {
  private static instance: DatabaseService

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  async initialize() {
    console.log('Initializing database connection...')
    
    const isConnected = await this.testConnection()
    
    if (!isConnected) {
      throw new Error('Failed to connect to database')
    }

    console.log('Database initialized successfully')
    return true
  }

  async testConnection() {
    try {
      await prisma.$queryRaw`SELECT 1`
      console.log('✅ Database connection successful')
      return true
    } catch (error) {
      console.error('❌ Database connection failed:', error)
      return false
    }
  }

  async getStats() {
    try {
      const [
        usersCount,
        projectsCount,
        servicesCount,
        careersCount,
        testimonialsCount
      ] = await Promise.all([
        prisma.user.count(),
        prisma.project.count(),
        prisma.service.count(),
        prisma.career.count(),
        prisma.testimonial.count()
      ])

      return {
        users: usersCount,
        projects: projectsCount,
        services: servicesCount,
        careers: careersCount,
        testimonials: testimonialsCount,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error getting database stats:', error)
      throw error
    }
  }

  async healthCheck() {
    try {
      const connection = await this.testConnection()
      const stats = await this.getStats()

      return {
        status: connection ? 'healthy' : 'unhealthy',
        database: connection ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        stats
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async cleanup() {
    await prisma.$disconnect()
    console.log('Database connection closed')
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance()