#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Deployment script for Vercel
 * This script prepares the application for deployment and provides helpful commands
 */

console.log('🚀 Theia IDE Vercel Deployment Script');
console.log('=====================================\n');

// Check if we're in the right directory
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ Error: package.json not found. Please run this script from the project root.');
    process.exit(1);
}

// Check if Vercel CLI is installed
try {
    execSync('vercel --version', { stdio: 'pipe' });
    console.log('✅ Vercel CLI is installed');
} catch (error) {
    console.log('⚠️  Vercel CLI not found. Installing...');
    try {
        execSync('npm install -g vercel', { stdio: 'inherit' });
        console.log('✅ Vercel CLI installed successfully');
    } catch (installError) {
        console.error('❌ Failed to install Vercel CLI. Please install it manually:');
        console.error('   npm install -g vercel');
        process.exit(1);
    }
}

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    console.log('📝 Creating .env file from .env.example...');
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    if (fs.existsSync(envExamplePath)) {
        fs.copyFileSync(envExamplePath, envPath);
        console.log('✅ .env file created');
    } else {
        console.log('⚠️  .env.example not found, creating basic .env file...');
        fs.writeFileSync(envPath, 'NODE_ENV=production\n');
    }
}

// Build the application
console.log('\n🔨 Building application for production...');
try {
    execSync('npm run build:vercel', { stdio: 'inherit' });
    console.log('✅ Build completed successfully');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}

// Check if dist directory was created
const distPath = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distPath)) {
    console.error('❌ Build output directory "dist" not found');
    process.exit(1);
}

console.log('\n📦 Deployment preparation complete!');
console.log('\nNext steps:');
console.log('1. Run "vercel" to deploy to Vercel');
console.log('2. Or run "vercel --prod" to deploy to production');
console.log('3. Or run "vercel link" to link to an existing project');
console.log('\n📋 Available commands:');
console.log('   vercel                    - Deploy to preview');
console.log('   vercel --prod             - Deploy to production');
console.log('   vercel link               - Link to existing project');
console.log('   vercel env add            - Add environment variables');
console.log('   vercel logs               - View deployment logs');
console.log('\n🌐 Your Theia IDE will be available at:');
console.log('   - Browser version: /browser/');
console.log('   - Browser-only version: /browser-only/');
console.log('   - Landing page: /');