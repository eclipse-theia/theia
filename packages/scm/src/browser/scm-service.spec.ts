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
import { Emitter } from '@theia/core/lib/common/event';
import { ScmService } from './scm-service';
import { ScmProvider } from './scm-provider';

function makeProvider(id: string, rootUri: string): ScmProvider {
    return {
        id,
        label: id,
        rootUri,
        groups: [],
        onDidChange: new Emitter<void>().event,
        onDidChangeCommitTemplate: new Emitter<string>().event,
        dispose: () => { }
    } as unknown as ScmProvider;
}

describe('ScmService - repository removal event ordering', () => {
    let service: ScmService;

    beforeEach(() => {
        service = new ScmService();
        // ScmService declares a ScmContextKeyService injection but does not use it
        // in the paths exercised here. Stub it to stay resilient against future use.
        (service as unknown as Record<string, unknown>).contextKeys = {};
    });

    it('should update selectedRepository before firing onDidRemoveRepository', () => {
        const repoA = service.registerScmProvider(makeProvider('git', '/a'));
        const repoB = service.registerScmProvider(makeProvider('git', '/b'));

        // Select repoA explicitly (registerScmProvider auto-selects the first one).
        service.selectedRepository = repoA;
        expect(service.selectedRepository).to.equal(repoA);

        let selectedDuringRemoveEvent: unknown;
        service.onDidRemoveRepository(() => {
            selectedDuringRemoveEvent = service.selectedRepository;
        });

        repoA.dispose();

        // When a subscriber of onDidRemoveRepository inspects selectedRepository,
        // it must not observe the disposed repository as still being selected.
        expect(selectedDuringRemoveEvent).to.not.equal(repoA);
        expect(selectedDuringRemoveEvent).to.equal(repoB);
        expect(service.selectedRepository).to.equal(repoB);
    });

    it('should clear selectedRepository to undefined when the last repository is removed', () => {
        const repo = service.registerScmProvider(makeProvider('git', '/a'));
        expect(service.selectedRepository).to.equal(repo);

        let selectedDuringRemoveEvent: unknown = 'unset';
        service.onDidRemoveRepository(() => {
            selectedDuringRemoveEvent = service.selectedRepository;
        });

        repo.dispose();

        expect(selectedDuringRemoveEvent).to.be.undefined;
        expect(service.selectedRepository).to.be.undefined;
    });

    it('should fire onDidRemoveRepository and leave _repositories empty after disposing the only repo', () => {
        const repo = service.registerScmProvider(makeProvider('git', '/a'));
        let removed: unknown;
        service.onDidRemoveRepository(r => { removed = r; });

        repo.dispose();

        expect(removed).to.equal(repo);
        expect(service.repositories).to.have.length(0);
    });
});
