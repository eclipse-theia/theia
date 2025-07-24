// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ArrayUtils, Disposable, DisposableCollection, nls, URI } from '@theia/core';
import {
    ApplicationShell, BaseWidget, FocusTracker, LabelProvider, Message, Navigatable, NavigatableWidgetOpenHandler, PanelLayout,
    Saveable, SaveableSource, SplitPanel, StatefulWidget, StorageService, Widget, WidgetOpenerOptions
} from '@theia/core/lib/browser';
import { Autorun, DerivedObservable, Observable, ObservableUtils, SettableObservable } from '@theia/core/lib/common/observable';
import { Range } from '@theia/editor/lib/browser';
import { MergeRange } from './model/merge-range';
import { MergeEditorModel } from './model/merge-editor-model';
import { MergeEditorBasePane, MergeEditorPane, MergeEditorResultPane, MergeEditorSide1Pane, MergeEditorSide2Pane, MergeEditorSidePane } from './view/merge-editor-panes';
import { MergeEditorViewZone, MergeEditorViewZoneComputer } from './view/merge-editor-view-zones';
import { MergeEditorScrollSync } from './view/merge-editor-scroll-sync';

export interface MergeUris {
    baseUri: URI;
    side1Uri: URI;
    side2Uri: URI;
    resultUri: URI;
}

export namespace MergeEditorUri {

    const SCHEME = 'merge-editor';

    export function isMergeEditorUri(uri: URI): boolean {
        return uri.scheme === SCHEME;
    }

    export function encode({ baseUri, side1Uri, side2Uri, resultUri }: MergeUris): URI {
        return new URI().withScheme(SCHEME).withQuery(JSON.stringify([baseUri.toString(), side1Uri.toString(), side2Uri.toString(), resultUri.toString()]));
    }

    export function decode(uri: URI): MergeUris {
        if (uri.scheme !== SCHEME) {
            throw new Error(`The URI must have scheme ${SCHEME}. The URI was: ${uri}`);
        }
        const mergeUris = JSON.parse(uri.query);
        if (!Array.isArray(mergeUris) || !mergeUris.every(mergeUri => typeof mergeUri === 'string')) {
            throw new Error(`The URI ${uri} is not a valid URI for scheme ${SCHEME}`);
        }
        return {
            baseUri: new URI(mergeUris[0]),
            side1Uri: new URI(mergeUris[1]),
            side2Uri: new URI(mergeUris[2]),
            resultUri: new URI(mergeUris[3])
        };
    }
}

export type MergeEditorLayoutKind = 'mixed' | 'columns';

export interface MergeEditorLayoutMode {
    readonly kind: MergeEditorLayoutKind;
    readonly showBase: boolean;
    readonly showBaseAtTop: boolean;
}

export namespace MergeEditorLayoutMode {
    export const DEFAULT: MergeEditorLayoutMode = { kind: 'mixed', showBase: true, showBaseAtTop: false };
}

export interface MergeEditorSideWidgetState {
    title?: string;
    description?: string;
    detail?: string;
}

export interface MergeEditorWidgetState {
    layoutMode?: MergeEditorLayoutMode;
    side1State?: MergeEditorSideWidgetState;
    side2State?: MergeEditorSideWidgetState;
}

@injectable()
export class MergeEditorSettings {

    protected static LAYOUT_MODE = 'mergeEditor/layoutMode';

    @inject(StorageService)
    protected readonly storageService: StorageService;

    layoutMode = MergeEditorLayoutMode.DEFAULT;

    async load(): Promise<void> {
        await Promise.allSettled([
            this.storageService.getData(MergeEditorSettings.LAYOUT_MODE, this.layoutMode).then(
                layoutMode => this.layoutMode = layoutMode
            ),
        ]);
    }

    async save(): Promise<void> {
        await Promise.allSettled([
            this.storageService.setData(MergeEditorSettings.LAYOUT_MODE, this.layoutMode),
        ]);
    }
}

@injectable()
export class MergeEditor extends BaseWidget implements StatefulWidget, SaveableSource, Navigatable, ApplicationShell.TrackableWidgetProvider {

    @inject(MergeEditorModel)
    readonly model: MergeEditorModel;

    @inject(MergeEditorBasePane)
    readonly basePane: MergeEditorBasePane;

    @inject(MergeEditorSide1Pane)
    readonly side1Pane: MergeEditorSide1Pane;

