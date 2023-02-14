// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@phosphor/messaging';
import { Disposable, MaybeArray, nls } from '@theia/core/lib/common';
import { AbstractDialog, DialogProps, setEnabled, createIconButton, Widget, codiconArray, Key, LabelProvider } from '@theia/core/lib/browser';
import { FileStatNode } from '../file-tree';
import { LocationListRenderer, LocationListRendererFactory } from '../location';
import { FileDialogModel } from './file-dialog-model';
import { FileDialogWidget } from './file-dialog-widget';
import { FileDialogTreeFiltersRenderer, FileDialogTreeFilters, FileDialogTreeFiltersRendererFactory } from './file-dialog-tree-filters-renderer';
import URI from '@theia/core/lib/common/uri';
import { Panel } from '@theia/core/shared/@phosphor/widgets';
import * as DOMPurify from '@theia/core/shared/dompurify';
import { FileDialogHiddenFilesToggleRenderer, HiddenFilesToggleRendererFactory } from './file-dialog-hidden-files-renderer';

export const OpenFileDialogFactory = Symbol('OpenFileDialogFactory');
export interface OpenFileDialogFactory {
    (props: OpenFileDialogProps): OpenFileDialog;
}

export const SaveFileDialogFactory = Symbol('SaveFileDialogFactory');
export interface SaveFileDialogFactory {
    (props: SaveFileDialogProps): SaveFileDialog;
}

export const SAVE_DIALOG_CLASS = 'theia-SaveFileDialog';

export const NAVIGATION_PANEL_CLASS = 'theia-NavigationPanel';
export const NAVIGATION_BACK_CLASS = 'theia-NavigationBack';
export const NAVIGATION_FORWARD_CLASS = 'theia-NavigationForward';
export const NAVIGATION_HOME_CLASS = 'theia-NavigationHome';
export const NAVIGATION_UP_CLASS = 'theia-NavigationUp';
export const NAVIGATION_LOCATION_LIST_PANEL_CLASS = 'theia-LocationListPanel';

export const FILTERS_PANEL_CLASS = 'theia-FiltersPanel';
export const FILTERS_LABEL_CLASS = 'theia-FiltersLabel';
export const FILTERS_LIST_PANEL_CLASS = 'theia-FiltersListPanel';

export const FILENAME_PANEL_CLASS = 'theia-FileNamePanel';
export const FILENAME_LABEL_CLASS = 'theia-FileNameLabel';
export const FILENAME_TEXTFIELD_CLASS = 'theia-FileNameTextField';

export const CONTROL_PANEL_CLASS = 'theia-ControlPanel';
export const TOOLBAR_ITEM_TRANSFORM_TIMEOUT = 100;

export class FileDialogProps extends DialogProps {

    /**
     * A set of file filters that are used by the dialog. Each entry is a human readable label,
     * like "TypeScript", and an array of extensions, e.g.
     * ```ts
     * {
     *  'Images': ['png', 'jpg']
     *  'TypeScript': ['ts', 'tsx']
     * }
     * ```
     */
    filters?: FileDialogTreeFilters;

    /**
     * Determines if the dialog window should be modal.
     * Defaults to `true`.
     */
    modal?: boolean;

}

@injectable()
export class OpenFileDialogProps extends FileDialogProps {

    /**
     * A human-readable string for the accept button.
     */
    openLabel?: string;

    /**
     * Allow to select files, defaults to `true`.
     */
    canSelectFiles?: boolean;

    /**
     * Allow to select folders, defaults to `false`.
     */
    canSelectFolders?: boolean;

    /**
     * Allow to select many files or folders.
     */
    canSelectMany?: boolean;

}

@injectable()
export class SaveFileDialogProps extends FileDialogProps {

    /**
     * A human-readable string for the accept button.
     */
    saveLabel?: string;

    /**
     * A human-readable value for the input.
     */
    inputValue?: string;

}

