import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { canalDe, type NomeOperacao, type OperacoesCarteira, type Resposta } from '../shared/api'
import { hojeLocal } from '../shared/datas'
import {
  esquemaCategoriaAtiva,
  esquemaCriarCategoria,
  esquemaCriarLancamento,
  esquemaEditarAPartirDe,
  esquemaEditarOcorrencia,
  esquemaEncerrarSerie,
  esquemaExcluirOcorrencia,
  esquemaIdCategoria,
  esquemaMes,
  esquemaRegistrarRealizado,
  esquemaRenomearCategoria,
  esquemaVazio,
  primeiraMensagem
} from '../shared/esquemas'
import { ErroNegocio } from './db/erros'
import type { GerenciadorBanco } from './db/gerenciador'

/** Só aceita chamadas da própria interface do aplicativo. */
function origemConfiavel(evento: IpcMainInvokeEvent): boolean {
  const url = evento.senderFrame?.url ?? ''
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev && url.startsWith(dev)) return true
  return url.startsWith('file://') && url.endsWith('/renderer/index.html')
}

function tratar<K extends NomeOperacao, E extends z.ZodType>(
  operacao: K,
  esquema: E,
  executar: (
    dados: z.output<E>,
    evento: IpcMainInvokeEvent
  ) => ReturnType<OperacoesCarteira[K]> | Promise<ReturnType<OperacoesCarteira[K]>>
): void {
  ipcMain.handle(
    canalDe(operacao),
    async (evento, payload: unknown): Promise<Resposta<ReturnType<OperacoesCarteira[K]>>> => {
      if (!origemConfiavel(evento)) {
        return { ok: false, erro: { mensagem: 'Origem não autorizada.' } }
      }
      const validacao = esquema.safeParse(payload)
      if (!validacao.success) {
        return { ok: false, erro: { mensagem: primeiraMensagem(validacao.error) } }
      }
      try {
        return { ok: true, dados: await executar(validacao.data, evento) }
      } catch (erro) {
        if (erro instanceof ErroNegocio) {
          const { message: mensagem, codigo, quantidade } = erro
          return { ok: false, erro: { mensagem, codigo, quantidade } }
        }
        console.error(`Erro em ${operacao}:`, erro)
        return {
          ok: false,
          erro: { mensagem: 'Algo deu errado ao salvar ou ler seus dados. Tente novamente.' }
        }
      }
    }
  )
}

export function registrarIpc(banco: GerenciadorBanco): void {
  const repo = () => banco.repositorio

  tratar('listarCategorias', esquemaVazio, () => repo().listarCategorias())
  tratar('criarCategoria', esquemaCriarCategoria, (p) => repo().criarCategoria(p.nome))
  tratar('renomearCategoria', esquemaRenomearCategoria, (p) => repo().renomearCategoria(p.id, p.nome))
  tratar('definirCategoriaAtiva', esquemaCategoriaAtiva, (p) =>
    repo().definirCategoriaAtiva(p.id, p.ativa)
  )
  tratar('excluirCategoria', esquemaIdCategoria, (p) => repo().excluirCategoria(p.id))

  tratar('listarMes', esquemaMes, (mes) => repo().listarMes(mes))
  tratar('resumoMes', esquemaMes, (mes) => repo().resumoMes(mes))
  tratar('panorama', esquemaMes, (mes) => repo().panorama(mes))
  tratar('criarLancamento', esquemaCriarLancamento, (p) => {
    repo().criarLancamento(p)
  })
  tratar('editarOcorrencia', esquemaEditarOcorrencia, (p) => repo().editarOcorrencia(p))
  tratar('editarAPartirDe', esquemaEditarAPartirDe, (p) => repo().editarAPartirDe(p))
  tratar('registrarRealizado', esquemaRegistrarRealizado, (p) => repo().registrarRealizado(p))
  tratar('excluirOcorrencia', esquemaExcluirOcorrencia, (p) => repo().excluirOcorrencia(p))
  tratar('encerrarSerie', esquemaEncerrarSerie, (p) => repo().encerrarSerie(p))

  tratar('infoDados', esquemaVazio, () => ({
    caminhoBanco: banco.caminho,
    temDemonstracao: repo().temDemonstracao()
  }))
  tratar('carregarDemonstracao', esquemaMes, (mes) => repo().carregarDemonstracao(mes))
  tratar('removerDemonstracao', esquemaVazio, () => repo().removerDemonstracao())

  // Os caminhos de arquivo vêm sempre de diálogos do sistema, nunca da interface.
  tratar('exportarBackup', esquemaVazio, async (_dados, evento) => {
    const janela = BrowserWindow.fromWebContents(evento.sender)!
    const { canceled, filePath } = await dialog.showSaveDialog(janela, {
      title: 'Salvar backup',
      defaultPath: `auxiliar-de-carteira-backup-${hojeLocal()}.sqlite`,
      filters: [{ name: 'Backup do Auxiliar de Carteira', extensions: ['sqlite'] }]
    })
    if (canceled || !filePath) return { concluido: false }
    await banco.exportarBackup(filePath)
    return { concluido: true, caminho: filePath }
  })

  tratar('restaurarBackup', esquemaVazio, async (_dados, evento) => {
    const janela = BrowserWindow.fromWebContents(evento.sender)!
    const { canceled, filePaths } = await dialog.showOpenDialog(janela, {
      title: 'Escolher backup para restaurar',
      properties: ['openFile'],
      filters: [{ name: 'Backup do Auxiliar de Carteira', extensions: ['sqlite'] }]
    })
    const origem = filePaths[0]
    if (canceled || !origem) return { concluido: false }

    const { response } = await dialog.showMessageBox(janela, {
      type: 'warning',
      title: 'Restaurar backup',
      message: 'Substituir todos os dados atuais por este backup?',
      detail:
        'Tudo o que foi registrado depois deste backup deixará de aparecer. ' +
        'Uma cópia dos dados atuais será guardada automaticamente antes da troca.',
      buttons: ['Cancelar', 'Substituir meus dados'],
      defaultId: 0,
      cancelId: 0
    })
    if (response !== 1) return { concluido: false }

    const copia = await banco.restaurarBackup(origem)
    return { concluido: true, caminho: copia }
  })
}
