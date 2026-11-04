import { join } from 'node:path'
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { GerenciadorBanco } from './db/gerenciador'
import { registrarIpc } from './ipc'

// Usado apenas pelos testes automatizados, para não tocar nos dados reais.
const pastaDeTeste = process.env['AUX_CARTEIRA_PASTA_DADOS']
if (pastaDeTeste) app.setPath('userData', pastaDeTeste)

// Faz os campos de data do Chromium seguirem o padrão brasileiro.
app.commandLine.appendSwitch('lang', 'pt-BR')

let janela: BrowserWindow | null = null
let banco: GerenciadorBanco | null = null

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1180,
    minHeight: 640,
    title: 'Auxiliar de Carteira',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  janela.once('ready-to-show', () => janela?.show())
  janela.on('closed', () => (janela = null))

  // A interface é local: não abre janelas nem navega para outros endereços.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (evento) => evento.preventDefault())

  const urlDev = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && urlDev) void janela.loadURL(urlDev)
  else void janela.loadFile(join(__dirname, '../renderer/index.html'))
}

function iniciar(): void {
  Menu.setApplicationMenu(null)
  try {
    banco = new GerenciadorBanco(join(app.getPath('userData'), 'carteira.sqlite'))
  } catch (erro) {
    console.error(erro)
    dialog.showErrorBox(
      'Não foi possível abrir seus dados',
      erro instanceof Error ? erro.message : 'Erro desconhecido ao abrir o banco de dados.'
    )
    app.quit()
    return
  }
  registrarIpc(banco)
  criarJanela()
}

// Uma só instância: duas janelas não devem gravar no mesmo banco.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (janela?.isMinimized()) janela.restore()
    janela?.focus()
  })
  void app.whenReady().then(iniciar)
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => banco?.fechar())
}