export abstract class FileDialog<T> extends AbstractDialog<T> {

    protected back: HTMLSpanElement;
    protected forward: HTMLSpanElement;
    protected home: HTMLSpanElement;
    protected up: HTMLSpanElement;
    protected locationListRenderer: LocationListRenderer;
    protected treeFiltersRenderer: FileDialogTreeFiltersRenderer | undefined;
    protected hiddenFilesToggleRenderer: FileDialogHiddenFilesToggleRenderer;
    protected treePanel: Panel;

    @inject(FileDialogWidget) readonly widget: FileDialogWidget;
    @inject(LocationListRendererFactory) readonly locationListFactory: LocationListRendererFactory;
    @inject(FileDialogTreeFiltersRendererFactory) readonly treeFiltersFactory: FileDialogTreeFiltersRendererFactory;
    @inject(HiddenFilesToggleRendererFactory) readonly hiddenFilesToggleFactory: HiddenFilesToggleRendererFactory;

    constructor(
        @inject(FileDialogProps) override readonly props: FileDialogProps
    ) {
        super(props);
    }

    @postConstruct()
    init(): void {
        this.treePanel = new Panel();
        this.treePanel.addWidget(this.widget);
        this.toDispose.push(this.treePanel);
        this.toDispose.push(this.model.onChanged(() => this.update()));
        this.toDispose.push(this.model.onDidOpenFile(() => this.accept()));
        this.toDispose.push(this.model.onSelectionChanged(() => this.update()));

        const navigationPanel = document.createElement('div');
        navigationPanel.classList.add(NAVIGATION_PANEL_CLASS);
        this.contentNode.appendChild(navigationPanel);

        navigationPanel.appendChild(this.back = createIconButton(...codiconArray('chevron-left', true)));
        this.back.classList.add(NAVIGATION_BACK_CLASS);
        this.back.title = nls.localize('theia/filesystem/dialog/navigateBack', 'Navigate Back');

        navigationPanel.appendChild(this.forward = createIconButton(...codiconArray('chevron-right', true)));
        this.forward.classList.add(NAVIGATION_FORWARD_CLASS);
        this.forward.title = nls.localize('theia/filesystem/dialog/navigateForward', 'Navigate Forward');

        navigationPanel.appendChild(this.home = createIconButton(...codiconArray('home', true)));
        this.home.classList.add(NAVIGATION_HOME_CLASS);
        this.home.title = nls.localize('theia/filesystem/dialog/initialLocation', 'Go To Initial Location');

        navigationPanel.appendChild(this.up = createIconButton(...codiconArray('arrow-up', true)));
        this.up.classList.add(NAVIGATION_UP_CLASS);
        this.up.title = nls.localize('theia/filesystem/dialog/navigateUp', 'Navigate Up One Directory');

        const locationListRendererHost = document.createElement('div');
        this.locationListRenderer = this.locationListFactory({ model: this.model, host: locationListRendererHost });
        this.toDispose.push(this.locationListRenderer);
        this.locationListRenderer.host.classList.add(NAVIGATION_LOCATION_LIST_PANEL_CLASS);
        navigationPanel.appendChild(this.locationListRenderer.host);

        this.hiddenFilesToggleRenderer = this.hiddenFilesToggleFactory(this.widget.model.tree);
        this.contentNode.appendChild(this.hiddenFilesToggleRenderer.host);

        if (this.props.filters) {
            this.treeFiltersRenderer = this.treeFiltersFactory({ suppliedFilters: this.props.filters, fileDialogTree: this.widget.model.tree });
            const filters = Object.keys(this.props.filters);
            if (filters.length) {
                this.widget.model.tree.setFilter(this.props.filters[filters[0]]);
            }
        }
    }

    get model(): FileDialogModel {
        return this.widget.model;
    }

