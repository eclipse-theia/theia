// @ts-ignore
const packageJson = require('./package.json');

// @ts-check
const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const cp = require('child_process');
const decompress = require('gulp-decompress');
const download = require('gulp-download');
const debugAdapterDir = packageJson['debugAdapter']['dir'];
const debugAdapterDownloadUri = packageJson['debugAdapter']['downloadUri'];
const downloadPath = path.join(__dirname, 'download');
const archivePath = path.join(downloadPath, path.basename(debugAdapterDownloadUri));

function decompressArchive() {
    gulp.src(archivePath)
        .pipe(decompress())
        .pipe(gulp.dest(debugAdapterDir))
}

gulp.task('download_nodejs_debug_adapter', () => {
    if (fs.existsSync(archivePath)) {
        decompressArchive();
    } else {
        download(debugAdapterDownloadUri)
            .pipe(gulp.dest(downloadPath))
            .on('end', () =>
                decompressArchive()
            );
    }
});
