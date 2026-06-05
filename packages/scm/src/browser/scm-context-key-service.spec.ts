// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ContextKey, ContextKeyServiceDummyImpl, ContextKeyValue } from '@theia/core/lib/browser/context-key-service';
import { Emitter } from '@theia/core/lib/common/event';
import { ScmContextKeyService } from './scm-context-key-service';
import { ScmContribution } from './scm-contribution';
import { ScmRepository } from './scm-repository';

disableJSDOM();

class MockContextKeyService extends ContextKeyServiceDummyImpl {
    override createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): ContextKey<T> {
        let value: T | undefined = defaultValue;
        const contextKey: ContextKey<T> = {
            set: (v: T | undefined) => { value = v; },
            reset: () => { value = defaultValue; },
            get: () => value
        };
        return contextKey;
    }
}

function createScmContextKeyService(): ScmContextKeyService {
    const mockContextKeyService = new MockContextKeyService();
    const scmContextKeyService = new ScmContextKeyService();
    // Inject the mock context key service
    (scmContextKeyService as unknown as { contextKeyService: MockContextKeyService }).contextKeyService = mockContextKeyService;
    // Manually trigger @postConstruct init
    (scmContextKeyService as unknown as { init(): void }).init();
    return scmContextKeyService;
}

describe('ScmContextKeyService', () => {
    let scmContextKeyService: ScmContextKeyService;

    beforeEach(() => {
        scmContextKeyService = createScmContextKeyService();
    });

    it('should initialize scm.providerCount to 0', () => {
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(0);
    });

    it('should update scm.providerCount when set is called', () => {
        scmContextKeyService.scmProviderCount.set(5);
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(5);
    });

    it('should reset scm.providerCount to default value', () => {
        scmContextKeyService.scmProviderCount.set(3);
        scmContextKeyService.scmProviderCount.reset();
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(0);
    });
});

describe('ScmContribution scm.providerCount wiring', () => {
    let restoreJSDOM: () => void;
    let scmContribution: ScmContribution;
    let scmContextKeyService: ScmContextKeyService;
    let onDidAddRepositoryEmitter: Emitter<ScmRepository>;
    let onDidRemoveRepositoryEmitter: Emitter<ScmRepository>;
    let onDidChangeSelectedRepositoryEmitter: Emitter<ScmRepository | undefined>;
    let onDidChangeStatusBarCommandsEmitter: Emitter<unknown>;
    let repositories: ScmRepository[];

    beforeEach(() => {
        restoreJSDOM = enableJSDOM();

        scmContextKeyService = createScmContextKeyService();
        const mockContextKeys = new MockContextKeyService();

        onDidAddRepositoryEmitter = new Emitter<ScmRepository>();
        onDidRemoveRepositoryEmitter = new Emitter<ScmRepository>();
        onDidChangeSelectedRepositoryEmitter = new Emitter<ScmRepository | undefined>();
        onDidChangeStatusBarCommandsEmitter = new Emitter<unknown>();
        repositories = [];

        const mockScmService: Partial<Record<string, unknown>> = {
            get repositories(): ScmRepository[] { return repositories; },
            onDidAddRepository: onDidAddRepositoryEmitter.event,
            onDidRemoveRepository: onDidRemoveRepositoryEmitter.event,
            onDidChangeSelectedRepository: onDidChangeSelectedRepositoryEmitter.event,
            onDidChangeStatusBarCommands: onDidChangeStatusBarCommandsEmitter.event,
            statusBarCommands: []
        };

        scmContribution = new ScmContribution();

        // Inject mocked dependencies
        const contribution = scmContribution as unknown as Record<string, unknown>;
        contribution.scmService = mockScmService;
        contribution.scmContextKeys = scmContextKeyService;
        contribution.contextKeys = mockContextKeys;
        contribution.statusBar = { setElement: (): void => { }, removeElement: (): void => { } };
        contribution.labelProvider = { getName: (): string => '', onDidChange: new Emitter<unknown>().event };
        contribution.shell = { onDidChangeCurrentWidget: new Emitter<unknown>().event, currentWidget: undefined };
        contribution.scmDecorationsService = { onDirtyDiffUpdate: new Emitter<unknown>().event };
        contribution.dirtyDiffNavigator = {};

        // Manually trigger @postConstruct init (creates scmFocus context key)
        (scmContribution as unknown as { init(): void }).init();
    });

    afterEach(() => {
        onDidAddRepositoryEmitter.dispose();
        onDidRemoveRepositoryEmitter.dispose();
        onDidChangeSelectedRepositoryEmitter.dispose();
        onDidChangeStatusBarCommandsEmitter.dispose();
        restoreJSDOM();
    });

    it('should set scm.providerCount to 0 on start with no repositories', () => {
        scmContribution.onStart();
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(0);
    });

    it('should set scm.providerCount initial count when repositories exist at startup', () => {
        repositories.push({} as ScmRepository, {} as ScmRepository);
        scmContribution.onStart();
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(2);
    });

    it('should increment scm.providerCount when a repository is added', () => {
        scmContribution.onStart();
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(0);

        repositories.push({} as ScmRepository);
        onDidAddRepositoryEmitter.fire({} as ScmRepository);
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(1);
    });

    it('should decrement scm.providerCount when a repository is removed', () => {
        const repo = {} as ScmRepository;
        repositories.push(repo);
        scmContribution.onStart();
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(1);

        repositories.pop();
        onDidRemoveRepositoryEmitter.fire(repo);
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(0);
    });

    it('should track multiple additions and removals', () => {
        scmContribution.onStart();

        const repo1 = {} as ScmRepository;
        const repo2 = {} as ScmRepository;

        repositories.push(repo1);
        onDidAddRepositoryEmitter.fire(repo1);
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(1);

        repositories.push(repo2);
        onDidAddRepositoryEmitter.fire(repo2);
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(2);

        repositories.pop();
        onDidRemoveRepositoryEmitter.fire(repo2);
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(1);

        repositories.pop();
        onDidRemoveRepositoryEmitter.fire(repo1);
        expect(scmContextKeyService.scmProviderCount.get()).to.equal(0);
    });
});
