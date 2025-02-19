// *****************************************************************************
// Copyright (C) 2018-2021 Google and others.
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

import { EditorManager, EditorOpenerOptions, EditorWidget, Range } from '@theia/editor/lib/browser';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { EditorPreviewPreferences } from './editor-preview-preferences';
import { ContributionProvider, MaybePromise, Prioritizeable, RecursivePartial, Disposable } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { EditorPreviewWidgetFactory, EditorPreviewOptions } from './editor-preview-widget-factory';
import { EditorPreviewWidget } from './editor-preview-widget';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';

export const EditorSelectionResolver = Symbol('EditorSelectionResolver');

/**
 * Resolves an initial selection to be revealed in an editor.
 *
 * Implementations may provide a custom initial selection based on the given widget, opener options,
 * and optional URI. The resolver's priority determines the order of execution, with higher values executed first.
 *
 * @see EditorPreviewManager#revealSelection
 */
export interface EditorSelectionResolver {
    /**
     * The priority of the resolver. A higher value resolver will be called before others.
     */
    priority?: number;
    resolveSelection(widget: EditorWidget, options: EditorOpenerOptions, uri?: URI): Promise<RecursivePartial<Range> | undefined>;
}

@injectable()
export class EditorPreviewManager extends EditorManager {
    override readonly id = EditorPreviewWidgetFactory.ID;

    @inject(EditorPreviewPreferences) protected readonly preferences: EditorPreviewPreferences;
    @inject(FrontendApplicationStateService) protected readonly stateService: FrontendApplicationStateService;
    @inject(ContributionProvider) @named(EditorSelectionResolver)
    protected readonly resolvers: ContributionProvider<EditorSelectionResolver>;

    /**
     * Until the layout has been restored, widget state is not reliable, so we ignore creation events.
     */
    protected layoutIsSet = false;

    /**
     * An array of selection resolvers, sorted in descending order of priority.
     */
    protected selectionResolvers: EditorSelectionResolver[] = [];

    @postConstruct()
    protected override init(): void {
        super.init();

        this.selectionResolvers = Prioritizeable.prioritizeAllSync(this.resolvers.getContributions(), resolver => resolver.priority ?? 0).map(p => p.value);

        // All editors are created, but not all are opened. This sets up the logic to swap previews when the editor is attached.
        this.onCreated((widget: EditorPreviewWidget) => {
            if (this.layoutIsSet && widget.isPreview) {
                const oneTimeDisposable = widget.onDidChangeVisibility(() => {
                    this.handleNewPreview(widget);
                    oneTimeDisposable.dispose();
                });
            }
        });

        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === 'editor.enablePreview' && !change.newValue) {
                this.all.forEach((editor: EditorPreviewWidget) => {
                    if (editor.isPreview) {
                        editor.convertToNonPreview();
                    }
                });
            }
        });

        this.stateService.reachedState('initialized_layout').then(() => {
            const editors = this.all as EditorPreviewWidget[];
            const currentPreview = editors.find(editor => editor.isPreview);
            if (currentPreview) {
                this.handleNewPreview(currentPreview);
            }
            this.layoutIsSet = true;
        });

        document.addEventListener('dblclick', this.convertEditorOnDoubleClick.bind(this));
    }

    /**
     * Registers a dynamic selection resolver.
     * The resolver is added to the sorted list of selection resolvers and can later be disposed to remove it.
     *
     * @param resolver The selection resolver to register.
     * @returns A Disposable that unregisters the resolver when disposed.
     */
    public registerSelectionResolver(priority: number, resolver: EditorSelectionResolver): Disposable {
        resolver.priority = priority;
        this.selectionResolvers.push(resolver);
        this.selectionResolvers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        return {
            dispose: () => {
                const index = this.selectionResolvers.indexOf(resolver);
                if (index !== -1) {
                    this.selectionResolvers.splice(index, 1);
                }
            }
        };
    }

    protected override async doOpen(widget: EditorPreviewWidget, options?: EditorOpenerOptions): Promise<void> {
        const { preview, widgetOptions = { area: 'main' }, mode = 'activate' } = options ?? {};
        if (!widget.isAttached) {
            this.shell.addWidget(widget, widgetOptions);
        } else if (!preview && widget.isPreview) {
            widget.convertToNonPreview();
        }

        if (mode === 'activate') {
            await this.shell.activateWidget(widget.id);
        } else if (mode === 'reveal') {
            await this.shell.revealWidget(widget.id);
        }
    }

    protected handleNewPreview(newPreviewWidget: EditorPreviewWidget): void {
        if (newPreviewWidget.isPreview) {
            const tabbar = this.shell.getTabBarFor(newPreviewWidget);
            if (tabbar) {
                for (const title of tabbar.titles) {
                    if (title.owner !== newPreviewWidget && title.owner instanceof EditorPreviewWidget && title.owner.isPreview) {
                        title.owner.dispose();
                    }
                }
            }
        }
    }

    protected override tryGetPendingWidget(uri: URI, options?: EditorOpenerOptions): MaybePromise<EditorWidget> | undefined {
        return super.tryGetPendingWidget(uri, { ...options, preview: true }) ?? super.tryGetPendingWidget(uri, { ...options, preview: false });
    }

    protected override async getWidget(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        return (await super.getWidget(uri, { ...options, preview: true })) ?? super.getWidget(uri, { ...options, preview: false });
    }

    protected override async getOrCreateWidget(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        return this.tryGetPendingWidget(uri, options) ?? super.getOrCreateWidget(uri, options);
    }

    protected override createWidgetOptions(uri: URI, options?: EditorOpenerOptions): EditorPreviewOptions {
        const navigatableOptions = super.createWidgetOptions(uri, options) as EditorPreviewOptions;
        navigatableOptions.preview = !!(options?.preview && this.preferences['editor.enablePreview']);
        return navigatableOptions;
    }

    protected convertEditorOnDoubleClick(event: Event): void {
        const widget = this.shell.findTargetedWidget(event);
        if (widget instanceof EditorPreviewWidget && widget.isPreview) {
            widget.convertToNonPreview();
        }
    }

    protected override async revealSelection(widget: EditorWidget, options: EditorOpenerOptions = {}, uri?: URI): Promise<void> {
        if (!options.selection) {
            options.selection = await this.resolveSelection(options, widget, uri);
        }
        super.revealSelection(widget, options, uri);
    }

    protected async resolveSelection(options: EditorOpenerOptions, widget: EditorWidget, uri: URI | undefined): Promise<RecursivePartial<Range> | undefined> {
        if (!options.selection) {
            for (const selectionResolver of this.selectionResolvers) {
                try {
                    const selection = await selectionResolver.resolveSelection(widget, options, uri);
                    if (selection) {
                        return selection;
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        }
        return options.selection;
    }
}
