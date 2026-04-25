import fs from 'fs';

const files = [
  'src/components/Layout.tsx',
  'src/components/TalkTab.tsx',
  'src/components/VocabManager.tsx',
  'src/components/ComposeTab.tsx',
  'src/components/HistoryTab.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf-8');
    let newContent = content.replace(/#004A99/g, '#006D77');
    newContent = newContent.replace(/#003B7A/g, '#005960');
    if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf-8');
      console.log('Updated', file);
    }
  }
});
console.log('Done.');
