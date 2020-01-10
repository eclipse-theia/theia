/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
    PreferenceSchemaProperties
} from '@theia/core/lib/browser/preferences';
import { isWindows, isOSX, OS } from '@theia/core/lib/common/os';
import { SUPPORTED_ENCODINGS } from './supported-encodings';

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'monospace\', monospace, \'Droid Sans Fallback\'';

const platform = {
    isMacintosh: isOSX,
    isLinux: OS.type() === OS.Type.Linux
};

// should be in sync with https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/common/config/editorOptions.ts#L2585
export const EDITOR_FONT_DEFAULTS = {
    fontFamily: (
        isOSX ? DEFAULT_MAC_FONT_FAMILY : (isWindows ? DEFAULT_WINDOWS_FONT_FAMILY : DEFAULT_LINUX_FONT_FAMILY)
    ),
    fontWeight: 'normal',
    fontSize: (
        isOSX ? 12 : 14
    ),
    lineHeight: 0,
    letterSpacing: 0,
};

// should be in sync with https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/common/config/editorOptions.ts#L2600
export const EDITOR_MODEL_DEFAULTS = {
    tabSize: 4,
    indentSize: 4,
    insertSpaces: true,
    detectIndentation: true,
    trimAutoWhitespace: true,
    largeFileOptimizations: true
};

/* eslint-disable no-null/no-null */
// should be in sync with https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/common/config/editorOptions.ts#L2612
// 1. Copy
// 2. Inline values
export const EDITOR_DEFAULTS = {
    inDiffEditor: false,
    wordSeparators: '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?',
    lineNumbersMinChars: 5,
    lineDecorationsWidth: 10,
    readOnly: false,
    mouseStyle: 'text',
    disableLayerHinting: false,
    automaticLayout: false,
    wordWrap: 'off',
    wordWrapColumn: 80,
    wordWrapMinified: true,
    wrappingIndent: 1,
    wordWrapBreakBeforeCharacters: '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋',
    wordWrapBreakAfterCharacters: ' \t})]?|/&,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣',
    wordWrapBreakObtrusiveCharacters: '.',
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoSurround: 'languageDefined',
    autoIndent: true,
    dragAndDrop: true,
    emptySelectionClipboard: true,
    copyWithSyntaxHighlighting: true,
    useTabStops: true,
    multiCursorModifier: 'altKey',
    multiCursorMergeOverlapping: true,
    accessibilitySupport: 'auto',
    showUnused: true,

    viewInfo: {
        extraEditorClassName: '',
        disableMonospaceOptimizations: false,
        rulers: [],
        ariaLabel: 'Editor content',
        renderLineNumbers: 1,
        renderCustomLineNumbers: null,
        cursorSurroundingLines: 0,
        renderFinalNewline: true,
        selectOnLineNumbers: true,
        glyphMargin: true,
        revealHorizontalRightPadding: 30,
        roundedSelection: true,
        overviewRulerLanes: 2,
        overviewRulerBorder: true,
        cursorBlinking: 1,
        mouseWheelZoom: false,
        cursorSmoothCaretAnimation: false,
        cursorStyle: 1,
        cursorWidth: 0,
        hideCursorInOverviewRuler: false,
        scrollBeyondLastLine: true,
        scrollBeyondLastColumn: 5,
        smoothScrolling: false,
        stopRenderingLineAfter: 10000,
        renderWhitespace: 'none',
        renderControlCharacters: false,
        fontLigatures: false,
        renderIndentGuides: true,
        highlightActiveIndentGuide: true,
        renderLineHighlight: 'line',
        scrollbar: {
            vertical: 1,
            horizontal: 1,
            arrowSize: 11,
            useShadows: true,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            horizontalScrollbarSize: 10,
            horizontalSliderSize: 10,
            verticalScrollbarSize: 14,
            verticalSliderSize: 14,
            handleMouseWheel: true,
            mouseWheelScrollSensitivity: 1,
            fastScrollSensitivity: 5,
        },
        minimap: {
            enabled: true,
            side: 'right',
            showSlider: 'mouseover',
            renderCharacters: true,
            maxColumn: 120
        },
        fixedOverflowWidgets: false,
    },

    contribInfo: {
        selectionClipboard: true,
        hover: {
            enabled: true,
            delay: 300,
            sticky: true
        },
        links: true,
        contextmenu: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        quickSuggestionsDelay: 10,
        parameterHints: {
            enabled: true,
            cycle: false
        },
        formatOnType: false,
        formatOnPaste: false,
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        acceptSuggestionOnCommitCharacter: true,
        wordBasedSuggestions: true,
        suggestSelection: 'recentlyUsed',
        suggestFontSize: 0,
        suggestLineHeight: 0,
        tabCompletion: 'off',
        suggest: {
            filterGraceful: true,
            snippets: 'inline',
            snippetsPreventQuickSuggestions: true,
            localityBonus: false,
            shareSuggestSelections: false,
            showIcons: true,
            maxVisibleSuggestions: 12,
            filteredTypes: Object.create(null)
        },
        gotoLocation: {
            multiple: 'peek'
        },
        selectionHighlight: true,
        occurrencesHighlight: true,
        codeLens: true,
        folding: true,
        foldingStrategy: 'auto',
        showFoldingControls: 'mouseover',
        matchBrackets: true,
        find: {
            seedSearchStringFromSelection: true,
            autoFindInSelection: false,
            globalFindClipboard: false,
            addExtraSpaceOnTop: true
        },
        colorDecorators: true,
        lightbulbEnabled: true,
        codeActionsOnSave: {},
        codeActionsOnSaveTimeout: 750
    },
};
/* eslint-enable no-null/no-null */

