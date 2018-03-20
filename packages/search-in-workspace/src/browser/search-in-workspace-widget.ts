/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Widget, Message, BaseWidget, VirtualRenderer, Key, StatefulWidget } from "@theia/core/lib/browser";
import { inject, injectable, postConstruct } from "inversify";
import { SearchInWorkspaceResultTreeWidget } from "./search-in-workspace-result-tree-widget";
import { h } from "@phosphor/virtualdom";
import { SearchInWorkspaceOptions } from "../common/search-in-workspace-interface";

export interface SearchFieldState {
    className: string;
    enabled: boolean;
    title: string;
}

@injectable()
export class SearchInWorkspaceWidget extends BaseWidget implements StatefulWidget {

    static ID = "search-in-workspace";
    static LABEL = "Search";

    protected matchCaseState: SearchFieldState;
    protected wholeWordState: SearchFieldState;
    protected regExpState: SearchFieldState;
    protected includeIgnoredState: SearchFieldState;

    protected showSearchDetails = false;
    protected hasResults = false;

    protected searchInWorkspaceOptions: SearchInWorkspaceOptions;

    protected searchTerm = "";
    protected replaceTerm = "";

    protected showReplaceField = false;

    protected contentNode: HTMLElement;
    protected searchFormContainer: HTMLElement;
    protected resultContainer: HTMLElement;

    @inject(SearchInWorkspaceResultTreeWidget) protected readonly resultTreeWidget: SearchInWorkspaceResultTreeWidget;

    @postConstruct()
    init() {
        this.id = SearchInWorkspaceWidget.ID;
        this.title.label = SearchInWorkspaceWidget.LABEL;

        this.contentNode = document.createElement('div');
        this.contentNode.classList.add("t-siw-search-container");
        this.searchFormContainer = document.createElement('div');
        this.searchFormContainer.classList.add("searchHeader");
        this.contentNode.appendChild(this.searchFormContainer);
        this.node.appendChild(this.contentNode);

        this.matchCaseState = {
            className: "match-case",
            enabled: false,
            title: "Match Case"
        };
        this.wholeWordState = {
            className: "whole-word",
            enabled: false,
            title: "Match Whole Word"
        };
        this.regExpState = {
            className: "use-regexp",
            enabled: false,
            title: "Use Regular Expression"
        };
        this.includeIgnoredState = {
            className: "include-ignored fa fa-eye",
            enabled: false,
            title: "Include Ignored Files"
        };
        this.searchInWorkspaceOptions = {
            matchCase: false,
            matchWholeWord: false,
            useRegExp: false,
            includeIgnored: false,
            include: [],
            exclude: [],
            maxResults: 500
        };
        this.toDispose.push(this.resultTreeWidget.onChange(r => {
            this.hasResults = r.size > 0;
            this.update();
        }));
    }

    storeState(): object {
        return {
            matchCaseState: this.matchCaseState,
            wholeWordState: this.wholeWordState,
            regExpState: this.regExpState,
            includeIgnoredState: this.includeIgnoredState,
            showSearchDetails: this.showSearchDetails,
            searchInWorkspaceOptions: this.searchInWorkspaceOptions,
            searchTerm: this.searchTerm,
            replaceTerm: this.replaceTerm,
            showReplaceField: this.showReplaceField
        };
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        this.matchCaseState = oldState.matchCaseState;
        this.wholeWordState = oldState.wholeWordState;
        this.regExpState = oldState.regExpState;
        this.includeIgnoredState = oldState.includeIgnoredState;
        this.showSearchDetails = oldState.showSearchDetails;
        this.searchInWorkspaceOptions = oldState.searchInWorkspaceOptions;
        this.searchTerm = oldState.searchTerm;
        this.replaceTerm = oldState.replaceTerm;
        this.showReplaceField = oldState.showReplaceField;
        this.resultTreeWidget.replaceTerm = this.replaceTerm;
        this.resultTreeWidget.showReplaceButtons = this.showReplaceField;
        this.refresh();
    }

    onAfterAttach(msg: Message) {
        super.onAfterAttach(msg);
        VirtualRenderer.render(this.renderSearchHeader(), this.searchFormContainer);
        Widget.attach(this.resultTreeWidget, this.contentNode);
    }

    onUpdateRequest(msg: Message) {
        super.onUpdateRequest(msg);
        VirtualRenderer.render(this.renderSearchHeader(), this.searchFormContainer);
    }

