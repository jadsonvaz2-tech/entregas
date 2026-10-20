# Scanner de Entregas — protótipo PWA

Esta é uma primeira versão para testar no Android sem computador. Não é APK nativo.

## Recursos atuais
- Guarda os pacotes localmente no navegador usando localStorage.
- Contagem de pacotes e de endereços agrupados.
- Leitura de código de barras se o navegador oferecer `BarcodeDetector` e a página estiver em HTTPS.
- Cadastro manual/correção de endereço, código e numeração escrita à caneta.
- Exportação CSV de pacotes, CSV agrupado e backup JSON.
- Estrutura PWA com cache para uso offline depois da primeira abertura.

## Limitações importantes
- OCR automático do texto da etiqueta ainda não foi implementado.
- CSV usa cabeçalhos genéricos `Address`, `PackageCode`, `ManualNumber`; confirme o modelo atual de importação do Spoke antes de importar.
- XLSX ainda não está incluído.
- `localStorage` depende dos dados do navegador; exporte backup regularmente e não limpe os dados do site.
- Leitura da câmera requer HTTPS e permissão. Compatibilidade de `BarcodeDetector` varia por navegador.
- O service worker só é instalado quando servido em HTTPS ou localhost. Abrir o HTML diretamente como arquivo não ativa PWA/offline completo.

## Como usar pelo celular
1. Hospede os arquivos em um serviço HTTPS (por exemplo, um repositório de hospedagem estática).
2. Abra o endereço no Chrome Android e permita a câmera.
3. Use o menu do Chrome > **Adicionar à tela inicial**.
4. Abra o app, escaneie códigos quando suportado, digite/confira o endereço e salve.
5. Exporte CSV e confira o arquivo antes de importá-lo no Spoke.

Esta versão é um protótipo funcional inicial, não uma versão de produção. Teste com poucos pacotes antes de usar em uma rota real.
