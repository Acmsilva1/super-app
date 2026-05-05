const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = scriptRegex.exec(content)) !== null) {
    count++;
    const scriptBody = match[1];
    const scriptStartPos = match.index + 8;
    const beforeScript = content.substring(0, scriptStartPos);
    const startLine = beforeScript.split('\n').length;

    try {
        new Function(scriptBody);
        console.log(`Script ${count} is valid`);
    } catch (e) {
        console.error(`Script ${count} has error: ${e.message}`);
        console.log(`Script starts around line ${startLine}`);
        
        // Find where the error is
        // We can't get it from Function(), but we can use acorn or similar if available.
        // Since we don't have acorn, we'll try to find "!" that are naked.
        const lines = scriptBody.split('\n');
        lines.forEach((line, index) => {
            if (line.includes('!')) {
                // Remove strings and comments
                let clean = line.replace(/\/\/.*/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '').replace(/`[^`]*`/g, '');
                if (clean.includes('!')) {
                   // Still has ! - check if it's !=, !==, or !variable
                   const broken = clean.match(/![^=a-zA-Z0-9_$]/);
                   if (broken) {
                       console.log(`Potential broken line at ${startLine + index}: ${line}`);
                   }
                }
            }
        });
    }
}