    onAfterShow(msg: Message) {
        const f = document.getElementById("search-input-field");
        if (f) {
            (f as HTMLInputElement).focus();
        }
    }

    protected renderSearchHeader(): h.Child {
        const controlButtons = this.renderControlButtons();
        const searchAndReplaceContainer = this.renderSearchAndReplace();
        const searchDetails = this.renderSearchDetails();
        return h.div(controlButtons, searchAndReplaceContainer, searchDetails);
    }

    protected refresh = () => {
        this.resultTreeWidget.search(this.searchTerm, this.searchInWorkspaceOptions);
        this.update();
    }

    protected collapseAll = () => {
        this.resultTreeWidget.collapseAll();
        this.update();
    }

    protected clear = () => {
        this.searchTerm = "";
        this.replaceTerm = "";
        this.searchInWorkspaceOptions.include = [];
        this.searchInWorkspaceOptions.exclude = [];
        this.includeIgnoredState.enabled = false;
        this.matchCaseState.enabled = false;
        this.wholeWordState.enabled = false;
        this.regExpState.enabled = false;
        const search = document.getElementById("search-input-field");
        const replace = document.getElementById("replace-input-field");
        const include = document.getElementById("include-glob-field");
        const exclude = document.getElementById("exclude-glob-field");
        if (search && replace && include && exclude) {
            (search as HTMLInputElement).value = "";
            (replace as HTMLInputElement).value = "";
            (include as HTMLInputElement).value = "";
            (exclude as HTMLInputElement).value = "";
        }
        this.resultTreeWidget.search(this.searchTerm, this.searchInWorkspaceOptions);
        this.update();
    }

    protected renderControlButtons(): h.Child {
        const refreshButton = this.renderControlButton(`refresh${this.hasResults || this.searchTerm !== "" ? " enabled" : ""}`, 'Refresh', this.refresh);
        const collapseAllButton = this.renderControlButton(`collapse-all${this.hasResults ? " enabled" : ""}`, 'Collapse All', this.collapseAll);
        const clearButton = this.renderControlButton(`clear${this.hasResults ? " enabled" : ""}`, 'Clear', this.clear);
        return h.div({ className: "controls button-container" }, refreshButton, collapseAllButton, clearButton);
    }

    protected renderControlButton(btnClass: string, title: string, clickHandler: () => void): h.Child {
        return h.span({ className: `btn ${btnClass}`, title, onclick: clickHandler });
    }

    protected renderSearchAndReplace(): h.Child {
        const toggleContainer = this.renderReplaceFieldToggle();
        const searchField = this.renderSearchField();
        const replaceField = this.renderReplaceField();
        const searchAndReplaceFields = h.div({ className: "search-and-replace-fields" }, searchField, replaceField);
        return h.div({ className: "search-and-replace-container" }, toggleContainer, searchAndReplaceFields);
    }

    protected renderReplaceFieldToggle(): h.Child {
        const toggle = h.span({ className: `fa fa-caret-${this.showReplaceField ? "down" : "right"}` });
        return h.div({
            className: "replace-toggle",
            tabindex: "0",
            onclick: e => {
                const elArr = document.getElementsByClassName("replace-toggle");
                if (elArr && elArr.length > 0) {
                    (elArr[0] as HTMLElement).focus();
                }
                this.showReplaceField = !this.showReplaceField;
                this.resultTreeWidget.showReplaceButtons = this.showReplaceField;
                this.update();
            }
        }, toggle);
    }

    protected renderSearchField(): h.Child {
        const input = h.input({
            id: "search-input-field",
            type: "text",
            placeholder: "Search",
            value: this.searchTerm,
            onfocus: e => {
                const elArr = document.getElementsByClassName("search-field-container");
                if (elArr && elArr.length > 0) {
                    (elArr[0] as HTMLElement).className = "search-field-container focussed";
                }
            },
            onblur: e => {
                const elArr = document.getElementsByClassName("search-field-container");
                if (elArr && elArr.length > 0) {
                    (elArr[0] as HTMLElement).className = "search-field-container";
                }
            },
            onkeyup: e => {
                if (e.target) {
                    this.searchTerm = (e.target as HTMLInputElement).value;
                    this.resultTreeWidget.search(this.searchTerm, (this.searchInWorkspaceOptions || {}));
                    this.update();
                }
            }
        });
        const optionContainer = this.renderOptionContainer();
        return h.div({ className: "search-field-container" }, h.div({ className: "search-field" }, input, optionContainer));
    }

