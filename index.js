const path = require("path");
const fs = require("fs")

async function lintAsync() {
    const lintOutputFilepath = path.join(__dirname, "output.json")
};

lintAsync();
