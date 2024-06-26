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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, decorate } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { OpenerService, open, WidgetOpenMode, ApplicationShell, PreferenceService } from '@theia/core/lib/browser';
import { EditorWidget, EditorOpenerOptions, EditorManager, CustomEditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';
import { MonacoToProtocolConverter } from './monaco-to-protocol-converter';
import { MonacoEditorModel } from './monaco-editor-model';
import { IResourceEditorInput, ITextResourceEditorInput } from '@theia/monaco-editor-core/esm/vs/platform/editor/common/editor';
import { StandaloneCodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneCodeEditorService';
import { StandaloneCodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneCodeEditor';
import { ICodeEditor } from '@theia/monaco-editor-core/esm/vs/editor/browser/editorBrowser';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { IThemeService } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';

decorate(injectable(), StandaloneCodeEditorService);

export const VSCodeContextKeyService = Symbol('VSCodeContextKeyService');
export const VSCodeThemeService = Symbol('VSCodeThemeService');

export const MonacoEditorServiceFactory = Symbol('MonacoEditorServiceFactory');
export type MonacoEditorServiceFactoryType = (contextKeyService: IContextKeyService, themeService: IThemeService) => MonacoEditorService;

@injectable()
export class MonacoEditorService extends StandaloneCodeEditorService {

    public static readonly ENABLE_PREVIEW_PREFERENCE: string = 'editor.enablePreview';

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(MonacoToProtocolConverter)
    protected readonly m2p: MonacoToProtocolConverter;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(EditorManager)
    protected readonly editors: EditorManager;

    @inject(PreferenceService)
    protected readonly preferencesService: PreferenceService;

    constructor(@inject(VSCodeContextKeyService) contextKeyService: IContextKeyService, @inject(VSCodeThemeService) themeService: IThemeService) {
        super(contextKeyService, themeService);
    }

    /**
     * Monaco active editor is either focused or last focused editor.
     */
    override getActiveCodeEditor(): StandaloneCodeEditor | null {
        let editor = MonacoEditor.getCurrent(this.editors);
        if (!editor && CustomEditorWidget.is(this.shell.activeWidget)) {
            const model = this.shell.activeWidget.modelRef.object;
            if (model?.editorTextModel instanceof MonacoEditorModel) {
                editor = MonacoEditor.findByDocument(this.editors, model.editorTextModel)[0];
            }
        }
        const candidate = editor?.getControl();
        // Since we extend a private super class, we have to check that the thing that matches the public interface also matches the private expectations the superclass.
        /* eslint-disable-next-line no-null/no-null */
        return candidate instanceof StandaloneCodeEditor ? candidate : null;
    }

    override async openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null> {
        const uri = new URI(input.resource.toString());
        const openerOptions = this.createEditorOpenerOptions(input, source, sideBySide);
        const widget = await open(this.openerService, uri, openerOptions);
        const editorWidget = await this.findEditorWidgetByUri(widget, uri.toString());
        if (editorWidget && editorWidget.editor instanceof MonacoEditor) {
            const candidate = editorWidget.editor.getControl();
            // Since we extend a private super class, we have to check that the thing that matches the public interface also matches the private expectations the superclass.
            // eslint-disable-next-line no-null/no-null
            return candidate instanceof StandaloneCodeEditor ? candidate : null;
        }
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    protected async findEditorWidgetByUri(widget: object | undefined, uriAsString: string): Promise<EditorWidget | undefined> {
        if (widget instanceof EditorWidget) {
            if (widget.editor.uri.toString() === uriAsString) {
                return widget;
            }
            return undefined;
        }
        if (ApplicationShell.TrackableWidgetProvider.is(widget)) {
            for (const childWidget of widget.getTrackableWidgets()) {
                const editorWidget = await this.findEditorWidgetByUri(childWidget, uriAsString);
                if (editorWidget) {
                    return editorWidget;
                }
            }
        }
        return undefined;
    }

    protected createEditorOpenerOptions(input: IResourceEditorInput | ITextResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): EditorOpenerOptions {
        const mode = this.getEditorOpenMode(input);
        const widgetOptions = this.getWidgetOptions(source, sideBySide);
        const selection = this.getSelection(input);
        const preview = !!this.preferencesService.get<boolean>(MonacoEditorService.ENABLE_PREVIEW_PREFERENCE, false);
        return { mode, widgetOptions, preview, selection };
    }

    protected getSelection(input: IResourceEditorInput | ITextResourceEditorInput): EditorOpenerOptions['selection'] {
        if ('options' in input && input.options && 'selection' in input.options) {
            return this.m2p.asRange(input.options.selection);
        }
    }

    protected getEditorOpenMode(input: IResourceEditorInput): WidgetOpenMode {
        const options = {
            preserveFocus: false,
            revealIfVisible: true,
            ...input.options
        };
        if (options.preserveFocus) {
            return 'reveal';
        }
        return options.revealIfVisible ? 'activate' : 'open';
    }

    protected getWidgetOptions(source: ICodeEditor | null, sideBySide?: boolean): ApplicationShell.WidgetOptions | undefined {
        const ref = MonacoEditor.getWidgetFor(this.editors, source);
        if (!ref) {
            return undefined;
        }
        const area = (ref && this.shell.getAreaFor(ref)) || 'main';
        const mode = ref && sideBySide ? 'split-right' : undefined;
        if (area === 'secondaryWindow') {
            return { area: 'main', mode };
        }
        return { area, mode, ref };
    }

}
