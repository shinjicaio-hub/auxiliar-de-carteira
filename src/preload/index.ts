import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CANAL_ESTADO_ATUALIZACAO, canalDe, OPERACOES, type EstadoAtualizacao } from '../shared/api'

// Expõe apenas as operações da lista fechada, nunca o ipcRenderer em si.
const operacoes = Object.fromEntries(
  OPERACOES.map((operacao) => [
    operacao,
    (payload?: unknown) => ipcRenderer.invoke(canalDe(operacao), payload)
  ])
)

contextBridge.exposeInMainWorld('carteira', {
  ...operacoes,
  aoMudarAtualizacao(ouvinte: (estado: EstadoAtualizacao) => void) {
    const repassar = (_evento: IpcRendererEvent, estado: EstadoAtualizacao) => ouvinte(estado)
    ipcRenderer.on(CANAL_ESTADO_ATUALIZACAO, repassar)
    return () => {
      ipcRenderer.removeListener(CANAL_ESTADO_ATUALIZACAO, repassar)
    }
  }
})