    protected override onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        setEnabled(this.back, this.model.canNavigateBackward());
        setEnabled(this.forward, this.model.canNavigateForward());
        setEnabled(this.home, !!this.model.initialLocation
            && !!this.model.location
            && this.model.initialLocation.toString() !== this.model.location.toString());
        setEnabled(this.up, this.model.canNavigateUpward());
        this.locationListRenderer.render();

        if (this.treeFiltersRenderer) {
            this.treeFiltersRenderer.render();
        }

        this.widget.update();
    }

    protected override handleEnter(event: KeyboardEvent): boolean | void {
        if (event.target instanceof HTMLTextAreaElement || this.targetIsDirectoryInput(event.target) || this.targetIsInputToggle(event.target)) {
            return false;
        }
        this.accept();
    }

    protected override handleEscape(event: KeyboardEvent): boolean | void {
        if (event.target instanceof HTMLTextAreaElement || this.targetIsDirectoryInput(event.target)) {
            return false;
        }
        this.close();
    }

    protected targetIsDirectoryInput(target: EventTarget | null): boolean {
        return target instanceof HTMLInputElement && target.classList.contains(LocationListRenderer.Styles.LOCATION_TEXT_INPUT_CLASS);
    }

    protected targetIsInputToggle(target: EventTarget | null): boolean {
        return target instanceof HTMLSpanElement && target.classList.contains(LocationListRenderer.Styles.LOCATION_INPUT_TOGGLE_CLASS);
    }

    protected appendFiltersPanel(): void {
        if (this.treeFiltersRenderer) {
            const filtersPanel = document.createElement('div');
            filtersPanel.classList.add(FILTERS_PANEL_CLASS);
            this.contentNode.appendChild(filtersPanel);

            const titlePanel = document.createElement('div');
            titlePanel.innerHTML = DOMPurify.sanitize(nls.localize('theia/filesystem/format', 'Format:'));
            titlePanel.classList.add(FILTERS_LABEL_CLASS);
            filtersPanel.appendChild(titlePanel);

            this.treeFiltersRenderer.host.classList.add(FILTERS_LIST_PANEL_CLASS);
            filtersPanel.appendChild(this.treeFiltersRenderer.host);
        }
    }

    protected override onAfterAttach(msg: Message): void {
        Widget.attach(this.treePanel, this.contentNode);
        this.toDisposeOnDetach.push(Disposable.create(() => {
            Widget.detach(this.treePanel);
            this.locationListRenderer.dispose();
            if (this.treeFiltersRenderer) {
                this.treeFiltersRenderer.dispose();
            }
        }));

        this.appendFiltersPanel();

        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(this.getAcceptButtonLabel());

        this.addKeyListener(this.back, Key.ENTER, () => {
            this.addTransformEffectToIcon(this.back);
            this.model.navigateBackward();
        }, 'click');

        this.addKeyListener(this.forward, Key.ENTER, () => {
            this.addTransformEffectToIcon(this.forward);
            this.model.navigateForward();
        }, 'click');
        this.addKeyListener(this.home, Key.ENTER, () => {
            this.addTransformEffectToIcon(this.home);
            if (this.model.initialLocation) {
                this.model.location = this.model.initialLocation;
            }
        }, 'click');
        this.addKeyListener(this.up, Key.ENTER, () => {
            this.addTransformEffectToIcon(this.up);
            if (this.model.location) {
                this.model.location = this.model.location.parent;
            }
        }, 'click');
        super.onAfterAttach(msg);
    }

    protected addTransformEffectToIcon(element: HTMLSpanElement): void {
        const icon = element.getElementsByTagName('i')[0];
        icon.classList.add('active');
        setTimeout(() => icon.classList.remove('active'), TOOLBAR_ITEM_TRANSFORM_TIMEOUT);
    }

    protected abstract getAcceptButtonLabel(): string;

    protected override onActivateRequest(msg: Message): void {
        this.widget.activate();
    }

}

