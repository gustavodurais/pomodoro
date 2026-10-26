// renderer.js
/**
 * Camada de interface do aplicativo Pomodoro.
 *
 * Responsabilidades deste arquivo:
 * - Atualizar o relógio, a fase atual e o número do ciclo.
 * - Controlar início, pausa e reinício do timer.
 * - Alternar automaticamente entre trabalho e descanso.
 * - Permitir editar o tempo restante e definir um horário de término.
 * - Carregar e salvar as durações configuradas pelo usuário.
 *
 * Este arquivo roda no processo de renderização do Electron. Não acessa APIs
 * do Node.js diretamente; a comunicação com o processo principal é feita por
 * window.electronAPI, disponibilizado pelo preload.js.
 *
 * Observação: a lógica do timer usa um timestamp de término, em vez de depender
 * de uma contagem regressiva decrementada a cada intervalo. Assim, atrasos no
 * setInterval não se acumulam como erro no tempo exibido.
 */

(() => {
  'use strict';

  // ---------- Elementos da interface ----------
  // Referências aos elementos do HTML usados para exibir o timer e seu estado.
  const timeDisplay = document.getElementById('timeDisplay');
  const phaseLabel = document.getElementById('phaseLabel');
  const nextPhaseLabel = document.getElementById('nextPhaseLabel');
  const cycleLabel = document.getElementById('cycleLabel');

  // Botões de controle do ciclo Pomodoro.
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartPhaseBtn = document.getElementById('restartPhaseBtn');
  const restartCycleBtn = document.getElementById('restartCycleBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');

  // Campos usados para editar o tempo restante ou definir um horário final.
  const timeEditInput = document.getElementById('timeEditInput');
  const endTimeInput = document.getElementById('endTimeInput');
  const setEndTimeBtn = document.getElementById('setEndTimeBtn');
  const endInfo = document.getElementById('endInfo');

  // Elementos do painel de configurações das durações de trabalho e descanso.
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const workInput = document.getElementById('workInput');
  const restInput = document.getElementById('restInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');

  // Elemento de áudio reproduzido ao fim de cada fase.
  const alarmSound = document.getElementById('alarmSound');

  // ---------- Estado ----------
  // Durações das fases, armazenadas em segundos.
  let workSeconds = 25 * 60;
  let restSeconds = 5 * 60;

  // Fase atual ('work' = trabalho; 'rest' = descanso) e ciclo em andamento.
  let phase = 'work';        // 'work' | 'rest'
  let cycle = 1;

  // remainingSeconds é usado como referência quando o timer está pausado/parado.
  // endTimestamp guarda o instante exato em que a fase atual deve terminar.
  let remainingSeconds = workSeconds; // usado apenas quando pausado/parado
  let endTimestamp = null;            // Date.now() (ms) em que a fase termina
  let running = false;
  let tickIntervalId = null;
  let editingTime = false;            // true enquanto o campo de edição do relógio está aberto

  // ---------- Utilidades ----------

  /**
   * Formata uma quantidade de segundos como MM:SS.
   * O valor é arredondado e impedido de ficar abaixo de zero.
   *
   * @param {number} totalSeconds - Tempo a ser exibido, em segundos.
   * @returns {string} Tempo formatado, por exemplo "25:00".
   */
  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  /**
   * Converte um timestamp em milissegundos para o horário local HH:MM.
   *
   * @param {number} timestampMs - Timestamp em milissegundos.
   * @returns {string} Horário formatado, por exemplo "14:30".
   */
  function formatClock(timestampMs) {
    const d = new Date(timestampMs);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /**
   * Atualiza a mensagem abaixo do timer e indica visualmente quando há erro.
   *
   * @param {string} message - Mensagem a ser exibida.
   * @param {boolean} [isError=false] - Se true, aplica a classe visual de erro.
   */
  function showEndInfo(message, isError = false) {
    endInfo.textContent = message;
    endInfo.classList.toggle('error', isError);
  }

  /**
   * Exibe o horário previsto para o término enquanto o timer está rodando.
   * Quando o timer está parado ou pausado, limpa essa informação.
   */
  function refreshEndInfo() {
    if (running && endTimestamp !== null) {
      showEndInfo(`Termina às ${formatClock(endTimestamp)}`);
    } else {
      showEndInfo('');
    }
  }

  /**
   * Retorna a duração configurada para a fase atual.
   *
   * @returns {number} Duração da fase atual, em segundos.
   */
  function currentPhaseDurationSeconds() {
    return phase === 'work' ? workSeconds : restSeconds;
  }

  /**
   * Atualiza todos os textos da interface relacionados ao tempo e à fase.
   * Também atualiza o título da janela, permitindo acompanhar o timer pela barra.
   *
   * @param {number} secondsToShow - Quantidade de segundos a ser exibida.
   */
  function updateDisplay(secondsToShow) {
    timeDisplay.textContent = formatTime(secondsToShow);

    const isWork = phase === 'work';
    phaseLabel.textContent = isWork ? 'TRABALHO' : 'DESCANSO';
    phaseLabel.classList.toggle('rest', !isWork);
    nextPhaseLabel.textContent = isWork ? 'Próximo: Descanso' : 'Próximo: Trabalho';
    cycleLabel.textContent = `Ciclo ${cycle}`;

    document.title = `${formatTime(secondsToShow)} · ${isWork ? 'Trabalho' : 'Descanso'} - Pomodoro`;
  }

  /**
   * Habilita ou desabilita os controles de início e pausa de acordo com o estado.
   */
  function updateButtons() {
    startBtn.disabled = running;
    pauseBtn.disabled = !running;
  }

  // ---------- Motor do timer ----------
  // O timer se baseia em timestamps, e não em uma contagem regressiva ingênua.
  // A cada tick (a cada 250 ms), calcula-se a diferença entre o horário atual
  // e o horário de término. Isso evita o acúmulo de erro caso o setInterval atrase.

  /**
   * Executa uma atualização do timer.
   * Se o prazo da fase terminou, troca para a próxima; caso contrário, atualiza
   * o tempo restante mostrado na interface.
   */
  function tick() {
    if (!running || endTimestamp === null) return;

    const msLeft = endTimestamp - Date.now();

    if (msLeft <= 0) {
      switchPhase();
      return;
    }

    updateDisplay(msLeft / 1000);
  }

  /**
   * Inicia o intervalo responsável por atualizar o timer.
   * Evita criar intervalos duplicados caso já exista um ativo.
   */
  function startTicking() {
    if (tickIntervalId !== null) return;
    tickIntervalId = setInterval(tick, 250);
  }

  /**
   * Encerra o intervalo de atualização, se houver um ativo.
   */
  function stopTicking() {
    if (tickIntervalId !== null) {
      clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
  }

  /**
   * Finaliza a fase atual e inicia automaticamente a próxima.
   * Ao concluir trabalho, inicia descanso; ao concluir descanso, inicia
   * trabalho e incrementa o número do ciclo.
   */
  function switchPhase() {
    // Guarda a fase que terminou para enviar a notificação correspondente.
    const finishedPhase = phase;

    closeTimeEdit(false);
    playAlarmAndNotify(finishedPhase);

    if (finishedPhase === 'work') {
      phase = 'rest';
      remainingSeconds = restSeconds;
    } else {
      phase = 'work';
      cycle += 1;
      remainingSeconds = workSeconds;
    }

    endTimestamp = Date.now() + remainingSeconds * 1000;
    updateDisplay(remainingSeconds);
    refreshEndInfo();
    // O ciclo continua automaticamente: o intervalo de tick já está rodando.
  }

  /**
   * Reproduz o alarme e envia uma notificação do sistema indicando qual fase
   * terminou. Falhas na reprodução do áudio não devem interromper o timer.
   *
   * @param {'work'|'rest'} finishedPhase - Fase que acabou de terminar.
   */
  function playAlarmAndNotify(finishedPhase) {
    try {
      alarmSound.currentTime = 0;
      alarmSound.play().catch(() => {
        // Reprodução pode falhar silenciosamente em alguns contextos;
        // isso não deve travar o app.
      });
    } catch (err) {
      // Ignora erros de áudio.
    }

    const title = finishedPhase === 'work'
      ? 'Tempo de trabalho concluído!'
      : 'Descanso concluído!';
    const body = finishedPhase === 'work'
      ? 'Hora de descansar um pouco.'
      : 'Hora de voltar ao trabalho.';

    if (window.electronAPI && typeof window.electronAPI.notify === 'function') {
      window.electronAPI.notify(title, body);
    }
  }

  // ---------- Ações dos botões ----------

  /**
   * Inicia a fase atual a partir do tempo restante disponível.
   * Não faz nada se o timer já estiver rodando.
   */
  function start() {
    if (running) return;

    if (endTimestamp === null) {
      // Primeira vez iniciando esta fase (ou após reset).
      remainingSeconds = remainingSeconds > 0 ? remainingSeconds : currentPhaseDurationSeconds();
    }

    endTimestamp = Date.now() + remainingSeconds * 1000;
    running = true;
    startTicking();
    updateButtons();
    refreshEndInfo();
  }

  /**
   * Pausa o timer, preservando o tempo restante para uma retomada posterior.
   */
  function pause() {
    if (!running) return;

    const msLeft = endTimestamp - Date.now();
    remainingSeconds = Math.max(0, msLeft / 1000);
    running = false;
    endTimestamp = null;
    stopTicking();
    updateDisplay(remainingSeconds);
    updateButtons();
    refreshEndInfo();
  }

  /**
   * Para o timer e define a fase e o número de ciclo informados.
   * A fase selecionada volta à sua duração completa.
   *
   * @param {'work'|'rest'} newPhase - Fase que ficará selecionada.
   * @param {number} newCycle - Número do ciclo a exibir.
   */
  function stopAndSetPhase(newPhase, newCycle) {
    running = false;
    stopTicking();
    endTimestamp = null;
    phase = newPhase;
    cycle = newCycle;
    remainingSeconds = currentPhaseDurationSeconds();
    updateDisplay(remainingSeconds);
    updateButtons();
    refreshEndInfo();
  }

  /**
   * Reinicia a fase atual do começo, mantendo o número do ciclo.
   */
  function restartPhase() {
    stopAndSetPhase(phase, cycle);
  }

  /**
   * Volta ao início da fase de trabalho do ciclo atual.
   */
  function restartCycle() {
    stopAndSetPhase('work', cycle);
  }

  /**
   * Reinicia o Pomodoro desde o trabalho do ciclo 1.
   */
  function resetAll() {
    stopAndSetPhase('work', 1);
  }

  // ---------- Edição manual do tempo restante ----------

  /**
   * Interpreta um tempo digitado como MM:SS ou apenas minutos.
   *
   * Exemplos aceitos: "10:30", "5:00" e "15".
   * O tempo precisa ser maior que zero e não pode ultrapassar 24 horas.
   *
   * @param {string} text - Texto digitado pelo usuário.
   * @returns {number|null} Tempo convertido para segundos ou null se inválido.
   */
  function parseTimeInput(text) {
    const t = text.trim();
    let seconds;

    if (/^\d{1,4}:[0-5]?\d$/.test(t)) {
      const [mm, ss] = t.split(':').map(Number);
      seconds = mm * 60 + ss;
    } else if (/^\d{1,4}$/.test(t)) {
      seconds = Number(t) * 60;
    } else {
      return null;
    }

    return seconds >= 1 && seconds <= 24 * 60 * 60 ? seconds : null;
  }

  /**
   * Abre o campo de edição do relógio e seleciona o valor atual para substituição.
   * Se o campo já estiver aberto, não executa a ação novamente.
   */
  function openTimeEdit() {
    if (editingTime) return;
    editingTime = true;
    timeEditInput.value = timeDisplay.textContent;
    timeDisplay.hidden = true;
    timeEditInput.hidden = false;
    timeEditInput.focus();
    timeEditInput.select();
  }

  /**
   * Fecha o campo de edição do relógio.
   * Se apply for true, valida e aplica o tempo digitado; se o timer estiver
   * rodando, recalcula o timestamp de término para refletir o novo tempo.
   *
   * @param {boolean} apply - Define se o valor digitado deve ser aplicado.
   */
  function closeTimeEdit(apply) {
    if (!editingTime) return;
    editingTime = false;

    const text = timeEditInput.value;
    timeEditInput.hidden = true;
    timeDisplay.hidden = false;

    if (!apply) return;

    const seconds = parseTimeInput(text);
    if (seconds === null) {
      showEndInfo('Tempo inválido. Use MM:SS ou minutos.', true);
      return;
    }

    remainingSeconds = seconds;
    if (running) {
      endTimestamp = Date.now() + seconds * 1000;
    }
    updateDisplay(remainingSeconds);
    refreshEndInfo();
  }

  /**
   * Define o horário em que a fase atual deve terminar, usando HH:MM do dia atual.
   * A ação inicia o timer; as fases seguintes continuam usando as durações
   * definidas nas configurações.
   */
  function setEndTime() {
    const value = endTimeInput.value; // formato "HH:MM" ou ""
    if (!value) {
      showEndInfo('Escolha um horário.', true);
      return;
    }

    const [hh, mm] = value.split(':').map(Number);
    const target = new Date();
    target.setHours(hh, mm, 0, 0);

    const secondsLeft = Math.round((target.getTime() - Date.now()) / 1000);
    if (secondsLeft < 1) {
      showEndInfo('Esse horário já passou hoje.', true);
      return;
    }

    remainingSeconds = secondsLeft;
    endTimestamp = target.getTime();
    running = true;
    startTicking();
    updateDisplay(remainingSeconds);
    updateButtons();
    refreshEndInfo();
  }

  // ---------- Configurações ----------

  /**
   * Busca as configurações salvas no processo principal do Electron e aplica
   * as durações de trabalho e descanso à interface.
   */
  async function loadSettings() {
    const settings = await window.electronAPI.getSettings();
    workSeconds = settings.workMinutes * 60;
    restSeconds = settings.restMinutes * 60;
    remainingSeconds = currentPhaseDurationSeconds();
    updateDisplay(remainingSeconds);
  }

  /**
   * Abre o painel de configurações preenchendo os campos com as durações atuais.
   */
  function openSettings() {
    workInput.value = Math.round(workSeconds / 60);
    restInput.value = Math.round(restSeconds / 60);
    settingsOverlay.classList.add('visible');
  }

  /**
   * Fecha o painel de configurações.
   */
  function closeSettings() {
    settingsOverlay.classList.remove('visible');
  }

  /**
   * Valida e salva as durações configuradas pelo usuário.
   * Trabalho fica limitado a 1–180 minutos e descanso a 1–60 minutos.
   * Se o timer estiver parado, atualiza imediatamente a duração exibida.
   */
  async function saveSettings() {
    const workMinutes = Math.min(180, Math.max(1, parseInt(workInput.value, 10) || 25));
    const restMinutes = Math.min(60, Math.max(1, parseInt(restInput.value, 10) || 5));

    const saved = await window.electronAPI.saveSettings({ workMinutes, restMinutes });
    workSeconds = saved.workMinutes * 60;
    restSeconds = saved.restMinutes * 60;

    // Se o timer não estiver rodando, atualiza o valor exibido para
    // refletir a nova duração da fase atual imediatamente.
    if (!running) {
      remainingSeconds = currentPhaseDurationSeconds();
      updateDisplay(remainingSeconds);
    }

    closeSettings();
  }

  // ---------- Listeners ----------
  // Conecta os controles do HTML às funções que implementam cada ação.
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  restartPhaseBtn.addEventListener('click', restartPhase);
  restartCycleBtn.addEventListener('click', restartCycle);
  resetAllBtn.addEventListener('click', resetAll);

  // Clique no relógio permite editar o tempo; Enter confirma e Escape cancela.
  // Ao perder o foco, o campo tenta aplicar o valor digitado.
  timeDisplay.addEventListener('click', openTimeEdit);
  timeEditInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closeTimeEdit(true);
    else if (e.key === 'Escape') closeTimeEdit(false);
  });
  timeEditInput.addEventListener('blur', () => closeTimeEdit(true));

  // Permite definir o horário final pelo botão ou pressionando Enter no campo.
  setEndTimeBtn.addEventListener('click', setEndTime);
  endTimeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setEndTime();
  });

  // Controles para abrir, salvar ou cancelar as configurações.
  openSettingsBtn.addEventListener('click', openSettings);
  cancelSettingsBtn.addEventListener('click', closeSettings);
  saveSettingsBtn.addEventListener('click', saveSettings);

  // ---------- Inicialização ----------
  // Aguarda as configurações salvas antes de atualizar os controles da interface.
  (async function init() {
    await loadSettings();
    updateButtons();
  })();
})();