#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Creates a landing page for the Vercel deployment
 * that allows users to choose between browser and browser-only versions
 */

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Theia IDE - Choose Your Version</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        
        .container {
            text-align: center;
            max-width: 600px;
            padding: 2rem;
        }
        
        .logo {
            font-size: 3rem;
            font-weight: bold;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .subtitle {
            font-size: 1.2rem;
            margin-bottom: 3rem;
            opacity: 0.9;
        }
        
        .options {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }
        
        .option {
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 2rem;
            text-decoration: none;
            color: white;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        }
        
        .option:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.4);
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .option h3 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
        }
        
        .option p {
            opacity: 0.8;
            line-height: 1.6;
        }
        
        .features {
            margin-top: 3rem;
            text-align: left;
        }
        
        .features h4 {
            margin-bottom: 1rem;
            font-size: 1.1rem;
        }
        
        .features ul {
            list-style: none;
            padding-left: 0;
        }
        
        .features li {
            padding: 0.5rem 0;
            opacity: 0.8;
        }
        
        .features li:before {
            content: "✓ ";
            color: #4ade80;
            font-weight: bold;
        }
        
        .footer {
            margin-top: 3rem;
            opacity: 0.7;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Theia IDE</div>
        <div class="subtitle">Cloud-based IDE ready to use</div>
        
        <div class="options">
            <a href="/browser-only/" class="option">
                <h3>⚡ Theia IDE</h3>
                <p>Lightweight, browser-based IDE optimized for static hosting. Perfect for viewing and editing files in the cloud.</p>
                <div class="features">
                    <h4>Features:</h4>
                    <ul>
                        <li>Fast loading and responsive</li>
                        <li>Advanced file editing</li>
                        <li>Syntax highlighting</li>
                        <li>Git integration</li>
                        <li>Extension support</li>
                        <li>Minimal dependencies</li>
                    </ul>
                </div>
            </a>
        </div>
        
        <div class="footer">
            <p>Powered by Eclipse Theia • Deployed on Vercel</p>
        </div>
    </div>
</body>
</html>`;

// Ensure dist directory exists
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Write the index.html file
const indexPath = path.join(distDir, 'index.html');
fs.writeFileSync(indexPath, indexHtml);

console.log('✅ Created Vercel index.html at:', indexPath);