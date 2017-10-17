
import { BasePage } from "../base-page"

export class MainPage extends BasePage {

    public constructor() {
        super();
    }

    public loadPanels() {
        this.topPanelExists();
        this.mainContentPanelExits();
    }

    public loadFilePanels() {
        const fileNavigatorIsOpen = this.isFileNavigatorOpenOnClickingFiles();
        const fileNavigatorIsClosed = this.isFileNavigatorClosed();
        console.log("fileNavigatorIsOpen : " + fileNavigatorIsOpen);
        console.log("fileNavigatorIsClosed :" + fileNavigatorIsClosed);
        return (fileNavigatorIsOpen && !fileNavigatorIsClosed)
    }

    public subMenuShowing(): Boolean {
        this.loadPanels();
        return this.subMenuExists();
    }
}