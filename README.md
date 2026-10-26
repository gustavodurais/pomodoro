# Pomodoro (Electron)

Timer Pomodoro simples, local e confiável. Sem internet, sem servidor, sem
banco de dados, sem frameworks — apenas Electron + HTML + CSS + JavaScript puro.

## 1. Estrutura dos arquivos

```
pomodoro/
├── package.json      -> dependências e scripts (start / build)
├── main.js           -> processo principal do Electron (janela, arquivo de
│                         configurações, notificação nativa do Windows)
├── preload.js        -> ponte segura entre main.js e a interface (contextBridge)
├── index.html        -> estrutura da interface
├── style.css         -> visual (minimalista, timer grande e centralizado)
├── renderer.js       -> toda a lógica do Pomodoro (timer, fases, ciclos)
├── sounds/
│   └── alarm.mp3     -> som de alerta tocado ao fim de cada fase (Metal Slug)
├── LICENSE           -> licença MIT
└── README.md
```

Nenhuma dependência de runtime é usada além do próprio Electron. As únicas
"dependências" do projeto são de desenvolvimento/empacotamento:

- **electron** — necessário para rodar o app.
- **electron-builder** — necessário só para gerar o `.exe` (empacotamento).

## 2. Como instalar as dependências

Você precisa ter o [Node.js](https://nodejs.org) instalado (versão LTS).
Dentro da pasta do projeto:

```bash
npm install
```

## 3. Como executar em modo desenvolvimento

```bash
npm start
```

Isso abre a janela do Electron já com o Pomodoro rodando (padrão: 25 min
trabalho / 5 min descanso, mas os últimos valores salvos são carregados
automaticamente).

## 4. Como gerar o `.exe` para Windows

```bash
npm run build
```

O instalador (`.exe`, gerado com NSIS) aparecerá na pasta `dist/`. Rode esse
comando no **Windows**. Na primeira vez é necessário ter acesso à internet, para
o `electron-builder` baixar os componentes de empacotamento.

Se preferir, também pode gerar uma versão "portátil" (uma pasta com o `.exe`
sem instalador) trocando o target no `package.json`:

```json
"win": {
  "target": "portable"
}
```

## 5. Como alterar o som de alerta

O app toca o arquivo `sounds/alarm.mp3`. Para usar outro som:

1. Coloque seu arquivo de áudio dentro da pasta `sounds/` (aceita `.mp3`,
   `.wav`, `.ogg` — qualquer formato que o Chromium consiga tocar).
2. Abra `index.html` e altere a linha:

   ```html
   <audio id="alarmSound" src="sounds/alarm.mp3" preload="auto"></audio>
   ```

   trocando `sounds/alarm.mp3` pelo nome do novo arquivo, por exemplo
   `sounds/meu-som.mp3`.

Não é necessário mexer em nenhum outro arquivo.

## 6. Como alterar os valores padrão do Pomodoro

Existem duas formas:

**A. Pelo próprio app (recomendado):**
Clique no ícone de engrenagem (⚙) no topo da janela, ajuste "Tempo de
trabalho" e "Tempo de descanso" (em minutos) e clique em "Salvar". Esses
valores ficam salvos em um arquivo local
(`%APPDATA%/pomodoro-app/settings.json` no Windows) e continuam valendo da
próxima vez que você abrir o app.

**B. Alterando o valor padrão de fábrica (antes de instalar):**
Abra `main.js` e edite:

```js
const DEFAULT_SETTINGS = {
  workMinutes: 25,
  restMinutes: 5
};
```

Esses são os valores usados apenas na primeiríssima execução do app (antes de
existir um `settings.json` salvo).

## 7. Como o app se comporta

- **Ciclo contínuo:** ao fim de cada fase o app toca o alarme, mostra a
  notificação e já inicia a fase seguinte sozinho, sem precisar clicar em nada.
- **Contador de ciclos:** começa em "Ciclo 1" e sobe de 1 sempre que um
  descanso termina e o trabalho recomeça. Não existe pausa longa: é sempre
  trabalho → descanso → trabalho → ...
- **Pausar / Iniciar:** "Pausar" congela o tempo restante e "Iniciar" retoma
  de onde parou.
- **Reiniciar fase:** para o timer e volta a fase atual (trabalho ou descanso)
  para a duração completa, mantendo o número do ciclo. É o botão para
  recomeçar um descanso.
- **Reiniciar ciclo:** para o timer e volta ao início do ciclo atual: fase de
  trabalho com a duração completa, mantendo o número do ciclo. Os ciclos
  anteriores não são afetados.
- **Zerar tudo:** para o timer e volta ao Ciclo 1, na fase de trabalho. As
  configurações salvas não são alteradas.
- **Editar o tempo na tela:** clique no relógio, digite o novo tempo e tecle
  Enter (Esc cancela). Aceita `MM:SS` (ex.: `10:30`) ou só minutos (ex.: `15`),
  de 1 segundo até 24 h. Altera apenas o tempo restante da fase atual: se o
  timer estava rodando, ele continua rodando a partir do novo valor. As
  durações das configurações não mudam.
- **Terminar às:** informe um horário de hoje (HH:MM) e clique em "Definir e
  iniciar". A fase atual passa a terminar nesse horário e a contagem começa (ou
  segue, se já estava rodando). Horários que já passaram são recusados. Vale só
  para a fase atual: as fases seguintes usam as durações das configurações.
  Enquanto o timer roda, o app mostra "Termina às HH:MM" abaixo do tempo.
- **Limites das configurações:** trabalho de 1 a 180 minutos e descanso de 1 a
  60 minutos. Valores fora do intervalo são ajustados para o limite mais
  próximo, e um campo vazio volta para 25 (trabalho) ou 5 (descanso).
- **Alterar as configurações com o timer em uso:**
  - Rodando: a fase atual termina no horário já calculado e a nova duração
    vale a partir da próxima fase.
  - Parado ou pausado: a fase atual é reiniciada já com a nova duração (o tempo
    que havia sido contado nela é perdido).

## Observações técnicas

- **Precisão do timer:** o app não conta o tempo "decrementando" um contador
  a cada segundo. Em vez disso, ao iniciar/retomar uma fase, ele calcula o
  horário exato (timestamp) em que ela deve terminar
  (`Date.now() + duração`). A cada 250ms ele apenas recalcula a diferença
  entre "agora" e esse horário. Isso evita que pequenos atrasos do
  `setInterval` (comuns quando a janela está minimizada ou o sistema está
  ocupado) acumulem erro ao longo do tempo.
- **Funciona minimizado:** a janela é criada com `backgroundThrottling: false`,
  o que impede o Chromium de "desacelerar" o JavaScript quando a janela não
  está em primeiro plano — importante para o timer continuar preciso.
- **Segurança:** a janela roda com `contextIsolation: true` e
  `nodeIntegration: false`. O `preload.js` expõe apenas três funções bem
  específicas (`getSettings`, `saveSettings`, `notify`) através do
  `contextBridge` — a interface (renderer) nunca tem acesso direto ao Node
  ou ao sistema de arquivos.
- **Persistência:** as configurações são salvas em um arquivo JSON simples
  na pasta de dados do usuário do Windows, sem nenhum banco de dados.
- **Notificação nativa:** é disparada pelo processo principal do Electron
  (`main.js`) via API `Notification` do próprio Electron, que usa o sistema
  de notificações nativo do Windows.
