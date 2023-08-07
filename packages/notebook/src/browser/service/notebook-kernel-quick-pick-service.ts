
// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayUtils, Command, CommandService, DisposableCollection, Event, nls, QuickInputButton, QuickInputService, QuickPickInput, QuickPickItem, URI, } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookKernelService, NotebookKernel, NotebookKernelMatchResult, SourceCommand } from './notebook-kernel-service';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { codicon, OpenerService } from '@theia/core/lib/browser';
import { NotebookKernelHistoryService } from './notebook-kernel-history-service';
import debounce = require('@theia/core/shared/lodash.debounce');

export const JUPYTER_EXTENSION_ID = 'ms-toolsai.jupyter';

export const NotebookKernelQuickPickService = Symbol('NotebookKernelQuickPickService');

type KernelPick = QuickPickItem & { kernel: NotebookKernel };
function isKernelPick(item: QuickPickInput<QuickPickItem>): item is KernelPick {
    return 'kernel' in item;
}
type GroupedKernelsPick = QuickPickItem & { kernels: NotebookKernel[]; source: string };
function isGroupedKernelsPick(item: QuickPickInput<QuickPickItem>): item is GroupedKernelsPick {
    return 'kernels' in item;
}
type SourcePick = QuickPickItem & { action: SourceCommand };
function isSourcePick(item: QuickPickInput<QuickPickItem>): item is SourcePick {
    return 'action' in item;
}
type InstallExtensionPick = QuickPickItem & { extensionIds: string[] };

type KernelSourceQuickPickItem = QuickPickItem & { command: Command; documentation?: string };
function isKernelSourceQuickPickItem(item: QuickPickItem): item is KernelSourceQuickPickItem {
    return 'command' in item;
}

function supportAutoRun(item: QuickPickInput<KernelQuickPickItem>): item is QuickPickItem {
    return 'autoRun' in item && !!item.autoRun;
}

type KernelQuickPickItem = (QuickPickItem & { autoRun?: boolean }) | InstallExtensionPick | KernelPick | GroupedKernelsPick | SourcePick | KernelSourceQuickPickItem;

const KERNELPICKERUPDATEDEBOUNCE = 200;

export type KernelQuickPickContext =
    { id: string; extension: string } |
    { notebookEditorId: string } |
    { id: string; extension: string; notebookEditorId: string } |
    { ui?: boolean; notebookEditor?: NotebookEditorWidget };

function toKernelQuickPick(kernel: NotebookKernel, selected: NotebookKernel | undefined): KernelPick {
    const res: KernelPick = {
        kernel,
        label: kernel.label,
        description: kernel.description,
        detail: kernel.detail
    };
    if (kernel.id === selected?.id) {
        if (!res.description) {
            res.description = nls.localizeByDefault('Currently Selected');
        } else {
            res.description = nls.localizeByDefault('{0} - Currently Selected', res.description);
        }
    }
    return res;
}

@injectable()
export abstract class NotebookKernelQuickPickServiceImpl {

    @inject(NotebookKernelService)
    protected readonly notebookKernelService: NotebookKernelService;
    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;
    @inject(CommandService)
    protected readonly commandService: CommandService;