/* eslint-disable max-len */
// should be in sync with https://github.com/TypeFox/vscode/blob/70b8db24a37fafc77247de7f7cb5bb0195120ed0/src/vs/editor/common/config/commonEditorConfig.ts#L232
// 1. Copy
// 2. Find -> Use Regular Expressions -> nls\.localize\(.*, "(.*)"\) -> "$1"
// 3. Find -> Use Regular Expressions -> nls\.localize\(.*, '(.*)'\) -> '$1'
// 4. Apply `quotemark` quick fixes
// 5. Fix the rest manually
const codeEditorPreferenceProperties = {
    'editor.fontFamily': {
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontFamily,
        'description': 'Controls the font family.'
    },
    'editor.fontWeight': {
        'type': 'string',
        'enum': ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
        'default': EDITOR_FONT_DEFAULTS.fontWeight,
        'description': 'Controls the font weight.'
    },
    'editor.fontSize': {
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.fontSize,
        'description': 'Controls the font size in pixels.'
    },
    'editor.lineHeight': {
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.lineHeight,
        'description': 'Controls the line height. Use 0 to compute the line height from the font size.'
    },
    'editor.letterSpacing': {
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.letterSpacing,
        'description': 'Controls the letter spacing in pixels.'
    },
    'editor.lineNumbers': {
        'type': 'string',
        'enum': ['off', 'on', 'relative', 'interval'],
        'enumDescriptions': [
            'Line numbers are not rendered.',
            'Line numbers are rendered as absolute number.',
            'Line numbers are rendered as distance in lines to cursor position.',
            'Line numbers are rendered every 10 lines.'
        ],
        'default': 'on',
        'description': 'Controls the display of line numbers.'
    },
    'editor.cursorSurroundingLines': {
        'type': 'number',
        'default': EDITOR_DEFAULTS.viewInfo.cursorSurroundingLines,
        'description': "Controls the minimal number of visible leading and trailing lines surrounding the cursor. Known as 'scrollOff' or `scrollOffset` in some other editors."
    },
    'editor.renderFinalNewline': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.renderFinalNewline,
        'description': 'Render last line number when the file ends with a newline.'
    },
    'editor.rulers': {
        'type': 'array',
        'items': {
            'type': 'number'
        },
        'default': EDITOR_DEFAULTS.viewInfo.rulers,
        'description': 'Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty.'
    },
    'editor.wordSeparators': {
        'type': 'string',
        'default': EDITOR_DEFAULTS.wordSeparators,
        'description': 'Characters that will be used as word separators when doing word related navigations or operations.'
    },
    'editor.tabSize': {
        'type': 'number',
        'default': EDITOR_MODEL_DEFAULTS.tabSize,
        'minimum': 1,
        'markdownDescription': 'The number of spaces a tab is equal to. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.'
    },
    'editor.insertSpaces': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.insertSpaces,
        'markdownDescription': 'Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.'
    },
    'editor.detectIndentation': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.detectIndentation,
        'markdownDescription': 'Controls whether `#editor.tabSize#` and `#editor.insertSpaces#` will be automatically detected when a file is opened based on the file contents.'
    },
    'editor.roundedSelection': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.roundedSelection,
        'description': 'Controls whether selections should have rounded corners.'
    },
    'editor.scrollBeyondLastLine': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.scrollBeyondLastLine,
        'description': 'Controls whether the editor will scroll beyond the last line.'
    },
    'editor.scrollBeyondLastColumn': {
        'type': 'number',
        'default': EDITOR_DEFAULTS.viewInfo.scrollBeyondLastColumn,
        'description': 'Controls the number of extra characters beyond which the editor will scroll horizontally.'
    },
    'editor.smoothScrolling': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.smoothScrolling,
        'description': 'Controls whether the editor will scroll using an animation.'
    },
    'editor.minimap.enabled': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.minimap.enabled,
        'description': 'Controls whether the minimap is shown.'
    },
    'editor.minimap.side': {
        'type': 'string',
        'enum': ['left', 'right'],
        'default': EDITOR_DEFAULTS.viewInfo.minimap.side,
        'description': 'Controls the side where to render the minimap.'
    },
    'editor.minimap.showSlider': {
        'type': 'string',
        'enum': ['always', 'mouseover'],
        'default': EDITOR_DEFAULTS.viewInfo.minimap.showSlider,
        'description': 'Controls whether the minimap slider is automatically hidden.'
    },
    'editor.minimap.renderCharacters': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.minimap.renderCharacters,
        'description': 'Render the actual characters on a line as opposed to color blocks.'
    },
    'editor.minimap.maxColumn': {
        'type': 'number',
        'default': EDITOR_DEFAULTS.viewInfo.minimap.maxColumn,
        'description': 'Limit the width of the minimap to render at most a certain number of columns.'
    },
    'editor.hover.enabled': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.hover.enabled,
        'description': 'Controls whether the hover is shown.'
    },
    'editor.hover.delay': {
        'type': 'number',
        'default': EDITOR_DEFAULTS.contribInfo.hover.delay,
        'description': 'Controls the delay in milliseconds after which the hover is shown.'
    },
    'editor.hover.sticky': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.hover.sticky,
        'description': 'Controls whether the hover should remain visible when mouse is moved over it.'
    },
    'editor.find.seedSearchStringFromSelection': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.find.seedSearchStringFromSelection,
        'description': 'Controls whether the search string in the Find Widget is seeded from the editor selection.'
    },
    'editor.find.autoFindInSelection': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.find.autoFindInSelection,
        'description': 'Controls whether the find operation is carried out on selected text or the entire file in the editor.'
    },
    'editor.find.globalFindClipboard': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.find.globalFindClipboard,
        'description': 'Controls whether the Find Widget should read or modify the shared find clipboard on macOS.',
        'included': platform.isMacintosh
    },
    'editor.find.addExtraSpaceOnTop': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.'
    },
    'editor.wordWrap': {
        'type': 'string',
        'enum': ['off', 'on', 'wordWrapColumn', 'bounded'],
        'markdownEnumDescriptions': [
            'Lines will never wrap.',
            'Lines will wrap at the viewport width.',
            'Lines will wrap at `#editor.wordWrapColumn#`.',
            'Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`.',
        ],
        'default': EDITOR_DEFAULTS.wordWrap,
        'description': 'Controls how lines should wrap.'
    },
    'editor.wordWrapColumn': {
        'type': 'integer',
        'default': EDITOR_DEFAULTS.wordWrapColumn,
        'minimum': 1,
        'markdownDescription': 'Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.'
    },
    'editor.wrappingIndent': {
        'type': 'string',
        'enum': ['none', 'same', 'indent', 'deepIndent'],
        enumDescriptions: [
            'No indentation. Wrapped lines begin at column 1.',
            'Wrapped lines get the same indentation as the parent.',
            'Wrapped lines get +1 indentation toward the parent.',
            'Wrapped lines get +2 indentation toward the parent.',
        ],
        'default': 'same',
        'description': 'Controls the indentation of wrapped lines.',
    },
    'editor.mouseWheelScrollSensitivity': {
        'type': 'number',
        'default': EDITOR_DEFAULTS.viewInfo.scrollbar.mouseWheelScrollSensitivity,
        'markdownDescription': 'A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.'
    },
    'editor.fastScrollSensitivity': {
        'type': 'number',
        'default': EDITOR_DEFAULTS.viewInfo.scrollbar.fastScrollSensitivity,
        'markdownDescription': 'Scrolling speed multiplier when pressing `Alt`.'
    },
    'editor.multiCursorModifier': {
        'type': 'string',
        'enum': ['ctrlCmd', 'alt'],
        'markdownEnumDescriptions': [
            'Maps to `Control` on Windows and Linux and to `Command` on macOS.',
            'Maps to `Alt` on Windows and Linux and to `Option` on macOS.'
        ],
        'default': 'alt',
        'markdownDescription': 'The modifier to be used to add multiple cursors with the mouse. The Go To Definition and Open Link mouse gestures will adapt such that they do not conflict with the multicursor modifier. [Read more](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier).'
    },
    'editor.multiCursorMergeOverlapping': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.multiCursorMergeOverlapping,
        'description': 'Merge multiple cursors when they are overlapping.'
    },
    'editor.quickSuggestions': {
        'anyOf': [
            {
                type: 'boolean',
            },
            {
                type: 'object',
                properties: {
                    strings: {
                        type: 'boolean',
                        default: false,
                        description: 'Enable quick suggestions inside strings.'
                    },
                    comments: {
                        type: 'boolean',
                        default: false,
                        description: 'Enable quick suggestions inside comments.'
                    },
                    other: {
                        type: 'boolean',
                        default: true,
                        description: 'Enable quick suggestions outside of strings and comments.'
                    },
                }
            }
        ],
        'default': EDITOR_DEFAULTS.contribInfo.quickSuggestions,
        'description': 'Controls whether suggestions should automatically show up while typing.'
    },
    'editor.quickSuggestionsDelay': {
        'type': 'integer',
        'default': EDITOR_DEFAULTS.contribInfo.quickSuggestionsDelay,
        'minimum': 0,
        'description': 'Controls the delay in milliseconds after which quick suggestions will show up.'
    },
    'editor.parameterHints.enabled': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.parameterHints.enabled,
        'description': 'Enables a pop-up that shows parameter documentation and type information as you type.'
    },
    'editor.parameterHints.cycle': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.parameterHints.cycle,
        'description': 'Controls whether the parameter hints menu cycles or closes when reaching the end of the list.'
    },
    'editor.autoClosingBrackets': {
        type: 'string',
        enum: ['always', 'languageDefined', 'beforeWhitespace', 'never'],
        enumDescriptions: [
            '',
            'Use language configurations to determine when to autoclose brackets.',
            'Autoclose brackets only when the cursor is to the left of whitespace.',
            '',

        ],
        'default': EDITOR_DEFAULTS.autoClosingBrackets,
        'description': 'Controls whether the editor should automatically close brackets after the user adds an opening bracket.'
    },
    'editor.autoClosingQuotes': {
        type: 'string',
        enum: ['always', 'languageDefined', 'beforeWhitespace', 'never'],
        enumDescriptions: [
            '',
            'Use language configurations to determine when to autoclose quotes.',
            'Autoclose quotes only when the cursor is to the left of whitespace.',
            '',
        ],
        'default': EDITOR_DEFAULTS.autoClosingQuotes,
        'description': 'Controls whether the editor should automatically close quotes after the user adds an opening quote.'
    },
    'editor.autoSurround': {
        type: 'string',
        enum: ['languageDefined', 'brackets', 'quotes', 'never'],
        enumDescriptions: [
            'Use language configurations to determine when to automatically surround selections.',
            'Surround with brackets but not quotes.',
            'Surround with quotes but not brackets.',
            ''
        ],
        'default': EDITOR_DEFAULTS.autoSurround,
        'description': 'Controls whether the editor should automatically surround selections.'
    },
    'editor.formatOnType': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.formatOnType,
        'description': 'Controls whether the editor should automatically format the line after typing.'
    },
    'editor.formatOnPaste': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.formatOnPaste,
        'description': 'Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.'
    },
    'editor.autoIndent': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.autoIndent,
        'description': 'Controls whether the editor should automatically adjust the indentation when users type, paste or move lines. Extensions with indentation rules of the language must be available.'
    },
    'editor.suggestOnTriggerCharacters': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.suggestOnTriggerCharacters,
        'description': 'Controls whether suggestions should automatically show up when typing trigger characters.'
    },
    'editor.acceptSuggestionOnEnter': {
        'type': 'string',
        'enum': ['on', 'smart', 'off'],
        'default': EDITOR_DEFAULTS.contribInfo.acceptSuggestionOnEnter,
        'markdownEnumDescriptions': [
            '',
            'Only accept a suggestion with `Enter` when it makes a textual change.',
            ''
        ],
        'markdownDescription': 'Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions.'
    },
    'editor.acceptSuggestionOnCommitCharacter': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.acceptSuggestionOnCommitCharacter,
        'markdownDescription': 'Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.'
    },
    'editor.snippetSuggestions': {
        'type': 'string',
        'enum': ['top', 'bottom', 'inline', 'none'],
        'enumDescriptions': [
            'Show snippet suggestions on top of other suggestions.',
            'Show snippet suggestions below other suggestions.',
            'Show snippets suggestions with other suggestions.',
            'Do not show snippet suggestions.',
        ],
        'default': EDITOR_DEFAULTS.contribInfo.suggest.snippets,
        'description': 'Controls whether snippets are shown with other suggestions and how they are sorted.'
    },
    'editor.emptySelectionClipboard': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.emptySelectionClipboard,
        'description': 'Controls whether copying without a selection copies the current line.'
    },
    'editor.copyWithSyntaxHighlighting': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.copyWithSyntaxHighlighting,
        'description': 'Controls whether syntax highlighting should be copied into the clipboard.'
    },
    'editor.wordBasedSuggestions': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.wordBasedSuggestions,
        'description': 'Controls whether completions should be computed based on words in the document.'
    },
    'editor.suggestSelection': {
        'type': 'string',
        'enum': ['first', 'recentlyUsed', 'recentlyUsedByPrefix'],
        'markdownEnumDescriptions': [
            'Always select the first suggestion.',
            'Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently.',
            'Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`.',
        ],
        'default': 'recentlyUsed',
        'description': 'Controls how suggestions are pre-selected when showing the suggest list.'
    },
    'editor.suggestFontSize': {
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'markdownDescription': 'Font size for the suggest widget. When set to `0`, the value of `#editor.fontSize#` is used.'
    },
    'editor.suggestLineHeight': {
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'markdownDescription': 'Line height for the suggest widget. When set to `0`, the value of `#editor.lineHeight#` is used.'
    },
    'editor.tabCompletion': {
        type: 'string',
        default: 'off',
        enum: ['on', 'off', 'onlySnippets'],
        enumDescriptions: [
            'Tab complete will insert the best matching suggestion when pressing tab.',
            'Disable tab completions.',
            "Tab complete snippets when their prefix match. Works best when 'quickSuggestions' aren't enabled.",
        ],
        description: 'Enables tab completions.'
    },
    'editor.suggest.filterGraceful': {
        type: 'boolean',
        default: true,
        description: 'Controls whether filtering and sorting suggestions accounts for small typos.'
    },
    'editor.suggest.localityBonus': {
        type: 'boolean',
        default: false,
        description: 'Controls whether sorting favours words that appear close to the cursor.'
    },
    'editor.suggest.shareSuggestSelections': {
        type: 'boolean',
        default: false,
        markdownDescription: 'Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`).'
    },
    'editor.suggest.snippetsPreventQuickSuggestions': {
        type: 'boolean',
        default: true,
        description: 'Control whether an active snippet prevents quick suggestions.'
    },
    'editor.suggest.showIcons': {
        type: 'boolean',
        default: EDITOR_DEFAULTS.contribInfo.suggest.showIcons,
        description: 'Controls whether to show or hide icons in suggestions.'
    },
    'editor.suggest.maxVisibleSuggestions': {
        type: 'number',
        default: EDITOR_DEFAULTS.contribInfo.suggest.maxVisibleSuggestions,
        minimum: 1,
        maximum: 15,
        description: 'Controls how many suggestions IntelliSense will show before showing a scrollbar (maximum 15).'
    },
    'editor.suggest.filteredTypes': {
        type: 'object',
        default: { keyword: true, snippet: true },
        markdownDescription: 'Controls whether some suggestion types should be filtered from IntelliSense. A list of suggestion types can be found here: https://code.visualstudio.com/docs/editor/intellisense#_types-of-completions.',
        properties: {
            method: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `method` suggestions.'
            },
            function: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `function` suggestions.'
            },
            constructor: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `constructor` suggestions.'
            },
            field: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `field` suggestions.'
            },
            variable: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `variable` suggestions.'
            },
            class: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `class` suggestions.'
            },
            struct: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `struct` suggestions.'
            },
            interface: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `interface` suggestions.'
            },
            module: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `module` suggestions.'
            },
            property: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `property` suggestions.'
            },
            event: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `event` suggestions.'
            },
            operator: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `operator` suggestions.'
            },
            unit: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `unit` suggestions.'
            },
            value: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `value` suggestions.'
            },
            constant: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `constant` suggestions.'
            },
            enum: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `enum` suggestions.'
            },
            enumMember: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `enumMember` suggestions.'
            },
            keyword: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `keyword` suggestions.'
            },
            text: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `text` suggestions.'
            },
            color: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `color` suggestions.'
            },
            file: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `file` suggestions.'
            },
            reference: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `reference` suggestions.'
            },
            customcolor: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `customcolor` suggestions.'
            },
            folder: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `folder` suggestions.'
            },
            typeParameter: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `typeParameter` suggestions.'
            },
            snippet: {
                type: 'boolean',
                default: true,
                markdownDescription: 'When set to `false` IntelliSense never shows `snippet` suggestions.'
            },
        }
    },
    'editor.gotoLocation.multiple': {
        description: "Controls the behavior of 'Go To' commands, like Go To Definition, when multiple target locations exist.",
        type: 'string',
        enum: ['peek', 'gotoAndPeek', 'goto'],
        default: EDITOR_DEFAULTS.contribInfo.gotoLocation.multiple,
        enumDescriptions: [
            'Show peek view of the results (default)',
            'Go to the primary result and show a peek view',
            'Go to the primary result and enable peek-less navigation to others'
        ]
    },
    'editor.selectionHighlight': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.selectionHighlight,
        'description': 'Controls whether the editor should highlight matches similar to the selection.'
    },
    'editor.occurrencesHighlight': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.occurrencesHighlight,
        'description': 'Controls whether the editor should highlight semantic symbol occurrences.'
    },
    'editor.overviewRulerLanes': {
        'type': 'integer',
        'default': 3,
        'description': 'Controls the number of decorations that can show up at the same position in the overview ruler.'
    },
    'editor.overviewRulerBorder': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.overviewRulerBorder,
        'description': 'Controls whether a border should be drawn around the overview ruler.'
    },
    'editor.cursorBlinking': {
        'type': 'string',
        'enum': ['blink', 'smooth', 'phase', 'expand', 'solid'],
        'default': 'blink',
        'description': 'Control the cursor animation style.'
    },
    'editor.mouseWheelZoom': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.mouseWheelZoom,
        'markdownDescription': 'Zoom the font of the editor when using mouse wheel and holding `Ctrl`.'
    },
    'editor.cursorSmoothCaretAnimation': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.cursorSmoothCaretAnimation,
        'description': 'Controls whether the smooth caret animation should be enabled.'
    },
    'editor.cursorStyle': {
        'type': 'string',
        'enum': ['block', 'block-outline', 'line', 'line-thin', 'underline', 'underline-thin'],
        'default': 'line',
        'description': 'Controls the cursor style.'
    },
    'editor.cursorWidth': {
        'type': 'integer',
        'default': EDITOR_DEFAULTS.viewInfo.cursorWidth,
        'markdownDescription': 'Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`.'
    },
    'editor.fontLigatures': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.fontLigatures,
        'description': 'Enables/Disables font ligatures.'
    },
    'editor.hideCursorInOverviewRuler': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.hideCursorInOverviewRuler,
        'description': 'Controls whether the cursor should be hidden in the overview ruler.'
    },
    'editor.renderWhitespace': {
        'type': 'string',
        'enum': ['none', 'boundary', 'selection', 'all'],
        'enumDescriptions': [
            '',
            'Render whitespace characters except for single spaces between words.',
            'Render whitespace characters only on selected text.',
            ''
        ],
        default: EDITOR_DEFAULTS.viewInfo.renderWhitespace,
        description: 'Controls how the editor should render whitespace characters.'
    },
    'editor.renderControlCharacters': {
        'type': 'boolean',
        default: EDITOR_DEFAULTS.viewInfo.renderControlCharacters,
        description: 'Controls whether the editor should render control characters.'
    },
    'editor.renderIndentGuides': {
        'type': 'boolean',
        default: EDITOR_DEFAULTS.viewInfo.renderIndentGuides,
        description: 'Controls whether the editor should render indent guides.'
    },
    'editor.highlightActiveIndentGuide': {
        'type': 'boolean',
        default: EDITOR_DEFAULTS.viewInfo.highlightActiveIndentGuide,
        description: 'Controls whether the editor should highlight the active indent guide.'
    },
    'editor.renderLineHighlight': {
        'type': 'string',
        'enum': ['none', 'gutter', 'line', 'all'],
        'enumDescriptions': [
            '',
            '',
            '',
            'Highlights both the gutter and the current line.',
        ],
        default: EDITOR_DEFAULTS.viewInfo.renderLineHighlight,
        description: 'Controls how the editor should render the current line highlight.'
    },
    'editor.codeLens': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.codeLens,
        'description': 'Controls whether the editor shows CodeLens.'
    },
    'editor.folding': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.folding,
        'description': 'Controls whether the editor has code folding enabled.'
    },
    'editor.foldingStrategy': {
        'type': 'string',
        'enum': ['auto', 'indentation'],
        'default': EDITOR_DEFAULTS.contribInfo.foldingStrategy,
        'markdownDescription': 'Controls the strategy for computing folding ranges. `auto` uses a language specific folding strategy, if available. `indentation` uses the indentation based folding strategy.'
    },
    'editor.showFoldingControls': {
        'type': 'string',
        'enum': ['always', 'mouseover'],
        'default': EDITOR_DEFAULTS.contribInfo.showFoldingControls,
        'description': 'Controls whether the fold controls on the gutter are automatically hidden.'
    },
    'editor.matchBrackets': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.matchBrackets,
        'description': 'Highlight matching brackets when one of them is selected.'
    },
    'editor.glyphMargin': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.viewInfo.glyphMargin,
        'description': 'Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.'
    },
    'editor.useTabStops': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.useTabStops,
        'description': 'Inserting and deleting whitespace follows tab stops.'
    },
    'editor.trimAutoWhitespace': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
        'description': 'Remove trailing auto inserted whitespace.'
    },
    'editor.stablePeek': {
        'type': 'boolean',
        'default': false,
        'markdownDescription': 'Keep peek editors open even when double clicking their content or when hitting `Escape`.'
    },
    'editor.dragAndDrop': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.dragAndDrop,
        'description': 'Controls whether the editor should allow moving selections via drag and drop.'
    },
    'editor.accessibilitySupport': {
        'type': 'string',
        'enum': ['auto', 'on', 'off'],
        'enumDescriptions': [
            'The editor will use platform APIs to detect when a Screen Reader is attached.',
            'The editor will be permanently optimized for usage with a Screen Reader.',
            'The editor will never be optimized for usage with a Screen Reader.',
        ],
        'default': EDITOR_DEFAULTS.accessibilitySupport,
        'description': 'Controls whether the editor should run in a mode where it is optimized for screen readers.'
    },
    'editor.showUnused': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.showUnused,
        'description': 'Controls fading out of unused code.'
    },
    'editor.links': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.links,
        'description': 'Controls whether the editor should detect links and make them clickable.'
    },
    'editor.colorDecorators': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.colorDecorators,
        'description': 'Controls whether the editor should render the inline color decorators and color picker.'
    },
    'editor.lightbulb.enabled': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.lightbulbEnabled,
        'description': 'Enables the code action lightbulb in the editor.'
    },
    'editor.maxTokenizationLineLength': {
        'type': 'integer',
        'default': 20_000,
        'description': 'Lines above this length will not be tokenized for performance reasons'
    },
    'editor.codeActionsOnSave': {
        'type': 'object',
        'properties': {
            'source.organizeImports': {
                'type': 'boolean',
                'description': 'Controls whether organize imports action should be run on file save.'
            },
            'source.fixAll': {
                'type': 'boolean',
                'description': 'Controls whether auto fix action should be run on file save.'
            }
        },
        'additionalProperties': {
            'type': 'boolean'
        },
        'default': EDITOR_DEFAULTS.contribInfo.codeActionsOnSave,
        'description': 'Code action kinds to be run on save.'
    },
    'editor.codeActionsOnSaveTimeout': {
        'type': 'number',
        'default': EDITOR_DEFAULTS.contribInfo.codeActionsOnSaveTimeout,
        'description': 'Timeout in milliseconds after which the code actions that are run on save are cancelled.'
    },
    'editor.selectionClipboard': {
        'type': 'boolean',
        'default': EDITOR_DEFAULTS.contribInfo.selectionClipboard,
        'description': 'Controls whether the Linux primary clipboard should be supported.',
        'included': platform.isLinux
    },
    'diffEditor.renderSideBySide': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the diff editor shows the diff side by side or inline.'
    },
    'diffEditor.ignoreTrimWhitespace': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the diff editor shows changes in leading or trailing whitespace as diffs.'
    },
    'editor.largeFileOptimizations': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
        'description': 'Special handling for large files to disable certain memory intensive features.'
    },
    'diffEditor.renderIndicators': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the diff editor shows +/- indicators for added/removed changes.'
    }
};
/* eslint-enable max-len */

