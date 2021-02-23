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

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'monospace\', monospace, \'Droid Sans Fallback\'';

const platform = {
    isMacintosh: isOSX,
    isLinux: OS.type() === OS.Type.Linux
};

// should be in sync with https://github.com/theia-ide/vscode/blob/standalone/0.20.x/src/vs/editor/common/config/editorOptions.ts#L3042
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

// should be in sync with https://github.com/theia-ide/vscode/blob/standalone/0.20.x/src/vs/editor/common/config/editorOptions.ts#L3057
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
//        1. https://github.com/theia-ide/vscode/blob/standalone/0.20.x/src/vs/editor/common/config/commonEditorConfig.ts#L441
//        2. https://github.com/theia-ide/vscode/blob/standalone/0.20.x/src/vs/editor/common/config/commonEditorConfig.ts#L530

// 1. Copy from https://github.com/theia-ide/vscode/blob/standalone/0.20.x/src/vs/editor/common/config/commonEditorConfig.ts#L530
// 2. Align first items with https://github.com/theia-ide/vscode/blob/standalone/0.20.x/src/vs/editor/common/config/commonEditorConfig.ts#L441
// 3. Find -> Use Regular Expressions to clean up data and replace " by ', for example -> nls\.localize\(.*, "(.*)"\) -> "$1"
// 4. Apply `quotemark` quick fixes
// 5. Fix the rest manually
const codeEditorPreferenceProperties = {
    'editor.tabSize': {
        'type': 'number',
        'default': EDITOR_MODEL_DEFAULTS.tabSize,
        'minimum': 1,
        'markdownDescription': 'The number of spaces a tab is equal to. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.'
    },
    'editor.defaultFormatter': {
        'type': 'string',
        'default': null,
        'description': 'Default formatter'
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
    'editor.trimAutoWhitespace': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
        'description': 'Remove trailing auto inserted whitespace.'
    },
    'editor.largeFileOptimizations': {
        'type': 'boolean',
        'default': EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
        'description': 'Special handling for large files to disable certain memory intensive features.'
    },
    'editor.wordBasedSuggestions': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether completions should be computed based on words in the document.'
    },
    'editor.semanticHighlighting.enabled': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the semanticHighlighting is shown for the languages that support it.'
    },
    'editor.stablePeek': {
        'type': 'boolean',
        'default': false,
        'markdownDescription': 'Keep peek editors open even when double clicking their content or when hitting `Escape`.'
    },
    'editor.maxTokenizationLineLength': {
        'type': 'integer',
        'default': 400,
        'description': 'Lines above this length will not be tokenized for performance reasons'
    },
    'diffEditor.maxComputationTime': {
        'type': 'number',
        'default': 5000,
        'description': 'Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout.'
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
    'diffEditor.renderIndicators': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the diff editor shows +/- indicators for added/removed changes.'
    },
    'editor.acceptSuggestionOnCommitCharacter': {
        'markdownDescription': 'Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.',
        'type': 'boolean',
        'default': true
    },
    'editor.acceptSuggestionOnEnter': {
        'markdownEnumDescriptions': [
            '',
            'Only accept a suggestion with `Enter` when it makes a textual change.',
            ''
        ],
        'markdownDescription': 'Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions.',
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
            'The editor will use platform APIs to detect when a Screen Reader is attached.',
            'The editor will be permanently optimized for usage with a Screen Reader.',
            'The editor will never be optimized for usage with a Screen Reader.'
        ],
        'default': 'auto',
        'description': 'Controls whether the editor should run in a mode where it is optimized for screen readers.'
    },
    'editor.accessibilityPageSize': {
        'description': 'Controls the number of lines in the editor that can be read out by a screen reader. Warning: this has a performance implication for numbers larger than the default.',
        'type': 'integer',
        'default': 10,
        'minimum': 1,
        'maximum': 1073741824
    },
    'editor.autoClosingBrackets': {
        'enumDescriptions': [
            '',
            'Use language configurations to determine when to autoclose brackets.',
            'Autoclose brackets only when the cursor is to the left of whitespace.',
            ''
        ],
        'description': 'Controls whether the editor should automatically close brackets after the user adds an opening bracket.',
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
            'Type over closing quotes or brackets only if they were automatically inserted.',
            ''
        ],
        'description': 'Controls whether the editor should type over closing quotes or brackets.',
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
            'Use language configurations to determine when to autoclose quotes.',
            'Autoclose quotes only when the cursor is to the left of whitespace.',
            ''
        ],
        'description': 'Controls whether the editor should automatically close quotes after the user adds an opening quote.',
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
            'The editor will not insert indentation automatically.',
            'The editor will keep the current line\'s indentation.',
            'The editor will keep the current line\'s indentation and honor language defined brackets.',
            'The editor will keep the current line\'s indentation, honor language defined brackets and invoke special onEnterRules defined by languages.',
            'The editor will keep the current line\'s indentation, honor language defined brackets, invoke special onEnterRules defined by languages, and honor indentationRules defined by languages.'
        ],
        'description': 'Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.',
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
            'Use language configurations to determine when to automatically surround selections.',
            'Surround with quotes but not brackets.',
            'Surround with brackets but not quotes.',
            ''
        ],
        'description': 'Controls whether the editor should automatically surround selections.',
        'type': 'string',
        'enum': [
            'languageDefined',
            'quotes',
            'brackets',
            'never'
        ],
        'default': 'languageDefined'
    },
    'editor.codeLens': {
        'description': 'Controls whether the editor shows CodeLens.',
        'type': 'boolean',
        'default': true
    },
    'editor.colorDecorators': {
        'description': 'Controls whether the editor should render the inline color decorators and color picker.',
        'type': 'boolean',
        'default': true
    },
    'editor.comments.insertSpace': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether a space character is inserted when commenting.'
    },
    'editor.copyWithSyntaxHighlighting': {
        'description': 'Controls whether syntax highlighting should be copied into the clipboard.',
        'type': 'boolean',
        'default': true
    },
    'editor.cursorBlinking': {
        'description': 'Control the cursor animation style.',
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
        'description': 'Controls whether the smooth caret animation should be enabled.',
        'type': 'boolean',
        'default': false
    },
    'editor.cursorStyle': {
        'description': 'Controls the cursor style.',
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
        'description': 'Controls the minimal number of visible leading and trailing lines surrounding the cursor. Known as `scrollOff` or `scrollOffset` in some other editors.',
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.cursorSurroundingLinesStyle': {
        'enumDescriptions': [
            '`cursorSurroundingLines` is enforced only when triggered via the keyboard or API.',
            '`cursorSurroundingLines` is enforced always.'
        ],
        'description': 'Controls when `cursorSurroundingLines` should be enforced.',
        'type': 'string',
        'enum': [
            'default',
            'all'
        ],
        'default': 'default'
    },
    'editor.cursorWidth': {
        'markdownDescription': 'Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`.',
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.dragAndDrop': {
        'description': 'Controls whether the editor should allow moving selections via drag and drop.',
        'type': 'boolean',
        'default': true
    },
    'editor.emptySelectionClipboard': {
        'description': 'Controls whether copying without a selection copies the current line.',
        'type': 'boolean',
        'default': true
    },
    'editor.fastScrollSensitivity': {
        'markdownDescription': 'Scrolling speed multiplier when pressing `Alt`.',
        'type': 'number',
        'default': 5
    },
    'editor.find.seedSearchStringFromSelection': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the search string in the Find Widget is seeded from the editor selection.'
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
            'Never turn on Find in selection automatically (default)',
            'Always turn on Find in selection automatically',
            'Turn on Find in selection automatically when multiple lines of content are selected.'
        ],
        'description': 'Controls whether the find operation is carried out on selected text or the entire file in the editor.'
    },
    'editor.find.globalFindClipboard': {
        'type': 'boolean',
        'default': false,
        'description': 'Controls whether the Find Widget should read or modify the shared find clipboard on macOS.',
        'included': isOSX
    },
    'editor.find.addExtraSpaceOnTop': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.'
    },
    'editor.folding': {
        'description': 'Controls whether the editor has code folding enabled.',
        'type': 'boolean',
        'default': true
    },
    'editor.foldingStrategy': {
        'markdownDescription': 'Controls the strategy for computing folding ranges. `auto` uses a language specific folding strategy, if available. `indentation` uses the indentation based folding strategy.',
        'type': 'string',
        'enum': [
            'auto',
            'indentation'
        ],
        'default': 'auto'
    },
    'editor.foldingHighlight': {
        'description': 'Controls whether the editor should highlight folded ranges.',
        'type': 'boolean',
        'default': true
    },
    'editor.fontFamily': {
        'description': 'Controls the font family.',
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontFamily
    },
    'editor.fontLigatures': {
        'anyOf': [
            {
                'type': 'boolean',
                'description': 'Enables/Disables font ligatures.'
            },
            {
                'type': 'string',
                'description': 'Explicit font-feature-settings.'
            }
        ],
        'description': 'Configures font ligatures.',
        'default': false
    },
    'editor.fontSize': {
        'type': 'number',
        'minimum': 6,
        'maximum': 100,
        'default': EDITOR_FONT_DEFAULTS.fontSize,
        'description': 'Controls the font size in pixels.'
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
        'description': 'Controls the font weight.',
        'type': 'string',
        'default': EDITOR_FONT_DEFAULTS.fontWeight
    },
    'editor.formatOnPaste': {
        'description': 'Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.',
        'type': 'boolean',
        'default': false
    },
    'editor.formatOnType': {
        'description': 'Controls whether the editor should automatically format the line after typing.',
        'type': 'boolean',
        'default': false
    },
    'editor.glyphMargin': {
        'description': 'Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.',
        'type': 'boolean',
        'default': true
    },
    'editor.gotoLocation.multiple': {
        'type': 'string',
        'default': '',
        'deprecationMessage': 'This setting is deprecated, please use separate settings like `editor.editor.gotoLocation.multipleDefinitions` or `editor.editor.gotoLocation.multipleImplementations` instead.'
    },
    'editor.gotoLocation.multipleDefinitions': {
        'description': 'Controls the behavior the `Go to Definition`-command when multiple target locations exist.',
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            'Show peek view of the results (default)',
            'Go to the primary result and show a peek view',
            'Go to the primary result and enable peek-less navigation to others'
        ]
    },
    'editor.gotoLocation.multipleTypeDefinitions': {
        'description': 'Controls the behavior the `Go to Type Definition`-command when multiple target locations exist.',
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            'Show peek view of the results (default)',
            'Go to the primary result and show a peek view',
            'Go to the primary result and enable peek-less navigation to others'
        ]
    },
    'editor.gotoLocation.multipleDeclarations': {
        'description': 'Controls the behavior the `Go to Declaration`-command when multiple target locations exist.',
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            'Show peek view of the results (default)',
            'Go to the primary result and show a peek view',
            'Go to the primary result and enable peek-less navigation to others'
        ]
    },
    'editor.gotoLocation.multipleImplementations': {
        'description': 'Controls the behavior the `Go to Implementations`-command when multiple target locations exist.',
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            'Show peek view of the results (default)',
            'Go to the primary result and show a peek view',
            'Go to the primary result and enable peek-less navigation to others'
        ]
    },
    'editor.gotoLocation.multipleReferences': {
        'description': 'Controls the behavior the `Go to References`-command when multiple target locations exist.',
        'type': 'string',
        'enum': [
            'peek',
            'gotoAndPeek',
            'goto'
        ],
        'default': 'peek',
        'enumDescriptions': [
            'Show peek view of the results (default)',
            'Go to the primary result and show a peek view',
            'Go to the primary result and enable peek-less navigation to others'
        ]
    },
    'editor.gotoLocation.alternativeDefinitionCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': 'Alternative command id that is being executed when the result of `Go to Definition` is the current location.'
    },
    'editor.gotoLocation.alternativeTypeDefinitionCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': 'Alternative command id that is being executed when the result of `Go to Type Definition` is the current location.'
    },
    'editor.gotoLocation.alternativeDeclarationCommand': {
        'type': 'string',
        'default': 'editor.action.goToReferences',
        'description': 'Alternative command id that is being executed when the result of `Go to Declaration` is the current location.'
    },
    'editor.gotoLocation.alternativeImplementationCommand': {
        'type': 'string',
        'default': '',
        'description': 'Alternative command id that is being executed when the result of `Go to Implementation` is the current location.'
    },
    'editor.gotoLocation.alternativeReferenceCommand': {
        'type': 'string',
        'default': '',
        'description': 'Alternative command id that is being executed when the result of `Go to Reference` is the current location.'
    },
    'editor.hideCursorInOverviewRuler': {
        'description': 'Controls whether the cursor should be hidden in the overview ruler.',
        'type': 'boolean',
        'default': false
    },
    'editor.highlightActiveIndentGuide': {
        'description': 'Controls whether the editor should highlight the active indent guide.',
        'type': 'boolean',
        'default': true
    },
    'editor.hover.enabled': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the hover is shown.'
    },
    'editor.hover.delay': {
        'type': 'number',
        'default': 300,
        'description': 'Controls the delay in milliseconds after which the hover is shown.'
    },
    'editor.hover.sticky': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether the hover should remain visible when mouse is moved over it.'
    },
    'editor.letterSpacing': {
        'description': 'Controls the letter spacing in pixels.',
        'type': 'number',
        'default': EDITOR_FONT_DEFAULTS.letterSpacing
    },
    'editor.lightbulb.enabled': {
        'type': 'boolean',
        'default': true,
        'description': 'Enables the code action lightbulb in the editor.'
    },
    'editor.lineHeight': {
        'description': 'Controls the line height. Use 0 to compute the line height from the font size.',
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
            'Line numbers are not rendered.',
            'Line numbers are rendered as absolute number.',
            'Line numbers are rendered as distance in lines to cursor position.',
            'Line numbers are rendered every 10 lines.'
        ],
        'default': 'on',
        'description': 'Controls the display of line numbers.'
    },
    'editor.links': {
        'description': 'Controls whether the editor should detect links and make them clickable.',
        'type': 'boolean',
        'default': true
    },
    'editor.matchBrackets': {
        'description': 'Highlight matching brackets.',
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
        'description': 'Controls whether the minimap is shown.'
    },
    'editor.minimap.side': {
        'type': 'string',
        'enum': [
            'left',
            'right'
        ],
        'default': 'right',
        'description': 'Controls the side where to render the minimap.'
    },
    'editor.minimap.showSlider': {
        'type': 'string',
        'enum': [
            'always',
            'mouseover'
        ],
        'default': 'mouseover',
        'description': 'Controls when the minimap slider is shown.'
    },
    'editor.minimap.scale': {
        'type': 'number',
        'default': 1,
        'minimum': 1,
        'maximum': 3,
        'description': 'Scale of content drawn in the minimap.'
    },
    'editor.minimap.renderCharacters': {
        'type': 'boolean',
        'default': true,
        'description': 'Render the actual characters on a line as opposed to color blocks.'
    },
    'editor.minimap.maxColumn': {
        'type': 'number',
        'default': 120,
        'description': 'Limit the width of the minimap to render at most a certain number of columns.'
    },
    'editor.mouseWheelScrollSensitivity': {
        'markdownDescription': 'A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.',
        'type': 'number',
        'default': 1
    },
    'editor.mouseWheelZoom': {
        'markdownDescription': 'Zoom the font of the editor when using mouse wheel and holding `Ctrl`.',
        'type': 'boolean',
        'default': false
    },
    'editor.multiCursorMergeOverlapping': {
        'description': 'Merge multiple cursors when they are overlapping.',
        'type': 'boolean',
        'default': true
    },
    'editor.multiCursorModifier': {
        'markdownEnumDescriptions': [
            'Maps to `Control` on Windows and Linux and to `Command` on macOS.',
            'Maps to `Alt` on Windows and Linux and to `Option` on macOS.'
        ],
        'markdownDescription': 'The modifier to be used to add multiple cursors with the mouse. The Go To Definition and Open Link mouse gestures will adapt such that they do not conflict with the multicursor modifier. [Read more](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier).',
        'type': 'string',
        'enum': [
            'ctrlCmd',
            'alt'
        ],
        'default': 'alt'
    },
    'editor.multiCursorPaste': {
        'markdownEnumDescriptions': [
            'Each cursor pastes a single line of the text.',
            'Each cursor pastes the full text.'
        ],
        'markdownDescription': 'Controls pasting when the line count of the pasted text matches the cursor count.',
        'type': 'string',
        'enum': [
            'spread',
            'full'
        ],
        'default': 'spread'
    },
    'editor.occurrencesHighlight': {
        'description': 'Controls whether the editor should highlight semantic symbol occurrences.',
        'type': 'boolean',
        'default': true
    },
    'editor.overviewRulerBorder': {
        'description': 'Controls whether a border should be drawn around the overview ruler.',
        'type': 'boolean',
        'default': true
    },
    'editor.parameterHints.enabled': {
        'type': 'boolean',
        'default': true,
        'description': 'Enables a pop-up that shows parameter documentation and type information as you type.'
    },
    'editor.parameterHints.cycle': {
        'type': 'boolean',
        'default': false,
        'description': 'Controls whether the parameter hints menu cycles or closes when reaching the end of the list.'
    },
    'editor.peekWidgetDefaultFocus': {
        'enumDescriptions': [
            'Focus the tree when opening peek',
            'Focus the editor when opening peek'
        ],
        'description': 'Controls whether to focus the inline editor or the tree in the peek widget.',
        'type': 'string',
        'enum': [
            'tree',
            'editor'
        ],
        'default': 'tree'
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
                        'description': 'Enable quick suggestions inside strings.'
                    },
                    'comments': {
                        'type': 'boolean',
                        'default': false,
                        'description': 'Enable quick suggestions inside comments.'
                    },
                    'other': {
                        'type': 'boolean',
                        'default': true,
                        'description': 'Enable quick suggestions outside of strings and comments.'
                    }
                }
            }
        ],
        'default': {
            'other': true,
            'comments': false,
            'strings': false
        },
        'description': 'Controls whether suggestions should automatically show up while typing.'
    },
    'editor.quickSuggestionsDelay': {
        'description': 'Controls the delay in milliseconds after which quick suggestions will show up.',
        'type': 'integer',
        'default': 10,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.rename.enablePreview': {
        'description': 'Controls whether the editor should display refactor preview pane for rename.',
        'type': 'boolean',
        'default': true
    },
    'editor.renderControlCharacters': {
        'description': 'Controls whether the editor should render control characters.',
        'type': 'boolean',
        'default': false
    },
    'editor.renderIndentGuides': {
        'description': 'Controls whether the editor should render indent guides.',
        'type': 'boolean',
        'default': true
    },
    'editor.renderFinalNewline': {
        'description': 'Render last line number when the file ends with a newline.',
        'type': 'boolean',
        'default': true
    },
    'editor.renderLineHighlight': {
        'enumDescriptions': [
            '',
            '',
            '',
            'Highlights both the gutter and the current line.'
        ],
        'description': 'Controls how the editor should render the current line highlight.',
        'type': 'string',
        'enum': [
            'none',
            'gutter',
            'line',
            'all'
        ],
        'default': 'line'
    },
    'editor.renderWhitespace': {
        'enumDescriptions': [
            '',
            'Render whitespace characters except for single spaces between words.',
            'Render whitespace characters only on selected text.',
            ''
        ],
        'description': 'Controls how the editor should render whitespace characters.',
        'type': 'string',
        'enum': [
            'none',
            'boundary',
            'selection',
            'all'
        ],
        'default': 'none'
    },
    'editor.roundedSelection': {
        'description': 'Controls whether selections should have rounded corners.',
        'type': 'boolean',
        'default': true
    },
    'editor.rulers': {
        'type': 'array',
        'items': {
            'type': 'number'
        },
        'default': [],
        'description': 'Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty.'
    },
    'editor.scrollBeyondLastColumn': {
        'description': 'Controls the number of extra characters beyond which the editor will scroll horizontally.',
        'type': 'integer',
        'default': 5,
        'minimum': 0,
        'maximum': 1073741824
    },
    'editor.scrollBeyondLastLine': {
        'description': 'Controls whether the editor will scroll beyond the last line.',
        'type': 'boolean',
        'default': true
    },
    'editor.selectionClipboard': {
        'description': 'Controls whether the Linux primary clipboard should be supported.',
        'included': platform.isLinux,
        'type': 'boolean',
        'default': true
    },
    'editor.selectionHighlight': {
        'description': 'Controls whether the editor should highlight matches similar to the selection.',
        'type': 'boolean',
        'default': true
    },
    'editor.showFoldingControls': {
        'description': 'Controls whether the fold controls on the gutter are automatically hidden.',
        'type': 'string',
        'enum': [
            'always',
            'mouseover'
        ],
        'default': 'mouseover'
    },
    'editor.showUnused': {
        'description': 'Controls fading out of unused code.',
        'type': 'boolean',
        'default': true
    },
    'editor.snippetSuggestions': {
        'enumDescriptions': [
            'Show snippet suggestions on top of other suggestions.',
            'Show snippet suggestions below other suggestions.',
            'Show snippets suggestions with other suggestions.',
            'Do not show snippet suggestions.'
        ],
        'description': 'Controls whether snippets are shown with other suggestions and how they are sorted.',
        'type': 'string',
        'enum': [
            'top',
            'bottom',
            'inline',
            'none'
        ],
        'default': 'inline'
    },
    'editor.smoothScrolling': {
        'description': 'Controls whether the editor will scroll using an animation.',
        'type': 'boolean',
        'default': false
    },
    'editor.suggest.insertMode': {
        'type': 'string',
        'enum': [
            'insert',
            'replace'
        ],
        'enumDescriptions': [
            'Insert suggestion without overwriting text right of the cursor.',
            'Insert suggestion and overwrite text right of the cursor.'
        ],
        'default': 'insert',
        'description': 'Controls whether words are overwritten when accepting completions. Note that this depends on extensions opting into this feature.'
    },
    'editor.suggest.insertHighlight': {
        'type': 'boolean',
        'default': false,
        'description': 'Controls whether unexpected text modifications while accepting completions should be highlighted, e.g `insertMode` is `replace` but the completion only supports `insert`.'
    },
    'editor.suggest.filterGraceful': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether filtering and sorting suggestions accounts for small typos.'
    },
    'editor.suggest.localityBonus': {
        'type': 'boolean',
        'default': false,
        'description': 'Controls whether sorting favours words that appear close to the cursor.'
    },
    'editor.suggest.shareSuggestSelections': {
        'type': 'boolean',
        'default': false,
        'markdownDescription': 'Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`).'
    },
    'editor.suggest.snippetsPreventQuickSuggestions': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether an active snippet prevents quick suggestions.'
    },
    'editor.suggest.showIcons': {
        'type': 'boolean',
        'default': true,
        'description': 'Controls whether to show or hide icons in suggestions.'
    },
    'editor.suggest.maxVisibleSuggestions': {
        'type': 'number',
        'default': 12,
        'minimum': 1,
        'maximum': 15,
        'description': 'Controls how many suggestions IntelliSense will show before showing a scrollbar (maximum 15).'
    },
    'editor.suggest.filteredTypes': {
        'type': 'object',
        'default': {},
        'deprecationMessage': 'This setting is deprecated, please use separate settings like `editor.suggest.showKeywords` or `editor.suggest.showSnippets` instead.'
    },
    'editor.suggest.showMethods': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `method`-suggestions.'
    },
    'editor.suggest.showFunctions': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `function`-suggestions.'
    },
    'editor.suggest.showConstructors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `constructor`-suggestions.'
    },
    'editor.suggest.showFields': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `field`-suggestions.'
    },
    'editor.suggest.showVariables': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `variable`-suggestions.'
    },
    'editor.suggest.showClasses': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `class`-suggestions.'
    },
    'editor.suggest.showStructs': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `struct`-suggestions.'
    },
    'editor.suggest.showInterfaces': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `interface`-suggestions.'
    },
    'editor.suggest.showModules': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `module`-suggestions.'
    },
    'editor.suggest.showProperties': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `property`-suggestions.'
    },
    'editor.suggest.showEvents': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `event`-suggestions.'
    },
    'editor.suggest.showOperators': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `operator`-suggestions.'
    },
    'editor.suggest.showUnits': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `unit`-suggestions.'
    },
    'editor.suggest.showValues': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `value`-suggestions.'
    },
    'editor.suggest.showConstants': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `constant`-suggestions.'
    },
    'editor.suggest.showEnums': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `enum`-suggestions.'
    },
    'editor.suggest.showEnumMembers': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `enumMember`-suggestions.'
    },
    'editor.suggest.showKeywords': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `keyword`-suggestions.'
    },
    'editor.suggest.showWords': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `text`-suggestions.'
    },
    'editor.suggest.showColors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `color`-suggestions.'
    },
    'editor.suggest.showFiles': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `file`-suggestions.'
    },
    'editor.suggest.showReferences': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `reference`-suggestions.'
    },
    'editor.suggest.showCustomcolors': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `customcolor`-suggestions.'
    },
    'editor.suggest.showFolders': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `folder`-suggestions.'
    },
    'editor.suggest.showTypeParameters': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `typeParameter`-suggestions.'
    },
    'editor.suggest.showSnippets': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'When enabled IntelliSense shows `snippet`-suggestions.'
    },
    'editor.suggest.hideStatusBar': {
        'type': 'boolean',
        'default': true,
        'markdownDescription': 'Controls the visibility of the status bar at the bottom of the suggest widget.'
    },
    'editor.suggestFontSize': {
        'markdownDescription': 'Font size for the suggest widget. When set to `0`, the value of `#editor.fontSize#` is used.',
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1000
    },
    'editor.suggestLineHeight': {
        'markdownDescription': 'Line height for the suggest widget. When set to `0`, the value of `#editor.lineHeight#` is used.',
        'type': 'integer',
        'default': 0,
        'minimum': 0,
        'maximum': 1000
    },
    'editor.suggestOnTriggerCharacters': {
        'description': 'Controls whether suggestions should automatically show up when typing trigger characters.',
        'type': 'boolean',
        'default': true
    },
    'editor.suggestSelection': {
        'markdownEnumDescriptions': [
            'Always select the first suggestion.',
            'Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently.',
            'Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`.'
        ],
        'description': 'Controls how suggestions are pre-selected when showing the suggest list.',
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
            'Tab complete will insert the best matching suggestion when pressing tab.',
            'Disable tab completions.',
            'Tab complete snippets when their prefix match. Works best when `quickSuggestions` aren\'t enabled.'
        ],
        'description': 'Enables tab completions.',
        'type': 'string',
        'enum': [
            'on',
            'off',
            'onlySnippets'
        ],
        'default': 'off'
    },
    'editor.useTabStops': {
        'description': 'Inserting and deleting whitespace follows tab stops.',
        'type': 'boolean',
        'default': true
    },
    'editor.wordSeparators': {
        'description': 'Characters that will be used as word separators when doing word related navigations or operations.',
        'type': 'string',
        'default': DEFAULT_WORD_SEPARATORS
    },
    'editor.wordWrap': {
        'markdownEnumDescriptions': [
            'Lines will never wrap.',
            'Lines will wrap at the viewport width.',
            'Lines will wrap at `#editor.wordWrapColumn#`.',
            'Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`.'
        ],
        'description': 'Controls how lines should wrap.',
        'type': 'string',
        'enum': [
            'off',
            'on',
            'wordWrapColumn',
            'bounded'
        ],
        'default': 'off'
    },
    'editor.wordWrapColumn': {
        'markdownDescription': 'Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.',
        'type': 'integer',
        'default': 80,
        'minimum': 1,
        'maximum': 1073741824
    },
    'editor.wrappingIndent': {
        'enumDescriptions': [
            'No indentation. Wrapped lines begin at column 1.',
            'Wrapped lines get the same indentation as the parent.',
            'Wrapped lines get +1 indentation toward the parent.',
            'Wrapped lines get +2 indentation toward the parent.'
        ],
        'description': 'Controls the indentation of wrapped lines.',
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
            'Assumes that all characters are of the same width. This is a fast algorithm that works correctly for monospace fonts and certain scripts (like Latin characters) where glyphs are of equal width.',
            'Delegates wrapping points computation to the browser. This is a slow algorithm, that might cause freezes for large files, but it works correctly in all cases.'
        ],
        'description': 'Controls the algorithm that computes wrapping points.',
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
