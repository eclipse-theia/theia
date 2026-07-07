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

import { inject, injectable, named, optional } from 'inversify';
import { ApplicationShell } from './shell/application-shell';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { WidgetManager } from './widget-manager';
import { ContributionProvider } from '../common/contribution-provider';
import { CommandContribution, CommandRegistry } from '../common/command';
import { Emitter, Event } from '../common/event';
import { QuickInputService, QuickPickItem } from '../common/quick-pick-service';
import { nls } from '../common/nls';

export interface PerspectiveDescriptor {
    id: string;
    label: string;
    /** Widget/view-container ID → target shell area */
    viewPlacements: Map<string, ApplicationShell.Area>;
    /** Called when perspective is activated */
    onActivate?(shell: ApplicationShell): void;
    /** Called when switching away */
    onDeactivate?(shell: ApplicationShell): void;
}

export const PerspectiveContribution = Symbol('PerspectiveContribution');
export interface PerspectiveContribution {
    registerPerspectives(service: PerspectiveService): void;
}

@injectable()
export class PerspectiveService implements FrontendApplicationContribution, CommandContribution {

    static readonly SWITCH_PERSPECTIVE_COMMAND = {
        id: 'perspective.switch',
        category: nls.localizeByDefault('View'),
        label: nls.localize('theia/core/perspective/switchPerspective', 'Switch Perspective')
    };

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ContributionProvider) @named(PerspectiveContribution) @optional()
    protected readonly contributions: ContributionProvider<PerspectiveContribution> | undefined;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService | undefined;

    static readonly DEFAULT_PERSPECTIVE_ID = 'theia-ide';

    protected readonly perspectives = new Map<string, PerspectiveDescriptor>();
    protected activePerspectiveId: string | undefined;
    protected readonly savedLayouts = new Map<string, ApplicationShell.LayoutData>();

    protected readonly onDidChangePerspectiveEmitter = new Emitter<string>();
    readonly onDidChangePerspective: Event<string> = this.onDidChangePerspectiveEmitter.event;

    initialize(): void {
        this.registerPerspective({
            id: PerspectiveService.DEFAULT_PERSPECTIVE_ID,
            label: nls.localize('theia/core/perspective/theiaIde', 'Theia IDE'),
            viewPlacements: new Map()
        });
        this.activePerspectiveId = PerspectiveService.DEFAULT_PERSPECTIVE_ID;

        if (this.contributions) {
            for (const contribution of this.contributions.getContributions()) {
                contribution.registerPerspectives(this);
            }
        }
    }

    registerPerspective(descriptor: PerspectiveDescriptor): void {
        this.perspectives.set(descriptor.id, descriptor);
    }

    async switchPerspective(id: string): Promise<void> {
        if (id === this.activePerspectiveId) {
            return;
        }

        const descriptor = this.perspectives.get(id);
        if (!descriptor) {
            return;
        }

        const oldPerspective = this.getActivePerspective();
        if (oldPerspective?.onDeactivate) {
            oldPerspective.onDeactivate(this.shell);
        }

        if (this.activePerspectiveId) {
            this.savedLayouts.set(this.activePerspectiveId, this.shell.getLayoutData());
        }

        this.activePerspectiveId = id;

        const savedLayout = this.savedLayouts.get(id);
        if (savedLayout) {
            await this.shell.setLayoutData(savedLayout);
        } else {
            for (const [viewId, area] of descriptor.viewPlacements) {
                try {
                    const widget = await this.widgetManager.getOrCreateWidget(viewId);
                    const currentTabBar = this.shell.getTabBarFor(widget);
                    if (currentTabBar) {
                        const currentArea = this.shell.getAreaFor(widget);
                        if (currentArea === area) {
                            continue;
                        }
                    }
                    await this.shell.addWidget(widget, { area });
                } catch {
                    // Widget factory may not be registered — skip silently
                }
            }

            for (const [viewId] of descriptor.viewPlacements) {
                try {
                    await this.shell.activateWidget(viewId);
                } catch {
                    // Ignore activation errors
                }
            }
        }

        if (descriptor.onActivate) {
            descriptor.onActivate(this.shell);
        }

        this.onDidChangePerspectiveEmitter.fire(id);
    }

    getActivePerspective(): PerspectiveDescriptor | undefined {
        if (this.activePerspectiveId) {
            return this.perspectives.get(this.activePerspectiveId);
        }
        return undefined;
    }

    getAreaForView(viewId: string): ApplicationShell.Area | undefined {
        const active = this.getActivePerspective();
        if (active) {
            return active.viewPlacements.get(viewId);
        }
        return undefined;
    }

    getRegisteredPerspectives(): PerspectiveDescriptor[] {
        return Array.from(this.perspectives.values());
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(PerspectiveService.SWITCH_PERSPECTIVE_COMMAND, {
            execute: () => this.showPerspectivePicker(),
            isEnabled: () => this.perspectives.size > 0
        });
    }

    protected async showPerspectivePicker(): Promise<void> {
        if (!this.quickInputService) {
            return;
        }

        const items: QuickPickItem[] = this.getRegisteredPerspectives().map(p => ({
            label: p.label,
            id: p.id,
            description: this.activePerspectiveId === p.id ? nls.localizeByDefault('Active') : undefined
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: nls.localize('theia/core/perspective/selectPerspective', 'Select a perspective')
        });

        if (selected?.id) {
            await this.switchPerspective(selected.id);
        }
    }
}
