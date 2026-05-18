import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.addInitScript(() => {
    const key = `theia:${location.pathname}:qaap.auth.signedIn`;
    localStorage.setItem(key, 'true');
});
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(12000);

const data = await page.evaluate(() => {
    const shell = document.getElementById('theia-app-shell');
    const panel = document.getElementById('theia-main-content-panel');
    const overlay = document.querySelector('.qaap-mobile-empty-brand');
    const bottomBar = document.getElementById('theia-mobile-bottom-bar');
    const chromeHost = document.querySelector('.theia-mobile-bottom-chrome-host');
    const statusBar = document.getElementById('theia-statusBar');
    const login = document.getElementById('qaap-login-host');
    const preload = document.querySelector('.theia-preload');
    return {
        bodyChildren: document.body.children.length,
        shellExists: !!shell,
        shellClass: shell?.className ?? null,
        shellDisplay: shell ? getComputedStyle(shell).display : null,
        panelExists: !!panel,
        panelChildCount: panel?.children.length ?? 0,
        panelBg: panel ? getComputedStyle(panel).backgroundImage : null,
        logoUrl: getComputedStyle(document.documentElement).getPropertyValue('--theia-workbench-brand-logo-url'),
        overlay: !!overlay,
        overlayDl: overlay?.querySelectorAll('.shortcuts dl').length ?? 0,
        logoEl: !!overlay?.querySelector('.qaap-mobile-empty-brand-logo'),
        logoBg: overlay?.querySelector('.qaap-mobile-empty-brand-logo')
            ? getComputedStyle(overlay.querySelector('.qaap-mobile-empty-brand-logo')).backgroundImage.slice(0, 100)
            : null,
        bottomBar: !!bottomBar,
        bottomBarDisplay: bottomBar ? getComputedStyle(bottomBar).display : null,
        chromeHost: !!chromeHost,
        statusBar: !!statusBar,
        login: !!login,
        loginHidden: login?.hidden,
        preload: !!preload,
        preloadDisplay: preload ? getComputedStyle(preload).display : null,
        letterpress: !!document.querySelector('.letterpress'),
        editorPart: !!document.querySelector('.part.editor'),
    };
});

console.log(JSON.stringify({ data, errors: errors.slice(0, 8) }, null, 2));
await page.screenshot({ path: '/tmp/qaap-shell-debug.png', fullPage: true });
await browser.close();
