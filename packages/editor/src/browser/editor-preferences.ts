/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema,
    PreferenceChangeEvent
} from '@theia/preferences-api/lib/browser';

export const editorPreferenceSchema: PreferenceSchema = {
    "type": "object",
    "properties": {
        "editor.tabSize": {
            "type": "number",
            "minimum": 1,
            "description": "Configure the tab size in the editor"
        },
        "editor.lineNumbers": {
            "enum": [
                "on",
                "off"
            ],
            "description": "Control the rendering of line numbers"
        },
        "editor.renderWhitespace": {
            "enum": [
                "none",
                "boundary",
                "all"
            ],
            "description": "Control the rendering of whitespaces in the editor"
        },
        "editor.autoSave": {
            "enum": [
                "on",
                "off"
            ],
            "default": "on",
            "description": "Configure whether the editor should be auto saved"
        },
        "editor.autoSaveDelay": {
            "type": "number",
            "default": 500,
            "description": "Configure the auto save delay in milliseconds"
        },
        "editor.rulers": {
            "type": "array",
            "default": [],
            "description": "Render vertical lines at the specified columns."
        },
        "editor.wordSeparators": {
            "type": "string",
            "default": "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/",
            "description": "A string containing the word separators used when doing word navigation."
        },
        "editor.glyphMargin": {
            "type": "boolean",
            "default": true,
            "description": "Enable the rendering of the glyph margin."
        },
        "editor.roundedSelection": {
            "type": "boolean",
            "default": true,
            "description": "Render the editor selection with rounded borders."
        },
        "editor.minimap.enabled": {
            "type": "boolean",
            "default": false,
            "description": "Enable or disable the minimap"
        },
        "editor.minimap.showSlider": {
            "type": "string",
            "default": "mouseover",
            "description": "Controls whether the minimap slider is automatically hidden. Possible values are 'always' and 'mouseover'"
        },
        "editor.minimap.renderCharacters": {
            "type": "boolean",
            "default": true,
            "description": "Render the actual characters on a line (as opposed to color blocks)"
        },
        "editor.minimap.maxColumn": {
            "type": "number",
            "default": 120,
            "description": "Limit the width of the minimap to render at most a certain number of columns"
        },
        "editor.overviewRulerLanes": {
            "type": "number",
            "default": 2,
            "description": "The number of vertical lanes the overview ruler should render."
        },
        "editor.overviewRulerBorder": {
            "type": "boolean",
            "default": true,
            "description": "Controls if a border should be drawn around the overview ruler."
        },
        "editor.cursorBlinking": {
            "type": "string",
            "default": "blink",
            "description": "Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'."
        },
        "editor.mouseWheelZoom": {
            "type": "boolean",
            "default": false,
            "description": "Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl."
        },
        "editor.cursorStyle": {
            "type": "string",
            "default": "line",
            "description": "Control the cursor style, either 'block' or 'line'."
        },
        "editor.fontLigatures": {
            "type": "boolean",
            "default": false,
            "description": "Enable font ligatures."
        },
        "editor.hideCursorInOverviewRuler": {
            "type": "boolean",
            "default": false,
            "description": "Should the cursor be hidden in the overview ruler."
        },
        "editor.scrollBeyondLastLine": {
            "type": "boolean",
            "default": true,
            "description": "Enable that scrolling can go one screen size after the last line."
        },
        "editor.wordWrap": {
            "enum": ['off', 'on', 'wordWrapColumn', 'bounded'],
            "default": "off",
            "description": "Control the wrapping of the editor."
        },
        "editor.wordWrapColumn": {
            "type": "number",
            "default": 80,
            "description": "Control the wrapping of the editor."
        },
        "editor.wrappingIndent": {
            "enum": ['none', 'same', 'indent'],
            "default": "same",
            "description": "Control indentation of wrapped lines. Can be: 'none', 'same' or 'indent'."
        },
        "editor.links": {
            "type": "boolean",
            "default": true,
            "description": "Enable detecting links and making them clickable."
        },
        "editor.mouseWheelScrollSensitivity": {
            "type": "number",
            "default": 1,
            "description": "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events."
        },
        "editor.multiCursorModifier": {
            "enum": ['ctrlCmd', 'alt'],
            "default": "alt",
            "description": "The modifier to be used to add multiple cursors with the mouse."
        },
        "editor.accessibilitySupport": {
            "enum": ['auto', 'off', 'on'],
            "default": "auto",
            "description": "Configure the editor's accessibility support."
        },
        "editor.quickSuggestions": {
            "type": "boolean",
            "default": true,
            "description": "Enable quick suggestions (shadow suggestions)"
        },
        "editor.quickSuggestionsDelay": {
            "type": "number",
            "default": 500,
            "description": "Quick suggestions show delay (in ms)"
        },
        "editor.parameterHints": {
            "type": "boolean",
            "default": true,
            "description": "Enables parameter hints"
        },
        "editor.autoClosingBrackets": {
            "type": "boolean",
            "default": true,
            "description": "Enable auto closing brackets."
        },
        "editor.autoIndent": {
            "type": "boolean",
            "default": false,
            "description": "Enable auto indentation adjustment."
        },
        "editor.formatOnType": {
            "type": "boolean",
            "default": false,
            "description": "Enable format on type."
        },
        "editor.formatOnPaste": {
            "type": "boolean",
            "default": false,
            "description": "Enable format on paste."
        },
        "editor.dragAndDrop": {
            "type": "boolean",
            "default": false,
            "description": "Controls if the editor should allow to move selections via drag and drop."
        },
        "editor.suggestOnTriggerCharacters": {
            "type": "boolean",
            "default": true,
            "description": "Enable the suggestion box to pop-up on trigger characters."
        },
        "editor.acceptSuggestionOnEnter": {
            "enum": ['on', 'smart', 'off'],
            "default": "on",
            "description": "Accept suggestions on ENTER."
        },
        "editor.acceptSuggestionOnCommitCharacter": {
            "type": "boolean",
            "default": true,
            "description": "Accept suggestions on provider defined characters."
        },
        "editor.snippetSuggestions": {
            "enum": ['top', 'bottom', 'inline', 'none'],
            "default": "inline",
            "description": "Enable snippet suggestions."
        },
        "editor.emptySelectionClipboard": {
            "type": "boolean",
            "description": "Copying without a selection copies the current line."
        },
        "editor.wordBasedSuggestions": {
            "type": "boolean",
            "default": true,
            "description": "Enable word based suggestions. Defaults to 'true'"
        },
        "editor.selectionHighlight": {
            "type": "boolean",
            "default": true,
            "description": "Enable selection highlight."
        },
        "editor.occurrencesHighlight": {
            "type": "boolean",
            "default": true,
            "description": "Enable semantic occurrences highlight."
        },
        "editor.codeLens": {
            "type": "boolean",
            "default": true,
            "description": "Show code lens"
        },
        "editor.folding": {
            "type": "boolean",
            "default": true,
            "description": "Enable code folding"
        },
        "editor.showFoldingControls": {
            "enum": ['always', 'mouseover'],
            "default": "mouseover",
            "description": "Controls whether the fold actions in the gutter stay always visible or hide unless the mouse is over the gutter."
        },
        "editor.matchBrackets": {
            "type": "boolean",
            "default": true,
            "description": "Enable highlighting of matching brackets."
        },
        "editor.renderControlCharacters": {
            "type": "boolean",
            "default": false,
            "description": "Enable rendering of control characters."
        },
        "editor.renderIndentGuides": {
            "type": "boolean",
            "default": false,
            "description": "Enable rendering of indent guides."
        },
        "editor.renderLineHighlight": {
            "enum": ['none', 'gutter', 'line', 'all'],
            "default": "all",
            "description": "Enable rendering of current line highlight."
        },
        "editor.useTabStops": {
            "type": "boolean",
            "description": "Inserting and deleting whitespace follows tab stops."
        }
    }
};

export interface EditorConfiguration {
    'editor.tabSize': number
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
    'editor.useTabStops'?: boolean
}
export type EditorPreferenceChange = PreferenceChangeEvent<EditorConfiguration>;

export const defaultEditorConfiguration: EditorConfiguration = {
    'editor.autoSave': 'on',
    'editor.autoSaveDelay': 500,
    'editor.tabSize': 4,
    'editor.minimap.enabled': false,
    'editor.glyphMargin': true,
    'editor.wrappingIndent': 'same'
};

export const EditorPreferences = Symbol('EditorPreferences');
export type EditorPreferences = PreferenceProxy<EditorConfiguration>;

export function createEditorPreferences(preferences: PreferenceService): EditorPreferences {
    return createPreferenceProxy(preferences, defaultEditorConfiguration, editorPreferenceSchema);
}

export function bindEditorPreferences(bind: interfaces.Bind): void {
    bind(EditorPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createEditorPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: editorPreferenceSchema });
}
