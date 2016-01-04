var gulp = require("gulp");
var util = require("gulp-util");
var childProcess = require("child_process");
var path = require("path");
var through = require("through2");

function compileProject() {
    return through.obj(function(file, encoding, callback) {
        var pathInfo = path.parse(file.path);
        var result = childProcess.execSync("\"./node_modules/.bin/tsc\"", { cwd: pathInfo.dir });

        util.log(result.toString());

        callback(null, file);
    });
}

gulp.task("compile", function() {
    return gulp.src("./tsconfig.json")
        .pipe(compileProject());
});
