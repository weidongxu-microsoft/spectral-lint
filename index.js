const path = require("path");
const fs = require("fs");
const child_process = require('child_process');

const { Octokit } = require("@octokit/rest");

async function lintAsync() {
    const owner = "Azure";
    const repo = "azure-rest-api-specs";
    const pullNumber = 6771;

    const lintOutputFilepath = path.join(__dirname, "output.json")

    const octokit = new Octokit({ auth: process.env.GITHUB_PAT });
    const pullRequest = await (await octokit.rest.pulls.get({
        owner: owner, 
        repo: repo, 
        pull_number: pullNumber
    })).data;
    const commitId = pullRequest.head.sha;
    
    const pullRequestFiles = await (await octokit.rest.pulls.listFiles({ 
        owner: owner, 
        repo: repo, 
        pull_number: pullNumber,
        per_page: 100
    })).data;

    for (const file of pullRequestFiles) {
        const filename = file.filename;
        if (filename.endsWith(".json") && !filename.includes("/examples/")) {
            console.log(`found JSON ${filename} from pull request ${pullNumber}`);

            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${commitId}/${filename}`;
            const url = `https://www.github.com/Azure/${owner}/${repo}/blob/${commitId}/${filename}`;
            console.log(`linting ${rawUrl}`);
            if (fs.existsSync(lintOutputFilepath)) { 
                fs.rmSync(lintOutputFilepath);
            }
            await exec(`npm run spectral-lint ${rawUrl}`);
            
            if (fs.existsSync(lintOutputFilepath)) {
                const lintResults = JSON.parse(fs.readFileSync(lintOutputFilepath, { encoding: 'utf-8' }));
                logLintResults(lintResults, url);
                // await githubReview(lintResults, octokit, owner, repo, pullNumber, url);
                await githubReviewComments(lintResults, octokit, owner, repo, pullNumber, commitId, filename);
            }
        }
    }
}

function logLintResults(lintResults, url) {
    for (const lintResult of lintResults) {
        const message = lintResult.message;
        const [start, end] = startEndFromRange(lintResult.range);
        console.log(`${lintResult.severity}\t${end}\t${message}`);
        if (start) {
            console.log(`${url}#L${start}-L${end}`);
        } else {
            console.log(`${url}#L${end}`);
        }
    }
}

async function githubReview(lintResults, octokit, owner, repo, pullNumber, url) {
    var markdown = "| Message | Location |\n";
    markdown += "|---|---|\n";
    const fileShort = new URL(url).pathname.split("/").pop();
    for (const lintResult of lintResults) {
        const message = lintResult.message;
        const [start, end] = startEndFromRange(lintResult.range);
        var fileLocation;
        if (start) {
            fileLocation = `#L${start}-L${end}`;
        } else {
            fileLocation = `#L${end}`;
        }
        markdown += `| ${message} | [${fileShort}${fileLocation}](${url}${fileLocation}) |\n`
    }

    await octokit.rest.pulls.createReview({
        owner: owner, 
        repo: repo, 
        pull_number: pullNumber,
        body: markdown,
        event: "COMMENT"
    });
}

async function githubReviewComments(lintResults, octokit, owner, repo, pullNumber, commitId, filename) {
    const comments = [];
    for (const lintResult of lintResults) {
        const severity = lintResult.severity;
        if (severity <= 1) {
            const message = lintResult.message;
            const [start, end] = startEndFromRange(lintResult.range);

            comments.push({
                body: message, 
                path: filename, 
                start_line: start, 
                line: end,
                side: "RIGHT"
            });
        }
    }

    await octokit.rest.pulls.createReview({
        owner: owner, 
        repo: repo, 
        pull_number: pullNumber,
        body: "spectral lint",
        commit_id: commitId, 
        event: "COMMENT",
        comments: comments
    });
}

function startEndFromRange(range) {
    var start = range.start.line + 1;
    var end = range.end.line + 1;
    if (start == end) {
        start = undefined;
    } else {
        end = end + 1;
    }
    return [start, end];
}

async function exec(command) {
    return new Promise((done, failed) => {
        child_process.exec(command, (err, stdout, stderr) => {
            done({ stdout, stderr });
        });
    });
}

lintAsync();
