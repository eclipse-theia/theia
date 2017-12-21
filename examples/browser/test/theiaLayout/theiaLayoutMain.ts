import { TheiaLayoutPO } from "./PageObject/theiaLayoutPO"

export class TheiaLayoutMain extends TheiaLayoutPO {

    constructor() {
        super();
    }

    /*
    * Left panel test
    */

    loadPanels() {
        this.mainContentPanelExits();
    }

    loadFilePanels() {
        if (this.isFileNavigatorClosed()) {
            return this.isFileNavigatorOpenOnClickingFiles();
        }
        else
            return this.isFileNavigatorOpenOnClickingFiles();
    }

    leftMenuTabShows(number: any) {
        return this.leftPanelMenuTabActive(number);
    }

    leftMenuShowing(number: any) {
        return this.leftPanelMenuExists(number);
    }

    filesWorkspace() {
        return this.workspaceExists();
    }

    gitContainer() {
        return this.gitContainerExists();
    }

    extensionsContainer() {
        return this.extensionsContainerExists();
    }

    /*
    * Tests for top menu
    */
    loadTopPanel() {
        this.topPanelExists();
    }

    topMenuTabShows(number: any) {
        return this.topPanelMenuTabActive(number);
    }

    topMenuShowing(number: any) {
        return this.topPanelMenuExists(number);
    }

}