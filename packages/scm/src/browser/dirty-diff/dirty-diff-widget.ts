// *****************************************************************************
// Copyright (C) 2023 1C-Soft LLC and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ActionMenuNode, Disposable, Event, MenuCommandExecutor, MenuModelRegistry, MenuPath, URI, nls } from '@theia/core';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { ChangeRangeMapping, LineRange, NormalizedEmptyLineRange } from './diff-computer';
import { ScmColors } from '../scm-colors';
import * as monaco from '@theia/monaco-editor-core';
import { PeekViewWidget, peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground }
    from '@theia/monaco-editor-core/esm/vs/editor/contrib/peekView/browser/peekView';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { ICodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { IPosition, Position } from '@theia/monaco-editor-core/esm/vs/editor/common/core/position';
import { IRange } from '@theia/monaco-editor-core/esm/vs/editor/common/core/range';
import { IDiffEditorOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/config/editorOptions';
import { EmbeddedDiffEditorWidget } from '@theia/monaco-editor-core/esm/vs/editor/browser/widget/embeddedCodeEditorWidget';
import { ITextModelService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import { Action, IAction } from '@theia/monaco-editor-core/esm/vs/base/common/actions';
import { Codicon } from '@theia/monaco-editor-core/esm/vs/base/common/codicons';
import { ScrollType } from '@theia/monaco-editor-core/esm/vs/editor/common/editorCommon';
import { Color } from '@theia/monaco-editor-core/esm/vs/base/common/color';
import { IColorTheme, IThemeService } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';

export const SCM_CHANGE_TITLE_MENU: MenuPath = ['scm-change-title-menu'];
/** Reserved for plugin contributions, corresponds to contribution point 'scm/change/title'. */
export const PLUGIN_SCM_CHANGE_TITLE_MENU: MenuPath = ['plugin-scm-change-title-menu'];

export const DirtyDiffWidgetProps = Symbol('DirtyDiffWidgetProps');
export interface DirtyDiffWidgetProps {
    readonly editor: MonacoEditor;
    readonly previousRevisionUri: URI;
    readonly changes: readonly ChangeRangeMapping[];
}

export const DirtyDiffWidgetFactory = Symbol('DirtyDiffWidgetFactory');
export type DirtyDiffWidgetFactory = (props: DirtyDiffWidgetProps) => DirtyDiffWidget;

@injectable()
export class DirtyDiffWidget implements Disposable {

    readonly onDidClose: Event<unknown>;
    protected index: number = -1;
    private readonly peekView: DirtyDiffPeekView;
    private readonly diffEditorPromise: Promise<monaco.editor.IDiffEditor>;

    constructor(
        @inject(DirtyDiffWidgetProps) protected readonly props: DirtyDiffWidgetProps,
        @inject(ContextKeyService) readonly contextKeyService: ContextKeyService,
        @inject(MenuModelRegistry) readonly menuModelRegistry: MenuModelRegistry,
        @inject(MenuCommandExecutor) readonly menuCommandExecutor: MenuCommandExecutor
    ) {
        this.peekView = new DirtyDiffPeekView(this);
        this.onDidClose = this.peekView.onDidClose;
        this.diffEditorPromise = this.peekView.create();
    }

    get editor(): MonacoEditor {
        return this.props.editor;
    }

    get uri(): URI {
        return this.editor.uri;
    }

    get previousRevisionUri(): URI {
        return this.props.previousRevisionUri;
    }

    get changes(): readonly ChangeRangeMapping[] {
        return this.props.changes;
    }

    get currentChange(): ChangeRangeMapping | undefined {
        return this.changes[this.index];
    }

    get currentChangeIndex(): number {
        return this.index;
    }

    showChange(index: number): void {
        if (index >= 0 && index < this.changes.length) {
            this.index = index;
            this.showCurrentChange();
        }
    }

    showNextChange(): void {
        const index = this.index;
        const length = this.changes.length;
        if (length > 0 && (index < 0 || length > 1)) {
            this.index = index < 0 ? 0 : cycle(index, 1, length);
            this.showCurrentChange();
        }
    }

    showPreviousChange(): void {
        const index = this.index;
        const length = this.changes.length;
        if (length > 0 && (index < 0 || length > 1)) {
            this.index = index < 0 ? length - 1 : cycle(index, -1, length);
            this.showCurrentChange();
        }
    }

    async getContentWithSelectedChanges(predicate: (change: ChangeRangeMapping, index: number, changes: readonly ChangeRangeMapping[]) => boolean): Promise<string> {
        const changes = this.changes.filter(predicate);
        const diffEditor = await this.diffEditorPromise;
        const diffEditorModel = diffEditor.getModel()!;
        return applyChanges(changes, diffEditorModel.original, diffEditorModel.modified);
    }

    dispose(): void {
        this.peekView.dispose();
    }

    protected showCurrentChange(): void {
        this.peekView.setTitle(this.computePrimaryHeading(), this.computeSecondaryHeading());
        const { previousRange, currentRange } = this.changes[this.index];
        this.peekView.show(new Position(LineRange.getEndPosition(currentRange).line + 1, 1), // monaco position is 1-based
            this.computeHeightInLines());
        this.diffEditorPromise.then(diffEditor => {
            let startLine = LineRange.getStartPosition(currentRange).line;
            let endLine = LineRange.getEndPosition(currentRange).line;
            if (LineRange.isEmpty(currentRange)) { // the change is a removal
                ++endLine;
            } else if (!LineRange.isEmpty(previousRange)) { // the change is a modification
                --startLine;
                ++endLine;
            }
            diffEditor.revealLinesInCenter(startLine + 1, endLine + 1, // monaco line numbers are 1-based
                monaco.editor.ScrollType.Immediate);
        });
        this.editor.focus();
    }

    protected computePrimaryHeading(): string {
        return this.uri.path.base;
    }

    protected computeSecondaryHeading(): string {
        const index = this.index + 1;
        const length = this.changes.length;
        return length > 1 ? nls.localizeByDefault('{0} of {1} changes', index, length) :
            nls.localizeByDefault('{0} of {1} change', index, length);
    }

    protected computeHeightInLines(): number {
        const editor = this.editor.getControl();
        const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
        const editorHeight = editor.getLayoutInfo().height;
        const editorHeightInLines = Math.floor(editorHeight / lineHeight);

        const { previousRange, currentRange } = this.changes[this.index];
        const changeHeightInLines = LineRange.getLineCount(currentRange) + LineRange.getLineCount(previousRange);

        return Math.min(changeHeightInLines + /* padding */ 8, Math.floor(editorHeightInLines / 3));
    }
}

function cycle(index: number, offset: -1 | 1, length: number): number {
    return (index + offset + length) % length;
}

// adapted from https://github.com/microsoft/vscode/blob/823d54f86ee13eb357bc6e8e562e89d793f3c43b/extensions/git/src/staging.ts
function applyChanges(changes: readonly ChangeRangeMapping[], original: monaco.editor.ITextModel, modified: monaco.editor.ITextModel): string {
    const result: string[] = [];
    let currentLine = 1;

    for (const change of changes) {
        const { previousRange, currentRange } = change;

        const isInsertion = LineRange.isEmpty(previousRange);
        const isDeletion = LineRange.isEmpty(currentRange);

        const convert = (range: LineRange | NormalizedEmptyLineRange): [number, number] => {
            let startLineNumber;
            let endLineNumber;
            if (!LineRange.isEmpty(range)) {
                startLineNumber = range.start + 1;
                endLineNumber = range.end + 1;
            } else {
                startLineNumber = range.start === 0 ? 0 : range.end + 1;
                endLineNumber = 0;
            }
            return [startLineNumber, endLineNumber];
        };

        const [originalStartLineNumber, originalEndLineNumber] = convert(previousRange);
        const [modifiedStartLineNumber, modifiedEndLineNumber] = convert(currentRange);

        let toLine = isInsertion ? originalStartLineNumber + 1 : originalStartLineNumber;
        let toCharacter = 1;

        // if this is a deletion at the very end of the document,
        // we need to account for a newline at the end of the last line,
        // which may have been deleted
        if (isDeletion && originalEndLineNumber === original.getLineCount()) {
            toLine--;
            toCharacter = original.getLineMaxColumn(toLine);
        }

        result.push(original.getValueInRange(new monaco.Range(currentLine, 1, toLine, toCharacter)));

        if (!isDeletion) {
            let fromLine = modifiedStartLineNumber;
            let fromCharacter = 1;

            // if this is an insertion at the very end of the document,
            // we must start the next range after the last character of the previous line,
            // in order to take the correct eol
            if (isInsertion && originalStartLineNumber === original.getLineCount()) {
                fromLine--;
                fromCharacter = modified.getLineMaxColumn(fromLine);
            }

            result.push(modified.getValueInRange(new monaco.Range(fromLine, fromCharacter, modifiedEndLineNumber + 1, 1)));
        }

        currentLine = isInsertion ? originalStartLineNumber + 1 : originalEndLineNumber + 1;
    }

    result.push(original.getValueInRange(new monaco.Range(currentLine, 1, original.getLineCount() + 1, 1)));

    return result.join('');
}

class DirtyDiffPeekView extends PeekViewWidget {

    private diffEditor?: EmbeddedDiffEditorWidget;
    private height?: number;

    constructor(readonly widget: DirtyDiffWidget) {
        super(
            widget.editor.getControl() as unknown as ICodeEditor,
            { isResizeable: true, showArrow: true, frameWidth: 1, keepEditorSelection: true, className: 'dirty-diff' },
            StandaloneServices.get(IInstantiationService)
        );
        StandaloneServices.get(IThemeService).onDidColorThemeChange(this.applyTheme, this, this._disposables);
    }

    override create(): Promise<monaco.editor.IDiffEditor> {
        super.create();
        const { diffEditor } = this;
        return new Promise(resolve => {
            // setTimeout is needed here because the non-side-by-side diff editor might still not have created the view zones;
            // otherwise, the first change shown might not be properly revealed in the diff editor.
            // see also https://github.com/microsoft/vscode/blob/b30900b56c4b3ca6c65d7ab92032651f4cb23f15/src/vs/workbench/contrib/scm/browser/dirtydiffDecorator.ts#L248
            const disposable = diffEditor!.onDidUpdateDiff(() => setTimeout(() => {
                resolve(diffEditor! as unknown as monaco.editor.IDiffEditor);
                disposable.dispose();
            }));
        });
    }

    override show(rangeOrPos: IRange | IPosition, heightInLines: number): void {
        this.applyTheme(StandaloneServices.get(IThemeService).getColorTheme());
        this.updateActions();
        super.show(rangeOrPos, heightInLines);
    }

    private updateActions(): void {
        const actionBar = this._actionbarWidget;
        if (!actionBar) {
            return;
        }
        const actions: IAction[] = [];
        const { contextKeyService, menuModelRegistry, menuCommandExecutor } = this.widget;
        contextKeyService.with({ originalResourceScheme: this.widget.previousRevisionUri.scheme }, () => {
            for (const menuPath of [SCM_CHANGE_TITLE_MENU, PLUGIN_SCM_CHANGE_TITLE_MENU]) {
                const menu = menuModelRegistry.getMenu(menuPath);
                for (const item of menu.children) {
                    if (item instanceof ActionMenuNode) {
                        const { command, id, label, icon, when } = item;
                        if (icon && menuCommandExecutor.isVisible(menuPath, command, this.widget) && (!when || contextKeyService.match(when))) {
                            actions.push(new Action(id, label, icon, menuCommandExecutor.isEnabled(menuPath, command, this.widget), () => {
                                menuCommandExecutor.executeCommand(menuPath, command, this.widget);
                            }));
                        }
                    }
                }
            }
        });
        actions.push(new Action('dirtydiff.next', nls.localizeByDefault('Show Next Change'), Codicon.arrowDown.classNames, true,
            () => this.widget.showNextChange()));
        actions.push(new Action('dirtydiff.previous', nls.localizeByDefault('Show Previous Change'), Codicon.arrowUp.classNames, true,
            () => this.widget.showPreviousChange()));
        actions.push(new Action('peekview.close', nls.localizeByDefault('Close'), Codicon.close.classNames, true,
            () => this.dispose()));
        actionBar.clear();
        actionBar.push(actions, { label: false, icon: true });
    }

    protected override _fillHead(container: HTMLElement): void {
        super._fillHead(container, true);
    }

    protected override _fillBody(container: HTMLElement): void {
        const options: IDiffEditorOptions = {
            scrollBeyondLastLine: true,
            scrollbar: {
                verticalScrollbarSize: 14,
                horizontal: 'auto',
                useShadows: true,
                verticalHasArrows: false,
                horizontalHasArrows: false
            },
            overviewRulerLanes: 2,
            fixedOverflowWidgets: true,
            minimap: { enabled: false },
            renderSideBySide: false,
            readOnly: true,
            renderIndicators: false,
            diffAlgorithm: 'experimental',
            stickyScroll: { enabled: false }
        };
        this.diffEditor = this._disposables.add(this.instantiationService.createInstance(
            EmbeddedDiffEditorWidget, container, options, this.editor));
        StandaloneServices.get(ITextModelService).createModelReference(this.widget.previousRevisionUri['codeUri']).then(modelRef => {
            this._disposables.add(modelRef);
            this.diffEditor!.setModel({ original: modelRef.object.textEditorModel, modified: this.editor.getModel()! });
        }, error => {
            console.error(error);
            this.dispose();
        });
    }

    protected override _doLayoutBody(height: number, width: number): void {
        super._doLayoutBody(height, width);
        this.diffEditor?.layout({ height, width });
        this.height = height;
    }

    protected override _onWidth(width: number): void {
        const { diffEditor, height } = this;
        if (diffEditor && height !== undefined) {
            diffEditor.layout({ height, width });
        }
    }

    protected override revealLine(lineNumber: number): void {
        this.editor.revealLineInCenterIfOutsideViewport(lineNumber, ScrollType.Smooth);
    }

    private applyTheme(theme: IColorTheme): void {
        const borderColor = this.getBorderColor(theme) || Color.transparent;
        this.style({
            arrowColor: borderColor,
            frameColor: borderColor,
            headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
            primaryHeadingColor: theme.getColor(peekViewTitleForeground),
            secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
        });
    }

    private getBorderColor(theme: IColorTheme): Color | undefined {
        const { currentChange } = this.widget;
        if (!currentChange) {
            return theme.getColor(peekViewBorder);
        }
        const { previousRange, currentRange } = currentChange;
        if (LineRange.isEmpty(previousRange)) {
            return theme.getColor(ScmColors.editorGutterAddedBackground);
        } else if (LineRange.isEmpty(currentRange)) {
            return theme.getColor(ScmColors.editorGutterDeletedBackground);
        } else {
            return theme.getColor(ScmColors.editorGutterModifiedBackground);
        }
    }
}
