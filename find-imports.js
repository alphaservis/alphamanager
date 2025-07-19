const fs = require('fs');
const path = require('path');

const searchDir = path.join(__dirname, 'src'); // Direktorij za pretraživanje
const searchTerm = 'firebase-functions'; // Prvi pojam za pretraživanje
const alternativeSearchTerm = '../functions'; // Drugi pojam za pretraživanje (za relativne putanje)

let foundFiles = [];

function walkSync(dir, filelist = []) {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      filelist = walkSync(filePath, filelist);
    } else {
      // Provjeri samo relevantne ekstenzije datoteka
      if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes(searchTerm) || content.includes(alternativeSearchTerm)) {
          foundFiles.push(filePath);
        }
      }
    }
  });
  return filelist;
}

console.log(`Pretraživanje za '${searchTerm}' ili '${alternativeSearchTerm}' u '${searchDir}'...`);
walkSync(searchDir);

if (foundFiles.length > 0) {
  console.log('\n--- Pronađene reference u sljedećim datotekama: ---');
  foundFiles.forEach(file => console.log(file));
  console.log('\nMolimo provjerite ove datoteke i uklonite sve uvoze (import/require) za "firebase-functions" ili relativne putanje koje vode do "functions" direktorija.');
} else {
  console.log('\n--- Nisu pronađene reference na "firebase-functions" ili "../functions" u "src" direktoriju. ---');
  console.log('Ako se greška i dalje javlja, problem je vjerojatno u keširanju ili konfiguraciji build alata.');
}