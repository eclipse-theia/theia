// @ts-check
const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const cp = require('child_process');
const decompress = require('gulp-decompress');
const download = require('gulp-download');
const downloadDir = 'download';
const extensionDir = 'lib/node/adapter';
const archiveUri = "https://github.com/tolusha/node-debug/releases/download/v1.23.5/vscode-node-debug.tar.gz"
const downloadPath = path.join(__dirname, downloadDir);
const archivePath = path.join(downloadPath, path.basename(archiveUri));

function decompressArchive() {
    gulp.src(archivePath)
        .pipe(decompress())
        .pipe(gulp.dest(extensionDir))
}

gulp.task('download_nodejs_debug_adapter', () => {
    if (fs.existsSync(archivePath)) {
        decompressArchive();
    } else {
        download(archiveUri)
            .pipe(gulp.dest(downloadPath))
            .on('end', () =>
                decompressArchive()
            );
    }
});

function isWin() {
    return /^win/.test(process.platform);
}

function mvnw() {
    return "./mvnw" + (isWin() ? ".cmd" : "");
}