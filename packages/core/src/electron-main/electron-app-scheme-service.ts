// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import {
    app, CustomScheme, net, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails, protocol, session, Session, WebContents, WebContentsView
} from '../../electron-shared/electron';
import { inject, injectable, postConstruct } from '../../shared/inversify';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { APP_ORIGIN, APP_SCHEME, appUri, isAppFileUrl, resolveAppFile } from './app-scheme';
import { ElectronMainApplicationGlobals } from './electron-main-constants';

/** The page under the application scheme through which the storage of the former `file:` origin is migrated. */
const STORAGE_MIGRATION_PAGE = 'theia-storage-migration.html';
/** The file in the user data folder that records that the storage has been migrated. */
const STORAGE_MIGRATION_MARKER = '.theia-app-storage-migrated';
/** How long the frontend waits for the storage migration at most. */
const STORAGE_MIGRATION_TIMEOUT = 5000;

/**
 * Copies the given local storage entries into the page's local storage, except those that it has already.
 * Runs in the migration page, so it must not refer to anything outside of its body.
 */
function copyMissingStorageEntries(storage: Pick<Storage, 'getItem' | 'setItem'>, entries: [string, string][]): number {
    let copied = 0;
    for (const [key, value] of entries) {
        if (typeof storage.getItem(key) !== 'string') {
            storage.setItem(key, value);
            copied++;
        }
    }
    return copied;
}

export const ElectronAppSchemeService = Symbol('ElectronAppSchemeService');
/**
 * Serves the Electron frontend through a privileged application scheme. The service registers its schemes
 * when it is created, which happens when the main process resolves the `ElectronMainApplication`, before
 * the app is ready.
 */
export interface ElectronAppSchemeService {
    /** The URL under which the windows load the frontend file `fileName`. */
    getFrontendUrl(fileName: string): string;
    /** Whether `url` names the frontend file `fileName`. */
    isFrontendUrl(url: string, fileName: string): boolean;
}

/**
 * Serves the frontend directory under {@link APP_SCHEME}, registered as a standard, secure scheme with a V8
 * code cache, so that Chromium does not recompile the frontend's scripts on every launch.
 */
@injectable()
export class ElectronAppSchemeServiceImpl implements ElectronAppSchemeService {

    @inject(ElectronMainApplicationGlobals)
    protected readonly globals: ElectronMainApplicationGlobals;

    /**
     * The pending requests of the frontend to its backend, by request id, with the request headers that a
     * CORS preflight asks for, or `undefined` for a request that is not a preflight.
     */
    protected readonly backendRequests = new Map<number, { preflight: boolean, requestedHeaders?: string }>();

    /** Settles when the frontend's storage has been migrated from its former origin, or that has failed. */
    protected storageMigrated: Promise<void> = Promise.resolve();

    @postConstruct()
    protected init(): void {
        this.registerPrivilegedSchemes(this.getPrivilegedSchemes());
        app.whenReady().then(() => {
            this.storageMigrated = this.migrateStorageOnce();
            this.serveFrontend();
            this.bridgeBackendRequests(session.defaultSession);
        });
    }

    getFrontendUrl(fileName: string): string {
        return appUri(fileName);
    }

    isFrontendUrl(url: string, fileName: string): boolean {
        return isAppFileUrl(url, fileName);
    }

    /**
     * The schemes to register as privileged. Electron honours only one registration, so subclasses that need
     * their own privileged schemes add them here.
     */
    protected getPrivilegedSchemes(): CustomScheme[] {
        return [{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }];
    }

    /** Registers the given schemes as privileged. Electron accepts this call only before the app is ready. */
    protected registerPrivilegedSchemes(schemes: CustomScheme[]): void {
        if (app.isReady()) {
            throw new Error('Privileged schemes must be registered before the app is ready.');
        }
        protocol.registerSchemesAsPrivileged(schemes);
    }

    /** Serves the frontend directory through the application scheme. Called once the app is ready. */
    protected serveFrontend(): void {
        protocol.handle(APP_SCHEME, request => this.handleRequest(request));
    }

