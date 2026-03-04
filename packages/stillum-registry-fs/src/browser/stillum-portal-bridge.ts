import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, Disposable, DisposableCollection } from '@theia/core';

export interface StillumInitMessage {
    type: 'stillum:init';
    token: string;
    tenantId: string;
    moduleArtifactId: string;
    moduleVersionId: string;
    theme: 'light' | 'dark';
    registryApiBaseUrl: string;
    openComponentId?: string;
    readOnly?: boolean;
    /** Workspace data sent from the portal to avoid CORS issues */
    workspace?: WorkspaceData;
}

export interface TokenRefreshMessage {
    type: 'stillum:token-refresh';
    token: string;
}

export interface ThemeChangeMessage {
    type: 'stillum:theme-change';
    theme: 'light' | 'dark';
}

export type PortalMessage = StillumInitMessage | TokenRefreshMessage | ThemeChangeMessage;

export interface WorkspaceData {
    module: ArtifactData;
    moduleVersion: VersionData | null;
    components: Array<{
        artifact: ArtifactData;
        version: VersionData | null;
    }>;
}

export interface ArtifactData {
    id: string;
    tenantId: string;
    type: string;
    title: string;
    description?: string | null;
    area?: string | null;
    componentType?: 'DROPLET' | 'POOL' | 'TRIGGER' | null;
    parentModuleId?: string | null;
}

export interface VersionData {
    id: string;
    artifactId: string;
    version: string;
    state: string;
    sourceCode?: string | null;
    buildSnapshot?: BuildSnapshotData | null;
    sourceFiles?: Record<string, string> | null;
}

export interface BuildSnapshotData {
    generatedAt: string;
    templateVersion: string;
    inputs: Record<string, string>;
    files: Record<string, string>;
}

@injectable()
export class StillumPortalBridge implements Disposable {

    private token: string = '';
    private tenantId: string = '';
    private registryApiBaseUrl: string = '';
    private initData: StillumInitMessage | undefined;
    private initResolve: ((data: StillumInitMessage) => void) | undefined;
    private initPromise: Promise<StillumInitMessage>;

    protected readonly onDidChangeThemeEmitter = new Emitter<'light' | 'dark'>();
    readonly onDidChangeTheme: Event<'light' | 'dark'> = this.onDidChangeThemeEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeThemeEmitter
    );

    constructor() {
        this.initPromise = new Promise<StillumInitMessage>(resolve => {
            this.initResolve = resolve;
        });
    }

    @postConstruct()
    protected init(): void {
        window.addEventListener('message', this.handleMessage.bind(this));
        // Signal readiness to parent frame
        window.parent.postMessage({ type: 'stillum:ready' }, '*');
    }

    private handleMessage(event: MessageEvent): void {
        const data = event.data;
        if (!data || typeof data.type !== 'string' || !data.type.startsWith('stillum:')) {
            return;
        }

        switch (data.type) {
            case 'stillum:init':
                this.handleInit(data as StillumInitMessage);
                break;
            case 'stillum:token-refresh':
                this.token = (data as TokenRefreshMessage).token;
                break;
            case 'stillum:theme-change':
                this.onDidChangeThemeEmitter.fire((data as ThemeChangeMessage).theme);
                break;
        }
    }

    private handleInit(data: StillumInitMessage): void {
        this.token = data.token;
        this.tenantId = data.tenantId;
        this.registryApiBaseUrl = data.registryApiBaseUrl;
        this.initData = data;
        if (this.initResolve) {
            this.initResolve(data);
            this.initResolve = undefined;
        }
    }

    waitForInit(): Promise<StillumInitMessage> {
        return this.initPromise;
    }

    getInitData(): StillumInitMessage | undefined {
        return this.initData;
    }

    async fetchWorkspace(): Promise<WorkspaceData> {
        const init = await this.initPromise;
        const url = `${this.registryApiBaseUrl}/tenants/${this.tenantId}/artifacts/${init.moduleArtifactId}/workspace`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/json',
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch workspace: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    /**
     * Save source code by delegating to the portal via postMessage (avoids CORS).
     * Sends a save-request, waits for the portal's save-response.
     */
    async saveSourceCode(artifactId: string, versionId: string, sourceCode: string): Promise<void> {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('Save timed out — no response from portal'));
            }, 30_000);

            const handler = (event: MessageEvent) => {
                const msg = event.data;
                if (msg?.type === 'stillum:save-response' && msg.requestId === requestId) {
                    window.removeEventListener('message', handler);
                    clearTimeout(timeout);
                    if (msg.success) {
                        resolve();
                    } else {
                        reject(new Error(msg.error ?? 'Save failed'));
                    }
                }
            };

            window.addEventListener('message', handler);

            window.parent.postMessage({
                type: 'stillum:save-request',
                requestId,
                artifactId,
                versionId,
                sourceCode,
            }, '*');
        });
    }

    /**
     * Save multiple files for a component artifact (avoids CORS via postMessage).
     */
    async saveComponentFiles(artifactId: string, versionId: string, sourceFiles: Record<string, string>): Promise<void> {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('Save timed out — no response from portal'));
            }, 30_000);

            const handler = (event: MessageEvent) => {
                const msg = event.data;
                if (msg?.type === 'stillum:save-response' && msg.requestId === requestId) {
                    window.removeEventListener('message', handler);
                    clearTimeout(timeout);
                    if (msg.success) {
                        resolve();
                    } else {
                        reject(new Error(msg.error ?? 'Save failed'));
                    }
                }
            };

            window.addEventListener('message', handler);

            window.parent.postMessage({
                type: 'stillum:save-request',
                requestId,
                artifactId,
                versionId,
                sourceFiles,
            }, '*');
        });
    }

    notifyDirtyState(dirty: boolean): void {
        window.parent.postMessage({
            type: 'stillum:dirty',
            dirty,
        }, '*');
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
