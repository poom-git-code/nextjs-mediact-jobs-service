import { defineConfig, env } from 'prisma/config'
import 'dotenv/config'

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'tsx prisma/seed.ts',
    },
    // datasource: {
    //     url: `mysql://${env('DATABASE_USER')}:${env('DATABASE_PASSWORD')}@${env('DATABASE_HOST')}:${env('DATABASE_PORT')}/${env('DATABASE_NAME')}`,
    // },
})