    /**
     * Lets the frontend make HTTP requests to its backend. Under the application scheme, the backend is a
     * different origin, so Chromium applies CORS to these requests and, with the default credentials mode,
     * omits the security token cookie that the backend requires. For requests from the frontend's origin
     * to a URL for which the session holds the token cookie, which it does only for backends, this adds the
     * cookie and allows the frontend's origin in the response.
     *
     * Electron supports one listener per `webRequest` event and session; an application that needs its own
     * listeners must delegate to {@link addBackendCookie} and {@link addBackendCorsHeaders}.
     */
    protected bridgeBackendRequests(electronSession: Session): void {
        electronSession.webRequest.onBeforeSendHeaders((details, callback) => {
            if (!this.isFrontendCrossOriginRequest(details)) {
                callback({});
                return;
            }
            this.addBackendCookie(electronSession, details).then(
                requestHeaders => callback({ requestHeaders }),
                () => callback({})
            );
        });
        electronSession.webRequest.onHeadersReceived((details, callback) => {
            callback(this.addBackendCorsHeaders(details));
        });
        electronSession.webRequest.onErrorOccurred(details => this.backendRequests.delete(details.id));
    }

    /** Whether the frontend makes a request that CORS applies to, i.e. to an HTTP origin. */
    protected isFrontendCrossOriginRequest(details: { initiatorOrigin?: string, url: string }): boolean {
        return details.initiatorOrigin === APP_ORIGIN && /^https?:/.test(details.url);
    }

    /**
     * The headers of a cross-origin request of the frontend, with the security token cookie if the session
     * holds one for the request's URL, which makes it a backend request.
     */
    protected async addBackendCookie(electronSession: Session, details: OnBeforeSendHeadersListenerDetails): Promise<Record<string, string>> {
        const headers = details.requestHeaders;
        const [tokenCookie] = await electronSession.cookies.get({ url: details.url, name: ElectronSecurityToken });
        if (!tokenCookie) {
            return headers;
        }
        const preflight = details.method === 'OPTIONS' && !!this.getHeader(headers, 'Access-Control-Request-Method');
        this.backendRequests.set(details.id, { preflight, requestedHeaders: preflight ? this.getHeader(headers, 'Access-Control-Request-Headers') : undefined });
        const cookieHeader = Object.keys(headers).find(name => name.toLowerCase() === 'cookie');
        const tokenPair = `${ElectronSecurityToken}=${tokenCookie.value}`;
        if (!cookieHeader) {
            return { ...headers, Cookie: tokenPair };
        }
        if (headers[cookieHeader].includes(`${ElectronSecurityToken}=`)) {
            return headers;
        }
        return { ...headers, [cookieHeader]: `${headers[cookieHeader]}; ${tokenPair}` };
    }

    /**
     * The response to a backend request of the frontend, as recognised by {@link addBackendCookie}, allowing
     * the frontend's origin. A CORS preflight is answered as successful.
     */
    protected addBackendCorsHeaders(details: OnHeadersReceivedListenerDetails): { responseHeaders?: Record<string, string[]>, statusLine?: string } {
        const backendRequest = this.backendRequests.get(details.id);
        this.backendRequests.delete(details.id);
        if (!backendRequest) {
            return {};
        }
        const responseHeaders = Object.fromEntries(Object.entries(details.responseHeaders ?? {})
            .filter(([name]) => !name.toLowerCase().startsWith('access-control-allow-')));
        responseHeaders['Access-Control-Allow-Origin'] = [APP_ORIGIN];
        responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
        if (!backendRequest.preflight) {
            return { responseHeaders };
        }
        responseHeaders['Access-Control-Allow-Methods'] = ['GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'];
        if (backendRequest.requestedHeaders) {
            responseHeaders['Access-Control-Allow-Headers'] = [backendRequest.requestedHeaders];
        }
        return { responseHeaders, statusLine: 'HTTP/1.1 204 No Content' };
    }

    protected getHeader(headers: Record<string, string>, name: string): string | undefined {
        const key = Object.keys(headers).find(header => header.toLowerCase() === name.toLowerCase());
        return key ? headers[key] : undefined;
    }

