const fs = require("fs");

const path = "app/page.tsx";
const text = fs.readFileSync(path, "utf8");

const oldBlock = `  ).sort(\n    (a, b) =>\n      b.winRate - a.winRate ||\n      b.w - a.w ||\n      b.played - a.played\n  ), [[players, filteredMatches, fines]]);`;

const newBlock = `  ).sort(\n    (a, b) => {\n      const aIsGuest = /^guest/i.test(a.name.trim());\n      const bIsGuest = /^guest/i.test(b.name.trim());\n      if (aIsGuest !== bIsGuest) return aIsGuest ? 1 : -1;\n      return b.winRate - a.winRate || b.w - a.w || b.played - a.played;\n    }\n  ), [[players, filteredMatches, fines]]);`;

if (text.includes(newBlock)) process.exit(0);

const count = text.split(oldBlock).length - 1;
if (count !== 1) {
  throw new Error(`Expected exactly one leaderboard sort block, found ${count}`);
}

fs.writeFileSync(path, text.replace(oldBlock, newBlock));
