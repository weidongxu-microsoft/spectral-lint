const path = require("path");
const fs = require("fs");
const child_process = require('child_process');

const { Octokit } = require("@octokit/rest");

async function lintAsync() {
    const owner = "Azure";
    const repo = "azure-rest-api-specs";
    const pullNumber = 18654;

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

            const rawUrl = `https://raw.githubusercontent.com/Azure/azure-rest-api-specs/${commitId}/${filename}`;
            console.log(`linting ${rawUrl}`);
            if (fs.existsSync(lintOutputFilepath)) { 
                fs.rmSync(lintOutputFilepath);
            };
            await exec(`npm run spectral-lint ${rawUrl}`);
            
            if (fs.existsSync(lintOutputFilepath)) {
                const lintResults = JSON.parse(fs.readFileSync(lintOutputFilepath, { encoding: 'utf-8' }));
                for (const lintResult of lintResults) {
                    const severity = lintResult.severity;
                    if (severity <= 1) {
                        const message = lintResult.message;
                        var start = lintResult.range.start.line + 1;
                        var end = lintResult.range.end.line + 1;
                        if (start == end) {
                            start = undefined;
                        } else {
                            end = end + 1;
                        };

                        console.log(`comment "${message}" on line ${end}`);
                        await octokit.rest.pulls.createReviewComment({
                            owner: owner, 
                            repo: repo, 
                            pull_number: pullNumber,
                            body: message, 
                            commit_id: commitId, 
                            path: filename, 
                            start_line: start, 
                            line: end,
                            side: "RIGHT"
                        });
                        // rate limit
                        await new Promise(r => setTimeout(r, 10* 1000));
                    };
                };
            };
        };
    };
};

async function exec(command) {
    return new Promise((done, failed) => {
        child_process.exec(command, (err, stdout, stderr) => {
            done({ stdout, stderr });
        });
    });
};

lintAsync();