    /**
     * Answers a request under the application scheme with the frontend file it names, streamed by Electron's
     * own file fetch, which also answers range requests and sets the content type.
     */
    protected async handleRequest(request: Request): Promise<Response> {
        if (this.isFrontendUrl(request.url, STORAGE_MIGRATION_PAGE)) {
            return new Response('<!DOCTYPE html><html><head><title></title></head><body></body></html>', { headers: { 'Content-Type': 'text/html' } });
        }
        // No page of the frontend may run before its storage is in place.
        await this.storageMigrated;
        const file = this.resolveFrontendFile(request.url);
        if (!file) {
            return new Response('Not found', { status: 404 });
        }
        try {
            return await net.fetch(pathToFileURL(file).href, { method: request.method, headers: request.headers });
        } catch (error) {
            console.debug(`Could not serve ${request.url}:`, error);
            return new Response('Not found', { status: 404 });
        }
    }

    /**
     * The absolute path of the frontend file that an application-scheme URL names, or `undefined` if it names
     * none or a path outside the frontend directory.
     */
    protected resolveFrontendFile(url: string): string | undefined {
        return resolveAppFile(url, path.dirname(this.globals.THEIA_FRONTEND_HTML_PATH));
    }

    /**
     * Migrates the local storage of the frontend's former `file:` origin, once per user data folder, waiting
     * at most {@link STORAGE_MIGRATION_TIMEOUT} milliseconds. Failures are logged, the frontend starts anyway.
     */
    protected migrateStorageOnce(): Promise<void> {
        const marker = path.join(app.getPath('userData'), STORAGE_MIGRATION_MARKER);
        if (fs.existsSync(marker)) {
            return Promise.resolve();
        }
        const migration = this.migrateStorage()
            .then(() => fs.promises.writeFile(marker, new Date().toISOString()))
            .catch(error => console.warn('Could not migrate the local storage of the frontend from its former file: origin:', error));
        const timeout = new Promise<void>(resolve => setTimeout(() => {
            resolve();
        }, STORAGE_MIGRATION_TIMEOUT).unref());
        return Promise.race([migration, timeout]);
    }

    /**
     * Copies the local storage of the `file:` origin, under which earlier versions loaded the frontend, into the
     * application scheme's origin, so that the frontend keeps its layout, its locale and the other state it stores
     * there. Entries that the new origin has already are kept. Without any local storage in the user data folder,
     * as on a fresh installation, there is nothing to migrate.
     */
    protected async migrateStorage(): Promise<void> {
        if (!fs.existsSync(path.join(app.getPath('userData'), 'Local Storage'))) {
            return;
        }
        const entries = await this.readFileOriginStorage();
        if (entries.length === 0) {
            return;
        }
        const copied = await this.withHiddenPage(async page => {
            await page.loadURL(this.getFrontendUrl(STORAGE_MIGRATION_PAGE));
            return page.executeJavaScript(this.storageMigrationScript(entries));
        });
        await session.defaultSession.flushStorageData();
        console.info(`Migrated ${copied} of ${entries.length} local storage entries of the frontend from its former file: origin.`);
    }

    /** The script that the migration page runs to copy the given entries into its local storage. */
    protected storageMigrationScript(entries: [string, string][]): string {
        return `(${copyMissingStorageEntries.toString()})(localStorage, ${JSON.stringify(entries)})`;
    }

    /** Reads the local storage of the `file:` origin through a blank page that is not shown. */
    protected async readFileOriginStorage(): Promise<[string, string][]> {
        const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'theia-storage-migration-'));
        try {
            const page = path.join(folder, 'blank.html');
            await fs.promises.writeFile(page, '<!DOCTYPE html><html><head><title></title></head><body></body></html>');
            return await this.withHiddenPage(async contents => {
                await contents.loadFile(page);
                return contents.executeJavaScript('Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])');
            });
        } finally {
            await fs.promises.rm(folder, { recursive: true, force: true });
        }
    }

    /**
     * Runs `task` with the web contents of a view without node integration that is not attached to any window,
     * so that it neither shows nor counts as a window, whose closing could otherwise quit the application. The
     * page is closed afterwards.
     */
    protected async withHiddenPage<T>(task: (contents: WebContents) => Promise<T>): Promise<T> {
        const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        try {
            return await task(view.webContents);
        } finally {
            // Closing rather than destroying lets the page unload, which hands its storage changes to the browser process.
            const destroyed = new Promise<void>(resolve => view.webContents.once('destroyed', () => resolve()));
            view.webContents.close();
            await destroyed;
        }
    }
}
