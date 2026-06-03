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

import { MessageService, nls } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { ResolvedSkillEntry } from '../../common/skill/skill-registry-types';
import { SkillInstallService } from './skill-install-service';
import { InstallSkillUriConfiguration } from './install-skill-uri-configuration';

const ID_PARAM = 'id';

/**
 * Handles `theia://install-skill?id=<skillId>` deep links. The URL is intentionally
 * minimal: the source, name and content hash are all read from the configured AI registry
 * by id, so the user installs exactly what the registry currently publishes.
 *
 * Unlike the MCP handler, the registry lookup lives in this same package, so the handler
 * consults the fetch service directly instead of going through a bridge interface.
 */
@injectable()
export class InstallSkillUriHandler implements OpenHandler {

    readonly id = 'install-skill-uri-handler';

    @inject(InstallSkillUriConfiguration)
    protected readonly configuration: InstallSkillUriConfiguration;

    @inject(RegistryFetchService)
    protected readonly fetchService: RegistryFetchService;

    @inject(SkillInstallService)
    protected readonly installService: SkillInstallService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    canHandle(uri: URI): number {
        return uri.scheme === this.configuration.getScheme()
            && uri.authority === this.configuration.getAuthority()
            ? 500
            : 0;
    }

    async open(uri: URI): Promise<object | undefined> {
        const skillId = this.extractSkillId(uri);
        if (!skillId) {
            this.messageService.error(nls.localize(
                'theia/ai-registry/skill/installUri/missingId',
                'Install link is missing the required "id" parameter.'
            ));
            return undefined;
        }
        const entry = await this.resolveEntry(skillId);
        if (!entry) {
            this.messageService.error(nls.localize(
                'theia/ai-registry/skill/installUri/unknownId',
                'Skill "{0}" is not listed in your AI registry.',
                skillId
            ));
            return undefined;
        }
        if (!await this.confirmInstall(entry)) {
            return undefined;
        }
        try {
            await this.installService.install(entry);
            this.messageService.info(nls.localize(
                'theia/ai-registry/skill/installUri/success',
                'Installed skill "{0}" from the AI registry.',
                entry.name
            ));
        } catch (error) {
            this.messageService.error(error instanceof Error ? error.message : String(error));
        }
        return undefined;
    }

    /** Loads the registry (awaiting the first fetch) and looks the id up. */
    protected async resolveEntry(skillId: string): Promise<ResolvedSkillEntry | undefined> {
        let entries: ResolvedSkillEntry[];
        try {
            entries = await this.fetchService.getSkillEntries();
        } catch (error) {
            this.messageService.error(nls.localize(
                'theia/ai-registry/skill/installUri/fetchFailed',
                'Could not load the AI registry to install skill "{0}".',
                skillId
            ));
            return undefined;
        }
        return entries.find(entry => entry.skillId === skillId);
    }

    protected async confirmInstall(entry: ResolvedSkillEntry): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai-registry/skill/installUri/confirm/title', 'Install skill'),
            msg: nls.localize(
                'theia/ai-registry/skill/installUri/confirm/msg',
                'Install the skill "{0}" by downloading its files from {1}?',
                entry.name,
                entry.sourceUrl
            ),
            ok: nls.localizeByDefault('Install'),
            cancel: nls.localizeByDefault('Cancel')
        });
        return !!await dialog.open();
    }

    protected extractSkillId(uri: URI): string | undefined {
        return new URLSearchParams(uri.query).get(ID_PARAM)?.trim() || undefined;
    }
}
