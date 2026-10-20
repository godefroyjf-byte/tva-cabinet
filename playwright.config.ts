import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  timeout:45000,
  workers:1,
  use:{baseURL:'http://127.0.0.1:3217',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}},
  webServer:{command:'node scripts/e2e-server.mjs',url:'http://127.0.0.1:3217',reuseExistingServer:false,timeout:30000},
  reporter:'list'
});
