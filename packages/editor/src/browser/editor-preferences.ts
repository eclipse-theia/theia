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

import { interfaces } from '@theia/core/shared/inversify';
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
import { nls } from '@theia/core/lib/common/nls';

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'monospace\', monospace, \'Droid Sans Fallback\'';

const platform = {
    isMacintosh: isOSX,
    isLinux: OS.type() === OS.Type.Linux
};

// should be in sync with https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/editor/common/config/editorOptions.ts#L3687
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

// should be in sync with https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/editor/common/config/editorOptions.ts#L3702
export const EDITOR_MODEL_DEFAULTS = {
    tabSize: 4,
    indentSize: 4,
    insertSpaces: true,
    detectIndentation: true,
    trimAutoWhitespace: true,
    largeFileOptimizations: true
};

export const DEFAULT_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

/* eslint-disable max-len */
/* eslint-disable no-null/no-null */

// should be in sync with:
//        1. https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/editor/common/config/commonEditorConfig.ts#L458
//        2. https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/editor/common/config/commonEditorConfig.ts#L577

// 1. Copy from https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/editor/common/config/commonEditorConfig.ts#L577
// 2. Align first items with https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/editor/common/config/commonEditorConfig.ts#L458
// 3. Find -> Use Regular Expressions to clean up data and replace " by ', for example -> nls\.localize\(.*, "(.*)"\) -> "$1"
// 4. Apply `quotemark` quick fixes
// 5. Fix the rest manually
const codeEditorPreferenceProperties = {
    'editor.tabSize': {
        'type': 'number',
        'default': EDITOR_MODEL_DEFAULTS.tabSize,
        'minimum': 1,
        'markdownDescription': nls.localize('vscode/commonEditorConfig/tabSize', 'The number of spaces a tab is equal to. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.')
    },
    'editor.defaultFormatter': {
        'type': 'string',
        'default': null,
        'description': 'Default formatter.'
    },
    'editor.insertSpaces': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.insertSpaces,
        'markdownDescription': nls.localize('vscode/commonEditorConfig/insertSpaces', 'Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.')
    },
    'editor.detectIndentation': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.detectIndentation,
        'markdownDescription': nls.localize('vscode/commonEditorConfig/detectIndentation', 'Controls whether `#editor.tabSize#` and `#editor.insertSpaces#` will be automatically detected when a file is opened based on the file contents.')
    },
    'editor.trimAutoWhitespace': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
        'description': nls.localize('vscode/commonEditorConfig/trimAutoWhitespace', 'Remove trailing auto inserted whitespace.')
    },
    'editor.largeFileOptimizations': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
        'description': nls.localize('vscode/commonEditorConfig/largeFileOptimizations', 'Special handling for large files to disable certain memory intensive features.')
    },
    'editor.wordBasedSuggestions': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/commonEditorConfig/wordBasedSuggestions', 'Controls whether completions should be computed based on words in the document.')
    },
    'editor.wordBasedSuggestionsMode': {
        'enum': ['currentDocument', 'matchingDocuments', 'allDocuments'],
        'default': 'matchingDocuments',
        'enumDescriptions': [
            nls.localize('vscode/commonEditorConfig/wordBasedSuggestionsMode.currentDocument', 'Only suggest words from the active document.'),
            nls.localize('vscode/commonEditorConfig/wordBasedSuggestionsMode.matchingDocuments', 'Suggest words from all open documents of the same language.'),
            nls.localize('vscode/commonEditorConfig/wordBasedSuggestionsMode.allDocuments', 'Suggest words from all open documents.')
        ],
        'description': nls.localize('vscode/commonEditorConfig/wordBasedSuggestionsMode', 'Controls form what documents word based completions are computed.')
    },
    'editor.semanticHighlighting.enabled': {
        'enum': [true, false, 'configuredByTheme'],
        'enumDescriptions': [
            nls.localize('vscode/commonEditorConfig/semanticHighlighting.true', 'Semantic highlighting enabled for all color themes.'),
            nls.localize('vscode/commonEditorConfig/semanticHighlighting.false', 'Semantic highlighting disabled for all color themes.'),
            nls.localize('vscode/commonEditorConfig/semanticHighlighting.configuredByTheme', 'Semantic highlighting is configured by the current color theme\'s `semanticHighlighting` setting.')
        ],
        'default': 'configuredByTheme',
        'description': nls.localize('vscode/commonEditorConfig/emanticHighlighting.enabled', 'Controls whether the semanticHighlighting is shown for the languages that support it.')
    },
    'editor.stablePeek': {
        'type': 'boolean',
        'default': false,
        'markdownDescription': nls.localize('vscode/commonEditorConfig/stablePeek', 'Keep peek editors open even when double clicking their content or when hitting `Escape`.')
    },
    'editor.maxTokenizationLineLength': {
        'type': 'integer',
        'default': 400,
        'description': nls.localize('vscode/commonEditorConfig/maxTokenizationLineLength', 'Lines above this length will not be tokenized for performance reasons.')
    },
    'diffEditor.maxComputationTime': {
        'type': 'number',
        'default': 5000,
        'description': nls.localize('vscode/commonEditorConfig/maxComputationTime', 'Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout.')
    },
    'diffEditor.renderSideBySide': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/commonEditorConfig/sideBySide', 'Controls whether the diff editor shows the diff side by side or inline.')
    },
    'diffEditor.ignoreTrimWhitespace': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/commonEditorConfig/ignoreTrimWhitespace', 'When enabled, the diff editor ignores changes in leading or trailing whitespace.')
    },
    'diffEditor.renderIndicators': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/commonEditorConfig/renderIndicators', 'Controls whether the diff editor shows +/- indicators for added/removed changes.')
    },
    'diffEditor.codeLens': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('vscode/commonEditorConfig/codeLens', 'Controls whether the editor shows CodeLens.')
    },
    'diffEditor.wordWrap': {
        'type': 'string',
        'enum': ['off', 'on', 'inherit'],
        'default': 'inherit',
        'markdownEnumDescriptions': [
            nls.localize('vscode/commonEditorConfig/wordWrap.off', 'Lines will never wrap.'),
            nls.localize('vscode/commonEditorConfig/wordWrap.on', 'Lines will wrap at the viewport width.'),
            nls.localize('vscode/commonEditorConfig/wordWrap.inherit', 'Lines will wrap according to the `#editor.wordWrap#` setting.')
        ]
    },
    'editor.acceptSuggestionOnCommitCharacter': {
        'markdownDescription': nls.localize('vscode/editorOptions/acceptSuggestionOnCommitCharacter', 'Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.'),
        'type': 'boolean',
        'default': true
    },
    'editor.acceptSuggestionOnEnter': {
        'markdownEnumDescriptions': [
            '',
            nls.localize('vscode/editorOptions/acceptSuggestionOnEnterSmart', 'Only accept a suggestion with `Enter` when it makes a textual change.'),
            ''
        ],
        'markdownDescription': nls.localize('vscode/editorOptions/acceptSuggestionOnEnter', 'Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions.'),
        'type': 'string',
        'enum': [
            'on',
            'smart',
            'off'
        ],
        'default': 'on'
    },
    'editor.accessibilitySupport': {
        'type': 'string',
        'enum': [
            'auto',
            'on',
            'off'
        ],
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/accessibilitySupport.auto', 'The editor will use platform APIs to detect when a Screen Reader is attached.'),
            nls.localize('vscode/editorOptions/accessibilitySupport.on', 'The editor will be permanently optimized for usage with a Screen Reader.'),
            nls.localize('vscode/editorOptions/accessibilitySupport.off', 'The editor will never be optimized for usage with a Screen Reader.')
        ],
        'default': 'auto',
        'description': nls.localize('vscode/editorOptions/accessibilitySupport', 'Controls whether the editor should run in a mode where it is optimized for screen readers.')
    },
    'editor.accessibilityPageSize': {
        'description': nls.localize('vscode/editorOptions/accessibilityPageSize', 'Controls the number of lines in the editor that can be read out by a screen reader. Warning: this has a performance implication for numbers larger than the default.'),
        'type': 'integer',
        'default': 10,
        'minimum': 1,
        'maximum': 1073741824
    },
    'editor.autoClosingBrackets': {
        'enumDescriptions': [
            '',
            nls.localize('vscode/editorOptions/languageDefined', 'Use language configurations to determine when to autoclose brackets.'),
            nls.localize('vscode/editorOptions/beforeWhitespace', 'Autoclose brackets only when the cursor is to the left of whitespace.'),
            ''
        ],
        'description': nls.localize('vscode/editorOptions/autoClosingBrackets', 'Controls whether the editor should automatically close brackets after the user adds an opening bracket.'),
        'type': 'string',
        'enum': [
            'always',
            'languageDefined',
            'beforeWhitespace',
            'never'
        ],
        'default': 'languageDefined'
    },
    'editor.autoClosingOvertype': {
        'enumDescriptions': [
            '',
            nls.localize('vscode/editorOptions/editor.autoClosingDelete.auto', 'Type over closing quotes or brackets only if they were automatically inserted.'),
            ''
        ],
        'description': nls.localize('vscode/editorOptions/autoClosingDelete', 'Controls whether the editor should type over closing quotes or brackets.'),
        'type': 'string',
        'enum': [
            'always',
            'auto',
            'never'
        ],
        'default': 'auto'
    },
    'editor.autoClosingQuotes': {
        'enumDescriptions': [
            '',
            nls.localize('vscode/editorOptions/editor.autoClosingQuotes.languageDefined', 'Use language configurations to determine when to autoclose quotes.'),
            nls.localize('vscode/editorOptions/editor.autoClosingQuotes.beforeWhitespace', 'Autoclose quotes only when the cursor is to the left of whitespace.'),
            ''
        ],
        'description': nls.localize('vscode/editorOptions/autoClosingQuotes', 'Controls whether the editor should automatically close quotes after the user adds an opening quote.'),
        'type': 'string',
        'enum': [
            'always',
            'languageDefined',
            'beforeWhitespace',
            'never'
        ],
        'default': 'languageDefined'
    },
    'editor.autoIndent': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.autoIndent.none', 'The editor will not insert indentation automatically.'),
            nls.localize('vscode/editorOptions/editor.autoIndent.keep', 'The editor will keep the current line\'s indentation.'),
            nls.localize('vscode/editorOptions/editor.autoIndent.brackets', 'The editor will keep the current line\'s indentation and honor language defined brackets.'),
            nls.localize('vscode/editorOptions/editor.autoIndent.advanced', 'The editor will keep the current line\'s indentation, honor language defined brackets and invoke special onEnterRules defined by languages.'),
            nls.localize('vscode/editorOptions/editor.autoIndent.full', 'The editor will keep the current line\'s indentation, honor language defined brackets, invoke special onEnterRules defined by languages, and honor indentationRules defined by languages.')
        ],
        'description': nls.localize('vscode/editorOptions/autoIndent', 'Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.'),
        'type': 'string',
        'enum': [
            'none',
            'keep',
            'brackets',
            'advanced',
            'full'
        ],
        'default': 'full'
    },
    'editor.autoSurround': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.autoSurround.languageDefined', 'Use language configurations to determine when to automatically surround selections.'),
            nls.localize('vscode/editorOptions/editor.autoSurround.quotes', 'Surround with quotes but not brackets.'),
            nls.localize('vscode/editorOptions/editor.autoSurround.brackets', 'Surround with brackets but not quotes.'),
            ''
        ],
        'description': nls.localize('vscode/editorOptions/autoSurround', 'Controls whether the editor should automatically surround selections.'),
        'type': 'string',
        'enum': [
            'languageDefined',
            'quotes',
            'brackets',
            'never'
        ],
        'default': 'languageDefined'
    },
    'editor.ariaLabel': {
        'type': 'string',
        'description': nls.localize('theia/editor/ariaLabel', 'The aria label for the editor\'s textarea when focused.'),
        'default': 'ariaLabel'
    },
    'editor.automaticLayout': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('theia/editor/automaticLayout', 'Enable that the editor will install an interval to check if its container dom node size has changed. Enabling this might have a severe performance impact.')
    },
    'editor.codeLens': {
        'description': nls.localize('vscode/editorOptions/codeLens', 'Controls whether the editor shows CodeLens.'),
        'type': 'boolean',
        'default': true
    },
    'editor.codeLensFontFamily': {
        'description': nls.localize('vscode/editorOptions/codeLensFontFamily', 'Controls the font family for CodeLens.'),
        'type': 'string',
        'default': true
    },
    'editor.codeLensFontSize': {
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 100,
        'description': nls.localize('vscode/editorOptions/codeLensFontSize', 'Controls the font size in pixels for CodeLens. When set to `0`, the 90% of `#editor.fontSize#` is used.')
    },
    'editor.colorDecorators': {
        'description': nls.localize('vscode/editorOptions/colorDecorators', 'Controls whether the editor should render the inline color decorators and color picker.'),
        'type': 'boolean',
        'default': true
    },
    'editor.comments.insertSpace': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/comments.insertSpace', 'Controls whether a space character is inserted when commenting.')
    },
    'editor.comments.ignoreEmptyLines': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/comments.ignoreEmptyLines', 'Controls if empty lines should be ignored with toggle, add or remove actions for line comments.')
    },
    'editor.contextmenu': {
        'description': nls.localize('theia/editor/contextmenu', 'Controls whether to enable the custom contextmenu.'),
        'type': 'boolean',
        'default': true,
    },
    'editor.copyWithSyntaxHighlighting': {
        'description': nls.localize('vscode/editorOptions/copyWithSyntaxHighlighting', 'Controls whether syntax highlighting should be copied into the clipboard.'),
        'type': 'boolean',
        'default': true
    },
    'editor.cursorBlinking': {
        'description': nls.localize('vscode/editorOptions/cursorBlinking', 'Control the cursor animation style.'),
        'type': 'string',
        'enum': [
            'blink',
            'smooth',
            'phase',
            'expand',
            'solid'
        ],
        'default': 'blink'
    },
    'editor.cursorSmoothCaretAnimation': {
        'description': nls.localize('vscode/editorOptions/cursorSmoothCaretAnimation', 'Controls whether the smooth caret animation should be enabled.'),
        'type': 'boolean',
        'default': false
    },
    'editor.cursorStyle': {
        'description': nls.localize('vscode/editorOptions/cursorStyle', 'Controls the cursor style.'),
        'type': 'string',
        'enum': [
            'line',
            'block',
            'underline',
            'line-thin',
            'block-outline',
            'underline-thin'
        ],
        'default': 'line'
    },
    'editor.cursorSurroundingLines': {
        'description': nls.localize('vscode/editorOptions/cursorSurroundingLines', 'Controls the minimal number of visible leading and trailing lines surrounding the cursor. Known as `scrollOff` or `scrollOffset` in some other editors.'),
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.cursorSurroundingLinesStyle': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/cursorSurroundingLinesStyle.default', '`cursorSurroundingLines` is enforced only when triggered via the keyboard or API.'),
            nls.localize('vscode/editorOptions/cursorSurroundingLinesStyle.all', '`cursorSurroundingLines` is enforced always.')
        ],
        'description': nls.localize('vscode/editorOptions/cursorSurroundingLinesStyle', 'Controls when `cursorSurroundingLines` should be enforced.'),
        'type': 'string',
        'enum': [
            'default',
            'all'
        ],
        'default': 'default'
    },
    'editor.cursorWidth': {
        'markdownDescription': nls.localize('vscode/editorOptions/cursorWidth', 'Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`.'),
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.disableLayerHinting': {
        'markdownDescription': nls.localize('theia/editor/disableLayerHinting', 'Disable the use of `transform: translate3d(0px, 0px, 0px)` for the editor margin and lines layers. The usage of `transform: translate3d(0px, 0px, 0px)` acts as a hint for browsers to create an extra layer.'),
        'type': 'boolean',
        'default': false
    },
    'editor.disableMonospaceOptimizations': {
        'description': nls.localize('theia/editor/disableMonospaceOptimizations', 'Controls whether to enable optimizations for monospace fonts.'),
        'type': 'boolean',
        'default': false
    },
    'editor.dragAndDrop': {
        'description': nls.localize('vscode/editorOptions/dragAndDrop', 'Controls whether the editor should allow moving selections via drag and drop.'),
        'type': 'boolean',
        'default': true
    },
    'editor.emptySelectionClipboard': {
        'description': nls.localize('vscode/editorOptions/emptySelectionClipboard', 'Controls whether copying without a selection copies the current line.'),
        'type': 'boolean',
        'default': true
    },
    'editor.extraEditorClassName': {
        'description': nls.localize('theia/editor/extraEditorClassName', 'Additional class name to be added to the editor.'),
        'type': 'string',
        'default': ''
    },
    'editor.fastScrollSensitivity': {
        'markdownDescription': nls.localize('vscode/editorOptions/fastScrollSensitivity', 'Scrolling speed multiplier when pressing `Alt`.'),
        'type': 'number',
        'default': 5
    },
    'editor.find.cursorMoveOnType': {
        'description': nls.localize('vscode/editorOptions/find.cursorMoveOnType', 'Controls whether the cursor should jump to find matches while typing.'),
        'type': 'boolean',
        'default': true
    },
    'editor.find.seedSearchStringFromSelection': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/find.seedSearchStringFromSelection', 'Controls whether the search string in the Find Widget is seeded from the editor selection.')
    },
    'editor.find.autoFindInSelection': {
        'type': 'string',
        'enum': [
            'never',
            'always',
            'multiline'
        ],
        'default': 'never',
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.find.autoFindInSelection.never', 'Never turn on Find in selection automatically (default)'),
            nls.localize('vscode/editorOptions/editor.find.autoFindInSelection.always', 'Always turn on Find in selection automatically'),
            nls.localize('vscode/editorOptions/editor.find.autoFindInSelection.multiline', 'Turn on Find in selection automatically when multiple lines of content are selected.')
        ],
        'description': nls.localize('vscode/editorOptions/find.autoFindInSelection', 'Controls whether the find operation is carried out on selected text or the entire file in the editor.')
    },
    'editor.find.globalFindClipboard': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('vscode/editorOptions/find.globalFindClipboard', 'Controls whether the Find Widget should read or modify the shared find clipboard on macOS.'),
        'included': isOSX
    },
    'editor.find.addExtraSpaceOnTop': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/find.addExtraSpaceOnTop', 'Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.')
    },
    'editor.find.loop': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/find.loop', 'Controls whether the search automatically restarts from the beginning (or the end) when no further matches can be found.')
    },
    'editor.fixedOverflowWidgets': {
        'markdownDescription': nls.localize('theia/editor/fixedOverflowWidgets', 'Controls whether to display overflow widgets as `fixed`.'),
        'type': 'boolean',
        'default': false,
    },
    'editor.folding': {
        'description': nls.localize('vscode/editorOptions/folding', 'Controls whether the editor has code folding enabled.'),
        'type': 'boolean',
        'default': true
    },
    'editor.foldingStrategy': {
        'markdownDescription': nls.localize('vscode/editorOptions/foldingStrategy', 'Controls the strategy for computing folding ranges. `auto` uses a language specific folding strategy, if available. `indentation` uses the indentation based folding strategy.'),
        'type': 'string',
        'enum': [
            'auto',
            'indentation'
        ],
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/foldingStrategy.auto', 'Use a language-specific folding strategy if available, else the indentation-based one.'),
            nls.localize('vscode/editorOptions/foldingStrategy.indentation', 'Use the indentation-based folding strategy.'),
        ],
        'default': 'auto'
    },
    'editor.foldingHighlight': {
        'description': nls.localize('vscode/editorOptions/foldingHighlight', 'Controls whether the editor should highlight folded ranges.'),
        'type': 'boolean',
        'default': true
    },
    'editor.unfoldOnClickAfterEndOfLine': {
        'description': nls.localize('vscode/editorOptions/unfoldOnClickAfterEndOfLine', 'Controls whether clicking on the empty content after a folded line will unfold the line.'),
        'type': 'boolean',
        'default': false
    },
    'editor.fontFamily': {
        'description': nls.localize('vscode/editorOptions/fontFamily', 'Controls the font family.'),
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontFamily
    },
    'editor.fontLigatures': {
        'anyOf': [
            {
                'type': 'boolean',
                'description': nls.localize('vscode/editorOptions/fontLigatures', 'Enables/Disables font ligatures.')
            },
            {
                'type': 'string',
                'description': nls.localize('vscode/editorOptions/fontFeatureSettings', 'Explicit font-feature-settings.')
            }
        ],
        'description': nls.localize('vscode/editorOptions/fontLigaturesGeneral', 'Configures font ligatures.'),
        'default': false
    },
    'editor.fontSize': {
        'type': 'number',
        'minimum': 6,
        'maximum': 100,
        'default': EDITOR_FONT_DEFAULTS.fontSize,
        'description': nls.localize('vscode/editorOptions/fontSize', 'Controls the font size in pixels.')
    },
    'editor.fontWeight': {
        'enum': [
            'normal',
            'bold',
            '100',
            '200',
            '300',
            '400',
            '500',
            '600',
            '700',
            '800',
            '900'
        ],
        'description': nls.localize('vscode/editorOptions/fontWeight', 'Controls the font weight.'),
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontWeight
    },
    'editor.formatOnPaste': {
        'description': nls.localize('vscode/editorOptions/formatOnPaste', 'Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.'),
        'type': 'boolean',
        'default': false
    },
    'editor.formatOnType': {
        'description': nls.localize('vscode/editorOptions/formatOnType', 'Controls whether the editor should automatically format the line after typing.'),
        'type': 'boolean',
        'default': false
    },
    'editor.glyphMargin': {
        'description': nls.localize('vscode/editorOptions/glyphMargin', 'Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.'),
        'type': 'boolean',
        'default': true
    },
    'editor.gotoLocation.multiple': {
        'type': 'string',
        'default': '',
        'deprecationMessage': nls.localize('vscode/editorOptions/insertSpaces', 'This setting is deprecated, please use separate settings like `editor.editor.gotoLocation.multipleDefinitions` or `editor.editor.gotoLocation.multipleImplementations` instead.')
    },
    'editor.gotoLocation.multipleDefinitions': {
        'description': nls.localize('vscode/editorOptions/editor.editor.gotoLocation.multipleDefinitions', 'Controls the behavior the `Go to Definition`-command when multiple target locations exist.'),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.peek', 'Show peek view of the results (default)'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.gotoAndPeek', 'Go to the primary result and show a peek view'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.goto', 'Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleTypeDefinitions': {
        'description': nls.localize('vscode/editorOptions/editor.editor.gotoLocation.multipleTypeDefinitions', 'Controls the behavior the `Go to Type Definition`-command when multiple target locations exist.'),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.peek', 'Show peek view of the results (default)'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.gotoAndPeek', 'Go to the primary result and show a peek view'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.goto', 'Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleDeclarations': {
        'description': nls.localize('vscode/editorOptions/editor.editor.gotoLocation.multipleDeclarations', 'Controls the behavior the `Go to Declaration`-command when multiple target locations exist.'),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.peek', 'Show peek view of the results (default)'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.gotoAndPeek', 'Go to the primary result and show a peek view'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.goto', 'Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleImplementations': {
        'description': nls.localize('vscode/editorOptions/editor.editor.gotoLocation.multipleImplemenattions', 'Controls the behavior the `Go to Implementations`-command when multiple target locations exist.'),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.peek', 'Show peek view of the results (default)'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.gotoAndPeek', 'Go to the primary result and show a peek view'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.goto', 'Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleReferences': {
        'description': nls.localize('vscode/editorOptions/editor.editor.gotoLocation.multipleReferences', 'Controls the behavior the `Go to References`-command when multiple target locations exist.'),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.peek', 'Show peek view of the results (default)'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.gotoAndPeek', 'Go to the primary result and show a peek view'),
            nls.localize('vscode/editorOptions/editor.gotoLocation.multiple.goto', 'Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.alternativeDefinitionCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': nls.localize('vscode/editorOptions/alternativeDefinitionCommand', 'Alternative command id that is being executed when the result of `Go to Definition` is the current location.')
    },
    'editor.gotoLocation.alternativeTypeDefinitionCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': nls.localize('vscode/editorOptions/alternativeTypeDefinitionCommand', 'Alternative command id that is being executed when the result of `Go to Type Definition` is the current location.')
    },
    'editor.gotoLocation.alternativeDeclarationCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': nls.localize('vscode/editorOptions/alternativeDeclarationCommand', 'Alternative command id that is being executed when the result of `Go to Declaration` is the current location.')
    },
    'editor.gotoLocation.alternativeImplementationCommand': {
        'type': 'string',
        'default': '',
        'description': nls.localize('vscode/editorOptions/alternativeImplementationCommand', 'Alternative command id that is being executed when the result of `Go to Implementation` is the current location.')
    },
    'editor.gotoLocation.alternativeReferenceCommand': {
        'type': 'string',
        'default': '',
        'description': nls.localize('vscode/editorOptions/alternativeReferenceCommand', 'Alternative command id that is being executed when the result of `Go to Reference` is the current location.')
    },
    'editor.hideCursorInOverviewRuler': {
        'description': nls.localize('vscode/editorOptions/hideCursorInOverviewRuler', 'Controls whether the cursor should be hidden in the overview ruler.'),
        'type': 'boolean',
        'default': false
    },
    'editor.highlightActiveIndentGuide': {
        'description': nls.localize('theia/editor/highlightActiveIndentGuide', 'Controls whether the editor should highlight the active indent guide.'),
        'type': 'boolean',
        'default': true
    },
    'editor.hover.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/hover.enabled', 'Controls whether the hover is shown.')
    },
    'editor.hover.delay': {
        'type': 'number',
        'default': 300,
        'description': nls.localize('vscode/editorOptions/hover.delay', 'Controls the delay in milliseconds after which the hover is shown.')
    },
    'editor.hover.sticky': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/hover.sticky', 'Controls whether the hover should remain visible when mouse is moved over it.')
    },
    'editor.inDiffEditor': {
        'type': 'boolean',
        'default': true,
    },
    'editor.letterSpacing': {
        'description': nls.localize('vscode/editorOptions/letterSpacing', 'Controls the letter spacing in pixels.'),
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.letterSpacing
    },
    'editor.lightbulb.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/codeActions', 'Enables the code action lightbulb in the editor.')
    },
    'editor.lineHeight': {
        'description': nls.localize('vscode/editorOptions/lineHeight', 'Controls the line height. Use 0 to compute the line height from the font size.'),
        'type': 'integer',
        'default': EDITOR_FONT_DEFAULTS.lineHeight,
        'minimum': 0,
        'maximum': 150
    },
    'editor.lineNumbers': {
        'type': 'string',
        'enum': [
            'off',
            'on',
            'relative',
            'interval'
        ],
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/lineNumbers.off', 'Line numbers are not rendered.'),
            nls.localize('vscode/editorOptions/lineNumbers.on', 'Line numbers are rendered as absolute number.'),
            nls.localize('vscode/editorOptions/lineNumbers.relative', 'Line numbers are rendered as distance in lines to cursor position.'),
            nls.localize('vscode/editorOptions/lineNumbers.interval', 'Line numbers are rendered every 10 lines.')
        ],
        'default': 'on',
        'description': nls.localize('vscode/editorOptions/lineNumbers', 'Controls the display of line numbers.')
    },
    'editor.lineNumbersMinChars': {
        'description': nls.localize('theia/editor/lineNumbersMinChars', 'Controls the line height. Use 0 to compute the line height from the font size.'),
        'type': 'integer',
        'default': 5,
        'minimum': 1,
        'maximum': 300
    },
    'editor.linkedEditing': {
        'description': nls.localize('vscode/editorOptions/linkedEditing', 'Controls whether the editor has linked editing enabled. Depending on the language, related symbols, e.g. HTML tags, are updated while editing.'),
        'type': 'boolean',
        'default': false
    },
    'editor.links': {
        'description': nls.localize('vscode/editorOptions/links', 'Controls whether the editor should detect links and make them clickable.'),
        'type': 'boolean',
        'default': true
    },
    'editor.matchBrackets': {
        'description': nls.localize('vscode/editorOptions/matchBrackets', 'Highlight matching brackets.'),
        'type': 'string',
        'enum': [
            'always',
            'near',
            'never'
        ],
        'default': 'always'
    },
    'editor.minimap.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/minimap.enabled', 'Controls whether the minimap is shown.')
    },
    'editor.minimap.side': {
        'type': 'string',
        'enum': [
            'left',
            'right'
        ],
        'default': 'right',
        'description': nls.localize('vscode/editorOptions/minimap.side', 'Controls the side where to render the minimap.')
    },
    'editor.minimap.showSlider': {
        'type': 'string',
        'enum': [
            'always',
            'mouseover'
        ],
        'default': 'mouseover',
        'description': nls.localize('vscode/editorOptions/minimap.showSlider', 'Controls when the minimap slider is shown.')
    },
    'editor.minimap.scale': {
        'type': 'number',
        'default': 1,
        'minimum': 1,
        'maximum': 3,
        'description': nls.localize('vscode/editorOptions/minimap.scale', 'Scale of content drawn in the minimap.')
    },
    'editor.minimap.renderCharacters': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/minimap.renderCharacters', 'Render the actual characters on a line as opposed to color blocks.')
    },
    'editor.minimap.maxColumn': {
        'type': 'number',
        'default': 120,
        'description': nls.localize('vscode/editorOptions/minimap.maxColumn', 'Limit the width of the minimap to render at most a certain number of columns.')
    },
    'editor.mouseStyle': {
        'description': nls.localize('theia/editor/mouseStyle', 'Controls the mouse pointer style.'),
        'type': 'string',
        'enum': ['text', 'default', 'copy'],
        'default': 'text'
    },
    'editor.mouseWheelScrollSensitivity': {
        'markdownDescription': nls.localize('vscode/editorOptions/mouseWheelScrollSensitivity', 'A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.'),
        'type': 'number',
        'default': 1
    },
    'editor.mouseWheelZoom': {
        'markdownDescription': nls.localize('vscode/editorOptions/mouseWheelZoom', 'Zoom the font of the editor when using mouse wheel and holding `Ctrl`.'),
        'type': 'boolean',
        'default': false
    },
    'editor.multiCursorMergeOverlapping': {
        'description': nls.localize('vscode/editorOptions/multiCursorMergeOverlapping', 'Merge multiple cursors when they are overlapping.'),
        'type': 'boolean',
        'default': true
    },
    'editor.multiCursorModifier': {
        'markdownEnumDescriptions': [
            nls.localize('vscode/editorOptions/multiCursorModifier.ctrlCmd', 'Maps to `Control` on Windows and Linux and to `Command` on macOS.'),
            nls.localize('vscode/editorOptions/multiCursorModifier.alt', 'Maps to `Alt` on Windows and Linux and to `Option` on macOS.')
        ],
        'markdownDescription': nls.localize('vscode/editorOptions/multiCursorModifier', 'The modifier to be used to add multiple cursors with the mouse. The Go To Definition and Open Link mouse gestures will adapt such that they do not conflict with the multicursor modifier. [Read more](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier).'),
        'type': 'string',
        'enum': [
            'ctrlCmd',
            'alt'
        ],
        'default': 'alt'
    },
    'editor.multiCursorPaste': {
        'markdownEnumDescriptions': [
            nls.localize('vscode/editorOptions/multiCursorPaste.spread', 'Each cursor pastes a single line of the text.'),
            nls.localize('vscode/editorOptions/multiCursorPaste.full', 'Each cursor pastes the full text.')
        ],
        'markdownDescription': nls.localize('vscode/editorOptions/multiCursorPaste', 'Controls pasting when the line count of the pasted text matches the cursor count.'),
        'type': 'string',
        'enum': [
            'spread',
            'full'
        ],
        'default': 'spread'
    },
    'editor.occurrencesHighlight': {
        'description': nls.localize('vscode/editorOptions/occurrencesHighlight', 'Controls whether the editor should highlight semantic symbol occurrences.'),
        'type': 'boolean',
        'default': true
    },
    'editor.overviewRulerBorder': {
        'description': nls.localize('vscode/editorOptions/overviewRulerBorder', 'Controls whether a border should be drawn around the overview ruler.'),
        'type': 'boolean',
        'default': true
    },
    'editor.overviewRulerLanes': {
        'type': 'integer',
        'default': 3,
        'minimum': 0,
        'maximum': 3,
        'description': nls.localize('theia/editor/overviewRulerLanes', 'The number of vertical lanes the overview ruler should render.')
    },
    'editor.padding.top': {
        'type': 'number',
        'default': 0,
        'minimum': 0,
        'maximum': 1000,
        'description': nls.localize('vscode/editorOptions/padding.top', 'Controls the amount of space between the top edge of the editor and the first line.')
    },
    'editor.padding.bottom': {
        'type': 'number',
        'default': 0,
        'minimum': 0,
        'maximum': 1000,
        'description': nls.localize('vscode/editorOptions/padding.bottom', 'Controls the amount of space between the bottom edge of the editor and the last line.')
    },
    'editor.parameterHints.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/parameterHints.enabled', 'Enables a pop-up that shows parameter documentation and type information as you type.')
    },
    'editor.parameterHints.cycle': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('vscode/editorOptions/parameterHints.cycle', 'Controls whether the parameter hints menu cycles or closes when reaching the end of the list.')
    },
    'editor.peekWidgetDefaultFocus': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/peekWidgetDefaultFocus.tree', 'Focus the tree when opening peek'),
            nls.localize('vscode/editorOptions/peekWidgetDefaultFocus.editor', 'Focus the editor when opening peek')
        ],
        'description': nls.localize('vscode/editorOptions/peekWidgetDefaultFocus', 'Controls whether to focus the inline editor or the tree in the peek widget.'),
        'type': 'string',
        'enum': [
            'tree',
            'editor'
        ],
        'default': 'tree'
    },
    'editor.definitionLinkOpensInPeek': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('vscode/editorOptions/definitionLinkOpensInPeek', 'Controls whether the Go to Definition mouse gesture always opens the peek widget.')
    },
    'editor.quickSuggestions': {
        'anyOf': [
            {
                'type': 'boolean'
            },
            {
                'type': 'object',
                'properties': {
                    'strings': {
                        'type': 'boolean',
                        'default': false,
                        'description': nls.localize('vscode/editorOptions/quickSuggestions.strings', 'Enable quick suggestions inside strings.')
                    },
                    'comments': {
                        'type': 'boolean',
                        'default': false,
                        'description': nls.localize('vscode/editorOptions/quickSuggestions.comments', 'Enable quick suggestions inside comments.')
                    },
                    'other': {
                        'type': 'boolean',
                        'default': true,
                        'description': nls.localize('vscode/editorOptions/quickSuggestions.other', 'Enable quick suggestions outside of strings and comments.')
                    }
                }
            }
        ],
        'default': {
            'other': true,
            'comments': false,
            'strings': false
        },
        'description': nls.localize('vscode/editorOptions/quickSuggestions', 'Controls whether suggestions should automatically show up while typing.')
    },
    'editor.quickSuggestionsDelay': {
        'description': nls.localize('vscode/editorOptions/quickSuggestionsDelay', 'Controls the delay in milliseconds after which quick suggestions will show up.'),
        'type': 'integer',
        'default': 10,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.readOnly': {
        'description': nls.localize('theia/editor/readOnly', 'Controls whether the editor is readonly.'),
        'type': 'boolean',
        'default': false
    },
    'editor.rename.enablePreview': {
        'description': nls.localize('vscode/rename/enablePreview', 'Controls whether the editor should display refactor preview pane for rename.'),
        'type': 'boolean',
        'default': true
    },
    'editor.renderControlCharacters': {
        'description': nls.localize('vscode/editorOptions/renderControlCharacters', 'Controls whether the editor should render control characters.'),
        'type': 'boolean',
        'default': false
    },
    'editor.renderIndentGuides': {
        'description': nls.localize('vscode/editorOptions/editor.guides.indentation', 'Controls whether the editor should render indent guides.'),
        'type': 'boolean',
        'default': true
    },
    'editor.renderFinalNewline': {
        'description': nls.localize('vscode/editorOptions/renderFinalNewline', 'Render last line number when the file ends with a newline.'),
        'type': 'boolean',
        'default': true
    },
    'editor.renderLineHighlight': {
        'enumDescriptions': [
            '',
            '',
            '',
            nls.localize('vscode/editorOptions/renderLineHighlight.all', 'Highlights both the gutter and the current line.')
        ],
        'description': nls.localize('vscode/editorOptions/renderLineHighlight', 'Controls how the editor should render the current line highlight.'),
        'type': 'string',
        'enum': [
            'none',
            'gutter',
            'line',
            'all'
        ],
        'default': 'line'
    },
    'editor.renderLineHighlightOnlyWhenFocus': {
        'description': nls.localize('vscode/editorOptions/renderLineHighlightOnlyWhenFocus', 'Controls if the editor should render the current line highlight only when the editor is focused.'),
        'type': 'boolean',
        'default': false
    },
    'editor.renderValidationDecorations': {
        'description': nls.localize('theia/editor/renderValidationDecorations', 'Controls whether the editor renders validation decorations.'),
        'type': 'string',
        'enum': ['editable', 'on', 'off'],
        'default': 'editable'
    },
    'editor.renderWhitespace': {
        'enumDescriptions': [
            '',
            nls.localize('vscode/editorOptions/renderWhitespace.boundary', 'Render whitespace characters except for single spaces between words.'),
            nls.localize('vscode/editorOptions/renderWhitespace.selection', 'Render whitespace characters only on selected text.'),
            nls.localize('vscode/editorOptions/renderWhitespace.trailing', 'Render only trailing whitespace characters.'),
            ''
        ],
        'description': nls.localize('vscode/editorOptions/renderWhitespace', 'Controls how the editor should render whitespace characters.'),
        'type': 'string',
        'enum': [
            'none',
            'boundary',
            'selection',
            'trailin',
            'all'
        ],
        'default': 'none'
    },
    'editor.revealHorizontalRightPadding': {
        'description': nls.localize('theia/editor/revealHorizontalRightPadding', 'When revealing the cursor, a virtual padding (px) is added to the cursor, turning it into a rectangle. This virtual padding ensures that the cursor gets revealed before hitting the edge of the viewport.'),
        'type': 'integer',
        'default': 30,
        'minimum': 0,
        'maximum': 1000
    },
    'editor.roundedSelection': {
        'description': nls.localize('vscode/editorOptions/roundedSelection', 'Controls whether selections should have rounded corners.'),
        'type': 'boolean',
        'default': true
    },
    'editor.rulers': {
        'type': 'array',
        'items': {
            'type': 'number'
        },
        'default': [],
        'description': nls.localize('vscode/editorOptions/rulers', 'Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty.')
    },
    'editor.scrollBeyondLastColumn': {
        'description': nls.localize('vscode/editorOptions/scrollBeyondLastColumn', 'Controls the number of extra characters beyond which the editor will scroll horizontally.'),
        'type': 'integer',
        'default': 5,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.scrollBeyondLastLine': {
        'description': nls.localize('vscode/editorOptions/scrollBeyondLastLine', 'Controls whether the editor will scroll beyond the last line.'),
        'type': 'boolean',
        'default': true
    },
    'editor.scrollPredominantAxis': {
        'description': nls.localize('vscode/editorOptions/scrollPredominantAxis', 'Scroll only along the predominant axis when scrolling both vertically and horizontally at the same time. Prevents horizontal drift when scrolling vertically on a trackpad.'),
        'type': 'boolean',
        'default': true
    },
    'editor.selectionClipboard': {
        'description': nls.localize('vscode/editorOptions/selectionClipboard', 'Controls whether the Linux primary clipboard should be supported.'),
        'included': platform.isLinux,
        'type': 'boolean',
        'default': true
    },
    'editor.selectionHighlight': {
        'description': nls.localize('vscode/editorOptions/selectionHighlight', 'Controls whether the editor should highlight matches similar to the selection.'),
        'type': 'boolean',
        'default': true
    },
    'editor.selectOnLineNumbers': {
        'description': nls.localize('vscode/editorOptions/selectOnLineNumbers', 'Controls whether to select the corresponding line when clicking on the line number'),
        'type': 'boolean',
        'default': true
    },
    'editor.showFoldingControls': {
        'description': nls.localize('vscode/editorOptions/showFoldingControls', 'Controls whether the fold controls on the gutter are automatically hidden.'),
        'type': 'string',
        'enum': [
            'always',
            'mouseover'
        ],
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/showFoldingControls.always', 'Always show the folding controls.'),
            nls.localize('vscode/editorOptions/showFoldingControls.mouseover', 'Only show the folding controls when the mouse is over the gutter.'),
        ],
        'default': 'mouseover'
    },
    'editor.showUnused': {
        'description': nls.localize('vscode/editorOptions/showUnused', 'Controls fading out of unused code.'),
        'type': 'boolean',
        'default': true
    },
    'editor.showDeprecated': {
        'description': nls.localize('vscode/editorOptions/showDeprecated', 'Controls strikethrough deprecated variables.'),
        'type': 'boolean',
        'default': true
    },
    'editor.inlineHints.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/editor.inlayHints.enabled', 'Enables the inline hints in the editor.')
    },
    'editor.inlineHints.fontSize': {
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.fontSize,
        description: nls.localize('vscode/editorOptions/editor.inlayHints.fontSize', 'Controls font size of inline hints in the editor. When set to `0`, the 90% of `#editor.fontSize#` is used.')
    },
    'editor.inlineHints.fontFamily': {
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontFamily,
        'description': nls.localize('vscode/editorOptions/inlayHints.fontFamily', 'Controls font family of inline hints in the editor.')
    },
    'editor.snippetSuggestions': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/snippetSuggestions.top', 'Show snippet suggestions on top of other suggestions.'),
            nls.localize('vscode/editorOptions/snippetSuggestions.bottom', 'Show snippet suggestions below other suggestions.'),
            nls.localize('vscode/editorOptions/snippetSuggestions.inline', 'Show snippets suggestions with other suggestions.'),
            nls.localize('vscode/editorOptions/snippetSuggestions.none', 'Do not show snippet suggestions.')
        ],
        'description': nls.localize('vscode/editorOptions/snippetSuggestions', 'Controls whether snippets are shown with other suggestions and how they are sorted.'),
        'type': 'string',
        'enum': [
            'top',
            'bottom',
            'inline',
            'none'
        ],
        'default': 'inline'
    },
    'editor.smartSelect.selectLeadingAndTrailingWhitespace': {
        'description': nls.localize('vscode/editorOptions/selectLeadingAndTrailingWhitespace', 'Whether leading and trailing whitespace should always be selected.'),
        'default': true,
        'type': 'boolean'
    },
    'editor.smoothScrolling': {
        'description': nls.localize('vscode/editorOptions/smoothScrolling', 'Controls whether the editor will scroll using an animation.'),
        'type': 'boolean',
        'default': false
    },
    'editor.stickyTabStops': {
        'description': nls.localize('vscode/editorOptions/stickyTabStops', 'Emulate selection behaviour of tab characters when using spaces for indentation. Selection will stick to tab stops.'),
        'type': 'boolean',
        'default': false
    },
    'editor.stopRenderingLineAfter': {
        'description': nls.localize('theia/editor/stopRenderingLineAfter', 'Performance guard: Stop rendering a line after x characters.'),
        'type': 'integer',
        'default': 10000,
        'minimum': -1,
        'maximum': 1073741824
    },
    'editor.suggest.insertMode': {
        'type': 'string',
        'enum': [
            'insert',
            'replace'
        ],
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/suggest.insertMode.insert', 'Insert suggestion without overwriting text right of the cursor.'),
            nls.localize('vscode/editorOptions/suggest.insertMode.replace', 'Insert suggestion and overwrite text right of the cursor.')
        ],
        'default': 'insert',
        'description': nls.localize('vscode/editorOptions/suggest.insertMode', 'Controls whether words are overwritten when accepting completions. Note that this depends on extensions opting into this feature.')
    },
    'editor.suggest.insertHighlight': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('theia/editor/suggest.insertHighlight', 'Controls whether unexpected text modifications while accepting completions should be highlighted, e.g `insertMode` is `replace` but the completion only supports `insert`.')
    },
    'editor.suggest.filterGraceful': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/suggest.filterGraceful', 'Controls whether filtering and sorting suggestions accounts for small typos.')
    },
    'editor.suggest.localityBonus': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('vscode/editorOptions/suggest.localityBonus', 'Controls whether sorting favours words that appear close to the cursor.')
    },
    'editor.suggest.shareSuggestSelections': {
        'type': 'boolean',
        'default': false,
        'markdownDescription': nls.localize('vscode/editorOptions/suggest.shareSuggestSelections', 'Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`).')
    },
    'editor.suggest.snippetsPreventQuickSuggestions': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/suggest.snippetsPreventQuickSuggestions', 'Controls whether an active snippet prevents quick suggestions.')
    },
    'editor.suggest.showIcons': {
        'type': 'boolean',
        'default': true,
        'description': nls.localize('vscode/editorOptions/suggest.showIcons', 'Controls whether to show or hide icons in suggestions.')
    },
    'editor.suggest.maxVisibleSuggestions': {
        'type': 'number',
        'default': 12,
        'minimum': 1,
        'maximum': 15,
        'description': nls.localize('vscode/editorOptions/suggest.maxVisibleSuggestions.dep', 'Controls how many suggestions IntelliSense will show before showing a scrollbar (maximum 15).')
    },
    'editor.suggest.filteredTypes': {
        'type': 'object',
        'default': {},
        'deprecationMessage': nls.localize('vscode/editorOptions/deprecated', 'This setting is deprecated, please use separate settings like `editor.suggest.showKeywords` or `editor.suggest.showSnippets` instead.')
    },
    'editor.suggest.showMethods': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showMethods', 'When enabled IntelliSense shows `method`-suggestions.')
    },
    'editor.suggest.showFunctions': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showFunctions', 'When enabled IntelliSense shows `function`-suggestions.')
    },
    'editor.suggest.showConstructors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showConstructors', 'When enabled IntelliSense shows `constructor`-suggestions.')
    },
    'editor.suggest.showFields': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showFields', 'When enabled IntelliSense shows `field`-suggestions.')
    },
    'editor.suggest.showVariables': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showVariables', 'When enabled IntelliSense shows `variable`-suggestions.')
    },
    'editor.suggest.showClasses': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showClasss', 'When enabled IntelliSense shows `class`-suggestions.')
    },
    'editor.suggest.showStructs': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showStructs', 'When enabled IntelliSense shows `struct`-suggestions.')
    },
    'editor.suggest.showInterfaces': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showInterfaces', 'When enabled IntelliSense shows `interface`-suggestions.')
    },
    'editor.suggest.showModules': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showModules', 'When enabled IntelliSense shows `module`-suggestions.')
    },
    'editor.suggest.showProperties': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showPropertys', 'When enabled IntelliSense shows `property`-suggestions.')
    },
    'editor.suggest.showEvents': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showEvents', 'When enabled IntelliSense shows `event`-suggestions.')
    },
    'editor.suggest.showOperators': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showOperators', 'When enabled IntelliSense shows `operator`-suggestions.')
    },
    'editor.suggest.showUnits': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showUnits', 'When enabled IntelliSense shows `unit`-suggestions.')
    },
    'editor.suggest.showValues': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showValues', 'When enabled IntelliSense shows `value`-suggestions.')
    },
    'editor.suggest.showConstants': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showConstants', 'When enabled IntelliSense shows `constant`-suggestions.')
    },
    'editor.suggest.showEnums': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showEnums', 'When enabled IntelliSense shows `enum`-suggestions.')
    },
    'editor.suggest.showEnumMembers': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showEnumMembers', 'When enabled IntelliSense shows `enumMember`-suggestions.')
    },
    'editor.suggest.showKeywords': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showKeywords', 'When enabled IntelliSense shows `keyword`-suggestions.')
    },
    'editor.suggest.showWords': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showTexts', 'When enabled IntelliSense shows `text`-suggestions.')
    },
    'editor.suggest.showColors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showColors', 'When enabled IntelliSense shows `color`-suggestions.')
    },
    'editor.suggest.showFiles': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showFiles', 'When enabled IntelliSense shows `file`-suggestions.')
    },
    'editor.suggest.showReferences': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showReferences', 'When enabled IntelliSense shows `reference`-suggestions.')
    },
    'editor.suggest.showCustomcolors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showCustomcolors', 'When enabled IntelliSense shows `customcolor`-suggestions.')
    },
    'editor.suggest.showFolders': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/ineditor.suggest.showFolderssertSpaces', 'When enabled IntelliSense shows `folder`-suggestions.')
    },
    'editor.suggest.showTypeParameters': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showTypeParameters', 'When enabled IntelliSense shows `typeParameter`-suggestions.')
    },
    'editor.suggest.showSnippets': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/editor.suggest.showSnippets', 'When enabled IntelliSense shows `snippet`-suggestions.')
    },
    'editor.suggest.hideStatusBar': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localize('vscode/editorOptions/suggest.showStatusBar', 'Controls the visibility of the status bar at the bottom of the suggest widget.')
    },
    'editor.suggestFontSize': {
        'markdownDescription': nls.localize('vscode/editorOptions/suggestFontSize', 'Font size for the suggest widget. When set to `0`, the value of `#editor.fontSize#` is used.'),
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1000
    },
    'editor.suggestLineHeight': {
        'markdownDescription': nls.localize('vscode/editorOptions/suggestLineHeight', 'Line height for the suggest widget. When set to `0`, the value of `#editor.lineHeight#` is used.'),
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1000
    },
    'editor.suggestOnTriggerCharacters': {
        'description': nls.localize('vscode/editorOptions/suggestOnTriggerCharacters', 'Controls whether suggestions should automatically show up when typing trigger characters.'),
        'type': 'boolean',
        'default': true
    },
    'editor.suggestSelection': {
        'markdownEnumDescriptions': [
            nls.localize('vscode/editorOptions/suggestSelection.first', 'Always select the first suggestion.'),
            nls.localize('vscode/editorOptions/suggestSelection.recentlyUsed', 'Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently.'),
            nls.localize('vscode/editorOptions/suggestSelection.recentlyUsedByPrefix', 'Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`.')
        ],
        'description': nls.localize('vscode/editorOptions/suggestSelection', 'Controls how suggestions are pre-selected when showing the suggest list.'),
        'type': 'string',
        'enum': [
            'first',
            'recentlyUsed',
            'recentlyUsedByPrefix'
        ],
        'default': 'recentlyUsed'
    },
    'editor.tabCompletion': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/tabCompletion.on', 'Tab complete will insert the best matching suggestion when pressing tab.'),
            nls.localize('vscode/editorOptions/tabCompletion.off', 'Disable tab completions.'),
            nls.localize('vscode/editorOptions/tabCompletion.onlySnippets', 'Tab complete snippets when their prefix match. Works best when `quickSuggestions` aren\'t enabled.')
        ],
        'description': nls.localize('vscode/editorOptions/tabCompletion', 'Enables tab completions.'),
        'type': 'string',
        'enum': [
            'on',
            'off',
            'onlySnippets'
        ],
        'default': 'off'
    },
    'editor.tabIndex': {
        'markdownDescription': nls.localize('theia/editor/tabIndex', 'Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.'),
        'type': 'integer',
        'default': 0,
        'minimum': -1,
        'maximum': 1073741824
    },
    'editor.unusualLineTerminators': {
        'markdownEnumDescriptions': [
            nls.localize('unusualLineTerminators.auto', 'Unusual line terminators are automatically removed.'),
            nls.localize('unusualLineTerminators.off', 'Unusual line terminators are ignored.'),
            nls.localize('unusualLineTerminators.prompt', 'Unusual line terminators prompt to be removed.')
        ],
        'description': nls.localize('vscode/editorOptions/unusualLineTerminators', 'Remove unusual line terminators that might cause problems.'),
        'type': 'string',
        'enum': ['auto', 'off', 'prompt'],
        'default': 'prompt'
    },
    'editor.useTabStops': {
        'description': nls.localize('vscode/editorOptions/useTabStops', 'Inserting and deleting whitespace follows tab stops.'),
        'type': 'boolean',
        'default': true
    },
    'editor.wordSeparators': {
        'description': nls.localize('vscode/editorOptions/wordSeparators', 'Characters that will be used as word separators when doing word related navigations or operations.'),
        'type': 'string',
        'default': DEFAULT_WORD_SEPARATORS
    },
    'editor.wordWrap': {
        'markdownEnumDescriptions': [
            nls.localize('vscode/editorOptions/wordWrap.off', 'Lines will never wrap.'),
            nls.localize('vscode/editorOptions/wordWrap.on', 'Lines will wrap at the viewport width.'),
            nls.localize('vscode/editorOptions/wordWrap.wordWrapColumn', 'Lines will wrap at `#editor.wordWrapColumn#`.'),
            nls.localize('vscode/editorOptions/wordWrap.bounded', 'Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`.')
        ],
        'description': nls.localize('vscode/editorOptions/wordWrap', 'Controls how lines should wrap.'),
        'type': 'string',
        'enum': [
            'off',
            'on',
            'wordWrapColumn',
            'bounded'
        ],
        'default': 'off'
    },
    'editor.wordWrapBreakAfterCharacters': {
        'description': nls.localize('theia/editor/wordWrapBreakAfterCharacters', 'Configure word wrapping characters. A break will be introduced after these characters.'),
        'type': 'string',
        'default': ' \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣',
    },
    'editor.wordWrapBreakBeforeCharacters': {
        'description': nls.localize('theia/editor/wordWrapBreakBeforeCharacters', 'Configure word wrapping characters. A break will be introduced before these characters.'),
        'type': 'string',
        'default': '([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋',
    },
    'editor.wordWrapColumn': {
        'markdownDescription': nls.localize('vscode/editorOptions/wordWrapColumn', 'Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.'),
        'type': 'integer',
        'default': 80,
        'minimum': 1,
        'maximum': 1073741824
    },
    'editor.wordWrapOverride1': {
        'markdownDescription': nls.localize('theia/editor/wordWrapOverride1', 'Override the `wordWrap` setting.'),
        'type': 'string',
        'enum': ['off', 'on', 'inherit'],
        'default': 'inherit'
    },
    'editor.wordWrapOverride2': {
        'markdownDescription': nls.localize('theia/editor/wordWrapOverride2', 'Override the `wordWrapOverride1` setting.'),
        'type': 'string',
        'enum': ['off', 'on', 'inherit'],
        'default': 'inherit'
    },
    'editor.wrappingIndent': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/wrappingIndent.none', 'No indentation. Wrapped lines begin at column 1.'),
            nls.localize('vscode/editorOptions/wrappingIndent.same', 'Wrapped lines get the same indentation as the parent.'),
            nls.localize('vscode/editorOptions/wrappingIndent.indent', 'Wrapped lines get +1 indentation toward the parent.'),
            nls.localize('vscode/editorOptions/wrappingIndent.deepIndent', 'Wrapped lines get +2 indentation toward the parent.')
        ],
        'description': nls.localize('vscode/editorOptions/wrappingIndent', 'Controls the indentation of wrapped lines.'),
        'type': 'string',
        'enum': [
            'none',
            'same',
            'indent',
            'deepIndent'
        ],
        'default': 'same'
    },
    'editor.wrappingStrategy': {
        'enumDescriptions': [
            nls.localize('vscode/editorOptions/wrappingStrategy.simple', 'Assumes that all characters are of the same width. This is a fast algorithm that works correctly for monospace fonts and certain scripts (like Latin characters) where glyphs are of equal width.'),
            nls.localize('vscode/editorOptions/wrappingStrategy.advanced', 'Delegates wrapping points computation to the browser. This is a slow algorithm, that might cause freezes for large files, but it works correctly in all cases.')
        ],
        'description': nls.localize('vscode/editorOptions/wrappingStrategy', 'Controls the algorithm that computes wrapping points.'),
        'type': 'string',
        'enum': [
            'simple',
            'advanced'
        ],
        'default': 'simple'
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
            'description': nls.localize('vscode/files.contribution/autoSave', 'Controls auto save of dirty files.'),
            overridable: false
        },
        'editor.autoSaveDelay': {
            'type': 'number',
            'default': 500,
            'description': nls.localize('vscode/files.contribution/autoSaveDelay', 'Configure the auto save delay in milliseconds.'),
            overridable: false
        },
        'editor.formatOnSave': {
            'type': 'boolean',
            'default': false,
            'description': nls.localize('vscode/files.contribution/formatOnSave', 'Enable format on manual save.')
        },
        'editor.formatOnSaveTimeout': {
            'type': 'number',
            'default': 750,
            'description': nls.localize('theia/editor/formatOnSaveTimeout', 'Timeout in milliseconds after which the formatting that is run on file save is cancelled.')
        },
        'editor.history.persistClosedEditors': {
            'type': 'boolean',
            'default': false,
            'description': nls.localize('theia/editor/persistClosedEditors', 'Controls whether to persist closed editor history for the workspace across window reloads.')
        },
        'files.eol': {
            'type': 'string',
            'enum': [
                '\n',
                '\r\n',
                'auto'
            ],
            'enumDescriptions': [
                nls.localize('vscode/files.contribution/eol.LF', 'LF'),
                nls.localize('vscode/files.contribution/eol.CRLF', 'CRLF'),
                nls.localize('vscode/files.contribution/eol.auto', 'Uses operating system specific end of line character.')
            ],
            'default': 'auto',
            'description': nls.localize('vscode/files.contribution/eol', 'The default end of line character.')
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
    'editor.history.persistClosedEditors': boolean
    'files.eol': EndOfLinePreference
}
export type EndOfLinePreference = '\n' | '\r\n' | 'auto';

export type EditorPreferenceChange = PreferenceChangeEvent<EditorConfiguration>;

export const EditorPreferenceContribution = Symbol('EditorPreferenceContribution');
export const EditorPreferences = Symbol('EditorPreferences');
export type EditorPreferences = PreferenceProxy<EditorConfiguration>;

export function createEditorPreferences(preferences: PreferenceService, schema: PreferenceSchema = editorPreferenceSchema): EditorPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindEditorPreferences(bind: interfaces.Bind): void {
    bind(EditorPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(EditorPreferenceContribution);
        return createEditorPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(EditorPreferenceContribution).toConstantValue({ schema: editorPreferenceSchema });
    bind(PreferenceContribution).toService(EditorPreferenceContribution);
}