    async showQuickPick(editor: NotebookModel, wantedId?: string, skipAutoRun?: boolean): Promise<boolean> {
        const notebook = editor;
        const matchResult = this.getMatchingResult(notebook);
        const { selected, all } = matchResult;

        let newKernel: NotebookKernel | undefined;
        if (wantedId) {
            for (const candidate of all) {
                if (candidate.id === wantedId) {
                    newKernel = candidate;
                    break;
                }
            }
            if (!newKernel) {
                console.warn(`wanted kernel DOES NOT EXIST, wanted: ${wantedId}, all: ${all.map(k => k.id)}`);
                return false;
            }
        }

        if (newKernel) {
            this.selectKernel(notebook, newKernel);
            return true;
        }

        const quickPick = this.quickInputService.createQuickPick<KernelQuickPickItem>();
        const quickPickItems = this.getKernelPickerQuickPickItems(matchResult);

        if (quickPickItems.length === 1 && supportAutoRun(quickPickItems[0]) && !skipAutoRun) {
            return this.handleQuickPick(editor, quickPickItems[0], quickPickItems as KernelQuickPickItem[]);
        }

        quickPick.items = quickPickItems;
        quickPick.canSelectMany = false;
        quickPick.placeholder = selected
            ? nls.localizeByDefault("Change kernel for '{0}'", 'current') // TODO get label for curent notebook from a label provider
            : nls.localizeByDefault("Select kernel for '{0}'", 'current');

        quickPick.busy = this.notebookKernelService.getKernelDetectionTasks(notebook).length > 0;

        const kernelDetectionTaskListener = this.notebookKernelService.onDidChangeKernelDetectionTasks(() => {
            quickPick.busy = this.notebookKernelService.getKernelDetectionTasks(notebook).length > 0;
        });

        const kernelChangeEventListener = debounce(
            Event.any(
                this.notebookKernelService.onDidChangeSourceActions,
                this.notebookKernelService.onDidAddKernel,
                this.notebookKernelService.onDidRemoveKernel,
                this.notebookKernelService.onDidChangeNotebookAffinity
            ),
            KERNELPICKERUPDATEDEBOUNCE
        )(async () => {
            // reset quick pick progress
            quickPick.busy = false;

            const currentActiveItems = quickPick.activeItems;
            const newMatchResult = this.getMatchingResult(notebook);
            const newQuickPickItems = this.getKernelPickerQuickPickItems(newMatchResult);
            quickPick.keepScrollPosition = true;

            // recalcuate active items
            const activeItems: KernelQuickPickItem[] = [];
            for (const item of currentActiveItems) {
                if (isKernelPick(item)) {
                    const kernelId = item.kernel.id;
                    const sameItem = newQuickPickItems.find(pi => isKernelPick(pi) && pi.kernel.id === kernelId) as KernelPick | undefined;
                    if (sameItem) {
                        activeItems.push(sameItem);
                    }
                } else if (isSourcePick(item)) {
                    const sameItem = newQuickPickItems.find(pi => isSourcePick(pi) && pi.action.command.id === item.action.command.id) as SourcePick | undefined;
                    if (sameItem) {
                        activeItems.push(sameItem);
                    }
                }
            }

            quickPick.items = newQuickPickItems;
            quickPick.activeItems = activeItems;
        }, this);

        const pick = await new Promise<{ selected: KernelQuickPickItem | undefined; items: KernelQuickPickItem[] }>((resolve, reject) => {
            quickPick.onDidAccept(() => {
                const item = quickPick.selectedItems[0];
                if (item) {
                    resolve({ selected: item, items: quickPick.items as KernelQuickPickItem[] });
                } else {
                    resolve({ selected: undefined, items: quickPick.items as KernelQuickPickItem[] });
                }

                quickPick.hide();
            });

            quickPick.onDidHide(() => {
                kernelDetectionTaskListener.dispose();
                kernelChangeEventListener?.dispose();
                quickPick.dispose();
                resolve({ selected: undefined, items: quickPick.items as KernelQuickPickItem[] });
            });
            quickPick.show();
        });

        if (pick.selected) {
            return this.handleQuickPick(editor, pick.selected, pick.items);
        }

        return false;
    }

    protected getMatchingResult(notebook: NotebookModel): NotebookKernelMatchResult {
        return this.notebookKernelService.getMatchingKernel(notebook);
    }

    protected abstract getKernelPickerQuickPickItems(matchResult: NotebookKernelMatchResult): QuickPickInput<KernelQuickPickItem>[];

