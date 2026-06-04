// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Static-site support for the project bootstrap pipeline.
 *
 * Plain front-end projects (a snake game, a landing page, an exported design) ship `index.html`
 * and some assets but no `package.json` / dev script, so the Node detector skips them entirely and
 * nothing auto-starts. This module lets the detector treat such folders as a runnable project by
 * synthesizing a zero-dependency dev command: a tiny static file server written inline with
 * `node -e`. Node is always present in a Theia host, so this needs no install and works offline
 * (unlike `npx serve`) and on images without Python.
 *
 * The server prints `http://127.0.0.1:<port>/` on startup, which the existing dev-output scanner in
 * {@link QaapProjectBootstrapService} picks up to open the in-IDE preview automatically.
 */

/** File name we look for to decide a folder is a servable static site. */
export const STATIC_INDEX_FILE = 'index.html';

/**
 * Directories probed (in order) for {@link STATIC_INDEX_FILE} when the workspace root itself does
 * not contain one. Covers the conventional output / source folders of static generators and
 * hand-written sites. `'.'` (root) is always tried first by the detector.
 */
export const STATIC_ROOT_CANDIDATE_DIRS: readonly string[] = [
    'public',
    'dist',
    'build',
    'out',
    'www',
    'site',
    'src',
    'app',
    'docs',
];

/** No-op install command for static sites (there is nothing to install). */
export const STATIC_INSTALL_COMMAND = 'echo "Static site: no dependencies to install."';

/**
 * Inline Node static file server. Reads the serve root from `QAAP_STATIC_ROOT` (relative to the
 * process cwd, which is the workspace root) and the port from `PORT` (set by the bootstrap port
 * wrapper). Deliberately written without single quotes so it can be embedded inside a
 * single-quoted `node -e '...'` argument.
 */
const STATIC_SERVER_SCRIPT = [
    'const http=require("http"),fs=require("fs"),p=require("path");',
    'const root=p.resolve(process.env.QAAP_STATIC_ROOT||".");',
    'const port=Number(process.env.PORT)||8080;',
    'const T={".html":"text/html",".htm":"text/html",".js":"text/javascript",".mjs":"text/javascript",',
    '".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",',
    '".gif":"image/gif",".svg":"image/svg+xml",".ico":"image/x-icon",".webp":"image/webp",".avif":"image/avif",',
    '".woff":"font/woff",".woff2":"font/woff2",".ttf":"font/ttf",".otf":"font/otf",".map":"application/json",',
    '".wasm":"application/wasm",".mp3":"audio/mpeg",".wav":"audio/wav",".mp4":"video/mp4",".txt":"text/plain"};',
    'const send=(res,code,type,body)=>{res.writeHead(code,{"content-type":type});res.end(body);};',
    'http.createServer((req,res)=>{',
    'const u=decodeURIComponent((req.url||"/").split("?")[0]);',
    'let f=p.normalize(p.join(root,u));',
    'if(f!==root&&!f.startsWith(root+p.sep)){send(res,403,"text/plain","Forbidden");return;}',
    'fs.stat(f,(e,st)=>{',
    'if(!e&&st.isDirectory()){f=p.join(f,"index.html");}',
    'fs.readFile(f,(err,buf)=>{',
    'if(err){fs.readFile(p.join(root,"index.html"),(e2,idx)=>{',
    'if(e2){send(res,404,"text/plain","Not found");}else{send(res,200,"text/html",idx);}});return;}',
    'send(res,200,T[p.extname(f).toLowerCase()]||"application/octet-stream",buf);',
    '});});',
    '}).listen(port,"127.0.0.1",()=>console.log("Static dev server running at http://127.0.0.1:"+port+"/"));',
].join('');

/**
 * Builds the shell command that serves `relDir` (relative to the workspace root) over HTTP.
 * The port is injected by the bootstrap port wrapper via the `PORT` env var.
 */
export function buildStaticServeCommand(relDir: string): string {
    const dir = relDir && relDir.length > 0 ? relDir : '.';
    const escapedDir = dir.replace(/"/g, '\\"');
    return `QAAP_STATIC_ROOT="${escapedDir}" node -e '${STATIC_SERVER_SCRIPT}'`;
}
