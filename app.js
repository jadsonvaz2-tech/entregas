'use strict';
const KEY='scanner-entregas-v1', CACHE_KEY='scanner-entregas-address-cache-v1';
const $=id=>document.getElementById(id);
let packages=[]; try{packages=JSON.parse(localStorage.getItem(KEY)||'[]')}catch(e){packages=[]}
if(!Array.isArray(packages))packages=[];
let cache={};try{cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')}catch(e){cache={}}
let stream=null,detector=null,scanning=false,ocrWorker=null,ocrBusy=false,lastOCR=0,lastBarcode='',lastOCRText='';

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const digits=s=>String(s||'').replace(/\D/g,'');
const val=id=>$(id).value.trim();
const set=(id,v)=>{if(v!==undefined&&v!==null&&String(v).trim())$(id).value=String(v).trim()};
const fields=['street','houseNumber','complement','neighborhood','cep','city','state'];

function address(p){
 if(p.street||p.houseNumber||p.neighborhood||p.cep||p.city||p.state){
  return [[p.street,p.houseNumber].filter(Boolean).join(', '),p.complement,p.neighborhood,[p.city,p.state].filter(Boolean).join(' - '),p.cep].filter(Boolean).join(', ');
 }
 return p.address||'';
}
function groups(){
 const m=new Map();
 packages.forEach(p=>{const a=address(p),k=norm(a);if(!m.has(k))m.set(k,{address:a,count:0,codes:[],manual:[],review:false});
 const g=m.get(k);g.count++;if(p.code)g.codes.push(p.code);if(p.handNo)g.manual.push(p.handNo);if(p.review)g.review=true;});
 return [...m.values()];
}
function render(){
 $('total').textContent=packages.length;$('stops').textContent=groups().length;$('review').textContent=packages.filter(p=>p.review).length;
 const q=norm(val('search'));$('list').innerHTML='';
 const list=packages.filter(p=>!q||norm(address(p)+' '+p.code+' '+p.handNo).includes(q));
 if(!list.length){$('list').textContent=packages.length?'Nenhum pacote encontrado.':'Nenhum pacote salvo ainda.';return}
 list.forEach(p=>{
  const card=document.createElement('article');card.className='package-card';
  const strong=document.createElement('strong');strong.textContent=address(p)||'Endereço não informado';card.appendChild(strong);
  const info=document.createElement('p');info.textContent=[p.code?'Código: '+p.code:'',p.handNo?'Número à caneta: '+p.handNo:'',p.review?'⚠ Conferir endereço':''].filter(Boolean).join(' · ');if(info.textContent)card.appendChild(info);
  const actions=document.createElement('div');actions.className='actions';
  ['edit','delete'].forEach(act=>{const b=document.createElement('button');b.type='button';b.className=act==='edit'?'secondary':'danger';b.textContent=act==='edit'?'Editar':'Excluir';b.dataset.action=act;b.dataset.id=p.id;actions.appendChild(b)});
  card.appendChild(actions);$('list').appendChild(card);
 });
}
function save(){localStorage.setItem(KEY,JSON.stringify(packages));render()}
function formData(){
 const p={street:val('street'),houseNumber:val('houseNumber'),complement:val('complement'),neighborhood:val('neighborhood'),cep:val('cep'),city:val('city'),state:val('state').toUpperCase()};
 p.address=address(p);return p;
}
function fillFromLookup(d){
 // Deliberadamente não modifica houseNumber.
 [['street',d.street||d.logradouro],['neighborhood',d.neighborhood||d.bairro],['cep',d.cep],['city',d.city||d.localidade],['state',d.state||d.uf],['complement',d.complement||d.complemento]].forEach(([id,v])=>{if(v&&!val(id))set(id,v)});
}
function cacheSave(k,data){cache[k]={at:Date.now(),data};Object.keys(cache).sort((a,b)=>(cache[b].at||0)-(cache[a].at||0)).slice(300).forEach(k=>delete cache[k]);try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache))}catch(e){}}
async function lookup(){
 const cep=digits(val('cep')),street=val('street'),city=val('city'),uf=val('state').toUpperCase(),status=$('lookupStatus');
 try{
  status.textContent='Consultando endereço...';let key,data,fromCache=false;
  if(cep.length===8){
   key='cep:'+cep;
   if(cache[key]){data=cache[key].data;fromCache=true}
   else{if(!navigator.onLine)throw Error('Sem internet e sem consulta salva para este CEP.');
    const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');if(!r.ok)throw Error('Falha na consulta do CEP.');
    data=await r.json();if(data.erro)throw Error('CEP não encontrado.');
    data={street:data.logradouro||'',neighborhood:data.bairro||'',cep:data.cep||cep,city:data.localidade||'',state:data.uf||'',complement:data.complemento||''};cacheSave(key,data)}
   fillFromLookup(data);status.textContent=(fromCache?'Consulta local reutilizada.':'CEP consultado online.')+' Confira os campos. Número da casa preservado.';return;
  }
  if(street.length<3||city.length<2||!/^[A-Z]{2}$/.test(uf))throw Error('Informe um CEP válido ou preencha rua, cidade e UF.');
  key='street:'+norm(uf+'|'+city+'|'+street);
  if(cache[key]){data=cache[key].data;fromCache=true}
  else{if(!navigator.onLine)throw Error('Sem internet e sem consulta salva para esta rua.');
   const url='https://viacep.com.br/ws/'+encodeURIComponent(uf)+'/'+encodeURIComponent(city)+'/'+encodeURIComponent(street)+'/json/';
   const r=await fetch(url);if(!r.ok)throw Error('Falha ao consultar a rua.');data=await r.json();if(!Array.isArray(data)||!data.length)throw Error('Nenhuma correspondência encontrada.');
   data=data.slice(0,8).map(x=>({street:x.logradouro||'',neighborhood:x.bairro||'',cep:x.cep||'',city:x.localidade||city,state:x.uf||uf,complement:x.complemento||''}));cacheSave(key,data)}
  if(Array.isArray(data)){
   const options=data.map((x,i)=>`${i+1}. ${x.street||'Rua não informada'} — ${x.neighborhood||'bairro não informado'}, ${x.city}/${x.state}, CEP ${x.cep||'não informado'}`).join('\n');
   const choice=prompt('Escolha a correspondência correta pelo número, ou cancele:\n\n'+options,'1');
   if(choice===null){status.textContent='Consulta cancelada; campos mantidos.';return}
   const i=Number(choice)-1;if(!Number.isInteger(i)||i<0||i>=data.length){status.textContent='Opção inválida; campos mantidos.';return}
   fillFromLookup(data[i]);
  }else fillFromLookup(data);
  status.textContent=(fromCache?'Consulta local reutilizada.':'Consulta online concluída.')+' Confira os campos; número da casa preservado.';
 }catch(e){status.textContent=e.message||'Não foi possível consultar o endereço.'}
}
$('lookupAddress').addEventListener('click',lookup);

