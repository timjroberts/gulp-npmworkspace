var gulp = require("gulp");
var workspace = require("gulp-npmworkspace");
var path = require("path");
var fs = require("fs");
var process = require("process");
var typings = require("typings");
var rimraf = require("rimraf");
var through = require("through2");


gulp.task("install", function() {
    var typingsPostInstaller = {
        condition: function(packageDescriptor, packagePath) {
            return fs.existsSync(path.join(packagePath, "typings.json"));
        },
        action: function(packagePath, packageDescriptor) {
            typings.install({ cwd: packagePath }).then(function () {
                rimraf.sync(path.join(packagePath, "./typings/**/browser*"));
                rimraf.sync(path.join(packagePath, "./.typings"));
            });
        }
    };

    return workspace.workspacePackages()
        .pipe(workspace.npmInstall({ postInstall: typingsPostInstaller }));
});


gulp.task("compile", function() {
    return workspace.workspacePackages()
        .pipe(workspace.buildTypeScriptProject());
});


gulp.task("run-spec-tests", function() {
    return workspace.workspacePackages()
        .pipe(workspace.filter(function (packageDescriptor, packagePath) {
            return packageDescriptor.name === "gulp-npmworkspace-specs"
        }))
        .pipe(testCucumber());
});


gulp.task("publish", function() {
    return workspace.workspacePackages()
        .pipe(workspace.filter(function (packageDescriptor, packagePath) {
            return !packageDescriptor.private
        }))
        .pipe(workspace.npmPublish({ bump: "patch" }));
});


function testCucumber() {
    var Cucumber = require("cucumber");

    return through.obj(function (file, _, callback) {
        var packagePath = path.parse(file.path).dir;

        Cucumber
            .Cli([ "node", ".\node_modules\cucumber\bin\cucumber.js", path.join(packagePath, "features"), "-r", path.join(packagePath, "step_definitions") ])
            .run(function(success) {
                if (success) {
                    callback(null, file);
                }
                else {
                    callback(new Error("Failed"));
                }
            });
    });
}