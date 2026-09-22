// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { CopilotCredentials } from './copilot-credential-store';
import { CopilotSdkClientProvider } from './copilot-sdk-client-provider';
import type { CopilotClient, CopilotClientOptions } from './copilot-sdk-types';

interface SdkStub {
    api: {
        CopilotClient: new (options?: CopilotClientOptions) => CopilotClient,
        RuntimeConnection: { forStdio: (options: { path: string }) => unknown }
    };
    started: string[];
    stopped: string[];
}

/** The SDK as the provider uses it: a client constructor and the stdio connection factory. */
function sdkStub(): SdkStub {
    const started: string[] = [];
    const stopped: string[] = [];
    class StubClient {
        constructor(readonly options?: CopilotClientOptions) { }
        async start(): Promise<void> {
            started.push(String(this.options?.gitHubToken));
        }
        async stop(): Promise<Error[]> {
            stopped.push(String(this.options?.gitHubToken));
            return [];
        }
        async listModels(): Promise<[]> {
            return [];
        }
    }
    return {
        api: {
            CopilotClient: StubClient as unknown as new (options?: CopilotClientOptions) => CopilotClient,
            RuntimeConnection: { forStdio: (options: { path: string }) => ({ kind: 'stdio', ...options }) }
        },
        started,
        stopped
    };
}

class TestableCopilotSdkClientProvider extends CopilotSdkClientProvider {

    credentials: CopilotCredentials | undefined = { token: 'gho_first' };

    constructor(sdk: SdkStub['api'], configDirectory: string, cli = join('/opt', 'copilot', 'copilot')) {
        super();
        Object.assign(this, {
            logger: new MockLogger(),
            credentialStore: { get: async () => this.credentials },
            cliLocator: { resolve: async () => cli },
            sdkLoader: { load: async () => sdk },
            envVariablesServer: { getConfigDirUri: async () => FileUri.create(configDirectory).toString() }
        });
    }

    callCreateRuntimeEnv(credentials: CopilotCredentials): Record<string, string | undefined> {
        return this.createRuntimeEnv(credentials);
    }

    callEnrichEntitlementError(error: unknown): unknown {
        return this.enrichEntitlementError(error);
    }

    clientOptions(client: CopilotClient): CopilotClientOptions | undefined {
        return (client as unknown as { options?: CopilotClientOptions }).options;
    }
}

describe('CopilotSdkClientProvider - client options', () => {

    let configDirectory: string;
    let sdk: ReturnType<typeof sdkStub>;

    beforeEach(async () => {
        configDirectory = await fs.mkdtemp(join(os.tmpdir(), 'theia-copilot-config-'));
        sdk = sdkStub();
    });

    afterEach(async () => {
        await fs.rm(configDirectory, { recursive: true, force: true });
    });

    it('should hand the located CLI and the token of this application to the runtime', async () => {
        const provider = new TestableCopilotSdkClientProvider(sdk.api, configDirectory);
        const options = provider.clientOptions(await provider.getClient());
        expect(options?.connection).to.deep.equal({ kind: 'stdio', path: join('/opt', 'copilot', 'copilot') });
        expect(options?.gitHubToken).to.equal('gho_first');
        // Nothing the runtime finds on the host may make it appear signed in.
        expect(options?.useLoggedInUser).to.be.false;
    });

    it('should keep the runtime out of the ambient behaviour of the CLI', async () => {
        const provider = new TestableCopilotSdkClientProvider(sdk.api, configDirectory);
        const options = provider.clientOptions(await provider.getClient());
        expect(options?.mode).to.equal('empty');
    });

    it('should point the runtime at a Copilot home of the application and create it', async () => {
        const provider = new TestableCopilotSdkClientProvider(sdk.api, configDirectory);
        const options = provider.clientOptions(await provider.getClient());
        const home = join(configDirectory, 'copilot');
        // Compared without case, because the URI of the configuration directory lowercases the drive
        // letter on Windows, which addresses the same location.
        expect(options?.baseDirectory?.toLowerCase()).to.equal(home.toLowerCase());
        expect((await fs.stat(home)).isDirectory()).to.be.true;
    });
});

