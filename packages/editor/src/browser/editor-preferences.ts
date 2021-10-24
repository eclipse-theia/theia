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
        'markdownDescription': nls.localizeByDefault('The number of spaces a tab is equal to. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.')
    },
    'editor.defaultFormatter': {
        'type': 'string',
        'default': null,
        'description': 'Default formatter.'
    },
    'editor.insertSpaces': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.insertSpaces,
        'markdownDescription': nls.localizeByDefault('Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.')
    },
    'editor.detectIndentation': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.detectIndentation,
        'markdownDescription': nls.localizeByDefault('Controls whether `#editor.tabSize#` and `#editor.insertSpaces#` will be automatically detected when a file is opened based on the file contents.')
    },
    'editor.trimAutoWhitespace': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
        'description': nls.localizeByDefault('Remove trailing auto inserted whitespace.')
    },
    'editor.largeFileOptimizations': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
        'description': nls.localizeByDefault('Special handling for large files to disable certain memory intensive features.')
    },
    'editor.wordBasedSuggestions': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether completions should be computed based on words in the document.')
    },
    'editor.wordBasedSuggestionsMode': {
        'enum': ['currentDocument', 'matchingDocuments', 'allDocuments'],
        'default': 'matchingDocuments',
        'enumDescriptions': [
            nls.localizeByDefault('Only suggest words from the active document.'),
            nls.localizeByDefault('Suggest words from all open documents of the same language.'),
            nls.localizeByDefault('Suggest words from all open documents.')
        ],
        'description': nls.localizeByDefault('Controls form what documents word based completions are computed.')
    },
    'editor.semanticHighlighting.enabled': {
        'enum': [true, false, 'configuredByTheme'],
        'enumDescriptions': [
            nls.localizeByDefault('Semantic highlighting enabled for all color themes.'),
            nls.localizeByDefault('Semantic highlighting disabled for all color themes.'),
            nls.localizeByDefault('Semantic highlighting is configured by the current color theme\'s `semanticHighlighting` setting.')
        ],
        'default': 'configuredByTheme',
        'description': nls.localizeByDefault('Controls whether the semanticHighlighting is shown for the languages that support it.')
    },
    'editor.stablePeek': {
        'type': 'boolean',
        'default': false,
        'markdownDescription': nls.localizeByDefault('Keep peek editors open even when double clicking their content or when hitting `Escape`.')
    },
    'editor.maxTokenizationLineLength': {
        'type': 'integer',
        'default': 400,
        'description': nls.localizeByDefault('Lines above this length will not be tokenized for performance reasons')
    },
    'diffEditor.maxComputationTime': {
        'type': 'number',
        'default': 5000,
        'description': nls.localizeByDefault('Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout.')
    },
    'diffEditor.renderSideBySide': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether the diff editor shows the diff side by side or inline.')
    },
    'diffEditor.ignoreTrimWhitespace': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('When enabled, the diff editor ignores changes in leading or trailing whitespace.')
    },
    'diffEditor.renderIndicators': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether the diff editor shows +/- indicators for added/removed changes.')
    },
    'diffEditor.codeLens': {
        'type': 'boolean',
        'default': false,
        'description': nls.localizeByDefault('Controls whether the editor shows CodeLens.')
    },
    'diffEditor.wordWrap': {
        'type': 'string',
        'enum': ['off', 'on', 'inherit'],
        'default': 'inherit',
        'markdownEnumDescriptions': [
            nls.localizeByDefault('Lines will never wrap.'),
            nls.localizeByDefault('Lines will wrap at the viewport width.'),
            nls.localizeByDefault('Lines will wrap according to the `#editor.wordWrap#` setting.')
        ]
    },
    'editor.acceptSuggestionOnCommitCharacter': {
        'markdownDescription': nls.localizeByDefault('Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.'),
        'type': 'boolean',
        'default': true
    },
    'editor.acceptSuggestionOnEnter': {
        'markdownEnumDescriptions': [
            '',
            nls.localizeByDefault('Only accept a suggestion with `Enter` when it makes a textual change.'),
            ''
        ],
        'markdownDescription': nls.localizeByDefault('Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions.'),
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
            nls.localizeByDefault('The editor will use platform APIs to detect when a Screen Reader is attached.'),
            nls.localizeByDefault('The editor will be permanently optimized for usage with a Screen Reader. Word wrapping will be disabled.'),
            nls.localizeByDefault('The editor will never be optimized for usage with a Screen Reader.')
        ],
        'default': 'auto',
        'description': nls.localizeByDefault('Controls whether the editor should run in a mode where it is optimized for screen readers. Setting to on will disable word wrapping.')
    },
    'editor.accessibilityPageSize': {
        'description': nls.localizeByDefault('Controls the number of lines in the editor that can be read out by a screen reader. Warning: this has a performance implication for numbers larger than the default.'),
        'type': 'integer',
        'default': 10,
        'minimum': 1,
        'maximum': 1073741824
    },
    'editor.autoClosingBrackets': {
        'enumDescriptions': [
            '',
            nls.localizeByDefault('Use language configurations to determine when to autoclose brackets.'),
            nls.localizeByDefault('Autoclose brackets only when the cursor is to the left of whitespace.'),
            ''
        ],
        'description': nls.localizeByDefault('Controls whether the editor should automatically close brackets after the user adds an opening bracket.'),
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
            nls.localizeByDefault('Type over closing quotes or brackets only if they were automatically inserted.'),
            ''
        ],
        'description': nls.localizeByDefault('Controls whether the editor should type over closing quotes or brackets.'),
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
            nls.localizeByDefault('Use language configurations to determine when to autoclose quotes.'),
            nls.localizeByDefault('Autoclose quotes only when the cursor is to the left of whitespace.'),
            ''
        ],
        'description': nls.localizeByDefault('Controls whether the editor should automatically close quotes after the user adds an opening quote.'),
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
            nls.localizeByDefault('The editor will not insert indentation automatically.'),
            nls.localizeByDefault('The editor will keep the current line\'s indentation.'),
            nls.localizeByDefault('The editor will keep the current line\'s indentation and honor language defined brackets.'),
            nls.localizeByDefault('The editor will keep the current line\'s indentation, honor language defined brackets and invoke special onEnterRules defined by languages.'),
            nls.localizeByDefault('The editor will keep the current line\'s indentation, honor language defined brackets, invoke special onEnterRules defined by languages, and honor indentationRules defined by languages.')
        ],
        'description': nls.localizeByDefault('Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.'),
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
            nls.localizeByDefault('Use language configurations to determine when to automatically surround selections.'),
            nls.localizeByDefault('Surround with quotes but not brackets.'),
            nls.localizeByDefault('Surround with brackets but not quotes.'),
            ''
        ],
        'description': nls.localizeByDefault('Controls whether the editor should automatically surround selections when typing quotes or brackets.'),
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
        'description': nls.localizeByDefault('Controls whether the editor shows CodeLens.'),
        'type': 'boolean',
        'default': true
    },
    'editor.codeLensFontFamily': {
        'description': nls.localizeByDefault('Controls the font family for CodeLens.'),
        'type': 'string',
        'default': true
    },
    'editor.codeLensFontSize': {
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 100,
        'description': nls.localizeByDefault('Controls the font size in pixels for CodeLens. When set to `0`, the 90% of `#editor.fontSize#` is used.')
    },
    'editor.colorDecorators': {
        'description': nls.localizeByDefault('Controls whether the editor should render the inline color decorators and color picker.'),
        'type': 'boolean',
        'default': true
    },
    'editor.comments.insertSpace': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether a space character is inserted when commenting.')
    },
    'editor.comments.ignoreEmptyLines': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls if empty lines should be ignored with toggle, add or remove actions for line comments.')
    },
    'editor.contextmenu': {
        'description': nls.localize('theia/editor/contextmenu', 'Controls whether to enable the custom contextmenu.'),
        'type': 'boolean',
        'default': true,
    },
    'editor.copyWithSyntaxHighlighting': {
        'description': nls.localizeByDefault('Controls whether syntax highlighting should be copied into the clipboard.'),
        'type': 'boolean',
        'default': true
    },
    'editor.cursorBlinking': {
        'description': nls.localizeByDefault('Control the cursor animation style.'),
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
        'description': nls.localizeByDefault('Controls whether the smooth caret animation should be enabled.'),
        'type': 'boolean',
        'default': false
    },
    'editor.cursorStyle': {
        'description': nls.localizeByDefault('Controls the cursor style.'),
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
        'description': nls.localizeByDefault("Controls the minimal number of visible leading and trailing lines surrounding the cursor. Known as 'scrollOff' or 'scrollOffset' in some other editors."),
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.cursorSurroundingLinesStyle': {
        'enumDescriptions': [
            nls.localizeByDefault('`cursorSurroundingLines` is enforced only when triggered via the keyboard or API.'),
            nls.localizeByDefault('`cursorSurroundingLines` is enforced always.')
        ],
        'description': nls.localizeByDefault('Controls when `cursorSurroundingLines` should be enforced.'),
        'type': 'string',
        'enum': [
            'default',
            'all'
        ],
        'default': 'default'
    },
    'editor.cursorWidth': {
        'markdownDescription': nls.localizeByDefault('Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`.'),
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
        'description': nls.localizeByDefault('Controls whether the editor should allow moving selections via drag and drop.'),
        'type': 'boolean',
        'default': true
    },
    'editor.emptySelectionClipboard': {
        'description': nls.localizeByDefault('Controls whether copying without a selection copies the current line.'),
        'type': 'boolean',
        'default': true
    },
    'editor.extraEditorClassName': {
        'description': nls.localize('theia/editor/extraEditorClassName', 'Additional class name to be added to the editor.'),
        'type': 'string',
        'default': ''
    },
    'editor.fastScrollSensitivity': {
        'markdownDescription': nls.localizeByDefault('Scrolling speed multiplier when pressing `Alt`.'),
        'type': 'number',
        'default': 5
    },
    'editor.find.cursorMoveOnType': {
        'description': nls.localizeByDefault('Controls whether the cursor should jump to find matches while typing.'),
        'type': 'boolean',
        'default': true
    },
    'editor.find.seedSearchStringFromSelection': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether the search string in the Find Widget is seeded from the editor selection.')
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
            nls.localizeByDefault('Never turn on Find in selection automatically (default)'),
            nls.localizeByDefault('Always turn on Find in selection automatically'),
            nls.localizeByDefault('Turn on Find in selection automatically when multiple lines of content are selected.')
        ],
        'description': nls.localizeByDefault('Controls the condition for turning on find in selection automatically.')
    },
    'editor.find.globalFindClipboard': {
        'type': 'boolean',
        'default': false,
        'description': nls.localizeByDefault('Controls whether the Find Widget should read or modify the shared find clipboard on macOS.'),
        'included': isOSX
    },
    'editor.find.addExtraSpaceOnTop': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.')
    },
    'editor.find.loop': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether the search automatically restarts from the beginning (or the end) when no further matches can be found.')
    },
    'editor.fixedOverflowWidgets': {
        'markdownDescription': nls.localize('theia/editor/fixedOverflowWidgets', 'Controls whether to display overflow widgets as `fixed`.'),
        'type': 'boolean',
        'default': false,
    },
    'editor.folding': {
        'description': nls.localizeByDefault('Controls whether the editor has code folding enabled.'),
        'type': 'boolean',
        'default': true
    },
    'editor.foldingStrategy': {
        'markdownDescription': nls.localizeByDefault('Controls the strategy for computing folding ranges.'),
        'type': 'string',
        'enum': [
            'auto',
            'indentation'
        ],
        'enumDescriptions': [
            nls.localizeByDefault('Use a language-specific folding strategy if available, else the indentation-based one.'),
            nls.localizeByDefault('Use the indentation-based folding strategy.'),
        ],
        'default': 'auto'
    },
    'editor.foldingHighlight': {
        'description': nls.localizeByDefault('Controls whether the editor should highlight folded ranges.'),
        'type': 'boolean',
        'default': true
    },
    'editor.unfoldOnClickAfterEndOfLine': {
        'description': nls.localizeByDefault('Controls whether clicking on the empty content after a folded line will unfold the line.'),
        'type': 'boolean',
        'default': false
    },
    'editor.fontFamily': {
        'description': nls.localizeByDefault('Controls the font family.'),
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontFamily
    },
    'editor.fontLigatures': {
        'anyOf': [
            {
                'type': 'boolean',
                'description': nls.localizeByDefault("Enables/Disables font ligatures ('calt' and 'liga' font features). Change this to a string for fine-grained control of the 'font-feature-settings' CSS property.")
            },
            {
                'type': 'string',
                'description': nls.localizeByDefault("Explicit 'font-feature-settings' CSS property. A boolean can be passed instead if one only needs to turn on/off ligatures.")
            }
        ],
        'description': nls.localizeByDefault("Configures font ligatures or font features. Can be either a boolean to enable/disable ligatures or a string for the value of the CSS 'font-feature-settings' property."),
        'default': false
    },
    'editor.fontSize': {
        'type': 'number',
        'minimum': 6,
        'maximum': 100,
        'default': EDITOR_FONT_DEFAULTS.fontSize,
        'description': nls.localizeByDefault('Controls the font size in pixels.')
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
        'description': nls.localizeByDefault('Controls the font weight. Accepts \"normal\" and \"bold\" keywords or numbers between 1 and 1000.'),
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontWeight
    },
    'editor.formatOnPaste': {
        'description': nls.localizeByDefault('Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.'),
        'type': 'boolean',
        'default': false
    },
    'editor.formatOnType': {
        'description': nls.localizeByDefault('Controls whether the editor should automatically format the line after typing.'),
        'type': 'boolean',
        'default': false
    },
    'editor.glyphMargin': {
        'description': nls.localizeByDefault('Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.'),
        'type': 'boolean',
        'default': true
    },
    'editor.gotoLocation.multiple': {
        'type': 'string',
        'default': '',
        'deprecationMessage': nls.localizeByDefault("This setting is deprecated, please use separate settings like 'editor.editor.gotoLocation.multipleDefinitions' or 'editor.editor.gotoLocation.multipleImplementations' instead.")
    },
    'editor.gotoLocation.multipleDefinitions': {
        'description': nls.localizeByDefault("Controls the behavior the 'Go to Definition'-command when multiple target locations exist."),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localizeByDefault('Show peek view of the results (default)'),
            nls.localizeByDefault('Go to the primary result and show a peek view'),
            nls.localizeByDefault('Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleTypeDefinitions': {
        'description': nls.localizeByDefault("Controls the behavior the 'Go to Type Definition'-command when multiple target locations exist."),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localizeByDefault('Show peek view of the results (default)'),
            nls.localizeByDefault('Go to the primary result and show a peek view'),
            nls.localizeByDefault('Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleDeclarations': {
        'description': nls.localizeByDefault("Controls the behavior the 'Go to Declaration'-command when multiple target locations exist."),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localizeByDefault('Show peek view of the results (default)'),
            nls.localizeByDefault('Go to the primary result and show a peek view'),
            nls.localizeByDefault('Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleImplementations': {
        'description': nls.localizeByDefault("Controls the behavior the 'Go to Implementations'-command when multiple target locations exist."),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localizeByDefault('Show peek view of the results (default)'),
            nls.localizeByDefault('Go to the primary result and show a peek view'),
            nls.localizeByDefault('Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.multipleReferences': {
        'description': nls.localizeByDefault("Controls the behavior the 'Go to References'-command when multiple target locations exist."),
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            nls.localizeByDefault('Show peek view of the results (default)'),
            nls.localizeByDefault('Go to the primary result and show a peek view'),
            nls.localizeByDefault('Go to the primary result and enable peek-less navigation to others')
        ]
    },
    'editor.gotoLocation.alternativeDefinitionCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Definition' is the current location.")
    },
    'editor.gotoLocation.alternativeTypeDefinitionCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Type Definition' is the current location.")
    },
    'editor.gotoLocation.alternativeDeclarationCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Declaration' is the current location.")
    },
    'editor.gotoLocation.alternativeImplementationCommand': {
        'type': 'string',
        'default': '',
        'description': nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Implementation' is the current location.")
    },
    'editor.gotoLocation.alternativeReferenceCommand': {
        'type': 'string',
        'default': '',
        'description': nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Reference' is the current location.")
    },
    'editor.hideCursorInOverviewRuler': {
        'description': nls.localizeByDefault('Controls whether the cursor should be hidden in the overview ruler.'),
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
        'description': nls.localizeByDefault('Controls whether the hover is shown.')
    },
    'editor.hover.delay': {
        'type': 'number',
        'default': 300,
        'description': nls.localizeByDefault('Controls the delay in milliseconds after which the hover is shown.')
    },
    'editor.hover.sticky': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether the hover should remain visible when mouse is moved over it.')
    },
    'editor.inDiffEditor': {
        'type': 'boolean',
        'default': true,
    },
    'editor.letterSpacing': {
        'description': nls.localizeByDefault('Controls the letter spacing in pixels.'),
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.letterSpacing
    },
    'editor.lightbulb.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Enables the code action lightbulb in the editor.')
    },
    'editor.lineHeight': {
        'description': nls.localizeByDefault('Controls the line height. Use 0 to compute the line height from the font size.'),
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
            nls.localizeByDefault('Line numbers are not rendered.'),
            nls.localizeByDefault('Line numbers are rendered as absolute number.'),
            nls.localizeByDefault('Line numbers are rendered as distance in lines to cursor position.'),
            nls.localizeByDefault('Line numbers are rendered every 10 lines.')
        ],
        'default': 'on',
        'description': nls.localizeByDefault('Controls the display of line numbers.')
    },
    'editor.lineNumbersMinChars': {
        'description': nls.localize('theia/editor/lineNumbersMinChars', 'Controls the line height. Use 0 to compute the line height from the font size.'),
        'type': 'integer',
        'default': 5,
        'minimum': 1,
        'maximum': 300
    },
    'editor.linkedEditing': {
        'description': nls.localizeByDefault('Controls whether the editor has linked editing enabled. Depending on the language, related symbols, e.g. HTML tags, are updated while editing.'),
        'type': 'boolean',
        'default': false
    },
    'editor.links': {
        'description': nls.localizeByDefault('Controls whether the editor should detect links and make them clickable.'),
        'type': 'boolean',
        'default': true
    },
    'editor.matchBrackets': {
        'description': nls.localizeByDefault('Highlight matching brackets.'),
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
        'description': nls.localizeByDefault('Controls whether the minimap is shown.')
    },
    'editor.minimap.side': {
        'type': 'string',
        'enum': [
            'left',
            'right'
        ],
        'default': 'right',
        'description': nls.localizeByDefault('Controls the side where to render the minimap.')
    },
    'editor.minimap.showSlider': {
        'type': 'string',
        'enum': [
            'always',
            'mouseover'
        ],
        'default': 'mouseover',
        'description': nls.localizeByDefault('Controls when the minimap slider is shown.')
    },
    'editor.minimap.scale': {
        'type': 'number',
        'default': 1,
        'minimum': 1,
        'maximum': 3,
        'description': nls.localizeByDefault('Scale of content drawn in the minimap: 1, 2 or 3.')
    },
    'editor.minimap.renderCharacters': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Render the actual characters on a line as opposed to color blocks.')
    },
    'editor.minimap.maxColumn': {
        'type': 'number',
        'default': 120,
        'description': nls.localizeByDefault('Limit the width of the minimap to render at most a certain number of columns.')
    },
    'editor.mouseStyle': {
        'description': nls.localize('theia/editor/mouseStyle', 'Controls the mouse pointer style.'),
        'type': 'string',
        'enum': ['text', 'default', 'copy'],
        'default': 'text'
    },
    'editor.mouseWheelScrollSensitivity': {
        'markdownDescription': nls.localizeByDefault('A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.'),
        'type': 'number',
        'default': 1
    },
    'editor.mouseWheelZoom': {
        'markdownDescription': nls.localizeByDefault('Zoom the font of the editor when using mouse wheel and holding `Ctrl`.'),
        'type': 'boolean',
        'default': false
    },
    'editor.multiCursorMergeOverlapping': {
        'description': nls.localizeByDefault('Merge multiple cursors when they are overlapping.'),
        'type': 'boolean',
        'default': true
    },
    'editor.multiCursorModifier': {
        'markdownEnumDescriptions': [
            nls.localizeByDefault('Maps to `Control` on Windows and Linux and to `Command` on macOS.'),
            nls.localizeByDefault('Maps to `Alt` on Windows and Linux and to `Option` on macOS.')
        ],
        'markdownDescription': nls.localizeByDefault('The modifier to be used to add multiple cursors with the mouse. The Go To Definition and Open Link mouse gestures will adapt such that they do not conflict with the multicursor modifier. [Read more](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier).'),
        'type': 'string',
        'enum': [
            'ctrlCmd',
            'alt'
        ],
        'default': 'alt'
    },
    'editor.multiCursorPaste': {
        'markdownEnumDescriptions': [
            nls.localizeByDefault('Each cursor pastes a single line of the text.'),
            nls.localizeByDefault('Each cursor pastes the full text.')
        ],
        'markdownDescription': nls.localizeByDefault('Controls pasting when the line count of the pasted text matches the cursor count.'),
        'type': 'string',
        'enum': [
            'spread',
            'full'
        ],
        'default': 'spread'
    },
    'editor.occurrencesHighlight': {
        'description': nls.localizeByDefault('Controls whether the editor should highlight semantic symbol occurrences.'),
        'type': 'boolean',
        'default': true
    },
    'editor.overviewRulerBorder': {
        'description': nls.localizeByDefault('Controls whether a border should be drawn around the overview ruler.'),
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
        'description': nls.localizeByDefault('Controls the amount of space between the top edge of the editor and the first line.')
    },
    'editor.padding.bottom': {
        'type': 'number',
        'default': 0,
        'minimum': 0,
        'maximum': 1000,
        'description': nls.localizeByDefault('Controls the amount of space between the bottom edge of the editor and the last line.')
    },
    'editor.parameterHints.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Enables a pop-up that shows parameter documentation and type information as you type.')
    },
    'editor.parameterHints.cycle': {
        'type': 'boolean',
        'default': false,
        'description': nls.localizeByDefault('Controls whether the parameter hints menu cycles or closes when reaching the end of the list.')
    },
    'editor.peekWidgetDefaultFocus': {
        'enumDescriptions': [
            nls.localizeByDefault('Focus the tree when opening peek'),
            nls.localizeByDefault('Focus the editor when opening peek')
        ],
        'description': nls.localizeByDefault('Controls whether to focus the inline editor or the tree in the peek widget.'),
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
        'description': nls.localizeByDefault('Controls whether the Go to Definition mouse gesture always opens the peek widget.')
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
                        'description': nls.localizeByDefault('Enable quick suggestions inside strings.')
                    },
                    'comments': {
                        'type': 'boolean',
                        'default': false,
                        'description': nls.localizeByDefault('Enable quick suggestions inside comments.')
                    },
                    'other': {
                        'type': 'boolean',
                        'default': true,
                        'description': nls.localizeByDefault('Enable quick suggestions outside of strings and comments.')
                    }
                }
            }
        ],
        'default': {
            'other': true,
            'comments': false,
            'strings': false
        },
        'description': nls.localizeByDefault('Controls whether suggestions should automatically show up while typing.')
    },
    'editor.quickSuggestionsDelay': {
        'description': nls.localizeByDefault('Controls the delay in milliseconds after which quick suggestions will show up.'),
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
        'description': nls.localizeByDefault('Enable/disable the ability to preview changes before renaming'),
        'type': 'boolean',
        'default': true
    },
    'editor.renderControlCharacters': {
        'description': nls.localizeByDefault('Controls whether the editor should render control characters.'),
        'type': 'boolean',
        'default': false
    },
    'editor.renderIndentGuides': {
        'description': nls.localizeByDefault('Controls whether the editor should render indent guides.'),
        'type': 'boolean',
        'default': true
    },
    'editor.renderFinalNewline': {
        'description': nls.localizeByDefault('Render last line number when the file ends with a newline.'),
        'type': 'boolean',
        'default': true
    },
    'editor.renderLineHighlight': {
        'enumDescriptions': [
            '',
            '',
            '',
            nls.localizeByDefault('Highlights both the gutter and the current line.')
        ],
        'description': nls.localizeByDefault('Controls how the editor should render the current line highlight.'),
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
        'description': nls.localizeByDefault('Controls if the editor should render the current line highlight only when the editor is focused'),
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
            nls.localizeByDefault('Render whitespace characters except for single spaces between words.'),
            nls.localizeByDefault('Render whitespace characters only on selected text.'),
            nls.localizeByDefault('Render only trailing whitespace characters'),
            ''
        ],
        'description': nls.localizeByDefault('Controls how the editor should render whitespace characters.'),
        'type': 'string',
        'enum': [
            'none',
            'boundary',
            'selection',
            'trailing',
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
        'description': nls.localizeByDefault('Controls whether selections should have rounded corners.'),
        'type': 'boolean',
        'default': true
    },
    'editor.rulers': {
        'type': 'array',
        'items': {
            'type': 'number'
        },
        'default': [],
        'description': nls.localizeByDefault('Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty.')
    },
    'editor.scrollBeyondLastColumn': {
        'description': nls.localizeByDefault('Controls the number of extra characters beyond which the editor will scroll horizontally.'),
        'type': 'integer',
        'default': 5,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.scrollBeyondLastLine': {
        'description': nls.localizeByDefault('Controls whether the editor will scroll beyond the last line.'),
        'type': 'boolean',
        'default': true
    },
    'editor.scrollPredominantAxis': {
        'description': nls.localizeByDefault('Scroll only along the predominant axis when scrolling both vertically and horizontally at the same time. Prevents horizontal drift when scrolling vertically on a trackpad.'),
        'type': 'boolean',
        'default': true
    },
    'editor.selectionClipboard': {
        'description': nls.localizeByDefault('Controls whether the Linux primary clipboard should be supported.'),
        'included': platform.isLinux,
        'type': 'boolean',
        'default': true
    },
    'editor.selectionHighlight': {
        'description': nls.localizeByDefault('Controls whether the editor should highlight matches similar to the selection.'),
        'type': 'boolean',
        'default': true
    },
    'editor.selectOnLineNumbers': {
        'description': nls.localize('theia/editor/selectOnLineNumbers', 'Controls whether to select the corresponding line when clicking on the line number'),
        'type': 'boolean',
        'default': true
    },
    'editor.showFoldingControls': {
        'description': nls.localizeByDefault('Controls when the folding controls on the gutter are shown.'),
        'type': 'string',
        'enum': [
            'always',
            'mouseover'
        ],
        'enumDescriptions': [
            nls.localizeByDefault('Always show the folding controls.'),
            nls.localizeByDefault('Only show the folding controls when the mouse is over the gutter.'),
        ],
        'default': 'mouseover'
    },
    'editor.showUnused': {
        'description': nls.localizeByDefault('Controls fading out of unused code.'),
        'type': 'boolean',
        'default': true
    },
    'editor.showDeprecated': {
        'description': nls.localizeByDefault('Controls strikethrough deprecated variables.'),
        'type': 'boolean',
        'default': true
    },
    'editor.inlineHints.enabled': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Enables the inline hints in the editor.')
    },
    'editor.inlineHints.fontSize': {
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.fontSize,
        description: nls.localizeByDefault('Controls font size of inline hints in the editor. When set to `0`, the 90% of `#editor.fontSize#` is used.')
    },
    'editor.inlineHints.fontFamily': {
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontFamily,
        'description': nls.localizeByDefault('Controls font family of inline hints in the editor.')
    },
    'editor.snippetSuggestions': {
        'enumDescriptions': [
            nls.localizeByDefault('Show snippet suggestions on top of other suggestions.'),
            nls.localizeByDefault('Show snippet suggestions below other suggestions.'),
            nls.localizeByDefault('Show snippets suggestions with other suggestions.'),
            nls.localizeByDefault('Do not show snippet suggestions.')
        ],
        'description': nls.localizeByDefault('Controls whether snippets are shown with other suggestions and how they are sorted.'),
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
        'description': nls.localizeByDefault('Whether leading and trailing whitespace should always be selected.'),
        'default': true,
        'type': 'boolean'
    },
    'editor.smoothScrolling': {
        'description': nls.localizeByDefault('Controls whether the editor will scroll using an animation.'),
        'type': 'boolean',
        'default': false
    },
    'editor.stickyTabStops': {
        'description': nls.localizeByDefault('Emulate selection behaviour of tab characters when using spaces for indentation. Selection will stick to tab stops.'),
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
            nls.localizeByDefault('Insert suggestion without overwriting text right of the cursor.'),
            nls.localizeByDefault('Insert suggestion and overwrite text right of the cursor.')
        ],
        'default': 'insert',
        'description': nls.localizeByDefault('Controls whether words are overwritten when accepting completions. Note that this depends on extensions opting into this feature.')
    },
    'editor.suggest.insertHighlight': {
        'type': 'boolean',
        'default': false,
        'description': nls.localize('theia/editor/suggest.insertHighlight', 'Controls whether unexpected text modifications while accepting completions should be highlighted, e.g `insertMode` is `replace` but the completion only supports `insert`.')
    },
    'editor.suggest.filterGraceful': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether filtering and sorting suggestions accounts for small typos.')
    },
    'editor.suggest.localityBonus': {
        'type': 'boolean',
        'default': false,
        'description': nls.localizeByDefault('Controls whether sorting favours words that appear close to the cursor.')
    },
    'editor.suggest.shareSuggestSelections': {
        'type': 'boolean',
        'default': false,
        'markdownDescription': nls.localizeByDefault('Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`).')
    },
    'editor.suggest.snippetsPreventQuickSuggestions': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether an active snippet prevents quick suggestions.')
    },
    'editor.suggest.showIcons': {
        'type': 'boolean',
        'default': true,
        'description': nls.localizeByDefault('Controls whether to show or hide icons in suggestions.')
    },
    'editor.suggest.maxVisibleSuggestions': {
        'type': 'number',
        'default': 12,
        'minimum': 1,
        'maximum': 15,
        'description': nls.localizeByDefault('This setting is deprecated. The suggest widget can now be resized.')
    },
    'editor.suggest.filteredTypes': {
        'type': 'object',
        'default': {},
        'deprecationMessage': nls.localizeByDefault("This setting is deprecated, please use separate settings like 'editor.suggest.showKeywords' or 'editor.suggest.showSnippets' instead.")
    },
    'editor.suggest.showMethods': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `method`-suggestions.')
    },
    'editor.suggest.showFunctions': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `function`-suggestions.')
    },
    'editor.suggest.showConstructors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `constructor`-suggestions.')
    },
    'editor.suggest.showFields': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `field`-suggestions.')
    },
    'editor.suggest.showVariables': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `variable`-suggestions.')
    },
    'editor.suggest.showClasses': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `class`-suggestions.')
    },
    'editor.suggest.showStructs': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `struct`-suggestions.')
    },
    'editor.suggest.showInterfaces': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `interface`-suggestions.')
    },
    'editor.suggest.showModules': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `module`-suggestions.')
    },
    'editor.suggest.showProperties': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `property`-suggestions.')
    },
    'editor.suggest.showEvents': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `event`-suggestions.')
    },
    'editor.suggest.showOperators': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `operator`-suggestions.')
    },
    'editor.suggest.showUnits': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `unit`-suggestions.')
    },
    'editor.suggest.showValues': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `value`-suggestions.')
    },
    'editor.suggest.showConstants': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `constant`-suggestions.')
    },
    'editor.suggest.showEnums': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `enum`-suggestions.')
    },
    'editor.suggest.showEnumMembers': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `enumMember`-suggestions.')
    },
    'editor.suggest.showKeywords': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `keyword`-suggestions.')
    },
    'editor.suggest.showWords': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `text`-suggestions.')
    },
    'editor.suggest.showColors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `color`-suggestions.')
    },
    'editor.suggest.showFiles': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `file`-suggestions.')
    },
    'editor.suggest.showReferences': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `reference`-suggestions.')
    },
    'editor.suggest.showCustomcolors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `customcolor`-suggestions.')
    },
    'editor.suggest.showFolders': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `folder`-suggestions.')
    },
    'editor.suggest.showTypeParameters': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `typeParameter`-suggestions.')
    },
    'editor.suggest.showSnippets': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('When enabled IntelliSense shows `snippet`-suggestions.')
    },
    'editor.suggest.hideStatusBar': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': nls.localizeByDefault('Controls the visibility of the status bar at the bottom of the suggest widget.')
    },
    'editor.suggestFontSize': {
        'markdownDescription': nls.localizeByDefault('Font size for the suggest widget. When set to `0`, the value of `#editor.fontSize#` is used.'),
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1000
    },
    'editor.suggestLineHeight': {
        'markdownDescription': nls.localizeByDefault('Line height for the suggest widget. When set to `0`, the value of `#editor.lineHeight#` is used. The minimum value is 8.'),
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1000
    },
    'editor.suggestOnTriggerCharacters': {
        'description': nls.localizeByDefault('Controls whether suggestions should automatically show up when typing trigger characters.'),
        'type': 'boolean',
        'default': true
    },
    'editor.suggestSelection': {
        'markdownEnumDescriptions': [
            nls.localizeByDefault('Always select the first suggestion.'),
            nls.localizeByDefault('Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently.'),
            nls.localizeByDefault('Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`.')
        ],
        'description': nls.localizeByDefault('Controls how suggestions are pre-selected when showing the suggest list.'),
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
            nls.localizeByDefault('Tab complete will insert the best matching suggestion when pressing tab.'),
            nls.localizeByDefault('Disable tab completions.'),
            nls.localizeByDefault("Tab complete snippets when their prefix match. Works best when 'quickSuggestions' aren't enabled.")
        ],
        'description': nls.localizeByDefault('Enables tab completions.'),
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
        'description': nls.localizeByDefault('Remove unusual line terminators that might cause problems.'),
        'type': 'string',
        'enum': ['auto', 'off', 'prompt'],
        'default': 'prompt'
    },
    'editor.useTabStops': {
        'description': nls.localizeByDefault('Inserting and deleting whitespace follows tab stops.'),
        'type': 'boolean',
        'default': true
    },
    'editor.wordSeparators': {
        'description': nls.localizeByDefault('Characters that will be used as word separators when doing word related navigations or operations.'),
        'type': 'string',
        'default': DEFAULT_WORD_SEPARATORS
    },
    'editor.wordWrap': {
        'markdownEnumDescriptions': [
            nls.localizeByDefault('Lines will never wrap.'),
            nls.localizeByDefault('Lines will wrap at the viewport width.'),
            nls.localizeByDefault('Lines will wrap at `#editor.wordWrapColumn#`.'),
            nls.localizeByDefault('Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`.')
        ],
        'description': nls.localizeByDefault('Controls how lines should wrap.'),
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
        'markdownDescription': nls.localizeByDefault('Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.'),
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
            nls.localizeByDefault('No indentation. Wrapped lines begin at column 1.'),
            nls.localizeByDefault('Wrapped lines get the same indentation as the parent.'),
            nls.localizeByDefault('Wrapped lines get +1 indentation toward the parent.'),
            nls.localizeByDefault('Wrapped lines get +2 indentation toward the parent.')
        ],
        'description': nls.localizeByDefault('Controls the indentation of wrapped lines.'),
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
            nls.localizeByDefault('Assumes that all characters are of the same width. This is a fast algorithm that works correctly for monospace fonts and certain scripts (like Latin characters) where glyphs are of equal width.'),
            nls.localizeByDefault('Delegates wrapping points computation to the browser. This is a slow algorithm, that might cause freezes for large files, but it works correctly in all cases.')
        ],
        'description': nls.localizeByDefault('Controls the algorithm that computes wrapping points.'),
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
            'description': nls.localize('theia/editor/autoSaveSetting', 'Controls auto save of dirty files.'),
            overridable: false
        },
        'editor.autoSaveDelay': {
            'type': 'number',
            'default': 500,
            'description': nls.localize('theia/editor/autoSaveDelay', 'Configure the auto save delay in milliseconds.'),
            overridable: false
        },
        'editor.formatOnSave': {
            'type': 'boolean',
            'default': false,
            // eslint-disable-next-line max-len
            'description': nls.localizeByDefault('Format a file on save. A formatter must be available, the file must not be saved after delay, and the editor must not be shutting down.')
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
                nls.localizeByDefault('LF'),
                nls.localizeByDefault('CRLF'),
                nls.localizeByDefault('Uses operating system specific end of line character.')
            ],
            'default': 'auto',
            'description': nls.localizeByDefault('The default end of line character.')
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
