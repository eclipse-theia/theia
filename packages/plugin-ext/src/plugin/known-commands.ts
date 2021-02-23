/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { Range as R, Position as P, Location as L } from '@theia/core/shared/vscode-languageserver-types';
import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { cloneAndChange } from '../common/objects';
import { Position, Range, Location, CallHierarchyItem } from './types-impl';
import {
    fromPosition, fromRange, fromLocation,
    isModelLocation, toLocation,
    isModelCallHierarchyItem, fromCallHierarchyItem, toCallHierarchyItem,
    isModelCallHierarchyIncomingCall, toCallHierarchyIncomingCall,
    isModelCallHierarchyOutgoingCall, toCallHierarchyOutgoingCall
} from './type-converters';

// Here is a mapping of VSCode commands to monaco commands with their conversions
export namespace KnownCommands {

    /**
     * Commands that you want to apply custom conversions to rather than pass through the automatic args converter.
     * Would be useful in the case where theia provides some command and you need to provide custom conversions
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappings: { [id: string]: [string, (args: any[] | undefined) => any[] | undefined, ((results: any[] | undefined) => any[] | undefined)?] } = {};
    mappings['editor.action.showReferences'] = ['textEditor.commands.showReferences', createConversionFunction(
        (uri: URI) => uri.toString(),
        fromPositionToP,
        toArrayConversion(fromLocationToL)),
        createConversionFunction()];

    /**
     * Mapping of all editor.action commands to their conversion function.
     * executeCommand<T> inside of the plugin command registry will automatically convert
     * incoming arguments from vscode api types to monaco types
     */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CONVERT_VSCODE_TO_MONACO = (args: any[] | undefined) => {
        if (!args) {
            return args;
        }
        const argStack: ConversionFunction[] = [];
        args.forEach(_ => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            argStack.push((arg: any) => vscodeToMonacoArgsConverter(arg));
        });
        if (args) {
            return createConversionFunction(...argStack)(args);
        }
    };

    mappings['editor.action.select.all'] = ['editor.action.select.all', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.toggleHighContrast'] = ['editor.action.toggleHighContrast', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.moveCarretLeftAction'] = ['editor.action.moveCarretLeftAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.moveCarretRightAction'] = ['editor.action.moveCarretRightAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.transposeLetters'] = ['editor.action.transposeLetters', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.clipboardCopyWithSyntaxHighlightingAction'] = ['editor.action.clipboardCopyWithSyntaxHighlightingAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.commentLine'] = ['editor.action.commentLine', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.addCommentLine'] = ['editor.action.addCommentLine', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.removeCommentLine'] = ['editor.action.removeCommentLine', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.blockComment'] = ['editor.action.blockComment', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.showContextMenu'] = ['editor.action.showContextMenu', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorUndo'] = ['cursorUndo', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.unfold'] = ['editor.unfold', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.unfoldRecursively'] = ['editor.unfoldRecursively', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.fold'] = ['editor.fold', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldRecursively'] = ['editor.foldRecursively', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldAll'] = ['editor.foldAll', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.unfoldAll'] = ['editor.unfoldAll', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldAllBlockComments'] = ['editor.foldAllBlockComments', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldAllMarkerRegions'] = ['editor.foldAllMarkerRegions', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.unfoldAllMarkerRegions'] = ['editor.unfoldAllMarkerRegions', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldLevel1'] = ['editor.foldLevel1', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldLevel2'] = ['editor.foldLevel2', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldLevel3'] = ['editor.foldLevel3', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldLevel4'] = ['editor.foldLevel4', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldLevel5'] = ['editor.foldLevel5', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldLevel6'] = ['editor.foldLevel6', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.foldLevel7'] = ['editor.foldLevel7', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.fontZoomIn'] = ['editor.action.fontZoomIn', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.fontZoomOut'] = ['editor.action.fontZoomOut', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.fontZoomReset'] = ['editor.action.fontZoomReset', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.formatDocument'] = ['editor.action.formatDocument', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.formatSelection'] = ['editor.action.formatSelection', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.copyLinesUpAction'] = ['editor.action.copyLinesUpAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.copyLinesDownAction'] = ['editor.action.copyLinesDownAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.moveLinesUpAction'] = ['editor.action.moveLinesUpAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.moveLinesDownAction'] = ['editor.action.moveLinesDownAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.sortLinesAscending'] = ['editor.action.sortLinesAscending', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.sortLinesDescending'] = ['editor.action.sortLinesDescending', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.trimTrailingWhitespace'] = ['editor.action.trimTrailingWhitespace', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.deleteLines'] = ['editor.action.deleteLines', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.indentLines'] = ['editor.action.indentLines', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.outdentLines'] = ['editor.action.outdentLines', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.insertLineBefore'] = ['editor.action.insertLineBefore', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.insertLineAfter'] = ['editor.action.insertLineAfter', CONVERT_VSCODE_TO_MONACO];
    mappings['deleteAllLeft'] = ['deleteAllLeft', CONVERT_VSCODE_TO_MONACO];
    mappings['deleteAllRight'] = ['deleteAllRight', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.joinLines'] = ['editor.action.joinLines', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.transpose'] = ['editor.action.transpose', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.transformToUppercase'] = ['editor.action.transformToUppercase', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.transformToLowercase'] = ['editor.action.transformToLowercase', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.transformToTitlecase'] = ['editor.action.transformToTitlecase', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.smartSelect.expand'] = ['editor.action.smartSelect.expand', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.smartSelect.shrink'] = ['editor.action.smartSelect.shrink', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.forceRetokenize'] = ['editor.action.forceRetokenize', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.toggleTabFocusMode'] = ['editor.action.toggleTabFocusMode', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.gotoLine'] = ['editor.action.gotoLine', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.quickOutline'] = ['editor.action.quickOutline', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.inPlaceReplace.up'] = ['editor.action.inPlaceReplace.up', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.inPlaceReplace.down'] = ['editor.action.inPlaceReplace.down', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.diffReview.next'] = ['editor.action.diffReview.next', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.diffReview.prev'] = ['editor.action.diffReview.prev', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.selectToBracket'] = ['editor.action.selectToBracket', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.jumpToBracket'] = ['editor.action.jumpToBracket', CONVERT_VSCODE_TO_MONACO];
    mappings['actions.findWithSelection'] = ['actions.findWithSelection', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.nextMatchFindAction'] = ['editor.action.nextMatchFindAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.previousMatchFindAction'] = ['editor.action.previousMatchFindAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.nextSelectionMatchFindAction'] = ['editor.action.nextSelectionMatchFindAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.previousSelectionMatchFindAction'] = ['editor.action.previousSelectionMatchFindAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.openLink'] = ['editor.action.openLink', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.quickFix'] = ['editor.action.quickFix', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.refactor'] = ['editor.action.refactor', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.sourceAction'] = ['editor.action.sourceAction', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.organizeImports'] = ['editor.action.organizeImports', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.autoFix'] = ['editor.action.autoFix', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.fixAll'] = ['editor.action.fixAll', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.rename'] = ['editor.action.rename', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.insertCursorAbove'] = ['editor.action.insertCursorAbove', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.insertCursorBelow'] = ['editor.action.insertCursorBelow', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.insertCursorAtEndOfEachLineSelected'] = ['editor.action.insertCursorAtEndOfEachLineSelected', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.addSelectionToNextFindMatch'] = ['editor.action.addSelectionToNextFindMatch', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.addSelectionToPreviousFindMatch'] = ['editor.action.addSelectionToPreviousFindMatch', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.moveSelectionToNextFindMatch'] = ['editor.action.moveSelectionToNextFindMatch', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.moveSelectionToPreviousFindMatch'] = ['editor.action.moveSelectionToPreviousFindMatch', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.selectHighlights'] = ['editor.action.selectHighlights', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.changeAll'] = ['editor.action.changeAll', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.addCursorsToBottom'] = ['editor.action.addCursorsToBottom', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.addCursorsToTop'] = ['editor.action.addCursorsToTop', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.triggerParameterHints'] = ['editor.action.triggerParameterHints', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.wordHighlight.next'] = ['editor.action.wordHighlight.next', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.wordHighlight.prev'] = ['editor.action.wordHighlight.prev', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.wordHighlight.trigger'] = ['editor.action.wordHighlight.trigger', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.showAccessibilityHelp'] = ['editor.action.showAccessibilityHelp', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.inspectTokens'] = ['editor.action.inspectTokens', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.marker.next'] = ['editor.action.marker.next', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.marker.prev'] = ['editor.action.marker.prev', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.marker.nextInFiles'] = ['editor.action.marker.nextInFiles', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.marker.prevInFiles'] = ['editor.action.marker.prevInFiles', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.showHover'] = ['editor.action.showHover', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.revealDefinition'] = ['editor.action.revealDefinition', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.revealDefinitionAside'] = ['editor.action.revealDefinitionAside', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.peekDefinition'] = ['editor.action.peekDefinition', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.revealDeclaration'] = ['editor.action.revealDeclaration', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.peekDeclaration'] = ['editor.action.peekDeclaration', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.goToImplementation'] = ['editor.action.goToImplementation', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.peekImplementation'] = ['editor.action.peekImplementation', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.goToTypeDefinition'] = ['editor.action.goToTypeDefinition', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.peekTypeDefinition'] = ['editor.action.peekTypeDefinition', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.referenceSearch.trigger'] = ['editor.action.referenceSearch.trigger', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.triggerSuggest'] = ['editor.action.triggerSuggest', CONVERT_VSCODE_TO_MONACO];
    mappings['closeReferenceSearchEditor'] = ['closeReferenceSearchEditor', CONVERT_VSCODE_TO_MONACO];
    mappings['cancelSelection'] = ['cancelSelection', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorBottom'] = ['cursorBottom', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorBottomSelect'] = ['cursorBottomSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorDown'] = ['cursorDown', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorDownSelect'] = ['cursorDownSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorEnd'] = ['cursorEnd', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorEndSelect'] = ['cursorEndSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorHome'] = ['cursorHome', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorHomeSelect'] = ['cursorHomeSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorLeft'] = ['cursorLeft', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorLeftSelect'] = ['cursorLeftSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorPageDown'] = ['cursorPageDown', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorPageDownSelect'] = ['cursorPageDownSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorPageUp'] = ['cursorPageUp', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorPageUpSelect'] = ['cursorPageUpSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorRight'] = ['cursorRight', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorRightSelect'] = ['cursorRightSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorTop'] = ['cursorTop', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorTopSelect'] = ['cursorTopSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorUp'] = ['cursorUp', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorUpSelect'] = ['cursorUpSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['deleteLeft'] = ['deleteLeft', CONVERT_VSCODE_TO_MONACO];
    mappings['deleteRight'] = ['deleteRight', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.selectAll'] = ['editor.action.selectAll', CONVERT_VSCODE_TO_MONACO];
    mappings['expandLineSelection'] = ['expandLineSelection', CONVERT_VSCODE_TO_MONACO];
    mappings['outdent'] = ['outdent', CONVERT_VSCODE_TO_MONACO];
    mappings['scrollLineDown'] = ['scrollLineDown', CONVERT_VSCODE_TO_MONACO];
    mappings['scrollLineUp'] = ['scrollLineUp', CONVERT_VSCODE_TO_MONACO];
    mappings['scrollPageDown'] = ['scrollPageDown', CONVERT_VSCODE_TO_MONACO];
    mappings['scrollPageUp'] = ['scrollPageUp', CONVERT_VSCODE_TO_MONACO];
    mappings['tab'] = ['tab', CONVERT_VSCODE_TO_MONACO];
    mappings['removeSecondaryCursors'] = ['removeSecondaryCursors', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorWordRight'] = ['cursorWordEndRight', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorWordEndRight'] = ['cursorWordEndRight', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorWordEndRightSelect'] = ['cursorWordEndRightSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorWordLeft'] = ['cursorWordStartLeft', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorWordStartLeft'] = ['cursorWordStartLeft', CONVERT_VSCODE_TO_MONACO];
    mappings['cursorWordStartLeftSelect'] = ['cursorWordStartLeftSelect', CONVERT_VSCODE_TO_MONACO];
    mappings['deleteWordLeft'] = ['deleteWordLeft', CONVERT_VSCODE_TO_MONACO];
    mappings['deleteWordRight'] = ['deleteWordRight', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.cancelOperation'] = ['editor.cancelOperation', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.gotoNextSymbolFromResult'] = ['editor.gotoNextSymbolFromResult', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.gotoNextSymbolFromResult.cancel'] = ['editor.gotoNextSymbolFromResult.cancel', CONVERT_VSCODE_TO_MONACO];
    mappings['openReferenceToSide'] = ['openReferenceToSide', CONVERT_VSCODE_TO_MONACO];
    mappings['toggleExplainMode'] = ['toggleExplainMode', CONVERT_VSCODE_TO_MONACO];
    mappings['closeFindWidget'] = ['closeFindWidget', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.replaceAll'] = ['editor.action.replaceAll', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.replaceOne'] = ['editor.action.replaceOne', CONVERT_VSCODE_TO_MONACO];
    mappings['editor.action.selectAllMatches'] = ['editor.action.selectAllMatches', CONVERT_VSCODE_TO_MONACO];
    mappings['toggleFindCaseSensitive'] = ['toggleFindCaseSensitive', CONVERT_VSCODE_TO_MONACO];
    mappings['toggleFindInSelection'] = ['toggleFindInSelection', CONVERT_VSCODE_TO_MONACO];
    mappings['toggleFindRegex'] = ['toggleFindRegex', CONVERT_VSCODE_TO_MONACO];
    mappings['toggleFindWholeWord'] = ['toggleFindWholeWord', CONVERT_VSCODE_TO_MONACO];
    mappings['jumpToNextSnippetPlaceholder'] = ['jumpToNextSnippetPlaceholder', CONVERT_VSCODE_TO_MONACO];
    mappings['jumpToPrevSnippetPlaceholder'] = ['jumpToPrevSnippetPlaceholder', CONVERT_VSCODE_TO_MONACO];
    mappings['leaveEditorMessage'] = ['leaveEditorMessage', CONVERT_VSCODE_TO_MONACO];
    mappings['leaveSnippet'] = ['leaveSnippet', CONVERT_VSCODE_TO_MONACO];
    mappings['closeMarkersNavigation'] = ['closeMarkersNavigation', CONVERT_VSCODE_TO_MONACO];
    mappings['goToNextReferenceFromEmbeddedEditor'] = ['goToNextReferenceFromEmbeddedEditor', CONVERT_VSCODE_TO_MONACO];
    mappings['goToPreviousReferenceFromEmbeddedEditor'] = ['goToPreviousReferenceFromEmbeddedEditor', CONVERT_VSCODE_TO_MONACO];
    mappings['closeParameterHints'] = ['closeParameterHints', CONVERT_VSCODE_TO_MONACO];
    mappings['showNextParameterHint'] = ['showNextParameterHint', CONVERT_VSCODE_TO_MONACO];
    mappings['showPrevParameterHint'] = ['showPrevParameterHint', CONVERT_VSCODE_TO_MONACO];
    mappings['acceptSelectedSuggestion'] = ['acceptSelectedSuggestion', CONVERT_VSCODE_TO_MONACO];
    mappings['acceptSelectedSuggestionOnEnter'] = ['acceptSelectedSuggestionOnEnter', CONVERT_VSCODE_TO_MONACO];
    mappings['hideSuggestWidget'] = ['hideSuggestWidget', CONVERT_VSCODE_TO_MONACO];
    mappings['insertBestCompletion'] = ['insertBestCompletion', CONVERT_VSCODE_TO_MONACO];
    mappings['insertNextSuggestion'] = ['insertNextSuggestion', CONVERT_VSCODE_TO_MONACO];
    mappings['insertPrevSuggestion'] = ['insertPrevSuggestion', CONVERT_VSCODE_TO_MONACO];
    mappings['selectNextPageSuggestion'] = ['selectNextPageSuggestion', CONVERT_VSCODE_TO_MONACO];
    mappings['selectNextSuggestion'] = ['selectNextSuggestion', CONVERT_VSCODE_TO_MONACO];
    mappings['selectPrevPageSuggestion'] = ['selectPrevPageSuggestion', CONVERT_VSCODE_TO_MONACO];
    mappings['selectPrevSuggestion'] = ['selectPrevSuggestion', CONVERT_VSCODE_TO_MONACO];
    mappings['toggleSuggestionDetails'] = ['toggleSuggestionDetails', CONVERT_VSCODE_TO_MONACO];
    mappings['toggleSuggestionFocus'] = ['toggleSuggestionFocus', CONVERT_VSCODE_TO_MONACO];
    mappings['acceptRenameInput'] = ['acceptRenameInput', CONVERT_VSCODE_TO_MONACO];
    mappings['cancelRenameInput'] = ['cancelRenameInput', CONVERT_VSCODE_TO_MONACO];
    mappings['closeAccessibilityHelp'] = ['closeAccessibilityHelp', CONVERT_VSCODE_TO_MONACO];
    mappings['history.showNext'] = ['history.showNext', CONVERT_VSCODE_TO_MONACO];
    mappings['history.showPrevious'] = ['history.showPrevious', CONVERT_VSCODE_TO_MONACO];
    mappings['closeReferenceSearch'] = ['closeReferenceSearch', CONVERT_VSCODE_TO_MONACO];
    mappings['goToNextReference'] = ['goToNextReference', CONVERT_VSCODE_TO_MONACO];
    mappings['goToPreviousReference'] = ['goToPreviousReference', CONVERT_VSCODE_TO_MONACO];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CONVERT_MONACO_TO_VSCODE = (args: any | undefined) => {
        if (!args) {
            return args;
        }
        if (!Array.isArray(args)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return monacoToVscodeArgsConverter(args);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const argsArray: any[] = args;
        const argStack: ConversionFunction[] = [];
        argsArray.forEach(_ => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            argStack.push((arg: any) => monacoToVscodeArgsConverter(arg));
        });
        if (argsArray) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return createConversionFunction(...argStack)(argsArray);
        }
    };

    // vscode-'executeXXX'-like commands
    mappings['vscode.executeReferenceProvider'] = ['vscode.executeReferenceProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeImplementationProvider'] = ['vscode.executeImplementationProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeDefinitionProvider'] = ['vscode.executeDefinitionProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeDeclarationProvider'] = ['vscode.executeDeclarationProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeTypeDefinitionProvider'] = ['vscode.executeTypeDefinitionProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeHoverProvider'] = ['vscode.executeHoverProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeDocumentHighlights'] = ['vscode.executeDocumentHighlights', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeFormatDocumentProvider'] = ['vscode.executeFormatDocumentProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeFormatRangeProvider'] = ['vscode.executeFormatRangeProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.executeFormatOnTypeProvider'] = ['vscode.executeFormatOnTypeProvider', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.prepareCallHierarchy'] = ['vscode.prepareCallHierarchy', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.provideIncomingCalls'] = ['vscode.provideIncomingCalls', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];
    mappings['vscode.provideOutgoingCalls'] = ['vscode.provideOutgoingCalls', CONVERT_VSCODE_TO_MONACO, CONVERT_MONACO_TO_VSCODE];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function map<T>(id: string, args: any[] | undefined, toDo: (mappedId: string, mappedArgs: any[] | undefined, mappedResult: ConversionFunction | undefined) => T): T {
        if (mappings[id]) {
            return toDo(mappings[id][0], mappings[id][1](args), mappings[id][2] ? (result => mappings[id][2]!(result)) : undefined);
        } else {
            return toDo(id, args, undefined);
        }
    }

    export function mapped(id: string): boolean {
        return !!mappings[id];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export type ConversionFunction = ((parameter: any) => any) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function createConversionFunction(...conversions: ConversionFunction[]): (args: any[] | undefined) => any[] | undefined {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return function (args: any[] | undefined): any[] | undefined {
            if (!args) {
                return args;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return args.map(function (arg: any, index: number): any {
                if (index < conversions.length) {
                    const conversion = conversions[index];
                    if (conversion) {
                        return conversion(arg);
                    }
                }
                return arg;
            });
        };
    }

    function fromPositionToP(p: theia.Position): P {
        return P.create(p.line, p.character);
    }

    function fromRangeToR(r: theia.Range): R {
        return R.create(fromPositionToP(r.start), fromPositionToP(r.end));
    }

    function fromLocationToL(l: theia.Location): L {
        return L.create(l.uri.toString(), fromRangeToR(l.range));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/tslint/config
    function vscodeToMonacoArgsConverter(args: any[]) {
        // tslint:disable-next-line:typedef
        return cloneAndChange(args, function (value) {
            if (Position.isPosition(value)) {
                return fromPosition(value);
            }
            if (Range.isRange(value)) {
                return fromRange(value);
            }
            if (Location.isLocation(value)) {
                return fromLocation(value);
            }
            if (CallHierarchyItem.isCallHierarchyItem(value)) {
                return fromCallHierarchyItem(value);
            }
            if (!Array.isArray(value)) {
                return value;
            }
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/tslint/config
    function monacoToVscodeArgsConverter(args: any[]) {
        // tslint:disable-next-line:typedef
        return cloneAndChange(args, function (value) {
            if (isModelLocation(value)) {
                return toLocation(value);
            }
            if (isModelCallHierarchyItem(value)) {
                return toCallHierarchyItem(value);
            }
            if (isModelCallHierarchyIncomingCall(value)) {
                return toCallHierarchyIncomingCall(value);
            }
            if (isModelCallHierarchyOutgoingCall(value)) {
                return toCallHierarchyOutgoingCall(value);
            }
            if (!Array.isArray(value)) {
                return value;
            }

        });
    }
}

function toArrayConversion<T, U>(f: (a: T) => U): (a: T[]) => U[] {
    // tslint:disable-next-line:typedef
    return function (a: T[]) {
        return a.map(f);
    };
}
