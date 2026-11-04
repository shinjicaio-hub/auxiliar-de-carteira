export const TIPOS = ['receita', 'compromisso', 'investimento', 'lazer', 'gasto_livre', 'aporte'] as const
export type Tipo = (typeof TIPOS)[number]

export const REPETICOES = ['unico', 'parcelado', 'recorrente'] as const
export type Repeticao = (typeof REPETICOES)[number]

export const FORMAS_PAGAMENTO = [
  'dinheiro',
  'pix',
  'debito',
  'credito',
  'boleto',
  'transferencia',
  'outro'
] as const
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]

export const ROTULOS_TIPO: Record<Tipo, string> = {
  receita: 'Receita',
  compromisso: 'Compromisso',
  investimento: 'Reserva de investimento',
  lazer: 'Reserva de lazer',
  gasto_livre: 'Gasto livre',
  aporte: 'Aporte de investimento'
}

export const ROTULOS_REPETICAO: Record<Repeticao, string> = {
  unico: 'Único',
  parcelado: 'Parcelado',
  recorrente: 'Recorrente'
}

export const ROTULOS_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro'
}

/** Reservas não têm valor realizado próprio: o uso vem de lançamentos ligados a elas. */
export function ehReserva(tipo: Tipo): boolean {
  return tipo === 'lazer' || tipo === 'investimento'
}

/** Tipo de reserva que cada lançamento pode consumir. */
export function reservaAceitaPor(tipo: Tipo): Tipo | null {
  if (tipo === 'gasto_livre') return 'lazer'
  if (tipo === 'aporte') return 'investimento'
  return null
}

export interface Categoria {
  id: number
  nome: string
  ativa: boolean
}

export interface Serie {
  id: number
  tipo: Tipo
  repeticao: Repeticao
  mesInicial: string
  parcelaInicial: number | null
  parcelasTotal: number | null
  mesEncerramento: string | null
  demo: boolean
}

/** Campos descritivos de um lançamento, comuns a versões e edições pontuais. */
export interface CamposLancamento {
  nome: string
  valorCentavos: number
  categoriaId: number | null
  formaPagamento: FormaPagamento | null
  fatura: string | null
  reservaSerieId: number | null
  observacao: string | null
}

export interface VersaoSerie extends CamposLancamento {
  serieId: number
  aPartirDe: string
  dia: number
}

/** Exceção gravada para um mês; só existe quando o mês foge do padrão da série. */
export interface RegistroOcorrencia {
  serieId: number
  mes: string
  excluida: boolean
  /** Quando verdadeiro, os campos abaixo substituem os da versão neste mês. */
  edicao: (CamposLancamento & { data: string }) | null
  realizadoCentavos: number | null
  dataRealizacao: string | null
}

/** Uma ocorrência calculada. A identidade é o par (serieId, mes). */
export interface Ocorrencia extends Omit<CamposLancamento, 'valorCentavos'> {
  serieId: number
  mes: string
  tipo: Tipo
  repeticao: Repeticao
  data: string
  diaOriginal: number
  previstoCentavos: number
  realizadoCentavos: number | null
  dataRealizacao: string | null
  /** Realizado, se houver; senão, previsto. Nunca a soma dos dois. */
  consideradoCentavos: number
  parcelaAtual: number | null
  parcelasTotal: number | null
  totalCompraCentavos: number | null
  mesInicial: string
  ultimoMes: string | null
  mesEncerramento: string | null
  editadaNoMes: boolean
  demo: boolean
}

export interface UsoReserva {
  serieId: number
  nome: string
  tipo: 'lazer' | 'investimento'
  reservadoCentavos: number
  utilizadoCentavos: number
  restanteCentavos: number
  excedenteCentavos: number
}

export interface TotaisFluxo {
  previstoCentavos: number
  realizadoCentavos: number
  /** Soma de realizado-ou-previsto de cada item: é o valor usado no orçamento. */
  consideradoCentavos: number
  /** Parte ainda sem valor realizado. */
  pendenteCentavos: number
}

export interface TotaisReserva {
  reservadoCentavos: number
  utilizadoCentavos: number
  restanteCentavos: number
  excedenteCentavos: number
}

export interface ResumoMensal {
  mes: string
  renda: TotaisFluxo
  compromissos: TotaisFluxo
  investimento: TotaisReserva
  lazer: TotaisReserva
  aportesSemReservaCentavos: number
  orcamentoLivreCentavos: number
  gastosLivresCentavos: number
  restanteLivreCentavos: number
  reservas: UsoReserva[]
}
