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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { RequestService } from '@theia/core/shared/@theia/request';
import { OVSXApiFilterProvider, OVSXApiFilter, OVSXRouterConfig } from '@theia/ovsx-client';
import { OVSXClient, VSXExtensionRaw, VSXQueryResult, VSXSearchResult } from '@theia/ovsx-client/lib/ovsx-types';
import { OVSXClientProvider } from '../common/ovsx-client-provider';
import { VSXEnvironment } from '../common/vsx-environment';
import { VSXRegistryService } from '../common/vsx-registry-service';
import { VSXRegistryServiceImpl } from './vsx-registry-service-impl';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

describe('VSXRegistryServiceImpl', () => {
    let service: VSXRegistryService;
    let mockClient: sinon.SinonStubbedInstance<OVSXClient>;
    let mockFilter: sinon.SinonStubbedInstance<OVSXApiFilter>;
    let mockRequestService: sinon.SinonStubbedInstance<RequestService>;
    let mockVsxEnvironment: {
        getRateLimit: sinon.SinonStub;
        getRegistryUri: sinon.SinonStub;
        getRegistryApiUri: sinon.SinonStub;
        getVscodeApiVersion: sinon.SinonStub;
        getOvsxRouterConfig: sinon.SinonStub;
    };
    let mockLogger: MockLogger;

    beforeEach(() => {
        mockClient = {
            search: sinon.stub(),
            query: sinon.stub()
        };

        mockFilter = {
            supportedApiVersion: '1.80.0',
            findLatestCompatibleExtension: sinon.stub(),
            getLatestCompatibleExtension: sinon.stub(),
            getLatestCompatibleVersion: sinon.stub()
        };

        mockRequestService = {
            request: sinon.stub(),
            resolveProxy: sinon.stub(),
            configure: sinon.stub()
        } as sinon.SinonStubbedInstance<RequestService>;

        mockVsxEnvironment = {
            getRateLimit: sinon.stub().resolves(0),
            getRegistryUri: sinon.stub().resolves('https://open-vsx.org'),
            getRegistryApiUri: sinon.stub().resolves('https://open-vsx.org/api'),
            getVscodeApiVersion: sinon.stub().resolves('1.80.0'),
            getOvsxRouterConfig: sinon.stub().resolves(undefined)
        };

        mockLogger = new MockLogger();

        const container = new Container();
        container.bind(VSXRegistryServiceImpl).toSelf().inSingletonScope();
        container.bind(VSXRegistryService).toService(VSXRegistryServiceImpl);
        container.bind(OVSXClientProvider).toConstantValue(() => Promise.resolve(mockClient));
        container.bind(OVSXApiFilterProvider).toConstantValue(async () => mockFilter);
        container.bind(RequestService).toConstantValue(mockRequestService as unknown as RequestService);
        container.bind(VSXEnvironment).toConstantValue(mockVsxEnvironment as unknown as VSXEnvironment);
        container.bind(ILogger).toConstantValue(mockLogger);

        service = container.get(VSXRegistryService);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('search', () => {
        it('should delegate to OVSXClient.search', async () => {
            const searchResult: VSXSearchResult = { offset: 0, extensions: [] };
            mockClient.search.resolves(searchResult);

            const result = await service.search({ query: 'test' });

            expect(result).to.deep.equal(searchResult);
            expect(mockClient.search.calledOnce).to.be.true;
            expect(mockClient.search.firstCall.args[0]).to.deep.equal({ query: 'test' });
        });
    });

    describe('query', () => {
        it('should delegate to OVSXClient.query', async () => {
            const queryResult: VSXQueryResult = { offset: 0, totalSize: 0, extensions: [] };
            mockClient.query.resolves(queryResult);

            const result = await service.query({ extensionId: 'test.ext' });

            expect(result).to.deep.equal(queryResult);
            expect(mockClient.query.calledOnce).to.be.true;
            expect(mockClient.query.firstCall.args[0]).to.deep.equal({ extensionId: 'test.ext' });
        });
    });

    describe('findLatestCompatibleExtension', () => {
        it('should delegate to OVSXApiFilter.findLatestCompatibleExtension', async () => {
            const extensionRaw = { name: 'test', namespace: 'publisher' } as VSXExtensionRaw;
            mockFilter.findLatestCompatibleExtension.resolves(extensionRaw);

            const result = await service.findLatestCompatibleExtension({ extensionId: 'publisher.test', includeAllVersions: true });

            expect(result).to.deep.equal(extensionRaw);
            expect(mockFilter.findLatestCompatibleExtension.calledOnce).to.be.true;
        });

        it('should return undefined when no compatible extension exists', async () => {
            mockFilter.findLatestCompatibleExtension.resolves(undefined);

            const result = await service.findLatestCompatibleExtension({ extensionId: 'publisher.test' });

            expect(result).to.be.undefined;
        });
    });

    describe('fetchReadme', () => {
        it('should return text content for a URL matching the registry origin', async () => {
            mockRequestService.request.resolves({
                url: 'https://open-vsx.org/api/test/readme',
                res: { statusCode: 200, headers: {} },
                buffer: Buffer.from('# Test Readme')
            });

            const result = await service.fetchReadme('https://open-vsx.org/api/test/readme');

            expect(result).to.equal('# Test Readme');
            expect(mockRequestService.request.calledOnce).to.be.true;
        });

        it('should return undefined for a URL with a different origin', async () => {
            const result = await service.fetchReadme('https://evil.example.com/readme.md');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should return undefined for non-HTTP URLs', async () => {
            const result = await service.fetchReadme('file:///etc/passwd');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should return undefined for invalid URLs', async () => {
            const result = await service.fetchReadme('not-a-url');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should return undefined and log on non-404 request error', async () => {
            mockRequestService.request.rejects(new Error('Network error'));

            const result = await service.fetchReadme('https://open-vsx.org/api/test/readme');

            expect(result).to.be.undefined;
            expect((mockLogger.error as sinon.SinonStub).calledOnce).to.be.true;
            expect((mockLogger.error as sinon.SinonStub).firstCall.args[0]).to.contain('open-vsx.org');
        });

        it('should return undefined and log on non-404 status code', async () => {
            mockRequestService.request.resolves({
                url: 'https://open-vsx.org/api/test/readme',
                res: { statusCode: 500, headers: {} },
                buffer: Buffer.from('')
            });

            const result = await service.fetchReadme('https://open-vsx.org/api/test/readme');

            expect(result).to.be.undefined;
            expect((mockLogger.error as sinon.SinonStub).calledOnce).to.be.true;
        });

        it('should return undefined without logging on 404 status code', async () => {
            mockRequestService.request.resolves({
                url: 'https://open-vsx.org/api/test/readme',
                res: { statusCode: 404, headers: {} },
                buffer: Buffer.from('')
            });

            const result = await service.fetchReadme('https://open-vsx.org/api/test/readme');

            expect(result).to.be.undefined;
            expect((mockLogger.error as sinon.SinonStub).called).to.be.false;
        });
    });

    describe('fetchLanguagePackInfo', () => {
        it('should fetch and parse language pack info for a URL matching the registry origin', async () => {
            const manifest = {
                contributes: {
                    localizations: [
                        { languageId: 'de', languageName: 'German', localizedLanguageName: 'Deutsch' }
                    ]
                }
            };
            mockRequestService.request.resolves({
                url: 'https://open-vsx.org/ext/1.0.0/file/package.json',
                res: { statusCode: 200, headers: {} },
                buffer: Buffer.from(JSON.stringify(manifest))
            });

            const result = await service.fetchLanguagePackInfo('https://open-vsx.org/ext/1.0.0/file/download');

            expect(result).to.deep.equal([
                { languageId: 'de', languageName: 'German', localizedLanguageName: 'Deutsch', languagePack: true }
            ]);
            expect(mockRequestService.request.calledOnce).to.be.true;
            const requestUrl = mockRequestService.request.firstCall.args[0].url;
            expect(requestUrl).to.equal('https://open-vsx.org/ext/1.0.0/file/package.json');
        });

        it('should return empty array for a URL with a different origin', async () => {
            const result = await service.fetchLanguagePackInfo('https://evil.example.com/ext/1.0.0/file/download');

            expect(result).to.deep.equal([]);
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should return empty array for non-HTTP URLs', async () => {
            const result = await service.fetchLanguagePackInfo('file:///etc/passwd');

            expect(result).to.deep.equal([]);
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should return empty array on request error', async () => {
            mockRequestService.request.rejects(new Error('Network error'));

            const result = await service.fetchLanguagePackInfo('https://open-vsx.org/ext/1.0.0/file/download');

            expect(result).to.deep.equal([]);
        });

        it('should return empty array when manifest has no localizations', async () => {
            const manifest = { contributes: {} };
            mockRequestService.request.resolves({
                url: 'https://open-vsx.org/ext/1.0.0/file/package.json',
                res: { statusCode: 200, headers: {} },
                buffer: Buffer.from(JSON.stringify(manifest))
            });

            const result = await service.fetchLanguagePackInfo('https://open-vsx.org/ext/1.0.0/file/download');

            expect(result).to.deep.equal([]);
        });
    });

    describe('validateRegistryOrigin', () => {
        it('should allow URLs matching the primary registry origin', async () => {
            mockRequestService.request.resolves({
                url: 'https://open-vsx.org/api/test/readme',
                res: { statusCode: 200, headers: {} },
                buffer: Buffer.from('content')
            });

            const result = await service.fetchReadme('https://open-vsx.org/api/test/readme');

            expect(result).to.equal('content');
            expect(mockRequestService.request.calledOnce).to.be.true;
        });

        it('should reject URLs with a different host', async () => {
            const result = await service.fetchReadme('https://attacker.com/malicious');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
            expect(mockLogger.warn.calledOnce).to.be.true;
        });

        it('should reject private IP URLs (SSRF prevention)', async () => {
            const result = await service.fetchReadme('http://127.0.0.1:4567/');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
            expect(mockLogger.warn.calledOnce).to.be.true;
        });

        it('should reject file: scheme URLs', async () => {
            const result = await service.fetchReadme('file:///etc/shadow');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should reject invalid URLs', async () => {
            const result = await service.fetchReadme('not-a-url-at-all');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should allow URLs from additional registries in router config', async () => {
            const routerConfig: OVSXRouterConfig = {
                registries: {
                    primary: 'https://open-vsx.org',
                    internal: 'https://internal-registry.example.com'
                },
                use: ['primary', 'internal']
            };
            mockVsxEnvironment.getOvsxRouterConfig.resolves(routerConfig);

            mockRequestService.request.resolves({
                url: 'https://internal-registry.example.com/api/test/readme',
                res: { statusCode: 200, headers: {} },
                buffer: Buffer.from('internal content')
            });

            const result = await service.fetchReadme('https://internal-registry.example.com/api/test/readme');

            expect(result).to.equal('internal content');
            expect(mockRequestService.request.calledOnce).to.be.true;
        });

        it('should reject URLs not matching any configured registry', async () => {
            const routerConfig: OVSXRouterConfig = {
                registries: {
                    primary: 'https://open-vsx.org',
                    internal: 'https://internal-registry.example.com'
                },
                use: ['primary', 'internal']
            };
            mockVsxEnvironment.getOvsxRouterConfig.resolves(routerConfig);

            const result = await service.fetchReadme('https://other-host.example.com/readme');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should handle a custom registry URL from environment', async () => {
            mockVsxEnvironment.getRegistryUri.resolves('https://custom-registry.example.com');

            mockRequestService.request.resolves({
                url: 'https://custom-registry.example.com/api/test/readme',
                res: { statusCode: 200, headers: {} },
                buffer: Buffer.from('custom content')
            });

            const result = await service.fetchReadme('https://custom-registry.example.com/api/test/readme');

            expect(result).to.equal('custom content');
            expect(mockRequestService.request.calledOnce).to.be.true;
        });

        it('should log a warning when rejecting a URL', async () => {
            await service.fetchReadme('https://evil.example.com/steal-data');

            expect(mockLogger.warn.calledOnce).to.be.true;
            expect(mockLogger.warn.firstCall.args[0]).to.contain('evil.example.com');
            expect(mockLogger.warn.firstCall.args[0]).to.contain('origin does not match');
        });

        it('should allow URLs with same origin but different paths', async () => {
            mockRequestService.request.resolves({
                url: 'https://open-vsx.org/some/deep/nested/path/readme.md',
                res: { statusCode: 200, headers: {} },
                buffer: Buffer.from('nested content')
            });

            const result = await service.fetchReadme('https://open-vsx.org/some/deep/nested/path/readme.md');

            expect(result).to.equal('nested content');
        });

        it('should reject when origin differs by port', async () => {
            const result = await service.fetchReadme('https://open-vsx.org:8443/api/test/readme');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });

        it('should reject when origin differs by scheme', async () => {
            const result = await service.fetchReadme('http://open-vsx.org/api/test/readme');

            expect(result).to.be.undefined;
            expect(mockRequestService.request.called).to.be.false;
        });
    });
});
