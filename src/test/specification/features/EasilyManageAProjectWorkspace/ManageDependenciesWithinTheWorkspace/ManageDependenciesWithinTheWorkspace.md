# Manage dependencies within the workspace in the 'package.json' files

As a Developer
I want to manage dependencies within the workspace in the 'package.json' files
So that I don't have to maintain any additional ordereded lists

Given that a project workspace contains 'workspace packages', and those packages intrinsically
define their dependencies through their package.json dependencies, devDependencies and
optionalDependencies properties, there should be no need to identify any ordering of the
workspace packages when dealing with any workspace related tasks.
