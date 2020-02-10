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

import { Range as R, Position as P, Location as L } from 'vscode-languageserver-types';
import URI from 'vscode-uri';
import * as theia from '@theia/plugin';
import { cloneAndChange } from './objects';
import { Position, Range, Location } from '../plugin/types-impl';
import { fromPosition, fromRange, fromLocation } from '../plugin/type-converters';

// Here is a mapping of VSCode commands to monaco commands with their conversions
export namespace KnownCommands {

    /**
     * Commands that you want to apply custom conversions to rather than pass through the automatic args converter.
     * Would be useful in the case where theia provides some command and you need to provide custom conversions
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappings: { [id: string]: [string, (args: any[] | undefined) => any[] | undefined] } = {};
    mappings['editor.action.showReferences'] = ['textEditor.commands.showReferences', createConversionFunction(
        (uri: URI) => uri.toString(),
        fromPositionToP,
        toArrayConversion(fromLocationToL))];

    /**
     * Mapping of all editor.action commands to their conversion function.
     * executeCommand<T> inside of the plugin command registry will automatically convert
     * incoming arguments from vscode api types to monaco types
     */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MONACO_CONVERSION_IDENTITY = (args: any[] | undefined) => {
        if (!args) {
            return args;
        }
        const argStack: ConversionFunction[] = [];
        args.forEach(_ => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            argStack.push((arg: any) => monacoArgsConverter(arg));
        });
        if (args) {
            return createConversionFunction(...argStack)(args);
        }
    };

    mappings['editor.action.select.all'] = ['editor.action.select.all', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.toggleHighContrast'] = ['editor.action.toggleHighContrast', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.moveCarretLeftAction'] = ['editor.action.moveCarretLeftAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.moveCarretRightAction'] = ['editor.action.moveCarretRightAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.transposeLetters'] = ['editor.action.transposeLetters', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.clipboardCopyWithSyntaxHighlightingAction'] = ['editor.action.clipboardCopyWithSyntaxHighlightingAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.commentLine'] = ['editor.action.commentLine', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.addCommentLine'] = ['editor.action.addCommentLine', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.removeCommentLine'] = ['editor.action.removeCommentLine', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.blockComment'] = ['editor.action.blockComment', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.showContextMenu'] = ['editor.action.showContextMenu', MONACO_CONVERSION_IDENTITY];
    mappings['cursorUndo'] = ['cursorUndo', MONACO_CONVERSION_IDENTITY];
    mappings['editor.unfold'] = ['editor.unfold', MONACO_CONVERSION_IDENTITY];
    mappings['editor.unfoldRecursively'] = ['editor.unfoldRecursively', MONACO_CONVERSION_IDENTITY];
    mappings['editor.fold'] = ['editor.fold', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldRecursively'] = ['editor.foldRecursively', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldAll'] = ['editor.foldAll', MONACO_CONVERSION_IDENTITY];
    mappings['editor.unfoldAll'] = ['editor.unfoldAll', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldAllBlockComments'] = ['editor.foldAllBlockComments', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldAllMarkerRegions'] = ['editor.foldAllMarkerRegions', MONACO_CONVERSION_IDENTITY];
    mappings['editor.unfoldAllMarkerRegions'] = ['editor.unfoldAllMarkerRegions', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldLevel1'] = ['editor.foldLevel1', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldLevel2'] = ['editor.foldLevel2', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldLevel3'] = ['editor.foldLevel3', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldLevel4'] = ['editor.foldLevel4', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldLevel5'] = ['editor.foldLevel5', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldLevel6'] = ['editor.foldLevel6', MONACO_CONVERSION_IDENTITY];
    mappings['editor.foldLevel7'] = ['editor.foldLevel7', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.fontZoomIn'] = ['editor.action.fontZoomIn', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.fontZoomOut'] = ['editor.action.fontZoomOut', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.fontZoomReset'] = ['editor.action.fontZoomReset', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.formatDocument'] = ['editor.action.formatDocument', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.formatSelection'] = ['editor.action.formatSelection', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.copyLinesUpAction'] = ['editor.action.copyLinesUpAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.copyLinesDownAction'] = ['editor.action.copyLinesDownAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.moveLinesUpAction'] = ['editor.action.moveLinesUpAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.moveLinesDownAction'] = ['editor.action.moveLinesDownAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.sortLinesAscending'] = ['editor.action.sortLinesAscending', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.sortLinesDescending'] = ['editor.action.sortLinesDescending', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.trimTrailingWhitespace'] = ['editor.action.trimTrailingWhitespace', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.deleteLines'] = ['editor.action.deleteLines', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.indentLines'] = ['editor.action.indentLines', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.outdentLines'] = ['editor.action.outdentLines', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.insertLineBefore'] = ['editor.action.insertLineBefore', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.insertLineAfter'] = ['editor.action.insertLineAfter', MONACO_CONVERSION_IDENTITY];
    mappings['deleteAllLeft'] = ['deleteAllLeft', MONACO_CONVERSION_IDENTITY];
    mappings['deleteAllRight'] = ['deleteAllRight', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.joinLines'] = ['editor.action.joinLines', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.transpose'] = ['editor.action.transpose', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.transformToUppercase'] = ['editor.action.transformToUppercase', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.transformToLowercase'] = ['editor.action.transformToLowercase', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.transformToTitlecase'] = ['editor.action.transformToTitlecase', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.smartSelect.expand'] = ['editor.action.smartSelect.expand', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.smartSelect.shrink'] = ['editor.action.smartSelect.shrink', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.forceRetokenize'] = ['editor.action.forceRetokenize', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.toggleTabFocusMode'] = ['editor.action.toggleTabFocusMode', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.gotoLine'] = ['editor.action.gotoLine', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.quickOutline'] = ['editor.action.quickOutline', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.inPlaceReplace.up'] = ['editor.action.inPlaceReplace.up', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.inPlaceReplace.down'] = ['editor.action.inPlaceReplace.down', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.diffReview.next'] = ['editor.action.diffReview.next', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.diffReview.prev'] = ['editor.action.diffReview.prev', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.selectToBracket'] = ['editor.action.selectToBracket', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.jumpToBracket'] = ['editor.action.jumpToBracket', MONACO_CONVERSION_IDENTITY];
    mappings['actions.findWithSelection'] = ['actions.findWithSelection', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.nextMatchFindAction'] = ['editor.action.nextMatchFindAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.previousMatchFindAction'] = ['editor.action.previousMatchFindAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.nextSelectionMatchFindAction'] = ['editor.action.nextSelectionMatchFindAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.previousSelectionMatchFindAction'] = ['editor.action.previousSelectionMatchFindAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.openLink'] = ['editor.action.openLink', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.quickFix'] = ['editor.action.quickFix', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.refactor'] = ['editor.action.refactor', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.sourceAction'] = ['editor.action.sourceAction', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.organizeImports'] = ['editor.action.organizeImports', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.autoFix'] = ['editor.action.autoFix', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.fixAll'] = ['editor.action.fixAll', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.rename'] = ['editor.action.rename', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.insertCursorAbove'] = ['editor.action.insertCursorAbove', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.insertCursorBelow'] = ['editor.action.insertCursorBelow', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.insertCursorAtEndOfEachLineSelected'] = ['editor.action.insertCursorAtEndOfEachLineSelected', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.addSelectionToNextFindMatch'] = ['editor.action.addSelectionToNextFindMatch', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.addSelectionToPreviousFindMatch'] = ['editor.action.addSelectionToPreviousFindMatch', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.moveSelectionToNextFindMatch'] = ['editor.action.moveSelectionToNextFindMatch', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.moveSelectionToPreviousFindMatch'] = ['editor.action.moveSelectionToPreviousFindMatch', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.selectHighlights'] = ['editor.action.selectHighlights', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.changeAll'] = ['editor.action.changeAll', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.addCursorsToBottom'] = ['editor.action.addCursorsToBottom', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.addCursorsToTop'] = ['editor.action.addCursorsToTop', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.triggerParameterHints'] = ['editor.action.triggerParameterHints', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.wordHighlight.next'] = ['editor.action.wordHighlight.next', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.wordHighlight.prev'] = ['editor.action.wordHighlight.prev', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.wordHighlight.trigger'] = ['editor.action.wordHighlight.trigger', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.showAccessibilityHelp'] = ['editor.action.showAccessibilityHelp', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.inspectTokens'] = ['editor.action.inspectTokens', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.marker.next'] = ['editor.action.marker.next', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.marker.prev'] = ['editor.action.marker.prev', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.marker.nextInFiles'] = ['editor.action.marker.nextInFiles', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.marker.prevInFiles'] = ['editor.action.marker.prevInFiles', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.showHover'] = ['editor.action.showHover', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.revealDefinition'] = ['editor.action.revealDefinition', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.revealDefinitionAside'] = ['editor.action.revealDefinitionAside', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.peekDefinition'] = ['editor.action.peekDefinition', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.revealDeclaration'] = ['editor.action.revealDeclaration', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.peekDeclaration'] = ['editor.action.peekDeclaration', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.goToImplementation'] = ['editor.action.goToImplementation', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.peekImplementation'] = ['editor.action.peekImplementation', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.goToTypeDefinition'] = ['editor.action.goToTypeDefinition', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.peekTypeDefinition'] = ['editor.action.peekTypeDefinition', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.referenceSearch.trigger'] = ['editor.action.referenceSearch.trigger', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.triggerSuggest'] = ['editor.action.triggerSuggest', MONACO_CONVERSION_IDENTITY];
    mappings['closeReferenceSearchEditor'] = ['closeReferenceSearchEditor', MONACO_CONVERSION_IDENTITY];
    mappings['cancelSelection'] = ['cancelSelection', MONACO_CONVERSION_IDENTITY];
    mappings['cursorBottom'] = ['cursorBottom', MONACO_CONVERSION_IDENTITY];
    mappings['cursorBottomSelect'] = ['cursorBottomSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorDown'] = ['cursorDown', MONACO_CONVERSION_IDENTITY];
    mappings['cursorDownSelect'] = ['cursorDownSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorEnd'] = ['cursorEnd', MONACO_CONVERSION_IDENTITY];
    mappings['cursorEndSelect'] = ['cursorEndSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorHome'] = ['cursorHome', MONACO_CONVERSION_IDENTITY];
    mappings['cursorHomeSelect'] = ['cursorHomeSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorLeft'] = ['cursorLeft', MONACO_CONVERSION_IDENTITY];
    mappings['cursorLeftSelect'] = ['cursorLeftSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorPageDown'] = ['cursorPageDown', MONACO_CONVERSION_IDENTITY];
    mappings['cursorPageDownSelect'] = ['cursorPageDownSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorPageUp'] = ['cursorPageUp', MONACO_CONVERSION_IDENTITY];
    mappings['cursorPageUpSelect'] = ['cursorPageUpSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorRight'] = ['cursorRight', MONACO_CONVERSION_IDENTITY];
    mappings['cursorRightSelect'] = ['cursorRightSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorTop'] = ['cursorTop', MONACO_CONVERSION_IDENTITY];
    mappings['cursorTopSelect'] = ['cursorTopSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorUp'] = ['cursorUp', MONACO_CONVERSION_IDENTITY];
    mappings['cursorUpSelect'] = ['cursorUpSelect', MONACO_CONVERSION_IDENTITY];
    mappings['deleteLeft'] = ['deleteLeft', MONACO_CONVERSION_IDENTITY];
    mappings['deleteRight'] = ['deleteRight', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.selectAll'] = ['editor.action.selectAll', MONACO_CONVERSION_IDENTITY];
    mappings['expandLineSelection'] = ['expandLineSelection', MONACO_CONVERSION_IDENTITY];
    mappings['outdent'] = ['outdent', MONACO_CONVERSION_IDENTITY];
    mappings['scrollLineDown'] = ['scrollLineDown', MONACO_CONVERSION_IDENTITY];
    mappings['scrollLineUp'] = ['scrollLineUp', MONACO_CONVERSION_IDENTITY];
    mappings['scrollPageDown'] = ['scrollPageDown', MONACO_CONVERSION_IDENTITY];
    mappings['scrollPageUp'] = ['scrollPageUp', MONACO_CONVERSION_IDENTITY];
    mappings['tab'] = ['tab', MONACO_CONVERSION_IDENTITY];
    mappings['removeSecondaryCursors'] = ['removeSecondaryCursors', MONACO_CONVERSION_IDENTITY];
    mappings['cursorWordRight'] = ['cursorWordEndRight', MONACO_CONVERSION_IDENTITY];
    mappings['cursorWordEndRight'] = ['cursorWordEndRight', MONACO_CONVERSION_IDENTITY];
    mappings['cursorWordEndRightSelect'] = ['cursorWordEndRightSelect', MONACO_CONVERSION_IDENTITY];
    mappings['cursorWordLeft'] = ['cursorWordStartLeft', MONACO_CONVERSION_IDENTITY];
    mappings['cursorWordStartLeft'] = ['cursorWordStartLeft', MONACO_CONVERSION_IDENTITY];
    mappings['cursorWordStartLeftSelect'] = ['cursorWordStartLeftSelect', MONACO_CONVERSION_IDENTITY];
    mappings['deleteWordLeft'] = ['deleteWordLeft', MONACO_CONVERSION_IDENTITY];
    mappings['deleteWordRight'] = ['deleteWordRight', MONACO_CONVERSION_IDENTITY];
    mappings['editor.cancelOperation'] = ['editor.cancelOperation', MONACO_CONVERSION_IDENTITY];
    mappings['editor.gotoNextSymbolFromResult'] = ['editor.gotoNextSymbolFromResult', MONACO_CONVERSION_IDENTITY];
    mappings['editor.gotoNextSymbolFromResult.cancel'] = ['editor.gotoNextSymbolFromResult.cancel', MONACO_CONVERSION_IDENTITY];
    mappings['openReferenceToSide'] = ['openReferenceToSide', MONACO_CONVERSION_IDENTITY];
    mappings['toggleExplainMode'] = ['toggleExplainMode', MONACO_CONVERSION_IDENTITY];
    mappings['closeFindWidget'] = ['closeFindWidget', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.replaceAll'] = ['editor.action.replaceAll', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.replaceOne'] = ['editor.action.replaceOne', MONACO_CONVERSION_IDENTITY];
    mappings['editor.action.selectAllMatches'] = ['editor.action.selectAllMatches', MONACO_CONVERSION_IDENTITY];
    mappings['toggleFindCaseSensitive'] = ['toggleFindCaseSensitive', MONACO_CONVERSION_IDENTITY];
    mappings['toggleFindInSelection'] = ['toggleFindInSelection', MONACO_CONVERSION_IDENTITY];
    mappings['toggleFindRegex'] = ['toggleFindRegex', MONACO_CONVERSION_IDENTITY];
    mappings['toggleFindWholeWord'] = ['toggleFindWholeWord', MONACO_CONVERSION_IDENTITY];
    mappings['jumpToNextSnippetPlaceholder'] = ['jumpToNextSnippetPlaceholder', MONACO_CONVERSION_IDENTITY];
    mappings['jumpToPrevSnippetPlaceholder'] = ['jumpToPrevSnippetPlaceholder', MONACO_CONVERSION_IDENTITY];
    mappings['leaveEditorMessage'] = ['leaveEditorMessage', MONACO_CONVERSION_IDENTITY];
    mappings['leaveSnippet'] = ['leaveSnippet', MONACO_CONVERSION_IDENTITY];
    mappings['closeMarkersNavigation'] = ['closeMarkersNavigation', MONACO_CONVERSION_IDENTITY];
    mappings['goToNextReferenceFromEmbeddedEditor'] = ['goToNextReferenceFromEmbeddedEditor', MONACO_CONVERSION_IDENTITY];
    mappings['goToPreviousReferenceFromEmbeddedEditor'] = ['goToPreviousReferenceFromEmbeddedEditor', MONACO_CONVERSION_IDENTITY];
    mappings['closeParameterHints'] = ['closeParameterHints', MONACO_CONVERSION_IDENTITY];
    mappings['showNextParameterHint'] = ['showNextParameterHint', MONACO_CONVERSION_IDENTITY];
    mappings['showPrevParameterHint'] = ['showPrevParameterHint', MONACO_CONVERSION_IDENTITY];
    mappings['acceptSelectedSuggestion'] = ['acceptSelectedSuggestion', MONACO_CONVERSION_IDENTITY];
    mappings['acceptSelectedSuggestionOnEnter'] = ['acceptSelectedSuggestionOnEnter', MONACO_CONVERSION_IDENTITY];
    mappings['hideSuggestWidget'] = ['hideSuggestWidget', MONACO_CONVERSION_IDENTITY];
    mappings['insertBestCompletion'] = ['insertBestCompletion', MONACO_CONVERSION_IDENTITY];
    mappings['insertNextSuggestion'] = ['insertNextSuggestion', MONACO_CONVERSION_IDENTITY];
    mappings['insertPrevSuggestion'] = ['insertPrevSuggestion', MONACO_CONVERSION_IDENTITY];
    mappings['selectNextPageSuggestion'] = ['selectNextPageSuggestion', MONACO_CONVERSION_IDENTITY];
    mappings['selectNextSuggestion'] = ['selectNextSuggestion', MONACO_CONVERSION_IDENTITY];
    mappings['selectPrevPageSuggestion'] = ['selectPrevPageSuggestion', MONACO_CONVERSION_IDENTITY];
    mappings['selectPrevSuggestion'] = ['selectPrevSuggestion', MONACO_CONVERSION_IDENTITY];
    mappings['toggleSuggestionDetails'] = ['toggleSuggestionDetails', MONACO_CONVERSION_IDENTITY];
    mappings['toggleSuggestionFocus'] = ['toggleSuggestionFocus', MONACO_CONVERSION_IDENTITY];
    mappings['acceptRenameInput'] = ['acceptRenameInput', MONACO_CONVERSION_IDENTITY];
    mappings['cancelRenameInput'] = ['cancelRenameInput', MONACO_CONVERSION_IDENTITY];
    mappings['closeAccessibilityHelp'] = ['closeAccessibilityHelp', MONACO_CONVERSION_IDENTITY];
    mappings['history.showNext'] = ['history.showNext', MONACO_CONVERSION_IDENTITY];
    mappings['history.showPrevious'] = ['history.showPrevious', MONACO_CONVERSION_IDENTITY];
    mappings['closeReferenceSearch'] = ['closeReferenceSearch', MONACO_CONVERSION_IDENTITY];
    mappings['goToNextReference'] = ['goToNextReference', MONACO_CONVERSION_IDENTITY];
    mappings['goToPreviousReference'] = ['goToPreviousReference', MONACO_CONVERSION_IDENTITY];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function map<T>(id: string, args: any[] | undefined, toDo: (mappedId: string, mappedArgs: any[] | undefined) => T): T {
        if (mappings[id]) {
            return toDo(mappings[id][0], mappings[id][1](args));
        } else {
            return toDo(id, args);
        }
    }

    export function mapped(id: string): boolean {
        return !!mappings[id];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type ConversionFunction = ((parameter: any) => any) | undefined;
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
    function monacoArgsConverter(args: any[]) {
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