    @inject(MergeEditorSide2Pane)
    readonly side2Pane: MergeEditorSide2Pane;

    @inject(MergeEditorResultPane)
    readonly resultPane: MergeEditorResultPane;

    @inject(MergeEditorViewZoneComputer)
    protected readonly viewZoneComputer: MergeEditorViewZoneComputer;

    @inject(MergeEditorSettings)
    protected readonly settings: MergeEditorSettings;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    protected readonly visibilityObservable = SettableObservable.create(true);
    protected readonly currentPaneObservable = SettableObservable.create<MergeEditorPane | undefined>(undefined);
    protected readonly layoutModeObservable = SettableObservable.create(MergeEditorLayoutMode.DEFAULT, {
        isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b)
    });
    protected readonly currentMergeRangeObservable = this.createCurrentMergeRangeObservable();
    protected readonly selectionInBaseObservable = this.createSelectionInBaseObservable();

    protected verticalSplitPanel: SplitPanel;
    protected horizontalSplitPanel: SplitPanel;

    protected scrollSync: MergeEditorScrollSync;

    @postConstruct()
    protected init(): void {
        this.addClass('theia-merge-editor');

        const { baseUri, side1Uri, side2Uri, resultUri } = this;

        this.id = MergeEditorUri.encode({ baseUri, side1Uri, side2Uri, resultUri }).toString();

        const setLabels = () => {
            this.title.label = nls.localizeByDefault('Merging: {0}', this.labelProvider.getName(resultUri));
            this.title.iconClass = this.labelProvider.getIcon(resultUri) + ' file-icon';
            this.resultPane.header.description = this.labelProvider.getLongName(resultUri);
        };
        setLabels();
        this.toDispose.push(this.labelProvider.onDidChange(event => {
            if (event.affects(resultUri)) {
                setLabels();
            }
        }));

        this.title.caption = resultUri.path.fsPath();
        this.title.closable = true;

        this.basePane.header.title.label = nls.localizeByDefault('Base');
        this.side1Pane.header.title.label = nls.localizeByDefault('Input 1');
        this.side2Pane.header.title.label = nls.localizeByDefault('Input 2');
        this.resultPane.header.title.label = nls.localizeByDefault('Result');

        this.panes.forEach(pane => pane.mergeEditor = this);

        const layout = this.layout = new PanelLayout();
        this.verticalSplitPanel = new SplitPanel({
            spacing: 1, // --theia-border-width
            orientation: 'vertical'
        });
        layout.addWidget(this.verticalSplitPanel);

        this.horizontalSplitPanel = new SplitPanel({
            spacing: 1, // --theia-border-width
            orientation: 'horizontal'
        });
        this.verticalSplitPanel.addWidget(this.horizontalSplitPanel);

        this.layoutMode = this.settings.layoutMode;

        this.toDispose.push(this.scrollSync = this.createScrollSynchronizer());

        this.initCurrentPaneTracker();
    }

    protected createScrollSynchronizer(): MergeEditorScrollSync {
        return new MergeEditorScrollSync(this);
    }

    protected initCurrentPaneTracker(): void {
        const focusTracker = new FocusTracker<MergeEditorPane>();
        this.toDispose.push(focusTracker);
        focusTracker.currentChanged.connect((_, { oldValue, newValue }) => {
            oldValue?.removeClass('focused');
            newValue?.addClass('focused');
            this.currentPaneObservable.set(newValue || undefined);
        });
        this.panes.forEach(pane => focusTracker.add(pane));
    }

    protected layoutInitialized = false;

    protected ensureLayoutInitialized(): void {
        if (!this.layoutInitialized) {
            this.layoutInitialized = true;
            this.doInitializeLayout();
            this.onLayoutInitialized();
        }
    }

    protected doInitializeLayout(): void {
        this.toDispose.push(Autorun.create(({ isFirstRun }) => {
            const { layoutMode } = this;

            const scrollState = this.scrollSync.storeScrollState();
            const currentPane = this.currentPaneObservable.getUntracked();

            this.applyLayoutMode(layoutMode);

            const pane = currentPane?.isVisible ? currentPane : this.resultPane;
            this.currentPaneObservable.set(pane);
            pane.activate();

            this.scrollSync.restoreScrollState(scrollState);

            if (!isFirstRun) {
                this.settings.layoutMode = layoutMode;
            }
        }));
        let storedState: {
            scrollState: unknown;
            currentPane: MergeEditorPane | undefined;
        } | undefined;
        this.toDispose.push(ObservableUtils.autorunWithDisposables(({ toDispose }) => {
            if (this.isShown) {

                toDispose.push(this.createViewZones());

                if (storedState) {
                    const { currentPane, scrollState } = storedState;
                    storedState = undefined;

                    const pane = currentPane ?? this.resultPane;
                    this.currentPaneObservable.set(pane);
                    pane.activate();

                    this.scrollSync.restoreScrollState(scrollState);
                } else {
                    this.scrollSync.update();
                }
            } else {
                storedState = {
                    scrollState: this.scrollSync.storeScrollState(),
                    currentPane: this.currentPaneObservable.getUntracked()
                };
            }
        }));
    }

    protected onLayoutInitialized(): void {
        const shouldGoToInitialMergeRange = () => {
            const { cursorPosition } = this.currentPane ?? this.resultPane;
            return cursorPosition.line === 0 && cursorPosition.character === 0;
        };
        if (shouldGoToInitialMergeRange()) {
            this.model.onInitialized.then(() => {
                if (!this.isDisposed && shouldGoToInitialMergeRange()) {
                    this.goToFirstMergeRange(mergeRange => !this.model.isMergeRangeHandled(mergeRange));
                }
            });
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        if (msg.width >= 0 && msg.height >= 0) {
            // Don't try to initialize layout until the merge editor itself is positioned.
            // Otherwise, SplitPanel.setRelativeSizes might not work properly when initializing layout.
            this.ensureLayoutInitialized();
        }
    }

    get isShown(): boolean {
        return this.visibilityObservable.get();
    }

    get currentPane(): MergeEditorPane | undefined {
        return this.currentPaneObservable.get();
    }

    protected createCurrentMergeRangeObservable(): Observable<MergeRange | undefined> {
        return DerivedObservable.create(() => {
            const { currentPane } = this;
            if (!currentPane) {
                return undefined;
            }
            const { cursorLine } = currentPane;
            return this.model.mergeRanges.find(mergeRange => {
                const lineRange = currentPane.getLineRangeForMergeRange(mergeRange);
                return lineRange.isEmpty ? lineRange.startLineNumber === cursorLine : lineRange.containsLine(cursorLine);
            });
        });
    }

    get currentMergeRange(): MergeRange | undefined {
        return this.currentMergeRangeObservable.get();
    }

    protected createSelectionInBaseObservable(): Observable<Range[] | undefined> {
        return DerivedObservable.create(() => {
            const { currentPane } = this;
            return currentPane?.selection?.map(range => {
                if (currentPane === this.side1Pane) {
                    return this.model.translateSideRangeToBase(range, 1);
                }
                if (currentPane === this.side2Pane) {
                    return this.model.translateSideRangeToBase(range, 2);
                }
                if (currentPane === this.resultPane) {
                    return this.model.translateResultRangeToBase(range);
                }
                return range;
            });
        });
    }

    get selectionInBase(): Range[] | undefined {
        return this.selectionInBaseObservable.get();
    }

    get panes(): MergeEditorPane[] {
        return [this.basePane, this.side1Pane, this.side2Pane, this.resultPane];
    }

    get baseUri(): URI {
        return this.basePane.editor.uri;
    }

    get side1Uri(): URI {
        return this.side1Pane.editor.uri;
    }

    get side1Title(): string {
        return this.side1Pane.header.title.label;
    }

    get side2Uri(): URI {
        return this.side2Pane.editor.uri;
    }

    get side2Title(): string {
        return this.side2Pane.header.title.label;
    }

    get resultUri(): URI {
        return this.resultPane.editor.uri;
    }

    storeState(): MergeEditorWidgetState {
        const getSideState = ({ header }: MergeEditorSidePane): MergeEditorSideWidgetState => ({
            title: header.title.label,
            description: header.description,
            detail: header.detail
        });
        return {
            layoutMode: this.layoutMode,
            side1State: getSideState(this.side1Pane),
            side2State: getSideState(this.side2Pane)
        };
    }

    restoreState(state: MergeEditorWidgetState): void {
        const { layoutMode, side1State, side2State } = state;
        if (layoutMode) {
            this.layoutMode = layoutMode;
        }
        const restoreSideState = ({ header }: MergeEditorSidePane, { title, description, detail }: MergeEditorSideWidgetState) => {
            if (title) {
                header.title.label = title;
            }
            if (description) {
                header.description = description;
            }
            if (detail) {
                header.detail = detail;
            }
        };
        if (side1State) {
            restoreSideState(this.side1Pane, side1State);
        }
        if (side2State) {
            restoreSideState(this.side2Pane, side2State);
        }
    }

    get saveable(): Saveable {
        return this.resultPane.editor.document;
    }

    getResourceUri(): URI | undefined {
        return this.resultUri;
    }

    createMoveToUri(resourceUri: URI): URI | undefined {
        const { baseUri, side1Uri, side2Uri, resultUri } = this;
        return MergeEditorUri.encode({ baseUri, side1Uri, side2Uri, resultUri: resultUri.withPath(resourceUri.path) });
    }

    getTrackableWidgets(): Widget[] {
        return this.panes.map(pane => pane.editorWidget);
    }

    goToFirstMergeRange(predicate: (mergeRange: MergeRange) => boolean = () => true): void {
        const firstMergeRange = this.model.mergeRanges.find(mergeRange => predicate(mergeRange));
        if (firstMergeRange) {
            const pane = this.currentPane ?? this.resultPane;
            pane.goToMergeRange(firstMergeRange);
        }
    }

    goToNextMergeRange(predicate: (mergeRange: MergeRange) => boolean = () => true): void {
        const pane = this.currentPane ?? this.resultPane;
        const lineNumber = pane.cursorLine;
        const nextMergeRange =
            this.model.mergeRanges.find(mergeRange => predicate(mergeRange) && pane.getLineRangeForMergeRange(mergeRange).startLineNumber > lineNumber) ||
            this.model.mergeRanges.find(mergeRange => predicate(mergeRange));
        if (nextMergeRange) {
            pane.goToMergeRange(nextMergeRange);
        }
    }

    goToPreviousMergeRange(predicate: (mergeRange: MergeRange) => boolean = () => true): void {
        const pane = this.currentPane ?? this.resultPane;
        const lineNumber = pane.cursorLine;
        const previousMergeRange =
            ArrayUtils.findLast(this.model.mergeRanges, mergeRange => predicate(mergeRange) && pane.getLineRangeForMergeRange(mergeRange).endLineNumberExclusive <= lineNumber) ||
            ArrayUtils.findLast(this.model.mergeRanges, mergeRange => predicate(mergeRange));
        if (previousMergeRange) {
            pane.goToMergeRange(previousMergeRange);
        }
    }

    get layoutMode(): MergeEditorLayoutMode {
        return this.layoutModeObservable.get();
    }

    set layoutMode(value: MergeEditorLayoutMode) {
        this.layoutModeObservable.set(value);
    }

    get layoutKind(): MergeEditorLayoutKind {
        return this.layoutMode.kind;
    }

    set layoutKind(kind: MergeEditorLayoutKind) {
        this.layoutMode = {
            ...this.layoutMode,
            kind
        };
    }

    get isShowingBase(): boolean {
        return this.layoutMode.showBase;
    }

    get isShowingBaseAtTop(): boolean {
        const { layoutMode } = this;
        return layoutMode.showBase && layoutMode.showBaseAtTop;
    }

    toggleShowBase(): void {
        const { layoutMode } = this;
        this.layoutMode = {
            ...layoutMode,
            showBase: !layoutMode.showBase
        };
    }

    toggleShowBaseTop(): void {
        const { layoutMode } = this;
        const isToggled = layoutMode.showBase && layoutMode.showBaseAtTop;
        this.layoutMode = {
            ...layoutMode,
            showBaseAtTop: true,
            showBase: !isToggled,
        };
    }

    toggleShowBaseCenter(): void {
        const { layoutMode } = this;
        const isToggled = layoutMode.showBase && !layoutMode.showBaseAtTop;
        this.layoutMode = {
            ...layoutMode,
            showBaseAtTop: false,
            showBase: !isToggled,
        };
    }

    get shouldAlignResult(): boolean {
        return this.layoutKind === 'columns';
    }

    get shouldAlignBase(): boolean {
        const { layoutMode } = this;
        return layoutMode.kind === 'mixed' && layoutMode.showBase && !layoutMode.showBaseAtTop;
    }

    protected applyLayoutMode(layoutMode: MergeEditorLayoutMode): void {
        const oldVerticalSplitWidgets = [...this.verticalSplitPanel.widgets];
        if (!layoutMode.showBase) {
            // eslint-disable-next-line no-null/no-null
            this.basePane.parent = null;
        }
        this.horizontalSplitPanel.insertWidget(0, this.side1Pane);
        this.horizontalSplitPanel.insertWidget(2, this.side2Pane);
        let horizontalSplitRatio = [50, 50];
        let verticalSplitRatio: number[];
        if (layoutMode.kind === 'columns') {
            horizontalSplitRatio = [33, 34, 33];
            verticalSplitRatio = [100];
            this.horizontalSplitPanel.insertWidget(1, this.resultPane);
            if (layoutMode.showBase) {
                verticalSplitRatio = [30, 70];
                this.verticalSplitPanel.insertWidget(0, this.basePane);
            }
        } else {
            verticalSplitRatio = [45, 55];
            if (layoutMode.showBase) {
                if (layoutMode.showBaseAtTop) {
                    verticalSplitRatio = [30, 33, 37];
                    this.verticalSplitPanel.insertWidget(0, this.basePane);
                } else {
                    horizontalSplitRatio = [33, 34, 33];
                    this.horizontalSplitPanel.insertWidget(1, this.basePane);
                }
            }
            this.verticalSplitPanel.insertWidget(2, this.resultPane);
        }
        this.horizontalSplitPanel.setRelativeSizes(horizontalSplitRatio);
        // Keep the existing vertical split ratio if the layout mode change has not affected the vertical split layout.
        if (!ArrayUtils.equals(oldVerticalSplitWidgets, this.verticalSplitPanel.widgets)) {
            this.verticalSplitPanel.setRelativeSizes(verticalSplitRatio);
        }
    }

    protected createViewZones(): Disposable {
        const { baseViewZones, side1ViewZones, side2ViewZones, resultViewZones } = this.viewZoneComputer.computeViewZones(this);
        const toDispose = new DisposableCollection();
        const addViewZones = (pane: MergeEditorPane, viewZones: readonly MergeEditorViewZone[]) => {
            const editor = pane.editor.getControl();
            const viewZoneIds: string[] = [];
            toDispose.push(Disposable.create(() => {
                editor.changeViewZones(accessor => {
                    for (const viewZoneId of viewZoneIds) {
                        accessor.removeZone(viewZoneId);
                    }
                });
            }));
            editor.changeViewZones(accessor => {
                const ctx: MergeEditorViewZone.CreationContext = {
                    createViewZone: viewZone => viewZoneIds.push(accessor.addZone(viewZone)),
                    register: disposable => toDispose.push(disposable)
                };
                for (const viewZone of viewZones) {
                    viewZone.create(ctx);
                }
            });
        };
        addViewZones(this.basePane, baseViewZones);
        addViewZones(this.side1Pane, side1ViewZones);
        addViewZones(this.side2Pane, side2ViewZones);
        addViewZones(this.resultPane, resultViewZones);
        return toDispose;
    }

    protected override onBeforeHide(msg: Message): void {
        this.visibilityObservable.set(false);
    }

    protected override onAfterShow(msg: Message): void {
        this.visibilityObservable.set(true);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const { currentPane } = this;
        if (currentPane) {
            currentPane.activate();
        } else {
            this.resultPane.activate();
        }
    }
}

export interface MergeEditorOpenerOptions extends WidgetOpenerOptions {
    widgetState?: MergeEditorWidgetState;
}

@injectable()
export class MergeEditorOpenHandler extends NavigatableWidgetOpenHandler<MergeEditor> {

    static readonly ID = 'merge-editor-opener';

    readonly id = MergeEditorOpenHandler.ID;

    readonly label = nls.localizeByDefault('Merge Editor');

    override canHandle(uri: URI, options?: MergeEditorOpenerOptions): number {
        return MergeEditorUri.isMergeEditorUri(uri) ? 1000 : 0;
    }

    override open(uri: URI, options?: MergeEditorOpenerOptions): Promise<MergeEditor> {
        return super.open(uri, options);
    }

    protected override async getOrCreateWidget(uri: URI, options?: MergeEditorOpenerOptions): Promise<MergeEditor> {
        const widget = await super.getOrCreateWidget(uri, options);
        if (options?.widgetState) {
            widget.restoreState(options.widgetState);
        }
        return widget;
    }
}
