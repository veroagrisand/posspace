import { defineConfig } from 'cypress';

export default defineConfig({
  projectId: 'fxjmhu',
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    defaultCommandTimeout: 10000,
    retries: {
      runMode: 1,
      openMode: 0
    },
    viewportWidth: 1440,
    viewportHeight: 900,
    video: false,
    screenshotOnRunFailure: true,
    env: {
      posspaceMode: process.env.POSSPACE_MODE ?? 'demo',
      // Kredensial untuk suite backend (opsional; tanpa ini test backend di-skip):
      userEmail: process.env.CYPRESS_USER_EMAIL ?? '',
      userPassword: process.env.CYPRESS_USER_PASSWORD ?? '',
      adminEmail: process.env.CYPRESS_ADMIN_EMAIL ?? '',
      adminPassword: process.env.CYPRESS_ADMIN_PASSWORD ?? '',
      // Email unik untuk tes wizard OTP (backend + ALLOW_OTP_DEBUG=true):
      registerEmail: process.env.CYPRESS_REGISTER_EMAIL ?? ''
    }
  }
});