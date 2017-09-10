var path = require('path');
var process = require('process');
var rm = require('rimraf');

var gulp = require('gulp');
var gutil = require('gulp-util');
var inject = require('gulp-inject');
var cached = require('gulp-cached');
var changed = require('gulp-changed');
var plumber = require('gulp-plumber');
var aglio = require('gulp-aglio');

var browserSync = require('browser-sync').create();
const reload = browserSync.reload;

const PrjRoot = process.cwd();

const Config = {
    entry: './index.html',
    dirs: {
        src: 'docs',
        dist: 'dist'
    },
    // broswersync-config
    serve: {
        server: {
            baseDir: "./"
        }

    }
}

const CACHE_KEYS = {
    TRANSPILING: 'transpile-api-blueprint-docs',
    INJECTING: 'inject-transpiled-api-blueprint-docs'
}

const AglioOptions = {
    includePath: path.posix.join(PrjRoot, Config.dirs.src)
};

const transpileBluePrint = function transpileBluePrint(globs, options = {}, dist = Config.dirs.dist) {
    let transpilePromise = new Promise((resolve, reject) => {
        gulp.src(globs, { base: Config.dirs.src })
            .pipe(plumber(function rejector(err) {
                let { message } = err;
                console.error(err);
                this.emit('end', err);
            }))
            .pipe(cached(CACHE_KEYS['TRANSPILING'], {
                optimizeMemory: true
            }))
            .pipe(aglio(options))
            .pipe(changed(Config.dirs.dist, { extension: '.html', hasChanged: changed.compareContents }))
            .pipe(gulp.dest(dist))
            .on('end', function(err) {
                if (err) {
                    reject(err)
                } else {
                    resolve();
                }
            })
    });
    return transpilePromise;
}

const injectTranspiledDocs = function injectTranspiledDocs() {

    let target = gulp.src(`${Config.entry}`);
    let sources = gulp.src(`./${Config.dirs.dist}/**/*.html`, { read: false });

    let transpiledPromise = new Promise((resolve, reject) => {
        target
            .pipe(plumber(function rejector(err) {
                let { message } = err;
                console.error(err);
                this.emit('end', err);
            }))
            .pipe(cached(CACHE_KEYS['INJECTING']))
            .pipe(inject(sources, {
                relative: true,
                transform: function(filePath, file, i, length) {
                    let fileName = path.relative(Config.dirs.dist, filePath);
                    // console.log(filePath, Config.dirs.dist, fileName);
                    return '<li><a href="' + filePath + '">' + fileName + '</a></li>';
                }
            }))
            .pipe(gulp.dest('./'))
            .on('end', function(err) {
                if (err) {
                    reject(err)
                } else {
                    resolve();
                }
            })

    })

    return transpiledPromise;
}

const del = function del(globs) {
    let delPromise = new Promise((resolve, reject) => {
        rm(globs, resolve)
    }).catch(err => Promise.reject(err));
    return delPromise
}

gulp.task('clean', gulp.series(function cleanDistDir() {
    let globs = path.posix.join(PrjRoot, Config.dirs.dist, '/**/*');
    let cleanPromise = del(globs).then(() => {
        console.log(`${globs} were all cleaned ... `);
    })
    return cleanPromise;
}))

gulp.task('watch', gulp.series(function watchChanges(done) {
    let globs = path.posix.join(Config.dirs.src, '/**/*.{md,apib}');
    let watcher = gulp.watch(globs);

    watcher
        .on('add', function(filePath, stats) {
            console.log(`${filePath} was added`);
            transpileBluePrint(filePath)
                .then(() => {
                    console.log(`${filePath} was transpiled`);
                    injectTranspiledDocs()
                        .then(reload)
                        .catch(reload);
                })
        })
        .on('change', function(filePath, stats) {
            console.log(`${filePath} was changed`);
            transpileBluePrint(filePath)
                .then(() => {
                    console.log(`${filePath} was transpiled`);
                    injectTranspiledDocs()
                        .then(reload)
                        .catch(reload);
                })
        })
        .on('unlink', function(filePath, stats) {
            console.log(`${filePath} was removed`);
            let pathInfo = path.relative(Config.dirs.src, filePath);
            let { dir, base, name } = path.parse(pathInfo);
            let globs = path.posix.join(PrjRoot, Config.dirs.dist, dir, `${name}.html`);
            del(globs)
                .then(() => {
                    console.log(`${name}.html was removed in dist dir`);
                    injectTranspiledDocs()
                        .then(reload)
                        .catch(reload);
                })
        })
    done();
}))

gulp.task('transpile', gulp.series(function transpile() {
    let globs = path.posix.join(Config.dirs.src, '/**/*.{md,apib}');
    return transpileBluePrint(globs, AglioOptions);
}));

gulp.task("serve", gulp.series(function serve(done) {
    // modify some webpack config options
    browserSync.init(Config.serve);
    done();

}));

gulp.task("inject", gulp.series(injectTranspiledDocs))

gulp.task('default', gulp.series('clean', 'transpile', gulp.parallel('watch', 'inject'), 'serve'))