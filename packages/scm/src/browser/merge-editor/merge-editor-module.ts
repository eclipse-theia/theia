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

import '../../../src/browser/style/merge-editor.css';

import { Container, interfaces } from '@theia/core/shared/inversify';
import { CommandContribution, DisposableCollection, MenuContribution, URI } from '@theia/core';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { FrontendApplicationContribution, KeybindingContribution, NavigatableWidgetOptions, OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MergeEditorModel, MergeEditorModelProps } from './model/merge-editor-model';
import { MergeEditorBasePane, MergeEditorPaneHeader, MergeEditorResultPane, MergeEditorSide1Pane, MergeEditorSide2Pane } from './view/merge-editor-panes';
import { DiffSpacerService } from './view/diff-spacers';
import { MergeEditorViewZoneComputer } from './view/merge-editor-view-zones';
import { MergeEditor, MergeEditorOpenHandler, MergeEditorSettings, MergeEditorUri, MergeUris } from './merge-editor';
import { MergeEditorContribution } from './merge-editor-contribution';
import { MergeEditorDevContribution } from './merge-editor-dev-contribution';

export function bindMergeEditor(bind: interfaces.Bind): void {
    bind(MergeEditorSettings).toSelf().inSingletonScope();
    bind(DiffSpacerService).toSelf().inSingletonScope();
    bind(MergeEditorViewZoneComputer).toSelf().inSingletonScope();
    bind(MergeEditorFactory).toDynamicValue(ctx => new MergeEditorFactory(ctx.container)).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: MergeEditorOpenHandler.ID,
        createWidget: (options: NavigatableWidgetOptions) => ctx.container.get(MergeEditorFactory).createMergeEditor(MergeEditorUri.decode(new URI(options.uri)))
    })).inSingletonScope();

    bind(MergeEditorOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(MergeEditorOpenHandler);

    bind(MergeEditorContribution).toSelf().inSingletonScope();
    [FrontendApplicationContribution, CommandContribution, MenuContribution, TabBarToolbarContribution, KeybindingContribution, ColorContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(MergeEditorContribution)
    );
    bind(MergeEditorDevContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(MergeEditorDevContribution);
}

export class MergeEditorFactory {

    constructor(
        protected readonly container: interfaces.Container,
        protected readonly editorManager = container.get(EditorManager)
    ) { }

    async createMergeEditor({ baseUri, side1Uri, side2Uri, resultUri }: MergeUris): Promise<MergeEditor> {
        const toDisposeOnError = new DisposableCollection();
        const createEditorWidget = (uri: URI) => this.createEditorWidget(uri, toDisposeOnError);
        try {
            const [baseEditorWidget, side1EditorWidget, side2EditorWidget, resultEditorWidget] = await Promise.all(
                [createEditorWidget(baseUri), createEditorWidget(side1Uri), createEditorWidget(side2Uri), createEditorWidget(resultUri)]
            );
            const resultDocument = MonacoEditor.get(resultEditorWidget)!.document;
            const hasConflictMarkers = resultDocument.textEditorModel.getLinesContent().some(lineContent => lineContent.startsWith('<<<<<<<'));
            return this.createMergeEditorContainer({
                baseEditorWidget,
                side1EditorWidget,
                side2EditorWidget,
                resultEditorWidget,
                options: {
                    resetResult: hasConflictMarkers
                }
            }).get(MergeEditor);
        } catch (error) {
            toDisposeOnError.dispose();
            throw error;
        }
    }

    protected async createEditorWidget(uri: URI, disposables: DisposableCollection): Promise<EditorWidget> {
        const editorWidget = await this.editorManager.createByUri(uri);
        disposables.push(editorWidget);
        const editor = MonacoEditor.get(editorWidget);
        if (!editor) {
            throw new Error('The merge editor only supports Monaco editors as its parts');
        }
        editor.getControl().updateOptions({ folding: false, codeLens: false, minimap: { enabled: false } });
        editor.setShouldDisplayDirtyDiff(false);
        return editorWidget;
    }

    protected createMergeEditorContainer({
        baseEditorWidget,
        side1EditorWidget,
        side2EditorWidget,
        resultEditorWidget,
        options
    }: MergeEditorContainerProps): interfaces.Container {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = this.container;
        const [baseEditor, side1Editor, side2Editor, resultEditor] = [baseEditorWidget, side1EditorWidget, side2EditorWidget, resultEditorWidget].map(
            editorWidget => MonacoEditor.get(editorWidget)!
        );
        child.bind(MergeEditorModelProps).toConstantValue({ baseEditor, side1Editor, side2Editor, resultEditor, options });
        child.bind(MergeEditorModel).toSelf();
        child.bind(MergeEditorPaneHeader).toSelf().inTransientScope();
        child.bind(MergeEditorBasePane).toSelf();
        child.bind(MergeEditorSide1Pane).toSelf();
        child.bind(MergeEditorSide2Pane).toSelf();
        child.bind(MergeEditorResultPane).toSelf();
        child.bind(EditorWidget).toConstantValue(baseEditorWidget).whenInjectedInto(MergeEditorBasePane);
        child.bind(EditorWidget).toConstantValue(side1EditorWidget).whenInjectedInto(MergeEditorSide1Pane);
        child.bind(EditorWidget).toConstantValue(side2EditorWidget).whenInjectedInto(MergeEditorSide2Pane);
        child.bind(EditorWidget).toConstantValue(resultEditorWidget).whenInjectedInto(MergeEditorResultPane);
        child.bind(MergeEditor).toSelf();
        return child;
    }
}

export interface MergeEditorContainerProps {
    baseEditorWidget: EditorWidget;
    side1EditorWidget: EditorWidget;
    side2EditorWidget: EditorWidget;
    resultEditorWidget: EditorWidget;
    options?: {
        resetResult?: boolean;
    }
}