function cepFrom(t){const m=String(t).match(/\b\d{5}[\s.-]?\d{3}\b/);return m?m[0].replace(/\D/g,''):''}
const ufPattern='AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
function parseOCR(text){
 const lines=String(text||'').split(/\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>=3);
 const all=lines.join('\n'),cep=cepFrom(all);let street='',houseNumber='',neighborhood='',city='',state='';
 const streetRx=/\b(rua|r\.|avenida|av\.|travessa|tv\.|estrada|rodovia|alameda|servid[aã]o|pra[cç]a|largo|rod\.)\b/i;
 const ix=lines.findIndex(l=>streetRx.test(l));
 if(ix>=0){
  let l=lines[ix];let m=l.match(/^(.+?)\s*,?\s*(?:n[º°.]?\s*)?(\d{1,6}[A-Za-z]?)\s*$/i);
  if(m&&streetRx.test(m[1])){street=m[1].trim();houseNumber=m[2].trim()}else street=l;
  if(street.length<8&&lines[ix+1])street=(street+' '+lines[ix+1]).trim();
  if(!houseNumber){const next=lines[ix+1]||'';const n=next.match(/(?:n[º°.]?\s*)?(\d{1,5}[A-Za-z]?)\b/i);if(n&&/\d/.test(n[1])&&!/^\d{5,}$/.test(n[1]))houseNumber=n[1]}
 }
 for(const l of lines){const m=l.match(/(?:bairro|bair\.|bairro:|jd\.|jardim|vila)\s*[:\-]?\s*(.+)$/i);if(m){neighborhood=m[1].trim();break}}
 for(const l of lines){const m=l.match(new RegExp('^(.{2,50}?)\\s*[-,/ ]\\s*('+ufPattern+')\\b','i'));if(m&&!streetRx.test(l)){city=m[1].trim();state=m[2].toUpperCase();break}}
 return {street,houseNumber,neighborhood,cep,city,state,raw:all};
}
async function getOCR(){
 if(ocrWorker)return ocrWorker;
 if(!window.Tesseract)throw Error('Biblioteca OCR não carregada. Verifique a internet.');
 ocrWorker=await Tesseract.createWorker('por',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',langPath:'https://tessdata.projectnaptha.com/4.0.0',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5'});
 return ocrWorker;
}
async function recognize(){
 const v=$('video');if(!v.videoWidth||!v.videoHeight)return '';
 const worker=await getOCR(),c=document.createElement('canvas'),scale=Math.min(2,1600/v.videoWidth);
 c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,c.width,c.height);
 const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
 for(let i=0;i<d.length;i+=4){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2],v2=Math.max(0,Math.min(255,(g-128)*1.4+128));d[i]=d[i+1]=d[i+2]=v2}
 ctx.putImageData(im,0,0);const result=await worker.recognize(c);return (result.data.text||'').trim();
}
function autoFill(p){
 let changed=false;
 const vals={street:p.street,houseNumber:p.houseNumber,neighborhood:p.neighborhood,cep:p.cep,city:p.city,state:p.state};
 Object.entries(vals).forEach(([id,v])=>{if(v&&!val(id)){set(id,v);changed=true}});
 return changed;
}
async function scanLoop(){
 if(!scanning)return;
 if(detector){try{const codes=await detector.detect($('video'));if(codes[0]?.rawValue&&codes[0].rawValue!==lastBarcode){lastBarcode=codes[0].rawValue;set('code',lastBarcode)}}catch(e){}}
 if(Date.now()-lastOCR>=4500&&!ocrBusy){
  lastOCR=Date.now();ocrBusy=true;$('scanStatus').textContent='Lendo etiqueta... mantenha a câmera firme.';
  recognize().then(async text=>{
   if(!scanning||!text)return;lastOCRText=text;const p=parseOCR(text);const changed=autoFill(p);
   $('scanStatus').textContent=(p.street||p.cep?'Possíveis dados encontrados. Confira os campos. ':'Texto lido, mas endereço incompleto. ')+'Leitura: '+text.replace(/\s+/g,' ').slice(0,180);
   if(digits(val('cep')).length===8&&(!val('street')||!val('neighborhood')||!val('city')||!val('state')))await lookup();
   else if(changed)$('lookupStatus').textContent='Dados OCR preenchidos nos campos vazios. Se necessário, toque em Consultar / conferir endereço.';
  }).catch(e=>{if(scanning)$('scanStatus').textContent='Erro no OCR: '+(e.message||'tente novamente')}).finally(()=>ocrBusy=false);
 }
 if(scanning)setTimeout(()=>requestAnimationFrame(scanLoop),250);
}
$('startCam').addEventListener('click',async()=>{
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Use o site HTTPS no Chrome para acessar a câmera.');
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  $('video').srcObject=stream;await $('video').play();detector=null;
  if('BarcodeDetector'in window){try{const formats=await BarcodeDetector.getSupportedFormats();detector=new BarcodeDetector({formats:formats.filter(f=>['code_128','code_39','ean_13','ean_8','upc_a','upc_e','itf','codabar','qr_code','data_matrix','pdf417'].includes(f))})}catch(e){}}
  scanning=true;lastOCR=0;$('scanStatus').textContent='Câmera ligada. Leitura contínua ativada.';requestAnimationFrame(scanLoop);
 }catch(e){$('scanStatus').textContent='Não foi possível abrir a câmera. Confira a permissão do Chrome e tente novamente.'}
});
$('stopCam').addEventListener('click',()=>{scanning=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('scanStatus').textContent='Câmera desligada.'});

