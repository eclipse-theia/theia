# Theia IDE Vercel Deployment Guide

This guide will help you deploy your Theia IDE application to Vercel.

## Prerequisites

1. **Node.js**: Version 20 or higher
2. **Vercel CLI**: Install globally with `npm install -g vercel`
3. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Deploy to Vercel

```bash
# Option 1: Use the deployment script (recommended)
npm run deploy:vercel

# Option 2: Manual deployment
npm run build:vercel
vercel
```

### 3. Production Deployment

```bash
vercel --prod
```

## Available Versions

Your deployed Theia IDE will have two versions:

- **Browser Version** (`/browser/`): Full-featured IDE with backend services
- **Browser-Only Version** (`/browser-only/`): Lightweight version for static hosting

## Configuration Files

### vercel.json
Main Vercel configuration file that handles:
- Build commands and output directory
- Routing for both versions
- Security headers
- Caching strategies

### .vercelignore
Excludes unnecessary files from deployment to optimize build size.

### Environment Variables
Copy `.env.example` to `.env` and customize as needed:

```bash
cp .env.example .env
```

## Build Process

The build process includes:

1. **Compilation**: TypeScript compilation of all packages
2. **Browser Build**: Production build of the browser version
3. **Browser-Only Build**: Production build of the browser-only version
4. **Asset Preparation**: Copying and organizing files for deployment
5. **Index Creation**: Generating the landing page

## Customization

### Adding Environment Variables

```bash
vercel env add VARIABLE_NAME
```

### Custom Domain

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings > Domains
4. Add your custom domain

### Build Optimization

To optimize build times, you can:

1. Use Vercel's build cache
2. Exclude unnecessary packages in `.vercelignore`
3. Use environment variables for build configuration

## Troubleshooting

### Build Failures

1. Check Node.js version (must be 20+)
2. Ensure all dependencies are installed
3. Check for TypeScript compilation errors

### Runtime Issues

1. Verify environment variables are set
2. Check Vercel function logs: `vercel logs`
3. Ensure proper routing configuration

### Performance Issues

1. Enable Vercel's edge caching
2. Optimize static assets
3. Use CDN for large files

## Commands Reference

```bash
# Build for Vercel
npm run build:vercel

# Deploy with helper script
npm run deploy:vercel

# Manual Vercel commands
vercel                    # Deploy to preview
vercel --prod            # Deploy to production
vercel link              # Link to existing project
vercel env add           # Add environment variables
vercel logs              # View deployment logs
vercel domains add       # Add custom domain
```

## Security Considerations

The deployment includes several security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Support

For issues related to:
- **Theia IDE**: Check the [Eclipse Theia documentation](https://theia-ide.org/docs/)
- **Vercel**: Check the [Vercel documentation](https://vercel.com/docs)
- **This deployment**: Create an issue in the project repository

## License

This deployment configuration follows the same license as the Eclipse Theia project.