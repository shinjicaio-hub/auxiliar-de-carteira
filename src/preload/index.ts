import { contextBridge, ipcRenderer } from 'electron'
import { canalDe, OPERACOES } from '../shared/api'

// Expõe apenas as operações da lista fechada, nunca o ipcRenderer em si.
const api = Object.fromEntries(
  OPERACOES.map((operacao) => [
    operacao,
    (payload?: unknown) => ipcRenderer.invoke(canalDe(operacao), payload)
  ])
)

contextBridge.exposeInMainWorld('carteira', api)
