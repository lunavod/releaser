#!/usr/bin/env node
import ora from "ora";
import simpleGit from "simple-git";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import inquirer from "inquirer";
const dir = process.cwd();
const git = simpleGit({
    baseDir: dir,
});
let packageJson;
const pjsSpinner = ora("Parsing package.json...");
try {
    packageJson = await fs.readJson(path.join(dir, "package.json"));
    pjsSpinner.succeed();
}
catch (e) {
    pjsSpinner.fail("Cant find package.json in directory!");
    process.exit();
}
const typesToLevels = {
    feat: 1,
    fix: 0,
};
async function updateRemote() {
    const spinner = ora("Fetching remote...").start();
    await git.remote(["update"]);
    spinner.succeed();
}
async function getCommitsSinceLastRelease() {
    const log = (await git.log()).all;
    const currentReleaseCommits = [];
    const re = /tag: v(\d+\.\d+.\d+)/;
    for (const commit of log) {
        const tag = commit.refs.split(", ").find(r => r.match(re) !== null);
        if (tag) {
            return [currentReleaseCommits, tag.match(re)[1]];
        }
        currentReleaseCommits.push(commit);
    }
    return [currentReleaseCommits, null];
}
function getTypeFromMessage(msg) {
    for (const type of Object.keys(typesToLevels)) {
        if (msg.startsWith(`${type}:`) || msg.startsWith(`${type}(`))
            return type;
    }
    return null;
}
await updateRemote();
const status = await git.status(["-uno"]);
if (status.behind) {
    ora().fail("Local branch is outdated, update first!");
    process.exit();
}
// eslint-disable-next-line prefer-const
let [log, lastVersion] = await getCommitsSinceLastRelease();
if (!log.length) {
    console.log(chalk `\n{yellow No new commits for release!}`);
    process.exit();
}
if (!lastVersion)
    lastVersion = packageJson.version;
const messages = log.map(c => c.message);
const maxLevel = log
    .map(commit => getTypeFromMessage(commit.message))
    .reduce((maxLevel, type) => type !== null && typesToLevels[type] > maxLevel
    ? typesToLevels[type]
    : maxLevel, 0);
let releaseStr;
switch (maxLevel) {
    case 0:
        releaseStr = chalk `{blue PATCH}`;
        break;
    case 1:
        releaseStr = chalk `{green MINOR}`;
        break;
    case 2:
        releaseStr = chalk `{yellow MAJOR}`;
        break;
}
console.log(chalk `\n{magenta Commits in release:}`);
const re = /(.+?)(:?\(.+\))?: (.+)(?:\n|$)/;
const maxLen = messages.reduce((max, msg) => {
    const groups = msg.match(re);
    if (groups)
        msg = groups[3];
    return msg.length > max ? msg.length : max;
}, 0);
messages.forEach(msg => {
    const groups = msg.match(re);
    if (groups) {
        // eslint-disable-next-line prefer-const
        let [type, scope, message] = groups.slice(1, 4);
        if (scope) {
            scope = scope.slice(1, -1);
            console.log(chalk `%s{grey | }{green %s} {grey [}{blue %s}{grey ]}`, message.padEnd(maxLen + 2), type, scope);
        }
        else {
            console.log(chalk `%s{grey | }{green %s}`, message.padEnd(maxLen + 2), type);
        }
    }
    else {
        console.log(chalk `%s{grey | }{yellow non-conventional}`, msg.padEnd(maxLen + 2));
    }
});
console.log(chalk `\n{magenta Release type:}`, releaseStr);
let [major, minor, patch] = lastVersion
    .split(".")
    .map((s) => parseInt(s));
if (maxLevel === 0) {
    patch += 1;
}
else if (maxLevel === 1) {
    patch = 0;
    minor += 1;
}
else if (maxLevel === 2) {
    patch = 0;
    minor = 0;
    major += 1;
}
const newVersion = `${major}.${minor}.${patch}`;
console.log(chalk `{magenta Version: }{blue %s }{grey => }{green %s}\n`, lastVersion, newVersion);
const { confirmed } = await inquirer.prompt([
    {
        type: "confirm",
        message: "Proceed?",
        name: "confirmed",
    },
]);
if (!confirmed) {
    console.log(chalk `{red Ok, exiting}`);
    process.exit();
}
const vSpinner = ora("Updating package.json...");
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ ...packageJson, version: newVersion }, undefined, "  "));
vSpinner.succeed();
const cSpinner = ora("Committing...");
await git.add(path.join(dir, "package.json"));
await git.commit(`Release v${newVersion}`);
cSpinner.succeed();
const tagSpinner = ora(chalk `Creating tag {blue v${newVersion}}...`).start();
git.tag([`v${newVersion}`]);
tagSpinner.succeed();
console.log();
const { confirmPush } = await inquirer.prompt([
    {
        type: "confirm",
        message: "Push?",
        name: "confirmPush",
        default: false,
    },
]);
if (confirmPush) {
    const pSpinner = ora("Pushing...").start();
    await git.push();
    await git.pushTags();
    pSpinner.succeed();
}
console.log(chalk `\n{green.bold Done!~}`);
console.log(chalk `{yellow Publish to npm: yarn publish --new-version ${newVersion}}`);
//# sourceMappingURL=index.js.map