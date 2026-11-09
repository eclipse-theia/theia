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

import { LabelProvider, QuickInputService, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { RecommendedExtensions } from '../../common/recommended-extensions-preference-contribution.js';

export const WorkspaceRecommendationsService = Symbol('WorkspaceRecommendationsService');

/**
 * Reads and edits the extension recommendations of the current workspace, i.e. the
 * `extensions.json` files of the workspace folders and the `extensions` section of a saved workspace file.
 */
export interface WorkspaceRecommendationsService {
    /** Whether recommendations can be edited, i.e. whether a folder or workspace is opened. */
    canModifyRecommendations(): boolean;
    /** Whether the extension is recommended by any workspace folder or by the workspace file. */
    isWorkspaceRecommended(extensionId: string): boolean;
    /** Adds the extension to the recommendations and removes it from the unwanted recommendations. */
    addRecommendation(extensionId: string): Promise<void>;
    /** Removes the extension from the recommendations. */
    removeRecommendation(extensionId: string): Promise<void>;
}

/** A configuration that holds extension recommendations: a workspace folder or the workspace file. */
export interface WorkspaceRecommendationsTarget {
    scope: PreferenceScope.Folder | PreferenceScope.Workspace;
    /** The root URI of the workspace folder, for the `Folder` scope. */
    folderUri?: URI;
}

interface WorkspaceRecommendationsTargetPick extends QuickPickItem {
    target: WorkspaceRecommendationsTarget;
}

@injectable()
export class WorkspaceRecommendationsServiceImpl implements WorkspaceRecommendationsService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    canModifyRecommendations(): boolean {
        return this.workspaceService.opened;
    }

    isWorkspaceRecommended(extensionId: string): boolean {
        const id = extensionId.toLowerCase();
        return this.getTargets().some(target => this.containsExtension(this.getRecommendations(target).recommendations, id));
    }

    async addRecommendation(extensionId: string): Promise<void> {
        const id = extensionId.toLowerCase();
        const targets = await this.pickTargets(this.getTargets(), nls.localizeByDefault('Add extension recommendation to'));
        for (const target of targets) {
            const { recommendations, unwantedRecommendations } = this.getRecommendations(target);
            if (!this.containsExtension(recommendations, id)) {
                await this.setRecommendations(target, 'recommendations', [...recommendations, id]);
            }
            if (this.containsExtension(unwantedRecommendations, id)) {
                await this.setRecommendations(target, 'unwantedRecommendations', this.withoutExtension(unwantedRecommendations, id));
            }
        }
    }

    async removeRecommendation(extensionId: string): Promise<void> {
        const id = extensionId.toLowerCase();
        const recommendingTargets = this.getTargets().filter(target => this.containsExtension(this.getRecommendations(target).recommendations, id));
        const targets = await this.pickTargets(recommendingTargets, nls.localizeByDefault('Remove extension recommendation from'));
        for (const target of targets) {
            const { recommendations } = this.getRecommendations(target);
            await this.setRecommendations(target, 'recommendations', this.withoutExtension(recommendations, id));
        }
    }

    /**
     * Returns the workspace folders and, if the workspace is saved, the workspace file.
     * In a single-folder workspace, the workspace scope is the folder itself, so only the folder is returned.
     */
    protected getTargets(): WorkspaceRecommendationsTarget[] {
        const targets: WorkspaceRecommendationsTarget[] = this.workspaceService.tryGetRoots()
            .map(root => ({ scope: PreferenceScope.Folder, folderUri: root.resource }));
        if (this.workspaceService.saved) {
            targets.push({ scope: PreferenceScope.Workspace });
        }
        return targets;
    }

    protected getRecommendations(target: WorkspaceRecommendationsTarget): Required<RecommendedExtensions> {
        const inspection = this.preferenceService.inspect<Required<RecommendedExtensions>>('extensions', target.folderUri?.toString());
        const value = target.scope === PreferenceScope.Folder ? inspection?.workspaceFolderValue : inspection?.workspaceValue;
        return {
            recommendations: value?.recommendations ?? [],
            unwantedRecommendations: value?.unwantedRecommendations ?? []
        };
    }

    protected setRecommendations(target: WorkspaceRecommendationsTarget, key: keyof RecommendedExtensions, extensionIds: string[]): Promise<void> {
        return this.preferenceService.set(`extensions.${key}`, extensionIds, target.scope, target.folderUri?.toString());
    }

    /** Lets the user pick the targets to edit if there is more than one candidate, like VS Code does. */
    protected async pickTargets(targets: WorkspaceRecommendationsTarget[], placeHolder: string): Promise<WorkspaceRecommendationsTarget[]> {
        if (targets.length <= 1) {
            return targets;
        }
        const picks: Array<WorkspaceRecommendationsTargetPick | QuickPickSeparator> = [];
        for (const target of targets) {
            if (target.folderUri) {
                picks.push({ label: this.labelProvider.getName(target.folderUri), description: nls.localizeByDefault('Workspace Folder'), target });
            } else {
                picks.push({ type: 'separator' }, { label: nls.localizeByDefault('Workspace'), target });
            }
        }
        const selected = await this.quickInputService.pick(picks, { placeHolder, canPickMany: true });
        return selected?.map(pick => pick.target) ?? [];
    }

    protected containsExtension(extensionIds: string[], id: string): boolean {
        return extensionIds.some(extensionId => extensionId.toLowerCase() === id);
    }

    protected withoutExtension(extensionIds: string[], id: string): string[] {
        return extensionIds.filter(extensionId => extensionId.toLowerCase() !== id);
    }
}
