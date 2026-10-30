// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { TerminalService } from './base/terminal-service';
import { ShellTerminalProfile } from './shell-terminal-profile';
import { DefaultProfileStore, DefaultTerminalProfileService, NULL_PROFILE } from './terminal-profile-service';

disableJSDOM();

describe('DefaultTerminalProfileService', () => {
    let userStore: DefaultProfileStore;
    let contributedStore: DefaultProfileStore;
    let service: DefaultTerminalProfileService;
    let defaultShellChanges: string[];

    const createProfile = (shellPath: string): ShellTerminalProfile => new ShellTerminalProfile({} as TerminalService, { shellPath });
    const zsh = createProfile('/bin/zsh');
    const bash = createProfile('/bin/bash');
    const fish = createProfile('/usr/bin/fish');

    beforeEach(() => {
        userStore = new DefaultProfileStore();
        contributedStore = new DefaultProfileStore();
        service = new DefaultTerminalProfileService(userStore, contributedStore);
        defaultShellChanges = [];
        service.onDidChangeDefaultShell(shell => defaultShellChanges.push(shell));

        contributedStore.registerTerminalProfile('zsh', zsh);
        contributedStore.registerTerminalProfile('bash', bash);
        contributedStore.registerTerminalProfile('fish', fish);
    });

    it('should use the first profile as default if none is set', () => {
        expect(service.defaultProfile).to.equal(zsh);
    });

    it('should use the profile set as default', () => {
        service.setDefaultProfile('bash');
        expect(service.defaultProfile).to.equal(bash);
        expect(defaultShellChanges).to.deep.equal(['/bin/bash']);
    });

    it('should not set an unknown profile as default', () => {
        expect(() => service.setDefaultProfile('unknown')).to.throw();
        expect(service.defaultProfile).to.equal(zsh);
    });

    it('should keep the default when removing a profile listed before it', () => {
        service.setDefaultProfile('bash');
        contributedStore.unregisterTerminalProfile('zsh');
        expect(service.defaultProfile).to.equal(bash);
    });

    it('should keep the default when removing a profile listed after it', () => {
        contributedStore.unregisterTerminalProfile('fish');
        expect(service.defaultProfile).to.equal(zsh);

        service.setDefaultProfile('zsh');
        contributedStore.unregisterTerminalProfile('bash');
        expect(service.defaultProfile).to.equal(zsh);
    });

    it('should fall back to the first profile when the default is removed and restore it when added again', () => {
        service.setDefaultProfile('bash');
        contributedStore.unregisterTerminalProfile('bash');
        expect(service.defaultProfile).to.equal(zsh);

        contributedStore.registerTerminalProfile('bash', bash);
        expect(service.defaultProfile).to.equal(bash);
        expect(defaultShellChanges).to.deep.equal(['/bin/bash', '/bin/zsh', '/bin/bash']);
    });

    it('should fall back to the first profile when the default is hidden by a null profile', () => {
        service.setDefaultProfile('fish');
        userStore.registerTerminalProfile('fish', NULL_PROFILE);
        expect(service.defaultProfile).to.equal(zsh);
        expect(defaultShellChanges).to.deep.equal(['/usr/bin/fish', '/bin/zsh']);
    });

    it('should not report a default profile if there are no profiles', () => {
        const emptyService = new DefaultTerminalProfileService(new DefaultProfileStore());
        expect(emptyService.defaultProfile).to.be.undefined;
    });
});
