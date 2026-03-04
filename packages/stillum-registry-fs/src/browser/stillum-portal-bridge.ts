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
    parentModuleId?: string | null;
}

export interface VersionData {
    id: string;
    artifactId: string;
    version: string;
    state: string;
    sourceCode?: string | null;
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

    async saveSourceCode(artifactId: string, versionId: string, sourceCode: string): Promise<void> {
        const url = `${this.registryApiBaseUrl}/tenants/${this.tenantId}/artifacts/${artifactId}/versions/${versionId}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ sourceCode }),
        });
        if (!response.ok) {
            throw new Error(`Failed to save: ${response.status} ${response.statusText}`);
        }
        // Notify parent frame of successful save
        window.parent.postMessage({
            type: 'stillum:save-notification',
            artifactId,
            versionId,
        }, '*');
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