describe('CopilotSdkClientProvider - runtime environment', () => {

    const provider = new TestableCopilotSdkClientProvider(sdkStub().api, os.tmpdir());

    it('should remove tokens of the environment, which are not a sign-in of this application', () => {
        const previous = { ...process.env };
        try {
            process.env.GITHUB_TOKEN = 'gho_environment';
            process.env.GH_TOKEN = 'gho_environment';
            process.env.COPILOT_GITHUB_TOKEN = 'gho_environment';
            const env = provider.callCreateRuntimeEnv({ token: 'gho_ours' });
            expect(env.GITHUB_TOKEN).to.be.undefined;
            expect(env.GH_TOKEN).to.be.undefined;
            expect(env.COPILOT_GITHUB_TOKEN).to.be.undefined;
        } finally {
            process.env = previous;
        }
    });

    it('should remove a token variable whatever its case, since Windows ignores it', () => {
        const previous = { ...process.env };
        try {
            process.env.Gh_Token = 'gho_environment';
            const env = provider.callCreateRuntimeEnv({ token: 'gho_ours' });
            expect(Object.keys(env).some(name => name.toLowerCase() === 'gh_token')).to.be.false;
        } finally {
            process.env = previous;
        }
    });

    it('should point the runtime at the deployment that was signed in to', () => {
        const env = provider.callCreateRuntimeEnv({ token: 'gho_ours', enterpriseUrl: 'company.ghe.com' });
        expect(env.COPILOT_GH_HOST).to.equal('company.ghe.com');
    });

    it('should leave the host alone for a sign-in against GitHub.com', () => {
        expect(provider.callCreateRuntimeEnv({ token: 'gho_ours' })).to.not.have.property('COPILOT_GH_HOST');
    });
});

describe('CopilotSdkClientProvider - lifecycle', () => {

    let configDirectory: string;
    let sdk: ReturnType<typeof sdkStub>;
    let provider: TestableCopilotSdkClientProvider;

    beforeEach(async () => {
        configDirectory = await fs.mkdtemp(join(os.tmpdir(), 'theia-copilot-config-'));
        sdk = sdkStub();
        provider = new TestableCopilotSdkClientProvider(sdk.api, configDirectory);
    });

    afterEach(async () => {
        await fs.rm(configDirectory, { recursive: true, force: true });
    });

    it('should reject when the application is not signed in', async () => {
        provider.credentials = undefined;
        try {
            await provider.getClient();
            expect.fail('should have rejected');
        } catch (error) {
            expect(String(error)).to.contain('sign in');
        }
    });

    it('should start one CLI and share it, also for concurrent callers', async () => {
        const [first, second] = await Promise.all([provider.getClient(), provider.getClient()]);
        expect(first).to.equal(second);
        expect(await provider.getClient()).to.equal(first);
        expect(sdk.started).to.deep.equal(['gho_first']);
    });

    it('should replace the client when the credentials changed, stopping the previous one', async () => {
        const first = await provider.getClient();
        provider.credentials = { token: 'gho_second' };
        const second = await provider.getClient();
        expect(second).to.not.equal(first);
        expect(sdk.started).to.deep.equal(['gho_first', 'gho_second']);
        expect(sdk.stopped).to.deep.equal(['gho_first']);
    });

    it('should stop the CLI on reset and start a new one afterwards', async () => {
        await provider.getClient();
        await provider.reset();
        expect(sdk.stopped).to.deep.equal(['gho_first']);
        await provider.getClient();
        expect(sdk.started).to.deep.equal(['gho_first', 'gho_first']);
    });

    it('should not cache a client whose runtime failed to start', async () => {
        const failing = sdkStub();
        failing.api.CopilotClient = class {
            async start(): Promise<void> {
                throw new Error('runtime did not come up');
            }
        } as unknown as new () => CopilotClient;
        const other = new TestableCopilotSdkClientProvider(failing.api, configDirectory);
        await other.getClient().catch(() => { /* expected */ });
        // A cached rejection would keep replaying instead of trying again.
        await other.getClient().catch(error => expect(String(error)).to.contain('did not come up'));
    });
});

describe('CopilotSdkClientProvider - entitlement errors', () => {

    const provider = new TestableCopilotSdkClientProvider(sdkStub().api, os.tmpdir());

    it('should explain what an authorization failure of the runtime can mean', () => {
        const enriched = provider.callEnrichEntitlementError(new Error('user is not authorized to use this Copilot feature'));
        expect(String(enriched)).to.contain('subscription');
        expect(String(enriched)).to.contain('not authorized to use this Copilot feature');
    });

    it('should explain a policy rejection the same way', () => {
        expect(String(provider.callEnrichEntitlementError(new Error('Access denied by policy settings')))).to.contain('administrator');
    });

    it('should pass an unrelated failure through unchanged', () => {
        const error = new Error('socket hang up');
        expect(provider.callEnrichEntitlementError(error)).to.equal(error);
    });
});
