import {defineConfig} from '@playwright/test'
export default defineConfig({testDir:'./tests',testMatch:'*.spec.ts',timeout:35000,workers:1,retries:0,reporter:'list',use:{headless:true,launchOptions:{chromiumSandbox:true},screenshot:'only-on-failure',trace:'off'}})
