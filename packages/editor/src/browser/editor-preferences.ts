/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { interfaces } from 'inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema,
    PreferenceChangeEvent,
    PreferenceScope
} from '@theia/core/lib/browser/preferences';
import { isOSX } from '@theia/core/lib/common/os';

export const editorPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'editor.tabSize': {
            'type': 'number',
            'minimum': 1,
            'default': 4,
            'description': 'Configure the tab size in the editor',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.fontSize': {
            'type': 'number',
            'default': (isOSX) ? 12 : 14,
            'description': 'Configure the editor font size',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.lineNumbers': {
            'enum': [
                'on',
                'off'
            ],
            'default': 'on',
            'description': 'Control the rendering of line numbers',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.renderWhitespace': {
            'enum': [
                'none',
                'boundary',
                'all'
            ],
            'default': 'none',
            'description': 'Control the rendering of whitespaces in the editor',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.autoSave': {
            'enum': [
                'on',
                'off'
            ],
            'default': 'on',
            'description': 'Configure whether the editor should be auto saved',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.autoSaveDelay': {
            'type': 'number',
            'default': 500,
            'description': 'Configure the auto save delay in milliseconds',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.rulers': {
            'type': 'array',
            'default': [],
            'description': 'Render vertical lines at the specified columns.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.wordSeparators': {
            'type': 'string',
            'default': "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/",
            'description': 'A string containing the word separators used when doing word navigation.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.glyphMargin': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable the rendering of the glyph margin.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.roundedSelection': {
            'type': 'boolean',
            'default': true,
            'description': 'Render the editor selection with rounded borders.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.minimap.enabled': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable or disable the minimap',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.minimap.showSlider': {
            'type': 'string',
            'default': 'mouseover',
            'description': "Controls whether the minimap slider is automatically hidden. Possible values are 'always' and 'mouseover'",
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.minimap.renderCharacters': {
            'type': 'boolean',
            'default': true,
            'description': 'Render the actual characters on a line (as opposed to color blocks)',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.minimap.maxColumn': {
            'type': 'number',
            'default': 120,
            'description': 'Limit the width of the minimap to render at most a certain number of columns',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.overviewRulerLanes': {
            'type': 'number',
            'default': 2,
            'description': 'The number of vertical lanes the overview ruler should render.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.overviewRulerBorder': {
            'type': 'boolean',
            'default': true,
            'description': 'Controls if a border should be drawn around the overview ruler.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.cursorBlinking': {
            'type': 'string',
            'default': 'blink',
            'description': "Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'.",
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.mouseWheelZoom': {
            'type': 'boolean',
            'default': false,
            'description': 'Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.cursorStyle': {
            'type': 'string',
            'default': 'line',
            'description': "Control the cursor style, either 'block' or 'line'.",
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.fontLigatures': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable font ligatures.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.hideCursorInOverviewRuler': {
            'type': 'boolean',
            'default': false,
            'description': 'Should the cursor be hidden in the overview ruler.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.scrollBeyondLastLine': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable that scrolling can go one screen size after the last line.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.wordWrap': {
            'enum': ['off', 'on', 'wordWrapColumn', 'bounded'],
            'default': 'off',
            'description': 'Control the wrapping of the editor.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.wordWrapColumn': {
            'type': 'number',
            'default': 80,
            'description': 'Control the wrapping of the editor.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.wrappingIndent': {
            'enum': ['none', 'same', 'indent'],
            'default': 'same',
            'description': "Control indentation of wrapped lines. Can be: 'none', 'same' or 'indent'.",
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.links': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable detecting links and making them clickable.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.mouseWheelScrollSensitivity': {
            'type': 'number',
            'default': 1,
            'description': 'A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.multiCursorModifier': {
            'enum': ['ctrlCmd', 'alt'],
            'default': 'alt',
            'description': 'The modifier to be used to add multiple cursors with the mouse.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.accessibilitySupport': {
            'enum': ['auto', 'off', 'on'],
            'default': 'auto',
            'description': "Configure the editor's accessibility support.",
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.quickSuggestions': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable quick suggestions (shadow suggestions)',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.quickSuggestionsDelay': {
            'type': 'number',
            'default': 500,
            'description': 'Quick suggestions show delay (in ms)',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.parameterHints': {
            'type': 'boolean',
            'default': true,
            'description': 'Enables parameter hints',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.autoClosingBrackets': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable auto closing brackets.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.autoIndent': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable auto indentation adjustment.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.formatOnType': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable format on type.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.formatOnPaste': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable format on paste.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.dragAndDrop': {
            'type': 'boolean',
            'default': false,
            'description': 'Controls if the editor should allow to move selections via drag and drop.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.suggestOnTriggerCharacters': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable the suggestion box to pop-up on trigger characters.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.acceptSuggestionOnEnter': {
            'enum': ['on', 'smart', 'off'],
            'default': 'on',
            'description': 'Accept suggestions on ENTER.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.acceptSuggestionOnCommitCharacter': {
            'type': 'boolean',
            'default': true,
            'description': 'Accept suggestions on provider defined characters.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.snippetSuggestions': {
            'enum': ['top', 'bottom', 'inline', 'none'],
            'default': 'inline',
            'description': 'Enable snippet suggestions.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.emptySelectionClipboard': {
            'type': 'boolean',
            'default': true,
            'description': 'Copying without a selection copies the current line.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.wordBasedSuggestions': {
            'type': 'boolean',
            'default': true,
            'description': "Enable word based suggestions. Defaults to 'true'",
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.selectionHighlight': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable selection highlight.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.occurrencesHighlight': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable semantic occurrences highlight.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.codeLens': {
            'type': 'boolean',
            'default': true,
            'description': 'Show code lens',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.folding': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable code folding',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.showFoldingControls': {
            'enum': ['always', 'mouseover'],
            'default': 'mouseover',
            'description': 'Controls whether the fold actions in the gutter stay always visible or hide unless the mouse is over the gutter.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.matchBrackets': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable highlighting of matching brackets.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.renderControlCharacters': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable rendering of control characters.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.renderIndentGuides': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable rendering of indent guides.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.renderLineHighlight': {
            'enum': ['none', 'gutter', 'line', 'all'],
            'default': 'all',
            'description': 'Enable rendering of current line highlight.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.useTabStops': {
            'type': 'boolean',
            'default': true,
            'description': 'Inserting and deleting whitespace follows tab stops.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'editor.insertSpaces': {
            'type': 'boolean',
            'default': true,
            'description': 'Using whitespaces to replace tabs when tabbing.',
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'diffEditor.renderSideBySide': {
            'type': 'boolean',
            'description': 'Render the differences in two side-by-side editors.',
            'default': true,
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'diffEditor.ignoreTrimWhitespace': {
            'type': 'boolean',
            'description': 'Compute the diff by ignoring leading/trailing whitespace.',
            'default': true,
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'diffEditor.renderIndicators': {
            'type': 'boolean',
            'description': 'Render +/- indicators for added/deleted changes.',
            'default': true,
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'diffEditor.followsCaret': {
            'type': 'boolean',
            'description': 'Resets the navigator state when the user selects something in the editor.',
            'default': true,
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'diffEditor.ignoreCharChanges': {
            'type': 'boolean',
            'description': 'Jump from line to line.',
            'default': true,
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        },
        'diffEditor.alwaysRevealFirst': {
            'type': 'boolean',
            'description': 'Reveal first change.',
            'default': true,
            'scopes': PreferenceScope.Default | PreferenceScope.User | PreferenceScope.Workspace | PreferenceScope.Folders
        }
    }
};

export interface EditorConfiguration {
    'editor.tabSize': number
    'editor.fontSize': number
    'editor.autoSave': 'on' | 'off'
    'editor.autoSaveDelay': number
    'editor.lineNumbers'?: 'on' | 'off'
    'editor.renderWhitespace'?: 'none' | 'boundary' | 'all'
    'editor.rulers'?: number[]
    'editor.wordSeparators'?: string
    'editor.glyphMargin'?: boolean
    'editor.roundedSelection'?: boolean
    'editor.minimap.enabled'?: boolean,
    'editor.minimap.showSlider'?: string,
    'editor.minimap.renderCharacters'?: boolean,
    'editor.minimap.maxColumn'?: number,
    'editor.overviewRulerLanes'?: number
    'editor.overviewRulerBorder'?: boolean
    'editor.cursorBlinking'?: string
    'editor.mouseWheelZoom'?: boolean
    'editor.cursorStyle'?: string
    'editor.fontLigatures'?: boolean
    'editor.hideCursorInOverviewRuler'?: boolean
    'editor.scrollBeyondLastLine'?: boolean
    'editor.wordWrap'?: 'off' | 'on' | 'wordWrapColumn' | 'bounded'
    'editor.wordWrapColumn'?: number
    'editor.wrappingIndent'?: string
    'editor.links'?: boolean
    'editor.mouseWheelScrollSensitivity'?: number
    'editor.multiCursorModifier'?: 'ctrlCmd' | 'alt'
    'editor.accessibilitySupport'?: 'auto' | 'off' | 'on'
    'editor.quickSuggestions'?: boolean
    'editor.quickSuggestionsDelay'?: number
    'editor.parameterHints'?: boolean
    'editor.autoClosingBrackets'?: boolean
    'editor.autoIndent'?: boolean
    'editor.formatOnType'?: boolean
    'editor.formatOnPaste'?: boolean
    'editor.dragAndDrop'?: boolean
    'editor.suggestOnTriggerCharacters'?: boolean
    'editor.acceptSuggestionOnEnter'?: 'on' | 'smart' | 'off'
    'editor.acceptSuggestionOnCommitCharacter'?: boolean
    'editor.snippetSuggestions'?: 'top' | 'bottom' | 'inline' | 'none'
    'editor.emptySelectionClipboard'?: boolean
    'editor.wordBasedSuggestions'?: boolean
    'editor.selectionHighlight'?: boolean
    'editor.occurrencesHighlight'?: boolean
    'editor.codeLens'?: boolean
    'editor.folding'?: boolean
    'editor.showFoldingControls'?: 'always' | 'mouseover'
    'editor.matchBrackets'?: boolean
    'editor.renderControlCharacters'?: boolean
    'editor.renderIndentGuides'?: boolean
    'editor.renderLineHighlight'?: 'none' | 'gutter' | 'line' | 'all'
    'editor.useTabStops'?: boolean,
    'editor.insertSpaces': boolean,
    'diffEditor.renderSideBySide'?: boolean
    'diffEditor.ignoreTrimWhitespace'?: boolean
    'diffEditor.renderIndicators'?: boolean
    'diffEditor.followsCaret'?: boolean
    'diffEditor.ignoreCharChanges'?: boolean
    'diffEditor.alwaysRevealFirst'?: boolean
}
export type EditorPreferenceChange = PreferenceChangeEvent<EditorConfiguration>;

export const EditorPreferences = Symbol('EditorPreferences');
export type EditorPreferences = PreferenceProxy<EditorConfiguration>;

export function createEditorPreferences(preferences: PreferenceService): EditorPreferences {
    return createPreferenceProxy(preferences, editorPreferenceSchema);
}

export function bindEditorPreferences(bind: interfaces.Bind): void {
    bind(EditorPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createEditorPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: editorPreferenceSchema });
}