    protected async handleQuickPick(editor: NotebookModel, pick: KernelQuickPickItem, quickPickItems: KernelQuickPickItem[]): Promise<boolean> {
        if (isKernelPick(pick)) {
            const newKernel = pick.kernel;
            this.selectKernel(editor, newKernel);
            return true;
        }

        // actions
        // if (isSearchMarketplacePick(pick)) {
        //     await this.showKernelExtension(
        //         this.paneCompositePartService,
        //         this.extensionWorkbenchService,
        //         this.extensionService,
        //         editor.textModel.viewType,
        //         []
        //     );
        //     // suggestedExtension must be defined for this option to be shown, but still check to make TS happy
        // } else if (isInstallExtensionPick(pick)) {
        //     await this.showKernelExtension(
        //         this.paneCompositePartService,
        //         this.extensionWorkbenchService,
        //         this.extensionService,
        //         editor.textModel.viewType,
        //         pick.extensionIds,
        //     );
        // } else
        if (isSourcePick(pick)) {
            // selected explicilty, it should trigger the execution?
            pick.action.run();
        }

        return true;
    }

    protected selectKernel(notebook: NotebookModel, kernel: NotebookKernel): void {
        this.notebookKernelService.selectKernelForNotebook(kernel, notebook);
    }

    // protected async showKernelExtension(
    //     paneCompositePartService: PaneCompositePartService,
    //     extensionWorkbenchService: ExtensionsWorkbenchService,
    //     extensionService: ExtensionService,
    //     viewType: string,
    //     extIds: string[],
    // ) {
    //     // If extension id is provided attempt to install the extension as the user has requested the suggested ones be installed
    //     const extensionsToInstall: IExtension[] = [];

    //     for (const extId of extIds) {
    //         const extension = (await extensionWorkbenchService.getExtensions([{ id: extId }], CancellationToken.None))[0];
    //         const canInstall = await extensionWorkbenchService.canInstall(extension);
    //         if (canInstall) {
    //             extensionsToInstall.push(extension);
    //         }
    //     }

    //     if (extensionsToInstall.length) {
    //         await Promise.all(extensionsToInstall.map(async extension => {
    //             await extensionWorkbenchService.install(
    //                 extension,
    //                 {
    //                     installPreReleaseVersion: false,
    //                     context: { skipWalkthrough: true }
    //                 },
    //                 ProgressLocation.Notification
    //             );
    //         }));

    //         await extensionService.activateByEvent(`onNotebook:${viewType}`);
    //         return;
    //     }

    //     const viewlet = await paneCompositePartService.openPaneComposite(EXTENSIONVIEWLETID, ViewContainerLocation.Sidebar, true);
    //     const view = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer | undefined;
    //     const pascalCased = viewType.split(/[^a-z0-9]/ig).map(uppercaseFirstLetter).join('');
    //     view?.search(`@tag:notebookKernel${pascalCased}`);
    // }

    // private async showInstallKernelExtensionRecommendation(
    //     notebookModel: NotebookModel,
    //     quickPick: QuickPick<KernelQuickPickItem>,
    //     extensionWorkbenchService: ExtensionsWorkbenchService,
    //     token: CancellationToken
    // ): Promise<void> {
    //     quickPick.busy = true;

    //     const newQuickPickItems = await this.getKernelRecommendationsQuickPickItems(notebookModel, extensionWorkbenchService);
    //     quickPick.busy = false;

    //     if (token.isCancellationRequested) {
    //         return;
    //     }

    //     if (newQuickPickItems && quickPick.items.length === 0) {
    //         quickPick.items = newQuickPickItems;
    //     }
    // }

    // protected async getKernelRecommendationsQuickPickItems(
    //     notebookModel: NotebookModel,
    //     extensionWorkbenchService: ExtensionsWorkbenchService,
    // ): Promise<QuickPickInput<SearchMarketplacePick | InstallExtensionPick>[] | undefined> {
    //     const quickPickItems: QuickPickInput<SearchMarketplacePick | InstallExtensionPick>[] = [];

    //     const language = this.getSuggestedLanguage(notebookModel);
    //     const suggestedExtension: NotebookExtensionRecommendation | undefined = language ? this.getSuggestedKernelFromLanguage(notebookModel.viewType, language) : undefined;
    //     if (suggestedExtension) {
    //         await extensionWorkbenchService.queryLocal();
    //         const extensions = extensionWorkbenchService.installed.filter(e => suggestedExtension.extensionIds.includes(e.identifier.id));

