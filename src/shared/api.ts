import type { Panorama } from './analise'
import type {
  CriarLancamento,
  EditarAPartirDe,
  EditarOcorrencia,
  EncerrarSerie,
  ExcluirOcorrencia,
  RegistrarRealizado
} from './esquemas'
import type { Categoria, Ocorrencia, ResumoMensal } from './tipos'

export const CODIGO_REALIZADAS_FUTURAS = 'REALIZADAS_FUTURAS'

export type Resposta<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: { mensagem: string; codigo?: string; quantidade?: number } }

export interface InfoDados {
  caminhoBanco: string
  temDemonstracao: boolean
}

export interface ResultadoBackup {
  concluido: boolean
  caminho?: string
}

/** Operações disponíveis à interface. Cada uma é validada no processo principal. */
export interface OperacoesCarteira {
  listarCategorias(): Categoria[]
  criarCategoria(p: { nome: string }): void
  renomearCategoria(p: { id: number; nome: string }): void
  definirCategoriaAtiva(p: { id: number; ativa: boolean }): void
  excluirCategoria(p: { id: number }): void
  listarMes(mes: string): Ocorrencia[]
  resumoMes(mes: string): ResumoMensal
  panorama(mes: string): Panorama
  criarLancamento(p: CriarLancamento): void
  editarOcorrencia(p: EditarOcorrencia): void
  editarAPartirDe(p: EditarAPartirDe): void
  registrarRealizado(p: RegistrarRealizado): void
  excluirOcorrencia(p: ExcluirOcorrencia): void
  encerrarSerie(p: EncerrarSerie): void
  infoDados(): InfoDados
  carregarDemonstracao(mes: string): void
  removerDemonstracao(): void
  exportarBackup(): ResultadoBackup
  restaurarBackup(): ResultadoBackup
}

export type NomeOperacao = keyof OperacoesCarteira

/** Lista fechada de canais IPC: o preload não expõe nada além destes. */
export const OPERACOES = [
  'listarCategorias',
  'criarCategoria',
  'renomearCategoria',
  'definirCategoriaAtiva',
  'excluirCategoria',
  'listarMes',
  'resumoMes',
  'panorama',
  'criarLancamento',
  'editarOcorrencia',
  'editarAPartirDe',
  'registrarRealizado',
  'excluirOcorrencia',
  'encerrarSerie',
  'infoDados',
  'carregarDemonstracao',
  'removerDemonstracao',
  'exportarBackup',
  'restaurarBackup'
] as const satisfies readonly NomeOperacao[]

export function canalDe(operacao: NomeOperacao): string {
  return `carteira:${operacao}`
}

export type ApiCarteira = {
  [K in NomeOperacao]: (
    ...args: Parameters<OperacoesCarteira[K]>
  ) => Promise<Resposta<ReturnType<OperacoesCarteira[K]>>>
}
