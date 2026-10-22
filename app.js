
const KEY = 'scanner-entregas-v1';

let packages = JSON.parse(localStorage.getItem(KEY) || '[]');
let stream = null;
let detector = null;
let scanning = false;
let ocrWorker = null;
let ocrEmAndamento = false;
let ultimaTentativaOCR = 0;
let ultimoCodigoLido = '';

const $ = id => document.getElementById(id);

function save() {
  localStorage.setItem(KEY, JSON.stringify(packages));
  render();
}

function norm(s) {
  return (s || '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function grouped() {
  const m = new Map();

  for (const p of packages) {
    const k = norm(p.address);
    if (!k) continue;

    if (!m.has(k)) {
      m.set(k, {
        address: p.address,
        count: 0,
        codes: [],
        manualNumbers: [],
        items: []
      });
    }

    const g = m.get(k);
    g.count++;

    if (p.code) g.codes.push(p.code);
    if (p.handNo) g.manualNumbers.push(p.handNo);
    g.items.push(p);
  }

  return [...m.values()];
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function render() {
  $('total').textContent = packages.length;
  $('stops').textContent = grouped().length;
  $('review').textContent =
    packages.filter(p => p.review).length;

  const q = norm($('search').value);
  const list = $('list');
  list.innerHTML = '';

  const shown = packages
    .filter(p => !q || norm(
      [p.address, p.code, p.handNo].join(' ')
    ).includes(q))
    .slice()
    .reverse();

  if (!shown.length) {
    list.innerHTML =
      '<div class="empty">Nenhum pacote cadastrado ainda.</div>';
    return;
  }

  for (const p of shown) {
    const d = document.createElement('div');
    d.className = 'item';

    d.innerHTML = `
      <strong>${esc(p.address || 'Endereço pendente')}</strong>
      <small>
        Código: ${esc(p.code || 'não lido')}
        · Número à caneta: ${esc(p.handNo || '—')}
      </small>
      ${p.review
        ? '<span class="pill">Conferir endereço</span>'
        : ''}
      <div>
        <button class="secondary" data-edit="${p.id}">Editar</button>
        <button class="danger" data-del="${p.id}">Excluir</button>
      </div>
    `;

    list.appendChild(d);
  }
}

$('packageForm').addEventListener('submit', e => {
  e.preventDefault();

  const address = $('address').value.trim();
  const code = $('code').value.trim();
  const handNo = $('handNo').value.trim();

  if (!address) {
    alert('Confira e preencha o endereço antes de salvar.');
    $('address').focus();
    return;
  }

  if (code && packages.some(p => p.code === code)) {
    if (!confirm('Este código já existe. Salvar mesmo assim?')) {
      return;
    }
  }

  packages.push({
    id: Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7),
    code,
    address,
    handNo,
    review: address.length < 12,
    created: new Date().toISOString()
  });

  save();
  $('packageForm').reset();
  $('code').focus();
});

$('clearForm').onclick = () => {
  $('packageForm').reset();
};

$('search').oninput = render;

$('list').onclick = e => {
  const id = e.target.dataset.edit || e.target.dataset.del;
  if (!id) return;

  const p = packages.find(x => x.id === id);
  if (!p) return;

  if (e.target.dataset.del) {
    if (confirm('Excluir este pacote?')) {
      packages = packages.filter(x => x.id !== id);
      save();
    }
    return;
  }

  const a = prompt('Corrigir endereço:', p.address || '');
  if (a === null) return;

  const c = prompt('Código do pacote:', p.code || '');
  if (c === null) return;

  const n = prompt('Numeração escrita à caneta:', p.handNo || '');
  if (n === null) return;

  p.address = a.trim();
  p.code = c.trim();
  p.handNo = n.trim();
  p.review = p.address.length < 12;

  save();
};

function download(name, content, type) {
  const blob = new Blob(['\ufeff' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csv(rows) {
  return rows.map(r =>
    r.map(v =>
      '"' + String(v ?? '').replace(/"/g, '""') + '"'
    ).join(',')
  ).join('\r\n');
}

$('exportCSV').onclick = () => {
  if (!packages.length) {
    alert('Adicione pacotes antes de exportar.');
    return;
  }

  download(
    'pacotes_' + new Date().toISOString().slice(0, 10) + '.csv',
    csv([
      ['Address', 'PackageCode', 'ManualNumber'],
      ...packages.map(p => [p.address, p.code, p.handNo])
    ]),
    'text/csv;charset=utf-8'
  );
};

$('exportGrouped').onclick = () => {
  const g = grouped();

  if (!g.length) {
    alert('Adicione pacotes com endereço antes de exportar.');
    return;
  }

  download(
    'enderecos_agrupados_' +
      new Date().toISOString().slice(0, 10) + '.csv',
    csv([
      ['Address', 'PackageCount', 'PackageCodes', 'ManualNumbers'],
      ...g.map(x => [
        x.address,
        x.count,
        x.codes.join(' | '),
        x.manualNumbers.join(' | ')
      ])
    ]),
    'text/csv;charset=utf-8'
  );
};

$('exportJSON').onclick = () => {
  download(
    'backup_entregas_' +
      new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      packages
    }, null, 2),
    'application/json'
  );
};

$('clearDay').onclick = () => {
  if (confirm('Apagar todos os pacotes deste dia? Faça um backup antes.')) {
    packages = [];
    save();
  }
};

// OCR E CÂMERA

async function prepararOCR() {
  if (ocrWorker) return ocrWorker;

  if (!window.Tesseract) {
    throw new Error('Biblioteca OCR não carregada.');
  }

  ocrWorker = await Tesseract.createWorker('por', 1, {
    workerPath:
      'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    langPath:
      'https://tessdata.projectnaptha.com/4.0.0',
    corePath:
      'https://cdn.jsdelivr.net/npm/tesseract.js-core@5'
  });

  return ocrWorker;
}

function melhorarImagem(video, contraste) {
  const escala = 2;
  const canvas = document.createElement('canvas');

  canvas.width = video.videoWidth * escala;
  canvas.height = video.videoHeight * escala;

  const ctx = canvas.getContext('2d', {
    willReadFrequently: true
  });

  if (!ctx) {
    throw new Error('Não foi possível preparar a imagem.');
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(
    0, 0, canvas.width, canvas.height
  );
  const px = img.data;

  for (let i = 0; i < px.length; i += 4) {
    const gray =
      0.299 * px[i] +
      0.587 * px[i + 1] +
      0.114 * px[i + 2];

    const adjusted = Math.max(
      0,
      Math.min(255, (gray - 128) * contraste + 128)
    );

    px[i] = adjusted;
    px[i + 1] = adjusted;
    px[i + 2] = adjusted;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

async function reconhecerTextoDaEtiqueta() {
  const video = $('video');

  if (!video || !video.videoWidth || !video.videoHeight) {
    return '';
  }

  const worker = await prepararOCR();

  const imagem1 = melhorarImagem(video, 1.25);
  const resultado1 = await worker.recognize(imagem1);
  const texto1 = (resultado1.data.text || '').trim();

  if (texto1.length >= 35) return texto1;

  const imagem2 = melhorarImagem(video, 1.65);
  const resultado2 = await worker.recognize(imagem2);
  const texto2 = (resultado2.data.text || '').trim();

  return texto2.length > texto1.length ? texto2 : texto1;
}

function encontrarEndereco(texto) {
  const linhas = texto
    .split(/\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length >= 5);

  const padraoRua =
    /\b(rua|r\.|avenida|av\.|travessa|estrada|rodovia|alameda|servid[aã]o|praça|praca|logradouro)\b/i;

  const indice = linhas.findIndex(l => padraoRua.test(l));

  if (indice < 0) return '';

  const partes = [linhas[indice]];

  if (
    linhas[indice + 1] &&
    linhas[indice + 1].length <= 55 &&
    !padraoRua.test(linhas[indice + 1])
  ) {
    partes.push(linhas[indice + 1]);
  }

  return partes.join(', ').slice(0, 180);
}

$('startCam').onclick = async () => {
  try {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      $('scanStatus').textContent =
        'Câmera indisponível. Abra o aplicativo pelo HTTPS.';
      return;
    }

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    detector = null;

    if ('BarcodeDetector' in window) {
      try {
        detector = new BarcodeDetector();
      } catch (e) {
        detector = null;
      }
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });

    $('video').srcObject = stream;
    $('video').style.display = 'block';
    await $('video').play();

    scanning = true;
    ocrEmAndamento = false;
    ultimaTentativaOCR = 0;
    ultimoCodigoLido = '';

    $('scanStatus').textContent =
      'Câmera aberta. Aponte para a etiqueta.';

    scanLoop();
  } catch (err) {
    $('scanStatus').textContent =
      'Erro ao abrir câmera: ' + (err.message || String(err));
  }
};

async function scanLoop() {
  if (!scanning) return;

  if (detector) {
    try {
      const codes = await detector.detect($('video'));

      if (codes.length && codes[0].rawValue !== ultimoCodigoLido) {
        ultimoCodigoLido = codes[0].rawValue;
        $('code').value = ultimoCodigoLido;
      }
    } catch (e) {
      // Falha no leitor não interrompe o OCR.
    }
  }

  const agora = Date.now();

  if (
    agora - ultimaTentativaOCR >= 5000 &&
    !ocrEmAndamento
  ) {
    ultimaTentativaOCR = agora;
    ocrEmAndamento = true;

    $('scanStatus').textContent =
      'Lendo a etiqueta. Mantenha o texto focado...';

    reconhecerTextoDaEtiqueta()
      .then(texto => {
        if (!scanning) return;

        if (!texto) {
          $('scanStatus').textContent =
            'OCR não encontrou texto. Tente melhorar a iluminação.';
          return;
        }

        const endereco = encontrarEndereco(texto);

        if (endereco && !$('address').value.trim()) {
          $('address').value = endereco;
        }

        $('scanStatus').textContent = endereco
          ? 'Possível endereço: ' + endereco +
            '. Confira antes de salvar. Texto OCR: ' +
            texto.slice(0, 220)
          : 'Endereço não identificado. Texto OCR: ' +
            texto.slice(0, 300);
      })
      .catch(err => {
        $('scanStatus').textContent =
          'Erro no OCR: ' + (err.message || String(err));
      })
      .finally(() => {
        ocrEmAndamento = false;
      });
  }

  if (scanning) requestAnimationFrame(scanLoop);
}

$('stopCam').onclick = () => {
  scanning = false;

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  stream = null;
  detector = null;
  $('video').srcObject = null;
  $('video').style.display = 'none';
  $('scanStatus').textContent = 'Câmera desligada.';
};

if (
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http')
) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
