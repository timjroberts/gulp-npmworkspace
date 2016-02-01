@requiresWorkspace
Feature: Create links in dependant packages

As a Develoepr
I want links to be created in dependant projects with other known workspace packages when the Workspace is installed
So that I can avoid having to manually link projects via 'npm link'

Scenario: Simple linear dependencies

    Given a Workspace with:
        | package   | dependencies |
        | package-a |              |
        | package-b | package-a    |
        | package-c | package-b    |
    When the workspace packages are installed
    Then package "package-b" has a node_module named "package-a" that is a symbolic link
     And package "package-c" has a node_module named "package-b" that is a symbolic link

Scenario: Simple linear dependencies can be uninstalled

    Given a Workspace with:
        | package   | dependencies |
        | package-a |              |
        | package-b | package-a    |
        | package-c | package-b    |
    When the workspace packages are installed
    Then package "package-b" has a node_module named "package-a" that is a symbolic link
     And package "package-c" has a node_module named "package-b" that is a symbolic link
    When the workspace packages are uninstalled
    Then package "package-a" has no node_modules
     And package "package-b" has no node_modules
     And package "package-c" has no node_modules

Scenario: Simple linear dependencies combined with third-party dependencies

    Given a Workspace with:
        | package   | dependencies       |
        | package-a | express            |
        | package-b | package-a          |
        | package-c | package-b, express |
    When the workspace packages are installed
    Then package "package-a" has a node_module named "express" that is a folder
     And package "package-b" has a node_module named "package-a" that is a symbolic link
     And package "package-c" has a node_module named "express" that is a folder
     And package "package-c" has a node_module named "package-b" that is a symbolic link