export const editorPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'scope': 'resource',
    'overridable': true,
    'properties': {
        ...(<PreferenceSchemaProperties>codeEditorPreferenceProperties),
        'editor.autoSave': {
            'enum': [
                'on',
                'off'
            ],
            'default': 'off',
            'description': 'Controls auto save of dirty files.',
            overridable: false
        },
        'editor.autoSaveDelay': {
            'type': 'number',
            'default': 500,
            'description': 'Configure the auto save delay in milliseconds.',
            overridable: false
        },
        'editor.formatOnSave': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable format on manual save.'
        },
        'editor.formatOnSaveTimeout': {
            'type': 'number',
            'default': 750,
            'description': 'Timeout in milliseconds after which the formatting that is run on file save is cancelled.'
        },
        'files.eol': {
            'type': 'string',
            'enum': [
                '\n',
                '\r\n',
                'auto'
            ],
            'enumDescriptions': [
                'LF',
                'CRLF',
                'Uses operating system specific end of line character.'
            ],
            'default': 'auto',
            'description': 'The default end of line character.'
        },
        'files.encoding': {
            'enum': Object.keys(SUPPORTED_ENCODINGS).sort(),
            'default': 'utf8',
            'description': 'The default character set encoding to use when reading and writing files.'
        }
    }
};

type CodeEditorPreferenceProperties = typeof codeEditorPreferenceProperties;
export type CodeEditorConfiguration = {
    [P in keyof CodeEditorPreferenceProperties]:
    CodeEditorPreferenceProperties[P] extends { enum: string[] } ?
    CodeEditorPreferenceProperties[P]['enum'][number] : // eslint-disable-line @typescript-eslint/indent
    CodeEditorPreferenceProperties[P]['default']; // eslint-disable-line @typescript-eslint/indent
};

export interface EditorConfiguration extends CodeEditorConfiguration {
    'editor.autoSave': 'on' | 'off'
    'editor.autoSaveDelay': number
    'editor.formatOnSave': boolean
    'editor.formatOnSaveTimeout': number
    'files.eol': EndOfLinePreference
    'files.encoding': string
}
export type EndOfLinePreference = '\n' | '\r\n' | 'auto';

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
