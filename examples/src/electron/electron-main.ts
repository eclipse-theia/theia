import * as electron from 'electron';
import * as path from 'path';

let mainWindow: Electron.BrowserWindow | undefined = undefined;

electron.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron.app.quit();
    }
});

electron.app.on('ready', () => {
    require("../app"); // start the express server
    mainWindow = new electron.BrowserWindow({ width: 1024, height: 728 });
    mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}`);
    mainWindow.on('closed', () => {
        mainWindow = undefined;
    });
});