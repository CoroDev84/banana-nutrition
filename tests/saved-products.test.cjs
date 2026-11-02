const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {value:'',textContent:'',disabled:false,hidden:false,
    classList:{add(){},remove(){}},reportValidity:()=>true,
    querySelectorAll:()=>[element('food-name'),element('barcode-correction-save')],
    reset(){for(const e of elements.values())e.value='';}});
  return elements.get(id);
}
const context = vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},
  window:{clearTimeout(){}}, Date, console, setTimeout});
let source = fs.readFileSync(path.join(root,'nutrition-app.js'),'utf8')
  .replace(/import[\s\S]*?from "[^"]+";/g,'').split('const wellness = initWellness')[0];
source = fs.readFileSync(path.join(root,'saved-products.js'),'utf8').replace(/export /g,'') + '\n' + source;
vm.runInContext(source + '\nglobalThis.api={buildSavedProduct,buildEntryPayload,handleBarcodeCorrectionSave,applyFoodToEntryForm,applyServingMultiplierToForm,fillEntryForm,resetEntryForm,handleEntrySubmit,state};',context);
const api=context.api;
let calls=[],fail=false;
context.mockFetch=async (route,options)=>{calls.push({route,...options});if(fail)throw new Error('Network failed');return {};};
vm.runInContext('apiFetch=mockFetch; setAppScreen=()=>{}; loadDay=async()=>{};',context);
const product={name:'Rice',barcode:'0054800423347',servingSize:250,servingUnit:'g',servingLabel:'1 pouch (250 g)',
  calories:360,protein:7,carbs:71,fat:5,nutrients:{sugars:0,fiber:1},source:'saved_product'};
(async()=>{
 element('entry-date').value='2026-11-02';element('entry-meal').value='lunch';
 element('serving-multiplier').value='0.5';api.applyFoodToEntryForm(product);
 assert.equal(element('calories').value,'180.0');assert.equal(element('protein').value,'3.5');
 assert.equal(element('nutrient-sugars').value,'0.0');assert.equal(element('nutrient-sodium').value,'');
 await api.handleBarcodeCorrectionSave();
 assert.equal(calls.length,1);assert.equal(calls[0].method,'PUT');
 const saved=JSON.parse(calls[0].body);
 assert.equal(saved.calories,360);assert.equal(saved.protein,7);assert.equal(saved.carbs,71);
 assert.equal(saved.nutrients.sugars,0);assert.ok(!('sodium' in saved.nutrients));
 assert.equal(saved.servingSize,250);assert.ok(!('servingMultiplier' in saved));
 assert.equal(element('food-name').disabled,false);
 assert.match(element('barcode-correction-status').textContent,/saved for future scans/);
 // A failed product save keeps the user's correction and permits an idempotent retry.
 fail=true;await api.handleBarcodeCorrectionSave();
 assert.equal(element('protein').value,'3.5');assert.equal(api.state.productSaving,false);
 assert.match(element('barcode-correction-status').textContent,/Network failed/);
 fail=false;await api.handleBarcodeCorrectionSave();
 // Reloading a diary entry preserves consumed values and saves a one-serving product.
 api.fillEntryForm({id:'entry1',entryDate:'2026-11-02',meal:'lunch',foodNameSnapshot:'Rice',
   barcodeSnapshot:product.barcode,servingLabel:product.servingLabel,servingSize:250,servingUnit:'g',
   servingMultiplier:2,calories:720,protein:14,carbs:142,fat:10,nutrients:{sugars:0}});
 await api.handleBarcodeCorrectionSave();assert.equal(JSON.parse(calls.at(-1).body).protein,7);
 await api.handleEntrySubmit({preventDefault(){}});
 assert.equal(calls.at(-1).method,'PATCH');assert.equal(calls.at(-1).route,'/api/entries/entry1');
 assert.equal(JSON.parse(calls.at(-1).body).protein,14);
 // Blank/invalid barcode cannot save and never silently drops letters.
 const before=calls.length;element('barcode-snapshot').value='bad0054800423347';
 await api.handleBarcodeCorrectionSave();assert.equal(calls.length,before);
 assert.match(element('barcode-correction-status').textContent,/barcode/);
 assert.throws(()=>api.buildSavedProduct({foodNameSnapshot:'Rice',barcodeSnapshot:product.barcode,
   servingLabel:'pouch',servingMultiplier:0}),/multiplier/);
 console.log('PASS correction save/retry, half/double serving, zero/unknown nutrients, diary edit, invalid barcode');
})().catch(e=>{console.error(e);process.exitCode=1;});
