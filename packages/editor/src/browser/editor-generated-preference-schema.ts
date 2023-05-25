/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { isOSX, isWindows, nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/browser';

/* eslint-disable @typescript-eslint/quotes,max-len,no-null/no-null */

/**
 * Please do not modify this file by hand. It should be generated automatically
 * during a Monaco uplift using the command registered by monaco-editor-preference-extractor.ts
 * The only manual work required is fixing preferences with type 'array' or 'object'.
 */

export const editorGeneratedPreferenceProperties: PreferenceSchema['properties'] = {
    "editor.tabSize": {
        "type": "number",
        "default": 4,
        "minimum": 1,
        "markdownDescription": nls.localizeByDefault('The number of spaces a tab is equal to. This setting is overridden based on the file contents when {0} is on.', '`#editor.detectIndentation#`'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.insertSpaces": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault('Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when {0} is on.', `#editor.detectIndentation#`),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.detectIndentation": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault('Controls whether {0} and {1} will be automatically detected when a file is opened based on the file contents.', '`#editor.tabSize#`', '`#editor.insertSpaces#`'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.trimAutoWhitespace": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Remove trailing auto inserted whitespace."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.largeFileOptimizations": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Special handling for large files to disable certain memory intensive features."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.wordBasedSuggestions": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether completions should be computed based on words in the document."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.wordBasedSuggestionsMode": {
        "enum": [
            "currentDocument",
            "matchingDocuments",
            "allDocuments"
        ],
        "default": "matchingDocuments",
        "enumDescriptions": [
            nls.localizeByDefault("Only suggest words from the active document."),
            nls.localizeByDefault("Suggest words from all open documents of the same language."),
            nls.localizeByDefault("Suggest words from all open documents.")
        ],
        "description": nls.localizeByDefault("Controls from which documents word based completions are computed."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.semanticHighlighting.enabled": {
        "enum": [
            true,
            false,
            "configuredByTheme"
        ],
        "enumDescriptions": [
            nls.localizeByDefault("Semantic highlighting enabled for all color themes."),
            nls.localizeByDefault("Semantic highlighting disabled for all color themes."),
            nls.localizeByDefault("Semantic highlighting is configured by the current color theme's `semanticHighlighting` setting.")
        ],
        "default": "configuredByTheme",
        "description": nls.localizeByDefault("Controls whether the semanticHighlighting is shown for the languages that support it."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.stablePeek": {
        "type": "boolean",
        "default": false,
        "markdownDescription": nls.localizeByDefault('Keep peek editors open even when double-clicking their content or when hitting `Escape`.'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.maxTokenizationLineLength": {
        "type": "integer",
        "default": 20000,
        "description": nls.localizeByDefault("Lines above this length will not be tokenized for performance reasons"),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.language.brackets": {
        "type": [
            "array",
            "null"
        ],
        "default": null,
        "description": nls.localizeByDefault("Defines the bracket symbols that increase or decrease the indentation."),
        "items": {
            "type": "array",
            "items": [
                {
                    "type": "string",
                    "description": nls.localizeByDefault("The opening bracket character or string sequence.")
                },
                {
                    "type": "string",
                    "description": nls.localizeByDefault("The closing bracket character or string sequence.")
                }
            ]
        },
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.language.colorizedBracketPairs": {
        "type": [
            "array",
            "null"
        ],
        "default": null,
        "description": nls.localizeByDefault("Defines the bracket pairs that are colorized by their nesting level if bracket pair colorization is enabled."),
        "items": {
            "type": "array",
            "items": [
                {
                    "type": "string",
                    "description": nls.localizeByDefault("The opening bracket character or string sequence.")
                },
                {
                    "type": "string",
                    "description": nls.localizeByDefault("The closing bracket character or string sequence.")
                }
            ]
        },
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.maxComputationTime": {
        "type": "number",
        "default": 5000,
        "description": nls.localizeByDefault("Timeout in milliseconds after which diff computation is cancelled. Use 0 for no timeout."),
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.maxFileSize": {
        "type": "number",
        "default": 50,
        "description": nls.localizeByDefault("Maximum file size in MB for which to compute diffs. Use 0 for no limit."),
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.renderSideBySide": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the diff editor shows the diff side by side or inline."),
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.renderMarginRevertIcon": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("When enabled, the diff editor shows arrows in its glyph margin to revert changes."),
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.ignoreTrimWhitespace": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("When enabled, the diff editor ignores changes in leading or trailing whitespace."),
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.renderIndicators": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the diff editor shows +/- indicators for added/removed changes."),
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.codeLens": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether the editor shows CodeLens."),
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.wordWrap": {
        "type": "string",
        "enum": [
            "off",
            "on",
            "inherit"
        ],
        "default": "inherit",
        "markdownEnumDescriptions": [
            nls.localizeByDefault("Lines will never wrap."),
            nls.localizeByDefault("Lines will wrap at the viewport width."),
            nls.localizeByDefault('Lines will wrap according to the {0} setting.', '`#editor.wordWrap#`')
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "diffEditor.diffAlgorithm": {
        "type": "string",
        "enum": [
            "smart",
            "experimental"
        ],
        "default": "smart",
        "markdownEnumDescriptions": [
            nls.localizeByDefault("Uses the default diffing algorithm."),
            nls.localizeByDefault("Uses an experimental diffing algorithm.")
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.acceptSuggestionOnCommitCharacter": {
        "markdownDescription": nls.localizeByDefault('Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.'),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.acceptSuggestionOnEnter": {
        "markdownEnumDescriptions": [
            "",
            nls.localizeByDefault("Only accept a suggestion with `Enter` when it makes a textual change."),
            ""
        ],
        "markdownDescription": nls.localizeByDefault("Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions."),
        "type": "string",
        "enum": [
            "on",
            "smart",
            "off"
        ],
        "default": "on",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.accessibilitySupport": {
        "type": "string",
        "enum": [
            "auto",
            "on",
            "off"
        ],
        "enumDescriptions": [
            nls.localizeByDefault('Use platform APIs to detect when a Screen Reader is attached'),
            nls.localizeByDefault("Optimize for usage with a Screen Reader"),
            nls.localizeByDefault("Assume a screen reader is not attached")
        ],
        "default": "auto",
        "description": nls.localizeByDefault("Controls if the UI should run in a mode where it is optimized for screen readers."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.accessibilityPageSize": {
        "description": nls.localizeByDefault("Controls the number of lines in the editor that can be read out by a screen reader at once. When we detect a screen reader we automatically set the default to be 500. Warning: this has a performance implication for numbers larger than the default."),
        "type": "integer",
        "default": 10,
        "minimum": 1,
        "maximum": 1073741824,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.autoClosingBrackets": {
        "enumDescriptions": [
            "",
            nls.localizeByDefault("Use language configurations to determine when to autoclose brackets."),
            nls.localizeByDefault("Autoclose brackets only when the cursor is to the left of whitespace."),
            ""
        ],
        "description": nls.localizeByDefault("Controls whether the editor should automatically close brackets after the user adds an opening bracket."),
        "type": "string",
        "enum": [
            "always",
            "languageDefined",
            "beforeWhitespace",
            "never"
        ],
        "default": "languageDefined",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.autoClosingDelete": {
        "enumDescriptions": [
            "",
            nls.localizeByDefault("Remove adjacent closing quotes or brackets only if they were automatically inserted."),
            ""
        ],
        "description": nls.localizeByDefault("Controls whether the editor should remove adjacent closing quotes or brackets when deleting."),
        "type": "string",
        "enum": [
            "always",
            "auto",
            "never"
        ],
        "default": "auto",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.autoClosingOvertype": {
        "enumDescriptions": [
            "",
            nls.localizeByDefault("Type over closing quotes or brackets only if they were automatically inserted."),
            ""
        ],
        "description": nls.localizeByDefault("Controls whether the editor should type over closing quotes or brackets."),
        "type": "string",
        "enum": [
            "always",
            "auto",
            "never"
        ],
        "default": "auto",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.autoClosingQuotes": {
        "enumDescriptions": [
            "",
            nls.localizeByDefault("Use language configurations to determine when to autoclose quotes."),
            nls.localizeByDefault("Autoclose quotes only when the cursor is to the left of whitespace."),
            ""
        ],
        "description": nls.localizeByDefault("Controls whether the editor should automatically close quotes after the user adds an opening quote."),
        "type": "string",
        "enum": [
            "always",
            "languageDefined",
            "beforeWhitespace",
            "never"
        ],
        "default": "languageDefined",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.autoIndent": {
        "enumDescriptions": [
            nls.localizeByDefault("The editor will not insert indentation automatically."),
            nls.localizeByDefault("The editor will keep the current line's indentation."),
            nls.localizeByDefault("The editor will keep the current line's indentation and honor language defined brackets."),
            nls.localizeByDefault("The editor will keep the current line's indentation, honor language defined brackets and invoke special onEnterRules defined by languages."),
            nls.localizeByDefault("The editor will keep the current line's indentation, honor language defined brackets, invoke special onEnterRules defined by languages, and honor indentationRules defined by languages.")
        ],
        "description": nls.localizeByDefault("Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines."),
        "type": "string",
        "enum": [
            "none",
            "keep",
            "brackets",
            "advanced",
            "full"
        ],
        "default": "full",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.autoSurround": {
        "enumDescriptions": [
            nls.localizeByDefault("Use language configurations to determine when to automatically surround selections."),
            nls.localizeByDefault("Surround with quotes but not brackets."),
            nls.localizeByDefault("Surround with brackets but not quotes."),
            ""
        ],
        "description": nls.localizeByDefault("Controls whether the editor should automatically surround selections when typing quotes or brackets."),
        "type": "string",
        "enum": [
            "languageDefined",
            "quotes",
            "brackets",
            "never"
        ],
        "default": "languageDefined",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.bracketPairColorization.enabled": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault('Controls whether bracket pair colorization is enabled or not. Use {0} to override the bracket highlight colors.', '`#workbench.colorCustomizations#`'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.bracketPairColorization.independentColorPoolPerBracketType": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether each bracket type has its own independent color pool."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.guides.bracketPairs": {
        "type": [
            "boolean",
            "string"
        ],
        "enum": [
            true,
            "active",
            false
        ],
        "enumDescriptions": [
            nls.localizeByDefault("Enables bracket pair guides."),
            nls.localizeByDefault("Enables bracket pair guides only for the active bracket pair."),
            nls.localizeByDefault("Disables bracket pair guides.")
        ],
        "default": false,
        "description": nls.localizeByDefault("Controls whether bracket pair guides are enabled or not."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.guides.bracketPairsHorizontal": {
        "type": [
            "boolean",
            "string"
        ],
        "enum": [
            true,
            "active",
            false
        ],
        "enumDescriptions": [
            nls.localizeByDefault("Enables horizontal guides as addition to vertical bracket pair guides."),
            nls.localizeByDefault("Enables horizontal guides only for the active bracket pair."),
            nls.localizeByDefault("Disables horizontal bracket pair guides.")
        ],
        "default": "active",
        "description": nls.localizeByDefault("Controls whether horizontal bracket pair guides are enabled or not."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.guides.highlightActiveBracketPair": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the editor should highlight the active bracket pair."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.guides.indentation": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the editor should render indent guides."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.guides.highlightActiveIndentation": {
        "type": [
            "boolean",
            "string"
        ],
        "enum": [
            true,
            "always",
            false
        ],
        "enumDescriptions": [
            nls.localizeByDefault("Highlights the active indent guide."),
            nls.localizeByDefault("Highlights the active indent guide even if bracket guides are highlighted."),
            nls.localizeByDefault("Do not highlight the active indent guide.")
        ],
        "default": true,
        "description": nls.localizeByDefault("Controls whether the editor should highlight the active indent guide."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.codeLens": {
        "description": nls.localizeByDefault("Controls whether the editor shows CodeLens."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.codeLensFontFamily": {
        "description": nls.localizeByDefault("Controls the font family for CodeLens."),
        "type": "string",
        "default": "",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.codeLensFontSize": {
        "type": "integer",
        "default": 0,
        "minimum": 0,
        "maximum": 100,
        "markdownDescription": nls.localizeByDefault('Controls the font size in pixels for CodeLens. When set to 0, 90% of `#editor.fontSize#` is used.'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.colorDecorators": {
        "description": nls.localizeByDefault("Controls whether the editor should render the inline color decorators and color picker."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.columnSelection": {
        "description": nls.localizeByDefault("Enable that the selection with the mouse and keys is doing column selection."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.comments.insertSpace": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether a space character is inserted when commenting."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.comments.ignoreEmptyLines": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls if empty lines should be ignored with toggle, add or remove actions for line comments."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.copyWithSyntaxHighlighting": {
        "description": nls.localizeByDefault("Controls whether syntax highlighting should be copied into the clipboard."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.cursorBlinking": {
        "description": nls.localizeByDefault("Control the cursor animation style."),
        "type": "string",
        "enum": [
            "blink",
            "smooth",
            "phase",
            "expand",
            "solid"
        ],
        "default": "blink",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.cursorSmoothCaretAnimation": {
        "description": nls.localizeByDefault("Controls whether the smooth caret animation should be enabled."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.cursorStyle": {
        "description": nls.localizeByDefault("Controls the cursor style."),
        "type": "string",
        "enum": [
            "line",
            "block",
            "underline",
            "line-thin",
            "block-outline",
            "underline-thin"
        ],
        "default": "line",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.cursorSurroundingLines": {
        "description": nls.localizeByDefault('Controls the minimal number of visible leading lines (minimum 0) and trailing lines (minimum 1) surrounding the cursor. Known as \'scrollOff\' or \'scrollOffset\' in some other editors.'),
        "type": "integer",
        "default": 0,
        "minimum": 0,
        "maximum": 1073741824,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.cursorSurroundingLinesStyle": {
        "enumDescriptions": [
            nls.localizeByDefault("`cursorSurroundingLines` is enforced only when triggered via the keyboard or API."),
            nls.localizeByDefault("`cursorSurroundingLines` is enforced always.")
        ],
        "description": nls.localizeByDefault("Controls when `cursorSurroundingLines` should be enforced."),
        "type": "string",
        "enum": [
            "default",
            "all"
        ],
        "default": "default",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.cursorWidth": {
        "markdownDescription": nls.localizeByDefault("Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`."),
        "type": "integer",
        "default": 0,
        "minimum": 0,
        "maximum": 1073741824,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.dragAndDrop": {
        "description": nls.localizeByDefault("Controls whether the editor should allow moving selections via drag and drop."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.dropIntoEditor.enabled": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("Controls whether you can drag and drop a file into a text editor by holding down `shift` (instead of opening the file in an editor)."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.emptySelectionClipboard": {
        "description": nls.localizeByDefault("Controls whether copying without a selection copies the current line."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.fastScrollSensitivity": {
        "markdownDescription": nls.localizeByDefault("Scrolling speed multiplier when pressing `Alt`."),
        "type": "number",
        "default": 5,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.find.cursorMoveOnType": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the cursor should jump to find matches while typing."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.find.seedSearchStringFromSelection": {
        "type": "string",
        "enum": [
            "never",
            "always",
            "selection"
        ],
        "default": "always",
        "enumDescriptions": [
            nls.localizeByDefault("Never seed search string from the editor selection."),
            nls.localizeByDefault("Always seed search string from the editor selection, including word at cursor position."),
            nls.localizeByDefault("Only seed search string from the editor selection.")
        ],
        "description": nls.localizeByDefault("Controls whether the search string in the Find Widget is seeded from the editor selection."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.find.autoFindInSelection": {
        "type": "string",
        "enum": [
            "never",
            "always",
            "multiline"
        ],
        "default": "never",
        "enumDescriptions": [
            nls.localizeByDefault('Never turn on Find in Selection automatically (default).'),
            nls.localizeByDefault('Always turn on Find in Selection automatically.'),
            nls.localizeByDefault('Turn on Find in Selection automatically when multiple lines of content are selected.'),
        ],
        "description": nls.localizeByDefault('Controls the condition for turning on Find in Selection automatically.'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.find.addExtraSpaceOnTop": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.find.loop": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the search automatically restarts from the beginning (or the end) when no further matches can be found."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.folding": {
        "description": nls.localizeByDefault("Controls whether the editor has code folding enabled."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.foldingStrategy": {
        "enumDescriptions": [
            nls.localizeByDefault("Use a language-specific folding strategy if available, else the indentation-based one."),
            nls.localizeByDefault("Use the indentation-based folding strategy.")
        ],
        "description": nls.localizeByDefault("Controls the strategy for computing folding ranges."),
        "type": "string",
        "enum": [
            "auto",
            "indentation"
        ],
        "default": "auto",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.foldingHighlight": {
        "description": nls.localizeByDefault("Controls whether the editor should highlight folded ranges."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.foldingImportsByDefault": {
        "description": nls.localizeByDefault("Controls whether the editor automatically collapses import ranges."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.foldingMaximumRegions": {
        "description": nls.localizeByDefault("The maximum number of foldable regions. Increasing this value may result in the editor becoming less responsive when the current source has a large number of foldable regions."),
        "type": "integer",
        "default": 5000,
        "minimum": 10,
        "maximum": 65000,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.unfoldOnClickAfterEndOfLine": {
        "description": nls.localizeByDefault("Controls whether clicking on the empty content after a folded line will unfold the line."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.fontFamily": {
        "description": nls.localizeByDefault("Controls the font family."),
        "type": "string",
        "default": isOSX ? 'Menlo, Monaco, \'Courier New\', monospace' : isWindows ? 'Consolas, \'Courier New\', monospace' : '\'Droid Sans Mono\', \'monospace\', monospace',
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.fontLigatures": {
        "anyOf": [
            {
                "type": "boolean",
                "description": nls.localizeByDefault("Enables/Disables font ligatures ('calt' and 'liga' font features). Change this to a string for fine-grained control of the 'font-feature-settings' CSS property.")
            },
            {
                "type": "string",
                "description": nls.localizeByDefault("Explicit 'font-feature-settings' CSS property. A boolean can be passed instead if one only needs to turn on/off ligatures.")
            }
        ],
        "description": nls.localizeByDefault("Configures font ligatures or font features. Can be either a boolean to enable/disable ligatures or a string for the value of the CSS 'font-feature-settings' property."),
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.fontSize": {
        "type": "number",
        "minimum": 6,
        "maximum": 100,
        "default": isOSX ? 12 : 14,
        "description": nls.localizeByDefault("Controls the font size in pixels."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.fontWeight": {
        "anyOf": [
            {
                "type": "number",
                "minimum": 1,
                "maximum": 1000,
                "errorMessage": "Only \"normal\" and \"bold\" keywords or numbers between 1 and 1000 are allowed."
            },
            {
                "type": "string",
                "pattern": "^(normal|bold|1000|[1-9][0-9]{0,2})$"
            },
            {
                "enum": [
                    "normal",
                    "bold",
                    "100",
                    "200",
                    "300",
                    "400",
                    "500",
                    "600",
                    "700",
                    "800",
                    "900"
                ]
            }
        ],
        "default": "normal",
        "description": nls.localizeByDefault("Controls the font weight. Accepts \"normal\" and \"bold\" keywords or numbers between 1 and 1000."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.formatOnPaste": {
        "description": nls.localizeByDefault("Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.formatOnType": {
        "description": nls.localizeByDefault("Controls whether the editor should automatically format the line after typing."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.glyphMargin": {
        "description": nls.localizeByDefault("Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.multiple": {
        "deprecationMessage": "This setting is deprecated, please use separate settings like 'editor.editor.gotoLocation.multipleDefinitions' or 'editor.editor.gotoLocation.multipleImplementations' instead.",
        "default": null,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.multipleDefinitions": {
        "description": nls.localizeByDefault("Controls the behavior the 'Go to Definition'-command when multiple target locations exist."),
        "type": "string",
        "enum": [
            "peek",
            "gotoAndPeek",
            "goto"
        ],
        "default": "peek",
        "enumDescriptions": [
            nls.localizeByDefault("Show Peek view of the results (default)"),
            nls.localizeByDefault("Go to the primary result and show a Peek view"),
            nls.localizeByDefault('Go to the primary result and enable Peek-less navigation to others')
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.multipleTypeDefinitions": {
        "description": nls.localizeByDefault("Controls the behavior the 'Go to Type Definition'-command when multiple target locations exist."),
        "type": "string",
        "enum": [
            "peek",
            "gotoAndPeek",
            "goto"
        ],
        "default": "peek",
        "enumDescriptions": [
            nls.localizeByDefault("Show Peek view of the results (default)"),
            nls.localizeByDefault("Go to the primary result and show a Peek view"),
            nls.localizeByDefault('Go to the primary result and enable Peek-less navigation to others')
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.multipleDeclarations": {
        "description": nls.localizeByDefault("Controls the behavior the 'Go to Declaration'-command when multiple target locations exist."),
        "type": "string",
        "enum": [
            "peek",
            "gotoAndPeek",
            "goto"
        ],
        "default": "peek",
        "enumDescriptions": [
            nls.localizeByDefault("Show Peek view of the results (default)"),
            nls.localizeByDefault("Go to the primary result and show a Peek view"),
            nls.localizeByDefault('Go to the primary result and enable Peek-less navigation to others')
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.multipleImplementations": {
        "description": nls.localizeByDefault("Controls the behavior the 'Go to Implementations'-command when multiple target locations exist."),
        "type": "string",
        "enum": [
            "peek",
            "gotoAndPeek",
            "goto"
        ],
        "default": "peek",
        "enumDescriptions": [
            nls.localizeByDefault("Show Peek view of the results (default)"),
            nls.localizeByDefault("Go to the primary result and show a Peek view"),
            nls.localizeByDefault('Go to the primary result and enable Peek-less navigation to others')
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.multipleReferences": {
        "description": nls.localizeByDefault("Controls the behavior the 'Go to References'-command when multiple target locations exist."),
        "type": "string",
        "enum": [
            "peek",
            "gotoAndPeek",
            "goto"
        ],
        "default": "peek",
        "enumDescriptions": [
            nls.localizeByDefault("Show Peek view of the results (default)"),
            nls.localizeByDefault("Go to the primary result and show a Peek view"),
            nls.localizeByDefault('Go to the primary result and enable Peek-less navigation to others')
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.alternativeDefinitionCommand": {
        "type": "string",
        "default": "editor.action.goToReferences",
        "enum": [
            "",
            "editor.action.referenceSearch.trigger",
            "editor.action.goToReferences",
            "editor.action.peekImplementation",
            "editor.action.goToImplementation",
            "editor.action.peekTypeDefinition",
            "editor.action.goToTypeDefinition",
            "editor.action.peekDeclaration",
            "editor.action.revealDeclaration",
            "editor.action.peekDefinition",
            "editor.action.revealDefinitionAside",
            "editor.action.revealDefinition"
        ],
        "description": nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Definition' is the current location."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.alternativeTypeDefinitionCommand": {
        "type": "string",
        "default": "editor.action.goToReferences",
        "enum": [
            "",
            "editor.action.referenceSearch.trigger",
            "editor.action.goToReferences",
            "editor.action.peekImplementation",
            "editor.action.goToImplementation",
            "editor.action.peekTypeDefinition",
            "editor.action.goToTypeDefinition",
            "editor.action.peekDeclaration",
            "editor.action.revealDeclaration",
            "editor.action.peekDefinition",
            "editor.action.revealDefinitionAside",
            "editor.action.revealDefinition"
        ],
        "description": nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Type Definition' is the current location."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.alternativeDeclarationCommand": {
        "type": "string",
        "default": "editor.action.goToReferences",
        "enum": [
            "",
            "editor.action.referenceSearch.trigger",
            "editor.action.goToReferences",
            "editor.action.peekImplementation",
            "editor.action.goToImplementation",
            "editor.action.peekTypeDefinition",
            "editor.action.goToTypeDefinition",
            "editor.action.peekDeclaration",
            "editor.action.revealDeclaration",
            "editor.action.peekDefinition",
            "editor.action.revealDefinitionAside",
            "editor.action.revealDefinition"
        ],
        "description": nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Declaration' is the current location."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.alternativeImplementationCommand": {
        "type": "string",
        "default": "",
        "enum": [
            "",
            "editor.action.referenceSearch.trigger",
            "editor.action.goToReferences",
            "editor.action.peekImplementation",
            "editor.action.goToImplementation",
            "editor.action.peekTypeDefinition",
            "editor.action.goToTypeDefinition",
            "editor.action.peekDeclaration",
            "editor.action.revealDeclaration",
            "editor.action.peekDefinition",
            "editor.action.revealDefinitionAside",
            "editor.action.revealDefinition"
        ],
        "description": nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Implementation' is the current location."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.gotoLocation.alternativeReferenceCommand": {
        "type": "string",
        "default": "",
        "enum": [
            "",
            "editor.action.referenceSearch.trigger",
            "editor.action.goToReferences",
            "editor.action.peekImplementation",
            "editor.action.goToImplementation",
            "editor.action.peekTypeDefinition",
            "editor.action.goToTypeDefinition",
            "editor.action.peekDeclaration",
            "editor.action.revealDeclaration",
            "editor.action.peekDefinition",
            "editor.action.revealDefinitionAside",
            "editor.action.revealDefinition"
        ],
        "description": nls.localizeByDefault("Alternative command id that is being executed when the result of 'Go to Reference' is the current location."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.hideCursorInOverviewRuler": {
        "description": nls.localizeByDefault("Controls whether the cursor should be hidden in the overview ruler."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.hover.enabled": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the hover is shown."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.hover.delay": {
        "type": "number",
        "default": 300,
        "minimum": 0,
        "maximum": 10000,
        "description": nls.localizeByDefault("Controls the delay in milliseconds after which the hover is shown."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.hover.sticky": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the hover should remain visible when mouse is moved over it."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.hover.above": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Prefer showing hovers above the line, if there's space."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.inlineSuggest.enabled": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether to automatically show inline suggestions in the editor."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.letterSpacing": {
        "description": nls.localizeByDefault("Controls the letter spacing in pixels."),
        "type": "number",
        "default": 0,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.lightbulb.enabled": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault('Enables the Code Action lightbulb in the editor.'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.lineHeight": {
        "markdownDescription": nls.localizeByDefault("Controls the line height. \n - Use 0 to automatically compute the line height from the font size.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values."),
        "type": "number",
        "default": 0,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.lineNumbers": {
        "type": "string",
        "enum": [
            "off",
            "on",
            "relative",
            "interval"
        ],
        "enumDescriptions": [
            nls.localizeByDefault("Line numbers are not rendered."),
            nls.localizeByDefault("Line numbers are rendered as absolute number."),
            nls.localizeByDefault("Line numbers are rendered as distance in lines to cursor position."),
            nls.localizeByDefault("Line numbers are rendered every 10 lines.")
        ],
        "default": "on",
        "description": nls.localizeByDefault("Controls the display of line numbers."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.linkedEditing": {
        "description": nls.localizeByDefault('Controls whether the editor has linked editing enabled. Depending on the language, related symbols such as HTML tags, are updated while editing.'),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.links": {
        "description": nls.localizeByDefault("Controls whether the editor should detect links and make them clickable."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.matchBrackets": {
        "description": nls.localizeByDefault("Highlight matching brackets."),
        "type": "string",
        "enum": [
            "always",
            "near",
            "never"
        ],
        "default": "always",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.enabled": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the minimap is shown."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.autohide": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether the minimap is hidden automatically."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.size": {
        "type": "string",
        "enum": [
            "proportional",
            "fill",
            "fit"
        ],
        "enumDescriptions": [
            nls.localizeByDefault("The minimap has the same size as the editor contents (and might scroll)."),
            nls.localizeByDefault("The minimap will stretch or shrink as necessary to fill the height of the editor (no scrolling)."),
            nls.localizeByDefault("The minimap will shrink as necessary to never be larger than the editor (no scrolling).")
        ],
        "default": "proportional",
        "description": nls.localizeByDefault("Controls the size of the minimap."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.side": {
        "type": "string",
        "enum": [
            "left",
            "right"
        ],
        "default": "right",
        "description": nls.localizeByDefault("Controls the side where to render the minimap."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.showSlider": {
        "type": "string",
        "enum": [
            "always",
            "mouseover"
        ],
        "default": "mouseover",
        "description": nls.localizeByDefault("Controls when the minimap slider is shown."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.scale": {
        "type": "number",
        "default": 1,
        "minimum": 1,
        "maximum": 3,
        "enum": [
            1,
            2,
            3
        ],
        "description": nls.localizeByDefault("Scale of content drawn in the minimap: 1, 2 or 3."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.renderCharacters": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Render the actual characters on a line as opposed to color blocks."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.minimap.maxColumn": {
        "type": "number",
        "default": 120,
        "description": nls.localizeByDefault("Limit the width of the minimap to render at most a certain number of columns."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.mouseWheelScrollSensitivity": {
        "markdownDescription": nls.localizeByDefault("A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events."),
        "type": "number",
        "default": 1,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.mouseWheelZoom": {
        "markdownDescription": nls.localizeByDefault("Zoom the font of the editor when using mouse wheel and holding `Ctrl`."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.multiCursorMergeOverlapping": {
        "description": nls.localizeByDefault("Merge multiple cursors when they are overlapping."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.multiCursorModifier": {
        "markdownEnumDescriptions": [
            nls.localizeByDefault("Maps to `Control` on Windows and Linux and to `Command` on macOS."),
            nls.localizeByDefault("Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
        ],
        "markdownDescription": nls.localizeByDefault("The modifier to be used to add multiple cursors with the mouse. The Go to Definition and Open Link mouse gestures will adapt such that they do not conflict with the [multicursor modifier](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier)."),
        "type": "string",
        "enum": [
            "ctrlCmd",
            "alt"
        ],
        "default": "alt",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.multiCursorPaste": {
        "markdownEnumDescriptions": [
            nls.localizeByDefault("Each cursor pastes a single line of the text."),
            nls.localizeByDefault("Each cursor pastes the full text.")
        ],
        "markdownDescription": nls.localizeByDefault("Controls pasting when the line count of the pasted text matches the cursor count."),
        "type": "string",
        "enum": [
            "spread",
            "full"
        ],
        "default": "spread",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.occurrencesHighlight": {
        "description": nls.localizeByDefault("Controls whether the editor should highlight semantic symbol occurrences."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.overviewRulerBorder": {
        "description": nls.localizeByDefault("Controls whether a border should be drawn around the overview ruler."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.padding.top": {
        "type": "number",
        "default": 0,
        "minimum": 0,
        "maximum": 1000,
        "description": nls.localizeByDefault("Controls the amount of space between the top edge of the editor and the first line."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.padding.bottom": {
        "type": "number",
        "default": 0,
        "minimum": 0,
        "maximum": 1000,
        "description": nls.localizeByDefault("Controls the amount of space between the bottom edge of the editor and the last line."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.parameterHints.enabled": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Enables a pop-up that shows parameter documentation and type information as you type."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.parameterHints.cycle": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether the parameter hints menu cycles or closes when reaching the end of the list."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.peekWidgetDefaultFocus": {
        "enumDescriptions": [
            nls.localizeByDefault("Focus the tree when opening peek"),
            nls.localizeByDefault("Focus the editor when opening peek")
        ],
        "description": nls.localizeByDefault("Controls whether to focus the inline editor or the tree in the peek widget."),
        "type": "string",
        "enum": [
            "tree",
            "editor"
        ],
        "default": "tree",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.definitionLinkOpensInPeek": {
        "description": nls.localizeByDefault("Controls whether the Go to Definition mouse gesture always opens the peek widget."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.quickSuggestions": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "strings": {
                "anyOf": [
                    {
                        "type": "boolean"
                    },
                    {
                        "type": "string",
                        "enum": [
                            "on",
                            "inline",
                            "off"
                        ],
                        "enumDescriptions": [
                            nls.localizeByDefault("Quick suggestions show inside the suggest widget"),
                            nls.localizeByDefault("Quick suggestions show as ghost text"),
                            nls.localizeByDefault("Quick suggestions are disabled")
                        ]
                    }
                ],
                "default": "off",
                "description": nls.localizeByDefault("Enable quick suggestions inside strings.")
            },
            "comments": {
                "anyOf": [
                    {
                        "type": "boolean"
                    },
                    {
                        "type": "string",
                        "enum": [
                            "on",
                            "inline",
                            "off"
                        ],
                        "enumDescriptions": [
                            nls.localizeByDefault("Quick suggestions show inside the suggest widget"),
                            nls.localizeByDefault("Quick suggestions show as ghost text"),
                            nls.localizeByDefault("Quick suggestions are disabled")
                        ]
                    }
                ],
                "default": "off",
                "description": nls.localizeByDefault("Enable quick suggestions inside comments.")
            },
            "other": {
                "anyOf": [
                    {
                        "type": "boolean"
                    },
                    {
                        "type": "string",
                        "enum": [
                            "on",
                            "inline",
                            "off"
                        ],
                        "enumDescriptions": [
                            nls.localizeByDefault("Quick suggestions show inside the suggest widget"),
                            nls.localizeByDefault("Quick suggestions show as ghost text"),
                            nls.localizeByDefault("Quick suggestions are disabled")
                        ]
                    }
                ],
                "default": "on",
                "description": nls.localizeByDefault("Enable quick suggestions outside of strings and comments.")
            }
        },
        "default": {
            "other": "on",
            "comments": "off",
            "strings": "off"
        },
        "markdownDescription": nls.localize("theia/editor/editor.quickSuggestions", "Controls whether suggestions should automatically show up while typing. This can be controlled for typing in comments, strings, and other code. Quick suggestion can be configured to show as ghost text or with the suggest widget. Also be aware of the '#editor.suggestOnTriggerCharacters#'-setting which controls if suggestions are triggered by special characters."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.quickSuggestionsDelay": {
        "description": nls.localizeByDefault("Controls the delay in milliseconds after which quick suggestions will show up."),
        "type": "integer",
        "default": 10,
        "minimum": 0,
        "maximum": 1073741824,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.renameOnType": {
        "description": nls.localizeByDefault("Controls whether the editor auto renames on type."),
        "markdownDeprecationMessage": "Deprecated, use `editor.linkedEditing` instead.",
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false,
        "deprecationMessage": "Deprecated, use `editor.linkedEditing` instead."
    },
    "editor.renderControlCharacters": {
        "description": nls.localizeByDefault("Controls whether the editor should render control characters."),
        "restricted": true,
        "type": "boolean",
        "default": true,
        "scope": "language-overridable"
    },
    "editor.renderFinalNewline": {
        "description": nls.localizeByDefault("Render last line number when the file ends with a newline."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.renderLineHighlight": {
        "enumDescriptions": [
            "",
            "",
            "",
            nls.localizeByDefault("Highlights both the gutter and the current line.")
        ],
        "description": nls.localizeByDefault("Controls how the editor should render the current line highlight."),
        "type": "string",
        "enum": [
            "none",
            "gutter",
            "line",
            "all"
        ],
        "default": "line",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.renderLineHighlightOnlyWhenFocus": {
        "description": nls.localizeByDefault("Controls if the editor should render the current line highlight only when the editor is focused."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.renderWhitespace": {
        "enumDescriptions": [
            "",
            nls.localizeByDefault("Render whitespace characters except for single spaces between words."),
            nls.localizeByDefault("Render whitespace characters only on selected text."),
            nls.localizeByDefault("Render only trailing whitespace characters."),
            ""
        ],
        "description": nls.localizeByDefault("Controls how the editor should render whitespace characters."),
        "type": "string",
        "enum": [
            "none",
            "boundary",
            "selection",
            "trailing",
            "all"
        ],
        "default": "selection",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.roundedSelection": {
        "description": nls.localizeByDefault("Controls whether selections should have rounded corners."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.rulers": {
        "type": "array",
        "items": {
            "anyOf": [
                {
                    "type": "number",
                    "description": nls.localizeByDefault("Number of monospace characters at which this editor ruler will render.")
                },
                {
                    "type": [
                        "object"
                    ],
                    "properties": {
                        "column": {
                            "type": "number",
                            "description": nls.localizeByDefault("Number of monospace characters at which this editor ruler will render.")
                        },
                        "color": {
                            "type": "string",
                            "description": nls.localizeByDefault("Color of this editor ruler."),
                            "format": "color-hex"
                        }
                    }
                }
            ]
        },
        "default": [],
        "description": nls.localizeByDefault("Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollbar.vertical": {
        "type": "string",
        "enum": [
            "auto",
            "visible",
            "hidden"
        ],
        "enumDescriptions": [
            nls.localizeByDefault("The vertical scrollbar will be visible only when necessary."),
            nls.localizeByDefault("The vertical scrollbar will always be visible."),
            nls.localizeByDefault("The vertical scrollbar will always be hidden.")
        ],
        "default": "auto",
        "description": nls.localizeByDefault("Controls the visibility of the vertical scrollbar."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollbar.horizontal": {
        "type": "string",
        "enum": [
            "auto",
            "visible",
            "hidden"
        ],
        "enumDescriptions": [
            nls.localizeByDefault("The horizontal scrollbar will be visible only when necessary."),
            nls.localizeByDefault("The horizontal scrollbar will always be visible."),
            nls.localizeByDefault("The horizontal scrollbar will always be hidden.")
        ],
        "default": "auto",
        "description": nls.localizeByDefault("Controls the visibility of the horizontal scrollbar."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollbar.verticalScrollbarSize": {
        "type": "number",
        "default": 14,
        "description": nls.localizeByDefault("The width of the vertical scrollbar."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollbar.horizontalScrollbarSize": {
        "type": "number",
        "default": 12,
        "description": nls.localizeByDefault("The height of the horizontal scrollbar."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollbar.scrollByPage": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether clicks scroll by page or jump to click position."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollBeyondLastColumn": {
        "description": nls.localizeByDefault("Controls the number of extra characters beyond which the editor will scroll horizontally."),
        "type": "integer",
        "default": 4,
        "minimum": 0,
        "maximum": 1073741824,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollBeyondLastLine": {
        "description": nls.localizeByDefault("Controls whether the editor will scroll beyond the last line."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.scrollPredominantAxis": {
        "description": nls.localizeByDefault("Scroll only along the predominant axis when scrolling both vertically and horizontally at the same time. Prevents horizontal drift when scrolling vertically on a trackpad."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.selectionClipboard": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether the Linux primary clipboard should be supported."),
        "included": !isOSX && !isWindows
    },
    "editor.selectionHighlight": {
        "description": nls.localizeByDefault("Controls whether the editor should highlight matches similar to the selection."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.showFoldingControls": {
        "enumDescriptions": [
            nls.localizeByDefault("Always show the folding controls."),
            nls.localizeByDefault("Never show the folding controls and reduce the gutter size."),
            nls.localizeByDefault("Only show the folding controls when the mouse is over the gutter.")
        ],
        "description": nls.localizeByDefault("Controls when the folding controls on the gutter are shown."),
        "type": "string",
        "enum": [
            "always",
            "never",
            "mouseover"
        ],
        "default": "mouseover",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.showUnused": {
        "description": nls.localizeByDefault("Controls fading out of unused code."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.snippetSuggestions": {
        "enumDescriptions": [
            nls.localizeByDefault("Show snippet suggestions on top of other suggestions."),
            nls.localizeByDefault("Show snippet suggestions below other suggestions."),
            nls.localizeByDefault("Show snippets suggestions with other suggestions."),
            nls.localizeByDefault("Do not show snippet suggestions.")
        ],
        "description": nls.localizeByDefault("Controls whether snippets are shown with other suggestions and how they are sorted."),
        "type": "string",
        "enum": [
            "top",
            "bottom",
            "inline",
            "none"
        ],
        "default": "inline",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.smartSelect.selectLeadingAndTrailingWhitespace": {
        "description": nls.localizeByDefault("Whether leading and trailing whitespace should always be selected."),
        "default": true,
        "type": "boolean",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.smoothScrolling": {
        "description": nls.localizeByDefault("Controls whether the editor will scroll using an animation."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.stickyScroll.enabled": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Shows the nested current scopes during the scroll at the top of the editor."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.stickyScroll.maxLineCount": {
        "type": "number",
        "default": 5,
        "minimum": 1,
        "maximum": 10,
        "description": nls.localizeByDefault("Defines the maximum number of sticky lines to show."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.stickyTabStops": {
        "description": nls.localizeByDefault("Emulate selection behavior of tab characters when using spaces for indentation. Selection will stick to tab stops."),
        "type": "boolean",
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.insertMode": {
        "type": "string",
        "enum": [
            "insert",
            "replace"
        ],
        "enumDescriptions": [
            nls.localizeByDefault("Insert suggestion without overwriting text right of the cursor."),
            nls.localizeByDefault("Insert suggestion and overwrite text right of the cursor.")
        ],
        "default": "insert",
        "description": nls.localizeByDefault("Controls whether words are overwritten when accepting completions. Note that this depends on extensions opting into this feature."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.filterGraceful": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether filtering and sorting suggestions accounts for small typos."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.localityBonus": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether sorting favors words that appear close to the cursor."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.shareSuggestSelections": {
        "type": "boolean",
        "default": false,
        "markdownDescription": nls.localizeByDefault("Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`)."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.snippetsPreventQuickSuggestions": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether an active snippet prevents quick suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showIcons": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether to show or hide icons in suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showStatusBar": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls the visibility of the status bar at the bottom of the suggest widget."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.preview": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether to preview the suggestion outcome in the editor."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showInlineDetails": {
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault('Controls whether suggest details show inline with the label or only in the details widget.'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.maxVisibleSuggestions": {
        "type": "number",
        "deprecationMessage": "This setting is deprecated. The suggest widget can now be resized.",
        "default": 0,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.filteredTypes": {
        "type": "object",
        "deprecationMessage": "This setting is deprecated, please use separate settings like 'editor.suggest.showKeywords' or 'editor.suggest.showSnippets' instead.",
        "default": {},
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showMethods": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `method`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showFunctions": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `function`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showConstructors": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `constructor`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showDeprecated": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `deprecated`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.matchOnWordStartOnly": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localize("theia/editor/editor.suggest.matchOnWordStartOnly", "When enabled IntelliSense filtering requires that the first character matches on a word start, e.g `c` on `Console` or `WebContext` but _not_ on `description`. When disabled IntelliSense will show more results but still sorts them by match quality."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showFields": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `field`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showVariables": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `variable`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showClasses": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `class`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showStructs": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `struct`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showInterfaces": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `interface`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showModules": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `module`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showProperties": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `property`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showEvents": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `event`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showOperators": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `operator`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showUnits": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `unit`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showValues": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `value`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showConstants": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `constant`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showEnums": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `enum`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showEnumMembers": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `enumMember`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showKeywords": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `keyword`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showWords": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `text`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showColors": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `color`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showFiles": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `file`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showReferences": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `reference`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showCustomcolors": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `customcolor`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showFolders": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `folder`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showTypeParameters": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `typeParameter`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showSnippets": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `snippet`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showUsers": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `user`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggest.showIssues": {
        "type": "boolean",
        "default": true,
        "markdownDescription": nls.localizeByDefault("When enabled IntelliSense shows `issues`-suggestions."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggestFontSize": {
        "markdownDescription": nls.localizeByDefault('Font size for the suggest widget. When set to {0}, the value of {1} is used.', '`0`', '`#editor.fontSize#`'),
        "type": "integer",
        "default": 0,
        "minimum": 0,
        "maximum": 1000,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggestLineHeight": {
        "markdownDescription": nls.localizeByDefault('Line height for the suggest widget. When set to {0}, the value of {1} is used. The minimum value is 8.', '`0`', '`#editor.lineHeight#`'),
        "type": "integer",
        "default": 0,
        "minimum": 0,
        "maximum": 1000,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggestOnTriggerCharacters": {
        "description": nls.localizeByDefault("Controls whether suggestions should automatically show up when typing trigger characters."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.suggestSelection": {
        "markdownEnumDescriptions": [
            nls.localizeByDefault("Always select the first suggestion."),
            nls.localizeByDefault("Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently."),
            nls.localizeByDefault("Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`.")
        ],
        "description": nls.localizeByDefault("Controls how suggestions are pre-selected when showing the suggest list."),
        "type": "string",
        "enum": [
            "first",
            "recentlyUsed",
            "recentlyUsedByPrefix"
        ],
        "default": "first",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.tabCompletion": {
        "enumDescriptions": [
            nls.localizeByDefault("Tab complete will insert the best matching suggestion when pressing tab."),
            nls.localizeByDefault("Disable tab completions."),
            nls.localizeByDefault("Tab complete snippets when their prefix match. Works best when 'quickSuggestions' aren't enabled.")
        ],
        "description": nls.localizeByDefault("Enables tab completions."),
        "type": "string",
        "enum": [
            "on",
            "off",
            "onlySnippets"
        ],
        "default": "off",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.unicodeHighlight.nonBasicASCII": {
        "restricted": true,
        "type": [
            "boolean",
            "string"
        ],
        "enum": [
            true,
            false,
            "inUntrustedWorkspace"
        ],
        "default": "inUntrustedWorkspace",
        "description": nls.localizeByDefault("Controls whether all non-basic ASCII characters are highlighted. Only characters between U+0020 and U+007E, tab, line-feed and carriage-return are considered basic ASCII."),
        "scope": "language-overridable"
    },
    "editor.unicodeHighlight.invisibleCharacters": {
        "restricted": true,
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether characters that just reserve space or have no width at all are highlighted."),
        "scope": "language-overridable"
    },
    "editor.unicodeHighlight.ambiguousCharacters": {
        "restricted": true,
        "type": "boolean",
        "default": true,
        "description": nls.localizeByDefault("Controls whether characters are highlighted that can be confused with basic ASCII characters, except those that are common in the current user locale."),
        "scope": "language-overridable"
    },
    "editor.unicodeHighlight.includeComments": {
        "restricted": true,
        "type": [
            "boolean",
            "string"
        ],
        "enum": [
            true,
            false,
            "inUntrustedWorkspace"
        ],
        "default": "inUntrustedWorkspace",
        "description": nls.localizeByDefault('Controls whether characters in comments should also be subject to Unicode highlighting.'),
        "scope": "language-overridable"
    },
    "editor.unicodeHighlight.includeStrings": {
        "restricted": true,
        "type": [
            "boolean",
            "string"
        ],
        "enum": [
            true,
            false,
            "inUntrustedWorkspace"
        ],
        "default": true,
        "description": nls.localizeByDefault('Controls whether characters in strings should also be subject to Unicode highlighting.'),
        "scope": "language-overridable"
    },
    "editor.unicodeHighlight.allowedCharacters": {
        "restricted": true,
        "type": "object",
        "default": {},
        "description": nls.localizeByDefault("Defines allowed characters that are not being highlighted."),
        "additionalProperties": {
            "type": "boolean"
        },
        "scope": "language-overridable"
    },
    "editor.unicodeHighlight.allowedLocales": {
        "restricted": true,
        "type": "object",
        "additionalProperties": {
            "type": "boolean"
        },
        "default": {
            "_os": true,
            "_vscode": true
        },
        "description": nls.localizeByDefault("Unicode characters that are common in allowed locales are not being highlighted."),
        "scope": "language-overridable"
    },
    "editor.unusualLineTerminators": {
        "enumDescriptions": [
            nls.localizeByDefault("Unusual line terminators are automatically removed."),
            nls.localizeByDefault("Unusual line terminators are ignored."),
            nls.localizeByDefault("Unusual line terminators prompt to be removed.")
        ],
        "description": nls.localizeByDefault("Remove unusual line terminators that might cause problems."),
        "type": "string",
        "enum": [
            "auto",
            "off",
            "prompt"
        ],
        "default": "prompt",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.useTabStops": {
        "description": nls.localizeByDefault("Inserting and deleting whitespace follows tab stops."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.wordSeparators": {
        "description": nls.localizeByDefault("Characters that will be used as word separators when doing word related navigations or operations."),
        "type": "string",
        "default": "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.wordWrap": {
        "markdownEnumDescriptions": [
            nls.localizeByDefault("Lines will never wrap."),
            nls.localizeByDefault("Lines will wrap at the viewport width."),
            nls.localizeByDefault("Lines will wrap at `#editor.wordWrapColumn#`."),
            nls.localizeByDefault("Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`.")
        ],
        "description": nls.localizeByDefault("Controls how lines should wrap."),
        "type": "string",
        "enum": [
            "off",
            "on",
            "wordWrapColumn",
            "bounded"
        ],
        "default": "off",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.wordWrapColumn": {
        "markdownDescription": nls.localizeByDefault("Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`."),
        "type": "integer",
        "default": 80,
        "minimum": 1,
        "maximum": 1073741824,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.wrappingIndent": {
        "enumDescriptions": [
            nls.localizeByDefault("No indentation. Wrapped lines begin at column 1."),
            nls.localizeByDefault("Wrapped lines get the same indentation as the parent."),
            nls.localizeByDefault("Wrapped lines get +1 indentation toward the parent."),
            nls.localizeByDefault("Wrapped lines get +2 indentation toward the parent.")
        ],
        "description": nls.localizeByDefault("Controls the indentation of wrapped lines."),
        "type": "string",
        "enum": [
            "none",
            "same",
            "indent",
            "deepIndent"
        ],
        "default": "same",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.wrappingStrategy": {
        "enumDescriptions": [
            nls.localizeByDefault("Assumes that all characters are of the same width. This is a fast algorithm that works correctly for monospace fonts and certain scripts (like Latin characters) where glyphs are of equal width."),
            nls.localizeByDefault("Delegates wrapping points computation to the browser. This is a slow algorithm, that might cause freezes for large files, but it works correctly in all cases.")
        ],
        "description": nls.localizeByDefault('Controls the algorithm that computes wrapping points. Note that when in accessibility mode, advanced will be used for the best experience.'),
        "type": "string",
        "enum": [
            "simple",
            "advanced"
        ],
        "default": "simple",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.showDeprecated": {
        "description": nls.localizeByDefault("Controls strikethrough deprecated variables."),
        "type": "boolean",
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.inlayHints.enabled": {
        "type": "string",
        "default": "on",
        "description": nls.localizeByDefault("Enables the inlay hints in the editor."),
        "enum": [
            "on",
            "onUnlessPressed",
            "offUnlessPressed",
            "off"
        ],
        "markdownEnumDescriptions": [
            nls.localizeByDefault("Inlay hints are enabled"),
            nls.localize("theia/editor/editor.inlayHints.enabled1", "Inlay hints are showing by default and hide when holding Ctrl+Alt"),
            nls.localize("theia/editor/editor.inlayHints.enabled2", "Inlay hints are hidden by default and show when holding Ctrl+Alt"),
            nls.localizeByDefault("Inlay hints are disabled")
        ],
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.inlayHints.fontSize": {
        "type": "number",
        "default": 0,
        "markdownDescription": nls.localizeByDefault('Controls font size of inlay hints in the editor. As default the {0} is used when the configured value is less than {1} or greater than the editor font size.', '`#editor.fontSize#`'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.inlayHints.fontFamily": {
        "type": "string",
        "default": "",
        "markdownDescription": nls.localizeByDefault('Controls font family of inlay hints in the editor. When set to empty, the {0} is used.', '`#editor.fontFamily#`'),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.inlayHints.padding": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Enables the padding around the inlay hints in the editor."),
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.codeActionWidget.showHeaders": {
        "type": "boolean",
        "description": nls.localize("theia/editor/editor.codeActionWidget.showHeaders", "Enable/disable showing group headers in the code action menu."),
        "default": true,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.experimental.pasteActions.enabled": {
        "type": "boolean",
        "description": nls.localizeByDefault("Enable/disable running edits from extensions on paste."),
        "default": false,
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.rename.enablePreview": {
        "description": nls.localizeByDefault("Enable/disable the ability to preview changes before renaming"),
        "default": true,
        "type": "boolean",
        "scope": "language-overridable",
        "restricted": false
    },
    "editor.find.globalFindClipboard": {
        "type": "boolean",
        "default": false,
        "description": nls.localizeByDefault("Controls whether the Find Widget should read or modify the shared find clipboard on macOS."),
        "included": isOSX
    }
};

type QuickSuggestionValues = boolean | 'on' | 'inline' | 'off';

export interface GeneratedEditorPreferences {
    'editor.tabSize': number;
    'editor.insertSpaces': boolean;
    'editor.detectIndentation': boolean;
    'editor.trimAutoWhitespace': boolean;
    'editor.largeFileOptimizations': boolean;
    'editor.wordBasedSuggestions': boolean;
    'editor.wordBasedSuggestionsMode': 'currentDocument' | 'matchingDocuments' | 'allDocuments';
    'editor.semanticHighlighting.enabled': true | false | 'configuredByTheme';
    'editor.stablePeek': boolean;
    'editor.maxTokenizationLineLength': number;
    'editor.language.brackets': Array<[string, string]> | null | 'null';
    'editor.language.colorizedBracketPairs': Array<[string, string]> | null;
    'diffEditor.maxComputationTime': number;
    'diffEditor.maxFileSize': number;
    'diffEditor.renderSideBySide': boolean;
    'diffEditor.renderMarginRevertIcon': boolean;
    'diffEditor.ignoreTrimWhitespace': boolean;
    'diffEditor.renderIndicators': boolean;
    'diffEditor.codeLens': boolean;
    'diffEditor.wordWrap': 'off' | 'on' | 'inherit';
    'diffEditor.diffAlgorithm': 'smart' | 'experimental';
    'editor.acceptSuggestionOnCommitCharacter': boolean;
    'editor.acceptSuggestionOnEnter': 'on' | 'smart' | 'off';
    'editor.accessibilitySupport': 'auto' | 'on' | 'off';
    'editor.accessibilityPageSize': number;
    'editor.autoClosingBrackets': 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
    'editor.autoClosingDelete': 'always' | 'auto' | 'never';
    'editor.autoClosingOvertype': 'always' | 'auto' | 'never';
    'editor.autoClosingQuotes': 'always' | 'languageDefined' | 'beforeWhitespace' | 'never';
    'editor.autoIndent': 'none' | 'keep' | 'brackets' | 'advanced' | 'full';
    'editor.autoSurround': 'languageDefined' | 'quotes' | 'brackets' | 'never';
    'editor.bracketPairColorization.enabled': boolean;
    'editor.bracketPairColorization.independentColorPoolPerBracketType': boolean;
    'editor.guides.bracketPairs': true | 'active' | false;
    'editor.guides.bracketPairsHorizontal': true | 'active' | false;
    'editor.guides.highlightActiveBracketPair': boolean;
    'editor.guides.indentation': boolean;
    'editor.guides.highlightActiveIndentation': true | 'always' | false;
    'editor.codeLens': boolean;
    'editor.codeLensFontFamily': string;
    'editor.codeLensFontSize': number;
    'editor.colorDecorators': boolean;
    'editor.columnSelection': boolean;
    'editor.comments.insertSpace': boolean;
    'editor.comments.ignoreEmptyLines': boolean;
    'editor.copyWithSyntaxHighlighting': boolean;
    'editor.cursorBlinking': 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
    'editor.cursorSmoothCaretAnimation': boolean;
    'editor.cursorStyle': 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
    'editor.cursorSurroundingLines': number;
    'editor.cursorSurroundingLinesStyle': 'default' | 'all';
    'editor.cursorWidth': number;
    'editor.dragAndDrop': boolean;
    'editor.dropIntoEditor.enabled': boolean;
    'editor.emptySelectionClipboard': boolean;
    'editor.fastScrollSensitivity': number;
    'editor.find.cursorMoveOnType': boolean;
    'editor.find.seedSearchStringFromSelection': 'never' | 'always' | 'selection';
    'editor.find.autoFindInSelection': 'never' | 'always' | 'multiline';
    'editor.find.addExtraSpaceOnTop': boolean;
    'editor.find.loop': boolean;
    'editor.folding': boolean;
    'editor.foldingStrategy': 'auto' | 'indentation';
    'editor.foldingHighlight': boolean;
    'editor.foldingImportsByDefault': boolean;
    'editor.foldingMaximumRegions': number;
    'editor.unfoldOnClickAfterEndOfLine': boolean;
    'editor.fontFamily': string;
    'editor.fontLigatures': boolean | string;
    'editor.fontSize': number;
    'editor.fontWeight': number | string | 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
    'editor.formatOnPaste': boolean;
    'editor.formatOnType': boolean;
    'editor.glyphMargin': boolean;
    'editor.gotoLocation.multiple': null;
    'editor.gotoLocation.multipleDefinitions': 'peek' | 'gotoAndPeek' | 'goto';
    'editor.gotoLocation.multipleTypeDefinitions': 'peek' | 'gotoAndPeek' | 'goto';
    'editor.gotoLocation.multipleDeclarations': 'peek' | 'gotoAndPeek' | 'goto';
    'editor.gotoLocation.multipleImplementations': 'peek' | 'gotoAndPeek' | 'goto';
    'editor.gotoLocation.multipleReferences': 'peek' | 'gotoAndPeek' | 'goto';
    'editor.gotoLocation.alternativeDefinitionCommand': '' | 'editor.action.referenceSearch.trigger' | 'editor.action.goToReferences' | 'editor.action.peekImplementation' | 'editor.action.goToImplementation' | 'editor.action.peekTypeDefinition' | 'editor.action.goToTypeDefinition' | 'editor.action.peekDeclaration' | 'editor.action.revealDeclaration' | 'editor.action.peekDefinition' | 'editor.action.revealDefinitionAside' | 'editor.action.revealDefinition';
    'editor.gotoLocation.alternativeTypeDefinitionCommand': '' | 'editor.action.referenceSearch.trigger' | 'editor.action.goToReferences' | 'editor.action.peekImplementation' | 'editor.action.goToImplementation' | 'editor.action.peekTypeDefinition' | 'editor.action.goToTypeDefinition' | 'editor.action.peekDeclaration' | 'editor.action.revealDeclaration' | 'editor.action.peekDefinition' | 'editor.action.revealDefinitionAside' | 'editor.action.revealDefinition';
    'editor.gotoLocation.alternativeDeclarationCommand': '' | 'editor.action.referenceSearch.trigger' | 'editor.action.goToReferences' | 'editor.action.peekImplementation' | 'editor.action.goToImplementation' | 'editor.action.peekTypeDefinition' | 'editor.action.goToTypeDefinition' | 'editor.action.peekDeclaration' | 'editor.action.revealDeclaration' | 'editor.action.peekDefinition' | 'editor.action.revealDefinitionAside' | 'editor.action.revealDefinition';
    'editor.gotoLocation.alternativeImplementationCommand': '' | 'editor.action.referenceSearch.trigger' | 'editor.action.goToReferences' | 'editor.action.peekImplementation' | 'editor.action.goToImplementation' | 'editor.action.peekTypeDefinition' | 'editor.action.goToTypeDefinition' | 'editor.action.peekDeclaration' | 'editor.action.revealDeclaration' | 'editor.action.peekDefinition' | 'editor.action.revealDefinitionAside' | 'editor.action.revealDefinition';
    'editor.gotoLocation.alternativeReferenceCommand': '' | 'editor.action.referenceSearch.trigger' | 'editor.action.goToReferences' | 'editor.action.peekImplementation' | 'editor.action.goToImplementation' | 'editor.action.peekTypeDefinition' | 'editor.action.goToTypeDefinition' | 'editor.action.peekDeclaration' | 'editor.action.revealDeclaration' | 'editor.action.peekDefinition' | 'editor.action.revealDefinitionAside' | 'editor.action.revealDefinition';
    'editor.hideCursorInOverviewRuler': boolean;
    'editor.hover.enabled': boolean;
    'editor.hover.delay': number;
    'editor.hover.sticky': boolean;
    'editor.hover.above': boolean;
    'editor.inlineSuggest.enabled': boolean;
    'editor.letterSpacing': number;
    'editor.lightbulb.enabled': boolean;
    'editor.lineHeight': number;
    'editor.lineNumbers': 'off' | 'on' | 'relative' | 'interval';
    'editor.linkedEditing': boolean;
    'editor.links': boolean;
    'editor.matchBrackets': 'always' | 'near' | 'never';
    'editor.minimap.enabled': boolean;
    'editor.minimap.autohide': boolean;
    'editor.minimap.size': 'proportional' | 'fill' | 'fit';
    'editor.minimap.side': 'left' | 'right';
    'editor.minimap.showSlider': 'always' | 'mouseover';
    'editor.minimap.scale': '1' | '2' | '3';
    'editor.minimap.renderCharacters': boolean;
    'editor.minimap.maxColumn': number;
    'editor.mouseWheelScrollSensitivity': number;
    'editor.mouseWheelZoom': boolean;
    'editor.multiCursorMergeOverlapping': boolean;
    'editor.multiCursorModifier': 'ctrlCmd' | 'alt';
    'editor.multiCursorPaste': 'spread' | 'full';
    'editor.occurrencesHighlight': boolean;
    'editor.overviewRulerBorder': boolean;
    'editor.padding.top': number;
    'editor.padding.bottom': number;
    'editor.parameterHints.enabled': boolean;
    'editor.parameterHints.cycle': boolean;
    'editor.peekWidgetDefaultFocus': 'tree' | 'editor';
    'editor.definitionLinkOpensInPeek': boolean;
    'editor.quickSuggestions': boolean | { other?: QuickSuggestionValues; comments?: QuickSuggestionValues; strings?: QuickSuggestionValues };
    'editor.quickSuggestionsDelay': number;
    'editor.renameOnType': boolean;
    'editor.renderControlCharacters': boolean;
    'editor.renderFinalNewline': boolean;
    'editor.renderLineHighlight': 'none' | 'gutter' | 'line' | 'all';
    'editor.renderLineHighlightOnlyWhenFocus': boolean;
    'editor.renderWhitespace': 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
    'editor.roundedSelection': boolean;
    'editor.rulers': Array<number | { column: number, color: string }>;
    'editor.scrollbar.vertical': 'auto' | 'visible' | 'hidden';
    'editor.scrollbar.horizontal': 'auto' | 'visible' | 'hidden';
    'editor.scrollbar.verticalScrollbarSize': number;
    'editor.scrollbar.horizontalScrollbarSize': number;
    'editor.scrollbar.scrollByPage': boolean;
    'editor.scrollBeyondLastColumn': number;
    'editor.scrollBeyondLastLine': boolean;
    'editor.scrollPredominantAxis': boolean;
    'editor.selectionClipboard': boolean;
    'editor.selectionHighlight': boolean;
    'editor.showFoldingControls': 'always' | 'never' | 'mouseover';
    'editor.showUnused': boolean;
    'editor.snippetSuggestions': 'top' | 'bottom' | 'inline' | 'none';
    'editor.smartSelect.selectLeadingAndTrailingWhitespace': boolean;
    'editor.smoothScrolling': boolean;
    'editor.stickyScroll.enabled': boolean;
    'editor.stickyScroll.maxLineCount': number;
    'editor.stickyTabStops': boolean;
    'editor.suggest.insertMode': 'insert' | 'replace';
    'editor.suggest.filterGraceful': boolean;
    'editor.suggest.localityBonus': boolean;
    'editor.suggest.shareSuggestSelections': boolean;
    'editor.suggest.snippetsPreventQuickSuggestions': boolean;
    'editor.suggest.showIcons': boolean;
    'editor.suggest.showStatusBar': boolean;
    'editor.suggest.preview': boolean;
    'editor.suggest.showInlineDetails': boolean;
    'editor.suggest.maxVisibleSuggestions': number;
    'editor.suggest.filteredTypes': Record<string, boolean>;
    'editor.suggest.showMethods': boolean;
    'editor.suggest.showFunctions': boolean;
    'editor.suggest.showConstructors': boolean;
    'editor.suggest.showDeprecated': boolean;
    'editor.suggest.matchOnWordStartOnly': boolean;
    'editor.suggest.showFields': boolean;
    'editor.suggest.showVariables': boolean;
    'editor.suggest.showClasses': boolean;
    'editor.suggest.showStructs': boolean;
    'editor.suggest.showInterfaces': boolean;
    'editor.suggest.showModules': boolean;
    'editor.suggest.showProperties': boolean;
    'editor.suggest.showEvents': boolean;
    'editor.suggest.showOperators': boolean;
    'editor.suggest.showUnits': boolean;
    'editor.suggest.showValues': boolean;
    'editor.suggest.showConstants': boolean;
    'editor.suggest.showEnums': boolean;
    'editor.suggest.showEnumMembers': boolean;
    'editor.suggest.showKeywords': boolean;
    'editor.suggest.showWords': boolean;
    'editor.suggest.showColors': boolean;
    'editor.suggest.showFiles': boolean;
    'editor.suggest.showReferences': boolean;
    'editor.suggest.showCustomcolors': boolean;
    'editor.suggest.showFolders': boolean;
    'editor.suggest.showTypeParameters': boolean;
    'editor.suggest.showSnippets': boolean;
    'editor.suggest.showUsers': boolean;
    'editor.suggest.showIssues': boolean;
    'editor.suggestFontSize': number;
    'editor.suggestLineHeight': number;
    'editor.suggestOnTriggerCharacters': boolean;
    'editor.suggestSelection': 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix';
    'editor.tabCompletion': 'on' | 'off' | 'onlySnippets';
    'editor.unicodeHighlight.nonBasicASCII': true | false | 'inUntrustedWorkspace';
    'editor.unicodeHighlight.invisibleCharacters': boolean;
    'editor.unicodeHighlight.ambiguousCharacters': boolean;
    'editor.unicodeHighlight.includeComments': true | false | 'inUntrustedWorkspace';
    'editor.unicodeHighlight.includeStrings': true | false | 'inUntrustedWorkspace';
    'editor.unicodeHighlight.allowedCharacters': Record<string, boolean>;
    'editor.unicodeHighlight.allowedLocales': Record<string, boolean>;
    'editor.unusualLineTerminators': 'auto' | 'off' | 'prompt';
    'editor.useTabStops': boolean;
    'editor.wordSeparators': string;
    'editor.wordWrap': 'off' | 'on' | 'wordWrapColumn' | 'bounded';
    'editor.wordWrapColumn': number;
    'editor.wrappingIndent': 'none' | 'same' | 'indent' | 'deepIndent';
    'editor.wrappingStrategy': 'simple' | 'advanced';
    'editor.showDeprecated': boolean;
    'editor.inlayHints.enabled': 'on' | 'onUnlessPressed' | 'offUnlessPressed' | 'off';
    'editor.inlayHints.fontSize': number;
    'editor.inlayHints.fontFamily': string;
    'editor.inlayHints.padding': boolean;
    'editor.codeActionWidget.showHeaders': boolean;
    'editor.experimental.pasteActions.enabled': boolean;
    'editor.rename.enablePreview': boolean;
    'editor.find.globalFindClipboard': boolean;
}