    //         if (extensions.length === suggestedExtension.extensionIds.length) {
    //             // it's installed but might be detecting kernels
    //             return undefined;
    //         }

    //         // We have a suggested kernel, show an option to install it
    //         quickPickItems.push({
    //             id: 'installSuggested',
    //             description: suggestedExtension.displayName ?? suggestedExtension.extensionIds.join(', '),
    //             label: `$(${Codicon.lightbulb.id}) ` + nls.localizeByDefault('Install suggested extensions'),
    //             extensionIds: suggestedExtension.extensionIds
    //         } as InstallExtensionPick);
    //     }
    //     // there is no kernel, show the install from marketplace
    //     quickPickItems.push({
    //         id: 'install',
    //         label: nls.localizeByDefault('Browse marketplace for kernel extensions'),
    //     } as SearchMarketplacePick);

    //     return quickPickItems;
    // }

    /**
     * Examine the most common language in the notebook
     * @param notebookModel The notebook text model
     * @returns What the suggested language is for the notebook. Used for kernal installing
     */
    // private getSuggestedLanguage(notebookModel: NotebookModel): string | undefined {
    //     const metaData = notebookModel.data.metadata;
    //     let suggestedKernelLanguage: string | undefined = (metaData.custom as any)?.metadata?.languageinfo?.name;
    //     // TODO how do we suggest multi language notebooks?
    //     if (!suggestedKernelLanguage) {
    //         const cellLanguages = notebookModel.cells.map(cell => cell.language).filter(language => language !== 'markdown');
    //         // Check if cell languages is all the same
    //         if (cellLanguages.length > 1) {
    //             const firstLanguage = cellLanguages[0];
    //             if (cellLanguages.every(language => language === firstLanguage)) {
    //                 suggestedKernelLanguage = firstLanguage;
    //             }
    //         }
    //     }
    //     return suggestedKernelLanguage;
    // }

    /**
     * Given a language and notebook view type suggest a kernel for installation
     * @param language The language to find a suggested kernel extension for
     * @returns A recommednation object for the recommended extension, else undefined
     */
    // private getSuggestedKernelFromLanguage(viewType: string, language: string): NotebookExtensionRecommendation | undefined {
    //     const recommendation = KERNELRECOMMENDATIONS.get(viewType)?.get(language);
    //     return recommendation;
    // }

}
@injectable()
export class KernelPickerMRUStrategy extends NotebookKernelQuickPickServiceImpl {

    @inject(OpenerService)
    protected openerService: OpenerService;

    @inject(NotebookKernelHistoryService)
    protected notebookKernelHistoryService: NotebookKernelHistoryService;

    protected getKernelPickerQuickPickItems(matchResult: NotebookKernelMatchResult): QuickPickInput<KernelQuickPickItem>[] {
        const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];

        if (matchResult.selected) {
            const kernelItem = toKernelQuickPick(matchResult.selected, matchResult.selected);
            quickPickItems.push(kernelItem);
        }

        // TODO use suggested here wehen kernel affinity is implemented. For now though show all kernels
        matchResult.all.filter(kernel => kernel.id !== matchResult.selected?.id).map(kernel => toKernelQuickPick(kernel, matchResult.selected))
            .forEach(kernel => {
                quickPickItems.push(kernel);
            });

        const shouldAutoRun = quickPickItems.length === 0;

        if (quickPickItems.length > 0) {
            quickPickItems.push({
                type: 'separator'
            });
        }

        // select another kernel quick pick
        quickPickItems.push({
            id: 'selectAnother',
            label: nls.localizeByDefault('Select Another Kernel...'),
            autoRun: shouldAutoRun
        });