    protected renderReplaceField(): h.Child {
        const input = h.input({
            id: "replace-input-field",
            type: "text",
            placeholder: "Replace",
            value: this.replaceTerm,
            onkeyup: e => {
                if (e.target) {
                    if (Key.ENTER.keyCode === e.keyCode) {
                        this.resultTreeWidget.search(this.searchTerm, (this.searchInWorkspaceOptions || {}));
                        this.update();
                    } else {
                        this.replaceTerm = (e.target as HTMLInputElement).value;
                        this.resultTreeWidget.replaceTerm = this.replaceTerm;
                    }
                }
            }
        });
        const replaceAllButtonContainer = this.renderReplaceAllButtonContainer();
        return h.div({ className: `replace-field${this.showReplaceField ? "" : " hidden"}` }, input, replaceAllButtonContainer);
    }

    protected renderReplaceAllButtonContainer(): h.Child {
        const replaceButton = h.span({
            className: `replace-all-button${this.searchTerm === "" ? " disabled" : ""}`,
            onclick: () => {
                this.resultTreeWidget.replaceAll();
            }
        });
        return h.div({
            className: "replace-all-button-container"
        }, replaceButton);
    }

    protected renderOptionContainer(): h.Child {
        const matchCaseOption = this.renderOptionElement(this.matchCaseState);
        const wholeWordOption = this.renderOptionElement(this.wholeWordState);
        const regexOption = this.renderOptionElement(this.regExpState);
        const includeIgnoredOption = this.renderOptionElement(this.includeIgnoredState);
        return h.div({ className: "option-buttons" }, matchCaseOption, wholeWordOption, regexOption, includeIgnoredOption);
    }

    protected renderOptionElement(opt: SearchFieldState): h.Child {
        return h.span({
            className: `${opt.className} option ${opt.enabled ? "enabled" : ""}`,
            title: opt.title,
            onclick: () => this.handleOptionClick(opt)
        });
    }

    protected handleOptionClick(option: SearchFieldState): void {
        option.enabled = !option.enabled;
        this.updateSearchOptions();
        this.resultTreeWidget.search(this.searchTerm, this.searchInWorkspaceOptions);
        this.update();
    }

    protected updateSearchOptions() {
        this.searchInWorkspaceOptions.matchCase = this.matchCaseState.enabled;
        this.searchInWorkspaceOptions.matchWholeWord = this.wholeWordState.enabled;
        this.searchInWorkspaceOptions.useRegExp = this.regExpState.enabled;
        this.searchInWorkspaceOptions.includeIgnored = this.includeIgnoredState.enabled;
    }

    protected renderSearchDetails(): h.Child {
        const expandButton = this.renderExpandGlobFieldsButton();
        const globFieldContainer = this.renderGlobFieldContainer();
        return h.div({ className: "search-details" }, expandButton, globFieldContainer);
    }

    protected renderGlobFieldContainer(): h.Child {
        const includeField = this.renderGlobField("include");
        const excludeField = this.renderGlobField("exclude");
        return h.div({ className: `glob-field-container${!this.showSearchDetails ? " hidden" : ""}` }, includeField, excludeField);
    }

    protected renderExpandGlobFieldsButton(): h.Child {
        const button = h.span({ className: "fa fa-ellipsis-h btn" });
        return h.div({
            className: "button-container", onclick: () => {
                this.showSearchDetails = !this.showSearchDetails;
                this.update();
            }
        }, button);
    }

    protected renderGlobField(kind: "include" | "exclude"): h.Child {
        const label = h.div({ className: "label" }, "files to " + kind);
        const currentValue = this.searchInWorkspaceOptions[kind];
        const input = h.input({
            type: "text",
            value: currentValue && currentValue.join(', ') || '',
            id: kind + "-glob-field",
            onkeyup: e => {
                if (e.target) {
                    if (Key.ENTER.keyCode === e.keyCode) {
                        this.resultTreeWidget.search(this.searchTerm, this.searchInWorkspaceOptions);
                    } else {
                        this.searchInWorkspaceOptions[kind] = this.splitOnComma((e.target as HTMLInputElement).value);
                    }
                }
            }
        });
        return h.div({ className: "glob-field" }, label, input);
    }

    protected splitOnComma(patterns: string): string[] {
        return patterns.split(',').map(s => s.trim());
    }
}
