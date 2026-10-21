
const KEY='scanner-entregas-v1';
let packages=JSON.parse(localStorage.getItem(KEY)||'[]'), stream=null, detector=null, scanning=false;
const $=id=>document.getElementById(id);

function save(){localStorage.setItem(KEY,JSON.stringify(packages));render()}
function norm(s){return (s||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()}
function grouped(){const m=new Map();for(const p of packages){const k=norm(p.address);if(!m.has(k))m.set(k,{address:p.address,count:0,codes:[],items:[]});const g=m.get(k);g.count++;if(p.code)g.codes.push(p.code);g.items.push(p)}return [...m.values()]}

function render(){
  $('total').textContent=packages.length;
  $('stops').textContent=grouped().length;
  $('review').textContent=packages.filter(p=>p.review).length;
  const q=norm($('search').value),list=$('list');
  list.innerHTML='';
  const shown=packages.filter(p=>!q||norm(p.address+' '+p.code+' '+p.handNo).includes(q)).slice().reverse();
  if(!shown.length){list.innerHTML='<div class="empty">Nenhum pacote cadastrado ainda.</div>';return}
  for(const p of shown){
    const d=document.createElement('div');
    d.className='item';
    d.innerHTML=`<strong>${esc(p.address)}</strong><small>Pacote ${esc(p.code||'sem código')} · Numeração manual: ${esc(p.handNo||'—')}</small>${p.review?'<span class="pill">Conferir endereço</span>':''}<div><button class="secondary" data-edit="${p.id}">Editar</button><button class="danger" data-del="${p.id}">Excluir</button></div>`;
    list.appendChild(d);
  }
}

function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

$('packageForm').addEventListener('submit',e=>{
  e.preventDefault();
  const address=$('address').value.trim();
  if(!address)return;
  const code=$('code').value.trim();
  const duplicate=code&&packages.some(p=>p.code===code);
  if(duplicate&&!confirm('Este código já existe. Salvar mesmo assim?'))return;
  packages.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),code,address,handNo:$('handNo').value.trim(),review:address.length<12,created:new Date().toISOString()});
  save();
  $('packageForm').reset();
  $('code').focus();
});

$('clearForm').onclick=()=> $('packageForm').reset();
$('search').oninput=render;

$('list').onclick=e=>{
  const id=e.target.dataset.edit||e.target.dataset.del;
  if(!id)return;
  const p=packages.find(x=>x.id===id);
  if(e.target.dataset.del){
    if(confirm('Excluir este pacote?')){packages=packages.filter(x=>x.id!==id);save()}
    return;
  }
  const a=prompt('Corrigir endereço:',p.address);
  if(a===null)return;
  const c=prompt('Código do pacote:',p.code||'');
  if(c===null)return;
  const n=prompt('Numeração escrita à caneta:',p.handNo||'');
  if(n===null)return;
  p.address=a.trim();p.code=c.trim();p.handNo=n.trim();p.review=p.address.length<12;
  save();
};

function download(name,content,type){
  const blob=new Blob(['\ufeff'+content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function csv(rows){return rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')}

$('exportCSV').onclick=()=>{
  if(!packages.length)return alert('Adicione pacotes antes de exportar.');
  download('pacotes_'+new Date().toISOString().slice(0,10)+'.csv',csv([['Address','PackageCode','ManualNumber'],...packages.map(p=>[p.address,p.code,p.handNo])]),'text/csv;charset=utf-8');
};

$('exportGrouped').onclick=()=>{
  const g=grouped();
  if(!g.length)return alert('Adicione pacotes antes de exportar.');
  download('enderecos_agrupados_'+new Date().toISOString().slice(0,10)+'.csv',csv([['Address','PackageCount','PackageCodes'],...g.map(x=>[x.address,x.count,x.codes.join(' | ')])]),'text/csv;charset=utf-8');
};

$('exportJSON').onclick=()=>download('backup_entregas_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({exportedAt:new Date().toISOString(),packages},null,2),'application/json');

$('clearDay').onclick=()=>{
  if(confirm('Apagar todos os pacotes deste dia? Faça um backup antes, se necessário.')){packages=[];save()}
};

let ultimaTentativaOCR=0;
let ocrEmAndamento=false;
let ultimoCodigoLido='';
let ocrFalhou=false;
let ocrWorker=null;

async function prepararOCR(){
  if(ocrWorker)return ocrWorker;
  if(!window.Tesseract)throw new Error('Biblioteca OCR não carregada.');
  ocrWorker=await Tesseract.createWorker('por',1,{
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    langPath:'https://tessdata.projectnaptha.com/4.0.0',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5'
  });
  return ocrWorker;
}

reconhecerTextoDaEtiqueta()
  .then(texto => {
    if (!texto) {
      $('scanStatus').textContent =
        'OCR não encontrou texto. Aproxime e foque a etiqueta.';
      return;
    }

    const linhas = texto
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => l.length >= 8);

    const candidato = linhas.find(l =>
      /\b(rua|avenida|av\.|travessa|estrada|rodovia|alameda|servid[aã]o|cep)\b/i.test(l)
      || /\b\d{5}-?\d{3}\b/.test(l)
    );

    if (candidato) {
      $('scanStatus').textContent =
        'Possível endereço: ' + candidato +
        '. Confira antes de preencher.';
    } else {
      $('scanStatus').textContent =
        'Texto lido, mas endereço não confirmado. Aproxime a etiqueta.';
    }
  })
  .catch(erro => {
    ocrFalhou = true;
    $('scanStatus').textContent =
      'Erro no OCR: ' + (erro.message || String(erro));
  })
  .finally(() => {
    ocrEmAndamento = false;
  });

  if(scanning)requestAnimationFrame(scanLoop);
}

$('stopCam').onclick=()=>{
  scanning=false;
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=null;
  $('video').style.display='none';
  $('scanStatus').textContent='Câmera desligada.';
};

if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