        return quickPickItems;
    }

    protected override selectKernel(notebook: NotebookModel, kernel: NotebookKernel): void {
        const currentInfo = this.notebookKernelService.getMatchingKernel(notebook);
        if (currentInfo.selected) {
            // there is already a selected kernel
            this.notebookKernelHistoryService.addMostRecentKernel(currentInfo.selected);
        }
        super.selectKernel(notebook, kernel);
        this.notebookKernelHistoryService.addMostRecentKernel(kernel);
    }

    protected override getMatchingResult(notebook: NotebookModel): NotebookKernelMatchResult {
        const { selected, all } = this.notebookKernelHistoryService.getKernels(notebook);
        const matchingResult = this.notebookKernelService.getMatchingKernel(notebook);
        return {
            selected: selected,
            all: matchingResult.all,
            suggestions: all,
            hidden: []
        };
    }

    protected override async handleQuickPick(editor: NotebookModel, pick: KernelQuickPickItem, items: KernelQuickPickItem[]): Promise<boolean> {
        if (pick.id === 'selectAnother') {
            return this.displaySelectAnotherQuickPick(editor, items.length === 1 && items[0] === pick);
        }

        return super.handleQuickPick(editor, pick, items);
    }

    private async displaySelectAnotherQuickPick(editor: NotebookModel, kernelListEmpty: boolean): Promise<boolean> {
        const notebook: NotebookModel = editor;
        const disposables = new DisposableCollection();
        const quickPick = this.quickInputService.createQuickPick<KernelQuickPickItem>();
        const quickPickItem = await new Promise<KernelQuickPickItem | QuickInputButton | undefined>(resolve => {
            // select from kernel sources
            quickPick.title = kernelListEmpty ? nls.localizeByDefault('Select Kernel') : nls.localizeByDefault('Select Another Kernel');
            quickPick.placeholder = nls.localizeByDefault('Type to choose a kernel source');
            quickPick.busy = true;
            // quickPick.buttons = [this.quickInputService.backButton];
            quickPick.show();

            disposables.push(quickPick.onDidTriggerButton(button => {
                if (button === this.quickInputService.backButton) {
                    resolve(button);
                }
            }));
            quickPick.onDidTriggerItemButton(async e => {

                if (isKernelSourceQuickPickItem(e.item) && e.item.documentation !== undefined) {
                    const uri: URI | undefined = URI.isUri(e.item.documentation) ? new URI(e.item.documentation) : await this.commandService.executeCommand(e.item.documentation);
                    if (uri) {
                        (await this.openerService.getOpener(uri, { openExternal: true })).open(uri, { openExternal: true });
                    }
                }
            });
            disposables.push(quickPick.onDidAccept(async () => {
                resolve(quickPick.selectedItems[0]);
            }));
            disposables.push(quickPick.onDidHide(() => {
                resolve(undefined);
            }));

            this.calculdateKernelSources(editor).then(quickPickItems => {
                quickPick.items = quickPickItems;
                if (quickPick.items.length > 0) {
                    quickPick.busy = false;
                }
            });

            debounce(
                Event.any(
                    this.notebookKernelService.onDidChangeSourceActions,
                    this.notebookKernelService.onDidAddKernel,
                    this.notebookKernelService.onDidRemoveKernel
                ),
                KERNELPICKERUPDATEDEBOUNCE,
            )(async () => {
                quickPick.busy = true;
                const quickPickItems = await this.calculdateKernelSources(editor);
                quickPick.items = quickPickItems;
                quickPick.busy = false;
            });
        });

        quickPick.hide();
        disposables.dispose();

        if (quickPickItem === this.quickInputService.backButton) {
            return this.showQuickPick(editor, undefined, true);
        }

        if (quickPickItem) {
            const selectedKernelPickItem = quickPickItem as KernelQuickPickItem;
            if (isKernelSourceQuickPickItem(selectedKernelPickItem)) {
                try {
                    const selectedKernelId = await this.executeCommand<string>(notebook, selectedKernelPickItem.command);
                    if (selectedKernelId) {
                        const { all } = this.getMatchingResult(notebook);
                        const notebookKernel = all.find(kernel => kernel.id === `ms-toolsai.jupyter/${selectedKernelId}`);
                        if (notebookKernel) {
                            this.selectKernel(notebook, notebookKernel);
                            return true;
                        }
                        return true;
                    } else {
                        return this.displaySelectAnotherQuickPick(editor, false);
                    }
                } catch (ex) {
                    return false;
                }
            } else if (isKernelPick(selectedKernelPickItem)) {
                this.selectKernel(notebook, selectedKernelPickItem.kernel);
                return true;
            } else if (isGroupedKernelsPick(selectedKernelPickItem)) {
                await this.selectOneKernel(notebook, selectedKernelPickItem.source, selectedKernelPickItem.kernels);
                return true;
            } else if (isSourcePick(selectedKernelPickItem)) {
                // selected explicilty, it should trigger the execution?
                try {
                    await selectedKernelPickItem.action.run();
                    return true;
                } catch (ex) {
                    return false;
                }
            }
            // } else if (isSearchMarketplacePick(selectedKernelPickItem)) {
            //     await this.showKernelExtension(
            //         this.paneCompositePartService,
            //         this.extensionWorkbenchService,
            //         this.extensionService,
            //         editor.textModel.viewType,
            //         []
            //     );
            //     return true;
            // } else if (isInstallExtensionPick(selectedKernelPickItem)) {
            //     await this.showKernelExtension(
            //         this.paneCompositePartService,
            //         this.extensionWorkbenchService,
            //         this.extensionService,
            //         editor.textModel.viewType,
            //         selectedKernelPickItem.extensionIds,
            //     );
            //     return true;
            // }
        }

        return false;
    }

    private async calculdateKernelSources(editor: NotebookModel): Promise<QuickPickInput<KernelQuickPickItem>[]> {
        const notebook: NotebookModel = editor;

        const actions = await this.notebookKernelService.getKernelSourceActionsFromProviders(notebook);
        const matchResult = this.getMatchingResult(notebook);

        const others = matchResult.all.filter(item => item.extension !== JUPYTER_EXTENSION_ID);
        const quickPickItems: QuickPickInput<KernelQuickPickItem>[] = [];

        // group controllers by extension
        for (const group of ArrayUtils.groupBy(others, (a, b) => a.extension === b.extension ? 0 : 1)) {
            const source = group[0].extension;
            if (group.length > 1) {
                quickPickItems.push({
                    label: source,
                    kernels: group
                });
            } else {
                quickPickItems.push({
                    label: group[0].label,
                    kernel: group[0]
                });
            }
        }

        const validActions = actions.filter(action => action.command);

        quickPickItems.push(...validActions.map(action => {
            const buttons = action.documentation ? [{
                iconClass: codicon('info'),
                tooltip: nls.localizeByDefault('Learn More'),
            }] : [];
            return {
                id: typeof action.command! === 'string' ? action.command! : action.command!.id,
                label: action.label,
                description: action.description,
                command: action.command,
                documentation: action.documentation,
                buttons
            };
        }));

        return quickPickItems;
    }

    private async selectOneKernel(notebook: NotebookModel, source: string, kernels: NotebookKernel[]): Promise<void> {
        const quickPickItems: QuickPickInput<KernelPick>[] = kernels.map(kernel => toKernelQuickPick(kernel, undefined));
        const quickPick = this.quickInputService.createQuickPick<KernelQuickPickItem>();
        quickPick.items = quickPickItems;
        quickPick.canSelectMany = false;

        quickPick.title = nls.localizeByDefault('Select Kernel from {0}', source);

        quickPick.onDidAccept(async () => {
            if (quickPick.selectedItems && quickPick.selectedItems.length > 0 && isKernelPick(quickPick.selectedItems[0])) {
                this.selectKernel(notebook, quickPick.selectedItems[0].kernel);
            }

            quickPick.hide();
            quickPick.dispose();
        });

        quickPick.onDidHide(() => {
            quickPick.dispose();
        });

        quickPick.show();
    }

    private async executeCommand<T>(notebook: NotebookModel, command: string | Command): Promise<T | undefined | void> {
        const id = typeof command === 'string' ? command : command.id;

        return this.commandService.executeCommand(id, { uri: notebook.uri });

    }
}
