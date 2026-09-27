import { readFileSync } from 'node:fs'
const packs = ['ai-core','cet4','cet6','cloud-native','frontend','go-code','ielts','kaoyan','toefl','ts-code']
let total=0, emptyDef=[], noDefKey=0, emptyPhon=[]
for (const p of packs) {
  const w = JSON.parse(readFileSync(`content/vocabulary/${p}/words.json`,'utf8'))
  for (const it of w) {
    total++
    if (!('definition' in it)) noDefKey++
    else if (String(it.definition).trim()==='') emptyDef.push(p+':'+it.word)
    if ('phonetic' in it && String(it.phonetic).trim()==='') emptyPhon.push(p+':'+it.word)
  }
}
console.log('TOTAL words:', total)
console.log('NO definition key:', noDefKey)
console.log('EMPTY definition:', emptyDef.length, emptyDef.join(', '))
console.log('EMPTY phonetic:', emptyPhon.length, emptyPhon.join(', '))
console.log('=> definition 非空覆盖:', total-noDefKey-emptyDef.length, '/', total)
