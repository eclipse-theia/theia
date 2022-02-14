
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

import 'monaco-editor-core/esm/vs/editor/browser/controller/textAreaHandler.css';
import 'monaco-editor-core/esm/vs/editor/standalone/browser/standalone-tokens.css';
import 'monaco-editor-core/esm/vs/platform/actions/browser/menuEntryActionViewItem.css';
import 'monaco-editor-core/esm/vs/platform/contextview/browser/contextMenuHandler.css';
import 'monaco-editor-core/esm/vs/editor/browser/widget/media/diffEditor.css';
import 'monaco-editor-core/esm/vs/editor/browser/widget/media/diffReview.css';
import 'monaco-editor-core/esm/vs/editor/browser/widget/media/editor.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/decorations/decorations.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/currentLineHighlight/currentLineHighlight.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/glyphMargin/glyphMargin.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/indentGuides/indentGuides.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/lineNumbers/lineNumbers.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/lines/viewLines.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/linesDecorations/linesDecorations.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/marginDecorations/marginDecorations.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/overlayWidgets/overlayWidgets.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/minimap/minimap.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/rulers/rulers.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/scrollDecoration/scrollDecoration.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/selections/selections.css';
import 'monaco-editor-core/esm/vs/editor/browser/viewParts/viewCursors/viewCursors.css';
import 'monaco-editor-core/esm/vs/editor/contrib/anchorSelect/browser/anchorSelect.css';
import 'monaco-editor-core/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.css';
import 'monaco-editor-core/esm/vs/editor/contrib/codeAction/browser/lightBulbWidget.css';
import 'monaco-editor-core/esm/vs/editor/contrib/codelens/browser/codelensWidget.css';
import 'monaco-editor-core/esm/vs/editor/contrib/colorPicker/browser/colorPicker.css';
import 'monaco-editor-core/esm/vs/editor/contrib/dnd/browser/dnd.css';
import 'monaco-editor-core/esm/vs/editor/contrib/find/browser/findWidget.css';
import 'monaco-editor-core/esm/vs/editor/contrib/folding/browser/folding.css';
import 'monaco-editor-core/esm/vs/editor/contrib/inlineCompletions/browser/ghostText.css';
import 'monaco-editor-core/esm/vs/editor/contrib/links/browser/links.css';
import 'monaco-editor-core/esm/vs/editor/contrib/message/browser/messageController.css';
import 'monaco-editor-core/esm/vs/editor/contrib/parameterHints/browser/parameterHints.css';
import 'monaco-editor-core/esm/vs/editor/contrib/snippet/browser/snippetSession.css';
import 'monaco-editor-core/esm/vs/editor/contrib/rename/browser/renameInputField.css';
import 'monaco-editor-core/esm/vs/editor/contrib/unicodeHighlighter/browser/bannerController.css';
import 'monaco-editor-core/esm/vs/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.css';
import 'monaco-editor-core/esm/vs/editor/contrib/zoneWidget/browser/zoneWidget.css';
import 'monaco-editor-core/esm/vs/editor/standalone/browser/accessibilityHelp/accessibilityHelp.css';
import 'monaco-editor-core/esm/vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard.css';
import 'monaco-editor-core/esm/vs/editor/standalone/browser/inspectTokens/inspectTokens.css';
import 'monaco-editor-core/esm/vs/editor/standalone/browser/quickInput/standaloneQuickInput.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/actionbar/actionbar.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/aria/aria.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/button/button.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/checkbox/checkbox.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/contextview/contextview.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/countBadge/countBadge.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/dropdown/dropdown.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/findinput/findInput.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/hover/hover.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/iconLabel/iconlabel.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/inputbox/inputBox.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/keybindingLabel/keybindingLabel.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/list/list.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/mouseCursor/mouseCursor.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/progressbar/progressbar.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/sash/sash.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/selectBox/selectBox.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/selectBox/selectBoxCustom.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/splitview/splitview.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/table/table.css';
import 'monaco-editor-core/esm/vs/editor/contrib/gotoError/browser/media/gotoErrorWidget.css';
import 'monaco-editor-core/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.css';
import 'monaco-editor-core/esm/vs/editor/contrib/gotoSymbol/browser/peek/referencesWidget.css';
import 'monaco-editor-core/esm/vs/editor/contrib/peekView/browser/media/peekViewWidget.css';
import 'monaco-editor-core/esm/vs/editor/contrib/suggest/browser/media/suggest.css';
import 'monaco-editor-core/esm/vs/base/parts/quickinput/browser/media/quickInput.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/scrollbar/media/scrollbars.css';
import 'monaco-editor-core/esm/vs/base/browser/ui/tree/media/tree.css';
