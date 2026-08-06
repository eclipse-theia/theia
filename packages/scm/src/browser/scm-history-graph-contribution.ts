// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { nls } from '@theia/core/lib/common/nls';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { QuickInputService } from '@theia/core/lib/browser';
import { QuickPickItem, QuickPickSeparator } from '@theia/core/lib/common/quick-pick-service';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { ScmHistoryGraphModel } from './scm-history-graph-model';
import { ScmHistoryItemRef } from './scm-provider';
import { SCM_HISTORY_TITLE_MENU } from './scm-history-graph-widget';
import { getRefBadgeClass } from './scm-history-graph-helpers';

export namespace ScmHistoryGraphCommands {
    export const REFRESH = Command.toDefaultLocalizedCommand({
        id: 'scmHistoryGraph.refresh',
        category: 'Source Control',
        label: 'Refresh',
        iconClass: codicon('refresh')
    });
    export const PICK_HISTORY_ITEM_REFS = Command.toLocalizedCommand({
        id: 'scmHistoryGraph.pickHistoryItemRefs',
        category: 'Source Control',
        label: 'Pick History Item Reference...',
        iconClass: codicon('git-branch')
    }, 'theia/scm/pickHistoryItemRefs');
}

type RefPickItem = QuickPickItem & { refId?: string; auto?: boolean };

/**
 * Contributes the native toolbar actions of the SCM history graph: the
 * history item reference filter picker (VS Code's "Auto" dropdown) and the
 * refresh action. Extension actions (e.g. fetch/pull/push from vscode.git)
 * are contributed separately via the `scm/history/title` menu.
 */
@injectable()
export class ScmHistoryGraphContribution implements CommandContribution, MenuContribution {

    @inject(ScmHistoryGraphModel) protected readonly model: ScmHistoryGraphModel;
    @inject(QuickInputService) @optional() protected readonly quickInputService: QuickInputService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ScmHistoryGraphCommands.REFRESH, {
            isEnabled: () => !!this.model.provider,
            isVisible: () => !!this.model.provider,
            execute: () => this.model.refresh()
        });
        commands.registerCommand(ScmHistoryGraphCommands.PICK_HISTORY_ITEM_REFS, {
            isEnabled: () => !!this.model.provider && !!this.quickInputService,
            isVisible: () => !!this.model.provider,
            execute: () => this.pickHistoryItemRefs()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        // Extension actions from vscode.git sit at order 900-902; the picker
        // goes before them and refresh last, matching VS Code's graph toolbar.
        menus.registerMenuAction([...SCM_HISTORY_TITLE_MENU, 'navigation'], {
            commandId: ScmHistoryGraphCommands.PICK_HISTORY_ITEM_REFS.id,
            order: '100'
        });
        menus.registerMenuAction([...SCM_HISTORY_TITLE_MENU, 'navigation'], {
            commandId: ScmHistoryGraphCommands.REFRESH.id,
            order: '999'
        });
    }

    protected async pickHistoryItemRefs(): Promise<void> {
        const provider = this.model.provider;
        if (!provider || !this.quickInputService) {
            return;
        }
        const cts = new CancellationTokenSource();
        const refs = await provider.provideHistoryItemRefs(undefined, cts.token) ?? [];

        const currentFilter = this.model.historyItemRefFilter;
        const items = this.createRefPickItems(refs);

        const picker = this.quickInputService.createQuickPick<RefPickItem>();
        picker.placeholder = nls.localize('theia/scm/pickHistoryItemRefsPlaceholder', 'Select one or more history item references');
        picker.canSelectMany = true;
        picker.matchOnDescription = true;
        picker.items = items;
        picker.selectedItems = items.filter((item): item is RefPickItem => !QuickPickSeparator.is(item)
            && (currentFilter ? !!item.refId && currentFilter.includes(item.refId) : item.auto === true));

        // "Auto" is exclusive: checking it unchecks everything else and vice versa
        let lastSelection: readonly RefPickItem[] = picker.selectedItems;
        picker.onDidChangeSelection(newSelection => {
            const autoNow = newSelection.some(item => item.auto);
            if (autoNow && newSelection.length > 1) {
                const autoBefore = lastSelection.some(item => item.auto);
                picker.selectedItems = autoBefore ? newSelection.filter(item => !item.auto) : newSelection.filter(item => item.auto);
            }
            lastSelection = picker.selectedItems;
        });

        const selection = await new Promise<readonly RefPickItem[] | undefined>(resolve => {
            picker.onDidAccept(() => {
                resolve(picker.selectedItems);
                picker.hide();
            });
            picker.onDidHide(() => resolve(undefined));
            picker.show();
        });
        picker.dispose();

        if (!selection) {
            return;
        }
        const refIds = selection.filter(item => item.refId !== undefined).map(item => item.refId!);
        const auto = selection.some(item => item.auto) || refIds.length === 0;
        this.model.setHistoryItemRefFilter(auto ? undefined : refIds);
    }

    protected createRefPickItems(refs: readonly ScmHistoryItemRef[]): (RefPickItem | QuickPickSeparator)[] {
        const provider = this.model.provider;
        const autoRefs = [provider?.currentHistoryItemRef, provider?.currentHistoryItemRemoteRef, provider?.currentHistoryItemBaseRef]
            .filter((ref): ref is ScmHistoryItemRef => !!ref);
        const items: (RefPickItem | QuickPickSeparator)[] = [{
            label: nls.localizeByDefault('Auto'),
            description: autoRefs.map(ref => ref.name).join(', '),
            auto: true
        }];

        const groups: { label: string; badgeClass: string }[] = [
            { label: nls.localize('theia/scm/refPickerBranches', 'branches'), badgeClass: 'head' },
            { label: nls.localize('theia/scm/refPickerRemoteBranches', 'remote branches'), badgeClass: 'remote' },
            { label: nls.localize('theia/scm/refPickerTags', 'tags'), badgeClass: 'tag' }
        ];
        const grouped = new Set<ScmHistoryItemRef>();
        for (const group of groups) {
            const groupRefs = refs.filter(ref => getRefBadgeClass(ref) === group.badgeClass);
            if (groupRefs.length > 0) {
                groupRefs.forEach(ref => grouped.add(ref));
                items.push({ type: 'separator', label: group.label });
                items.push(...groupRefs.map(ref => this.toRefPickItem(ref)));
            }
        }
        const remaining = refs.filter(ref => !grouped.has(ref));
        if (remaining.length > 0) {
            items.push({ type: 'separator' });
            items.push(...remaining.map(ref => this.toRefPickItem(ref)));
        }
        return items;
    }

    protected toRefPickItem(ref: ScmHistoryItemRef): RefPickItem {
        return {
            label: ref.name,
            description: ref.description,
            refId: ref.id
        };
    }
}
