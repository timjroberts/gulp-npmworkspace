import * as path from "path";
import * as fs from "fs";
import * as childProcess from "child_process";
import * as util from "gulp-util";
import * as through from "through2";
import File = require("vinyl");

import {ArgumentOptions,
        PackageDescriptor} from "./interfaces";

import {pluginName} from "./plugin";

/**
 * Accepts and returns a stream of 'package.json' files and executes the TypeScript compiler for each one.
 */
export function buildProject(): NodeJS.ReadWriteStream {
    return through.obj(function(file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError("install", "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        var packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        util.log("Compiling workspace package '" + util.colors.cyan(packageDescriptor.name) + "'");

        if (!fs.existsSync(path.join(pathInfo.dir, "tsconfig.json"))) {
            util.log(util.colors.yellow("Workspace package '" + packageDescriptor.name + "' does not contain a TypeScript project file (tsconfig.json)."));

            return callback(null, file);
        }

        let hasLocalTypeScript = fs.existsSync(path.join(pathInfo.dir, "node_modules", "typescript"));
        let result = childProcess.spawnSync(path.join(hasLocalTypeScript ? "." : "..", "node_modules/.bin/tsc"), [], { cwd: pathInfo.dir });

        if (result.status !== 0) {
            util.log(util.colors.red(result.stdout.toString()));
        }

        callback(null, file);
    });
}