@injectable()
export class OpenFileDialog extends FileDialog<MaybeArray<FileStatNode>> {

    constructor(@inject(OpenFileDialogProps) override readonly props: OpenFileDialogProps) {
        super(props);
    }

    @postConstruct()
    override init(): void {
        super.init();
        const { props } = this;
        if (props.canSelectFiles !== undefined) {
            this.widget.disableFileSelection = !props.canSelectFiles;
        }
    }

    protected getAcceptButtonLabel(): string {
        return this.props.openLabel ? this.props.openLabel : nls.localizeByDefault('Open');
    }

    protected override isValid(value: MaybeArray<FileStatNode>): string {
        if (value && !this.props.canSelectMany && value instanceof Array) {
            return nls.localize('theia/filesystem/dialog/multipleItemMessage', 'You can select only one item');
        }
        return '';
    }

    get value(): MaybeArray<FileStatNode> {
        if (this.widget.model.selectedFileStatNodes.length === 1) {
            return this.widget.model.selectedFileStatNodes[0];
        } else {
            return this.widget.model.selectedFileStatNodes;
        }
    }

    protected override async accept(): Promise<void> {
        const selection = this.value;
        if (!this.props.canSelectFolders
            && !Array.isArray(selection)
            && selection.fileStat.isDirectory) {
            this.widget.model.openNode(selection);
            return;
        }
        super.accept();
    }
}

@injectable()
export class SaveFileDialog extends FileDialog<URI | undefined> {

    protected fileNameField: HTMLInputElement | undefined;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    constructor(@inject(SaveFileDialogProps) override readonly props: SaveFileDialogProps) {
        super(props);
    }

    @postConstruct()
    override init(): void {
        super.init();
        const { widget } = this;
        widget.addClass(SAVE_DIALOG_CLASS);
    }

    protected getAcceptButtonLabel(): string {
        return this.props.saveLabel ? this.props.saveLabel : nls.localizeByDefault('Save');
    }

    protected override onUpdateRequest(msg: Message): void {
        // Update file name field when changing a selection
        if (this.fileNameField) {
            if (this.widget.model.selectedFileStatNodes.length === 1) {
                const node = this.widget.model.selectedFileStatNodes[0];
                if (!node.fileStat.isDirectory) {
                    this.fileNameField.value = this.labelProvider.getName(node);
                }
            } else {
                this.fileNameField.value = '';
            }
        }

        // Continue updating the dialog
        super.onUpdateRequest(msg);
    }

    protected override isValid(value: URI | undefined): string | boolean {
        if (this.fileNameField && this.fileNameField.value) {
            return '';
        }
        return false;
    }

    get value(): URI | undefined {
        if (this.fileNameField && this.widget.model.selectedFileStatNodes.length === 1) {
            const node = this.widget.model.selectedFileStatNodes[0];

            if (node.fileStat.isDirectory) {
                return node.uri.resolve(this.fileNameField.value);
            }

            return node.uri.parent.resolve(this.fileNameField.value);
        }

        return undefined;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);

        const fileNamePanel = document.createElement('div');
        fileNamePanel.classList.add(FILENAME_PANEL_CLASS);
        this.contentNode.appendChild(fileNamePanel);

        const titlePanel = document.createElement('div');
        titlePanel.innerHTML = DOMPurify.sanitize(nls.localize('theia/filesystem/dialog/name', 'Name:'));
        titlePanel.classList.add(FILENAME_LABEL_CLASS);
        fileNamePanel.appendChild(titlePanel);

        this.fileNameField = document.createElement('input');
        this.fileNameField.type = 'text';
        this.fileNameField.spellcheck = false;
        this.fileNameField.classList.add('theia-input', FILENAME_TEXTFIELD_CLASS);
        this.fileNameField.value = this.props.inputValue || '';
        fileNamePanel.appendChild(this.fileNameField);

        this.fileNameField.onkeyup = () => this.validate();
    }

}
