import { injectable, decorate } from 'inversify';
import { ConsoleWindow } from 'monaco-languageclient/lib/console-window';
decorate(injectable(), ConsoleWindow);
export {
    ConsoleWindow
};