$('packageForm').addEventListener('submit',e=>{
 e.preventDefault();const p=formData(),code=val('code'),handNo=val('handNo');
 if(!p.street){alert('Informe ou confira a rua.');return}
 if(code&&packages.some(x=>x.code===code)&&!confirm('Este código já existe. Deseja salvar mesmo assim?'))return;
 p.code=code;p.handNo=handNo;p.review=!p.houseNumber||!p.neighborhood||digits(p.cep).length!==8||!p.city||!/^[A-Z]{2}$/.test(p.state);
 p.id=(crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);p.created=new Date().toISOString();
 packages.push(p);save();$('packageForm').reset();$('lookupStatus').textContent='Pacote salvo. Pronto para a próxima etiqueta.';
});
$('clearForm').addEventListener('click',()=>{$('packageForm').reset();$('lookupStatus').textContent='Campos limpos.'});
$('search').addEventListener('input',render);
$('list').addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;const i=packages.findIndex(p=>String(p.id)===b.dataset.id);if(i<0)return;
 if(b.dataset.action==='delete'){if(confirm('Excluir este pacote?')){packages.splice(i,1);save()}return}
 const p=packages[i],prompts=[['street','Rua / logradouro'],['houseNumber','Número da casa'],['complement','Complemento'],['neighborhood','Bairro'],['cep','CEP'],['city','Cidade'],['state','UF'],['code','Código'],['handNo','Número à caneta']];
 for(const [key,label] of prompts){const x=prompt(label+':',p[key]||'');if(x===null)return;p[key]=x.trim()}
 p.state=(p.state||'').toUpperCase();p.address=address(p);p.review=!p.houseNumber||!p.neighborhood||digits(p.cep).length!==8||!p.city||!/^[A-Z]{2}$/.test(p.state);save();
});
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function csv(rows){return rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n')}
const today=()=>new Date().toISOString().slice(0,10);
$('exportCSV').addEventListener('click',()=>{const rows=[['Street','HouseNumber','Complement','Neighborhood','CEP','City','State','Address','PackageCode','ManualNumber','Review']];packages.forEach(p=>rows.push([p.street||'',p.houseNumber||'',p.complement||'',p.neighborhood||'',p.cep||'',p.city||'',p.state||'',address(p),p.code||'',p.handNo||'',p.review?'SIM':'NÃO']));download('pacotes_'+today()+'.csv','\ufeff'+csv(rows),'text/csv;charset=utf-8')});
$('exportGrouped').addEventListener('click',()=>{const rows=[['Address','PackageCount','PackageCodes','ManualNumbers','Review']];groups().forEach(g=>rows.push([g.address,g.count,g.codes.join(', '),g.manual.join(', '),g.review?'SIM':'NÃO']));download('enderecos_agrupados_'+today()+'.csv','\ufeff'+csv(rows),'text/csv;charset=utf-8')});
$('exportJSON').addEventListener('click',()=>download('backup_scanner_'+today()+'.json',JSON.stringify({packages,cache},null,2),'application/json;charset=utf-8'));
$('clearDay').addEventListener('click',()=>{if(confirm('Apagar todos os pacotes do dia? Essa ação não pode ser desfeita.')){packages=[];save()}});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
