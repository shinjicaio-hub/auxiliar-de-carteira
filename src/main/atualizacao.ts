import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { CANAL_ESTADO_ATUALIZACAO, type EstadoAtualizacao, type InfoAtualizacao } from '../shared/api'
import type { Configuracoes } from './configuracoes'
import { ErroNegocio } from './db/erros'
import type { GerenciadorBanco } from './db/gerenciador'

/** Espera antes da verificação automática, para não atrasar a abertura. */
const ATRASO_VERIFICACAO_MS = 4000

/**
 * Procura versões novas nas Releases do GitHub e só baixa ou instala quando a
 * pessoa pede. Os dados ficam fora da pasta do programa e um backup é feito
 * antes de instalar.
 */
export class Atualizador {
  private estado: EstadoAtualizacao = { fase: 'parada' }
  private readonly ativo = app.isPackaged

  constructor(
    private readonly banco: GerenciadorBanco,
    private readonly configuracoes: Configuracoes
  ) {}

  iniciar(): void {
    if (!this.ativo) {
      this.estado = { fase: 'indisponivel' }
      return
    }
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false

    // Usado apenas pelos testes automatizados, com um servidor local de atualização.
    const urlDeTeste = process.env['AUX_CARTEIRA_URL_ATUALIZACAO']
    if (urlDeTeste) autoUpdater.setFeedURL({ provider: 'generic', url: urlDeTeste })

    autoUpdater.on('update-available', (info) =>
      this.mudar({ fase: 'disponivel', versao: info.version })
    )
    autoUpdater.on('update-not-available', () => this.mudar({ fase: 'atualizado' }))
    autoUpdater.on('download-progress', (progresso) => {
      const versao = 'versao' in this.estado ? this.estado.versao : ''
      this.mudar({ fase: 'baixando', versao, percentual: Math.floor(progresso.percent) })
    })
    autoUpdater.on('update-downloaded', (info) =>
      this.mudar({ fase: 'pronta', versao: info.version })
    )
    autoUpdater.on('error', (erro) => {
      console.error('Erro na atualização:', erro)
      this.mudar({
        fase: 'erro',
        mensagem: 'Não foi possível procurar ou baixar a atualização. Confira a internet e tente de novo.'
      })
    })

    if (this.configuracoes.ler().atualizacaoAutomatica) {
      setTimeout(() => void this.verificar(), ATRASO_VERIFICACAO_MS)
    }
  }

  info(): InfoAtualizacao {
    return {
      versaoAtual: app.getVersion(),
      automatica: this.configuracoes.ler().atualizacaoAutomatica,
      estado: this.estado
    }
  }

  definirAutomatica(ativa: boolean): void {
    this.configuracoes.definir({ atualizacaoAutomatica: ativa })
  }

  async verificar(): Promise<void> {
    this.exigirAtivo()
    const ocupado = ['verificando', 'baixando', 'pronta'].includes(this.estado.fase)
    if (ocupado) return
    this.mudar({ fase: 'verificando' })
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // O evento 'error' já informou a interface.
    }
  }

  baixar(): void {
    this.exigirAtivo()
    if (this.estado.fase !== 'disponivel') {
      throw new ErroNegocio('Não há atualização disponível para baixar.')
    }
    this.mudar({ fase: 'baixando', versao: this.estado.versao, percentual: 0 })
    autoUpdater.downloadUpdate().catch(() => {
      // O evento 'error' já informou a interface.
    })
  }

  async instalar(): Promise<void> {
    this.exigirAtivo()
    if (this.estado.fase !== 'pronta') {
      throw new ErroNegocio('A atualização ainda não foi baixada.')
    }
    try {
      await this.banco.backupAutomatico('antes-da-atualizacao')
    } catch (erro) {
      console.error('Backup antes da atualização falhou:', erro)
      throw new ErroNegocio(
        'Não foi possível fazer o backup antes de atualizar. Nada foi instalado.'
      )
    }
    // Instala sem perguntas e abre o aplicativo de novo ao terminar.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  }

  private exigirAtivo(): void {
    if (!this.ativo) {
      throw new ErroNegocio('Atualizações funcionam apenas no aplicativo instalado.')
    }
  }

  private mudar(estado: EstadoAtualizacao): void {
    this.estado = estado
    for (const janela of BrowserWindow.getAllWindows()) {
      janela.webContents.send(CANAL_ESTADO_ATUALIZACAO, estado)
    }
  }
}
