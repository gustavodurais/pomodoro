// preload.js
// Roda em um contexto isolado, com acesso ao Node, mas NAO expoe o Node
// diretamente para a pagina (renderer). Em vez disso, expomos apenas
// as funcoes especificas que o app realmente precisa, via contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Configuracoes persistidas em disco (arquivo JSON local)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:set', settings),

  // Notificacao nativa do Windows, disparada pelo processo principal
  notify: (title, body) => ipcRenderer.send('notify', { title, body })
});
