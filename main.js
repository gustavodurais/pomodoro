
// main.js
// Processo principal do Electron.
// Responsável por criar a janela, ler e gravar as configurações em disco
// (arquivo JSON simples, sem banco de dados) e disparar notificações nativas.

const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// Define o caminho do arquivo de configurações.
// Ele fica na pasta de dados do usuário (ex.: %APPDATA%/pomodoro-app no Windows),
// permitindo que as configurações persistam entre execuções do aplicativo.
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Valores padrão utilizados quando as configurações não estão disponíveis
// ou quando os valores salvos não podem ser convertidos em números válidos.
const DEFAULT_SETTINGS = {
  workMinutes: 25,
  restMinutes: 5
};

// Lê as configurações salvas no arquivo JSON.
function readSettings() {
  try {
    // Lê o conteúdo do arquivo como texto.
    const raw = fs.readFileSync(settingsPath, 'utf-8');

    // Converte o texto JSON em um objeto JavaScript.
    const parsed = JSON.parse(raw);

    // Retorna os tempos convertidos em números.
    // Se um valor for inválido ou zero, utiliza o valor padrão correspondente.
    return {
      workMinutes: Number(parsed.workMinutes) || DEFAULT_SETTINGS.workMinutes,
      restMinutes: Number(parsed.restMinutes) || DEFAULT_SETTINGS.restMinutes
    };
  } catch (err) {
    // Se o arquivo não existir, não puder ser lido ou contiver JSON inválido,
    // retorna uma cópia das configurações padrão.
    return { ...DEFAULT_SETTINGS };
  }
}

// Salva as configurações recebidas no arquivo JSON.
function writeSettings(settings) {
  // Garante que os valores sejam convertidos em números
  // e utiliza os padrões quando os valores forem inválidos ou zero.
  const toSave = {
    workMinutes: Number(settings.workMinutes) || DEFAULT_SETTINGS.workMinutes,
    restMinutes: Number(settings.restMinutes) || DEFAULT_SETTINGS.restMinutes
  };

  // Serializa o objeto como JSON formatado e grava no disco.
  fs.writeFileSync(settingsPath, JSON.stringify(toSave, null, 2), 'utf-8');

  // Retorna as configurações efetivamente salvas.
  return toSave;
}

// Referência à janela principal do aplicativo.
let mainWindow = null;

// Cria e configura a janela principal do Pomodoro.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420, // Largura inicial da janela
    height: 620, // Altura inicial da janela
    minWidth: 360, // Largura mínima permitida
    minHeight: 520, // Altura mínima permitida
    title: 'Pomodoro',
    backgroundColor: '#1e1f29', // Cor de fundo durante o carregamento
    webPreferences: {
      // Define o script de preload, que conecta a interface às APIs permitidas.
      preload: path.join(__dirname, 'preload.js'),

      // Isola o contexto JavaScript da página do contexto do Electron.
      contextIsolation: true,

      // Impede que a página acesse diretamente as APIs Node.js.
      nodeIntegration: false,

      // Executa o conteúdo da página em um ambiente isolado.
      sandbox: true,

      // Desativa a redução de frequência dos temporizadores em segundo plano.
      // Isso ajuda a manter o comportamento do timer quando a janela está minimizada
      // ou sem foco, embora a precisão também dependa da lógica do renderer.js.
      backgroundThrottling: false
    }
  });

  // Oculta a barra de menus da janela.
  mainWindow.setMenuBarVisibility(false);

  // Carrega o arquivo HTML que contém a interface da aplicação.
  mainWindow.loadFile('index.html');

  // Descomente a linha abaixo durante o desenvolvimento para abrir o DevTools.
  // mainWindow.webContents.openDevTools();
}

// Aguarda a inicialização do Electron antes de criar a janela.
app.whenReady().then(() => {
  createWindow();

  // No macOS, recria a janela quando o usuário ativa o aplicativo
  // e não existe nenhuma janela aberta.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Define o comportamento quando todas as janelas forem fechadas.
app.on('window-all-closed', () => {
  // Mantém o comportamento convencional do macOS,
  // onde o aplicativo pode continuar ativo sem janelas abertas.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==================================================
// IPC: CONFIGURAÇÕES
// Comunicação entre a interface e o processo principal.
// ==================================================

// Atende às solicitações da interface para obter as configurações salvas.
ipcMain.handle('settings:get', () => {
  return readSettings();
});

// Recebe novas configurações da interface e salva os valores no arquivo JSON.
ipcMain.handle('settings:set', (_event, newSettings) => {
  return writeSettings(newSettings);
});

// ==================================================
// IPC: NOTIFICAÇÕES NATIVAS
// Recebe pedidos da interface para exibir notificações do sistema.
// ==================================================

ipcMain.on('notify', (_event, { title, body }) => {
  // Verifica se o sistema oferece suporte a notificações nativas.
  if (Notification.isSupported()) {
    const notification = new Notification({
      // Utiliza um título padrão caso nenhum título seja informado.
      title: title || 'Pomodoro',

      // Utiliza um texto vazio caso o corpo da notificação não seja informado.
      body: body || '',

      // Desativa o som da notificação, pois o aplicativo reproduz
      // o áudio do alarme separadamente.
      silent: true
    });

    // Exibe a notificação nativa do sistema operacional.
    notification.show();
  }
});
