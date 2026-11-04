import { diaDaData, formatarMesCurto, mesDaData, somarMeses, ultimoDiaDoMes } from './datas'
import { formatarReais } from './dinheiro'
import type { Ocorrencia, ResumoMensal } from './tipos'

export interface GastoCategoria {
  categoriaId: number | null
  pagoCentavos: number
  pendenteCentavos: number
}

/** Fotografia de um mês: base dos gráficos, dos alertas e do simulador. */
export interface PanoramaMes {
  mes: string
  resumo: ResumoMensal
  /** Compromissos e gastos com valor realizado. Investimento não é gasto. */
  pagoCentavos: number
  /** Compromissos e gastos ainda sem valor realizado. */
  pendenteCentavos: number
  categorias: GastoCategoria[]
}

export interface Panorama {
  meses: PanoramaMes[]
  /** Lazer e compras isoladas ainda por acontecer, do mês consultado em diante. */
  planejados: Ocorrencia[]
}

export const gastoDoMes = (p: PanoramaMes): number => p.pagoCentavos + p.pendenteCentavos

export function analisarMes(
  mes: string,
  ocorrencias: Ocorrencia[],
  resumo: ResumoMensal
): PanoramaMes {
  const categorias = new Map<number | null, GastoCategoria>()
  let pago = 0
  let pendente = 0

  for (const o of ocorrencias) {
    if (o.tipo !== 'compromisso' && o.tipo !== 'gasto_livre') continue
    let categoria = categorias.get(o.categoriaId)
    if (!categoria) {
      categoria = { categoriaId: o.categoriaId, pagoCentavos: 0, pendenteCentavos: 0 }
      categorias.set(o.categoriaId, categoria)
    }
    if (o.realizadoCentavos === null) {
      categoria.pendenteCentavos += o.previstoCentavos
      pendente += o.previstoCentavos
    } else {
      categoria.pagoCentavos += o.realizadoCentavos
      pago += o.realizadoCentavos
    }
  }

  return {
    mes,
    resumo,
    pagoCentavos: pago,
    pendenteCentavos: pendente,
    categorias: [...categorias.values()].sort(
      (a, b) =>
        b.pagoCentavos + b.pendenteCentavos - (a.pagoCentavos + a.pendenteCentavos)
    )
  }
}

export type IdParte = 'compromissos' | 'gastos' | 'lazer' | 'investimento' | 'livre'

export interface ParteRenda {
  id: IdParte
  rotulo: string
  centavos: number
}

/** Divide a renda em partes que somam a renda quando o restante é positivo. */
export function distribuicaoRenda(r: ResumoMensal): ParteRenda[] {
  return [
    { id: 'compromissos', rotulo: 'Compromissos', centavos: r.compromissos.consideradoCentavos },
    { id: 'gastos', rotulo: 'Gastos livres', centavos: r.gastosLivresCentavos },
    {
      id: 'lazer',
      rotulo: 'Lazer',
      centavos: r.lazer.reservadoCentavos + r.lazer.excedenteCentavos
    },
    {
      id: 'investimento',
      rotulo: 'Investimento',
      centavos:
        r.investimento.reservadoCentavos +
        r.investimento.excedenteCentavos +
        r.aportesSemReservaCentavos
    },
    { id: 'livre', rotulo: 'Ainda livre', centavos: Math.max(r.restanteLivreCentavos, 0) }
  ]
}

export interface Ritmo {
  diasRestantes: number
  porDiaCentavos: number
}

/** Quanto dá para gastar por dia até o fim do mês. Só faz sentido no mês corrente. */
export function ritmoDoMes(r: ResumoMensal, hoje: string): Ritmo | null {
  if (mesDaData(hoje) !== r.mes) return null
  const diasRestantes = ultimoDiaDoMes(r.mes) - diaDaData(hoje) + 1
  return {
    diasRestantes,
    porDiaCentavos: Math.floor(Math.max(r.restanteLivreCentavos, 0) / diasRestantes)
  }
}

/** Contas e recebimentos sem valor realizado, separando o que já venceu. */
export function contasDoMes(
  ocorrencias: Ocorrencia[],
  hoje: string
): { atrasadas: Ocorrencia[]; aVencer: Ocorrencia[] } {
  const abertas = ocorrencias.filter(
    (o) =>
      o.realizadoCentavos === null &&
      (o.tipo === 'compromisso' || o.tipo === 'receita' || o.tipo === 'gasto_livre')
  )
  return {
    atrasadas: abertas.filter((o) => o.data < hoje),
    aVencer: abertas.filter((o) => o.data >= hoje)
  }
}

/** Média de gasto dos até 3 meses anteriores que têm dados. Null se não houver. */
export function mediaAnterior(meses: PanoramaMes[], mes: string): number | null {
  const anteriores = meses.filter((m) => m.mes < mes && gastoDoMes(m) > 0).slice(-3)
  if (anteriores.length === 0) return null
  const soma = anteriores.reduce((total, m) => total + gastoDoMes(m), 0)
  return Math.round(soma / anteriores.length)
}

export type NivelInsight = 'critico' | 'atencao' | 'bom'

export interface Insight {
  id: string
  nivel: NivelInsight
  titulo: string
  detalhe: string
}

const ORDEM_NIVEL: Record<NivelInsight, number> = { critico: 0, atencao: 1, bom: 2 }
const MAXIMO_INSIGHTS = 5
/** Diferença mínima para uma categoria ser apontada: 20% e R$ 50,00. */
const ALTA_MINIMA_RELATIVA = 1.2
const ALTA_MINIMA_CENTAVOS = 5000

function alertaRitmo(r: ResumoMensal, ocorrencias: Ocorrencia[], hoje: string): Insight | null {
  if (mesDaData(hoje) !== r.mes) return null
  const dia = diaDaData(hoje)
  if (dia < 5 || r.orcamentoLivreCentavos <= 0) return null

  const gastoAteAgora = ocorrencias
    .filter(
      (o) =>
        o.tipo === 'gasto_livre' &&
        o.reservaSerieId === null &&
        o.realizadoCentavos !== null &&
        o.data <= hoje
    )
    .reduce((total, o) => total + o.realizadoCentavos!, 0)
  if (gastoAteAgora === 0) return null

  const projecao = Math.round((gastoAteAgora / dia) * ultimoDiaDoMes(r.mes))
  if (projecao <= r.orcamentoLivreCentavos) return null
  return {
    id: 'ritmo',
    nivel: 'atencao',
    titulo: 'Gastos livres acima do ritmo',
    detalhe: `Nesse passo, o mês fecha com ${formatarReais(projecao)} em gastos livres, ${formatarReais(
      projecao - r.orcamentoLivreCentavos
    )} além do orçamento.`
  }
}

function alertasCategoria(
  atual: PanoramaMes,
  meses: PanoramaMes[],
  nomeCategoria: (id: number | null) => string
): Insight[] {
  const alertas: Insight[] = []
  for (const categoria of atual.categorias) {
    const total = categoria.pagoCentavos + categoria.pendenteCentavos
    // Só meses em que a categoria existiu: uma despesa nova não é um gasto fora do normal.
    const historico = meses
      .filter((m) => m.mes < atual.mes)
      .flatMap((m) => m.categorias.filter((c) => c.categoriaId === categoria.categoriaId))
      .map((c) => c.pagoCentavos + c.pendenteCentavos)
      .slice(-3)
    if (historico.length < 2) continue
    const media = historico.reduce((t, v) => t + v, 0) / historico.length
    if (total >= media * ALTA_MINIMA_RELATIVA && total - media >= ALTA_MINIMA_CENTAVOS) {
      const nome = nomeCategoria(categoria.categoriaId)
      alertas.push({
        id: `categoria-${categoria.categoriaId}`,
        nivel: 'atencao',
        titulo: `${nome} acima do normal`,
        detalhe: `${formatarReais(total)} neste mês, contra a média de ${formatarReais(Math.round(media))}.`
      })
    }
  }
  return alertas.slice(0, 2)
}

function alertasReserva(r: ResumoMensal): Insight[] {
  const alertas: Insight[] = []
  for (const reserva of r.reservas) {
    if (reserva.excedenteCentavos > 0) {
      alertas.push({
        id: `reserva-${reserva.serieId}`,
        nivel: 'atencao',
        titulo: `Reserva "${reserva.nome}" ultrapassada`,
        detalhe: `O uso passou ${formatarReais(reserva.excedenteCentavos)} do reservado e reduziu o dinheiro livre.`
      })
    } else if (
      reserva.tipo === 'lazer' &&
      reserva.restanteCentavos > 0 &&
      reserva.utilizadoCentavos >= reserva.reservadoCentavos * 0.8
    ) {
      alertas.push({
        id: `reserva-${reserva.serieId}`,
        nivel: 'atencao',
        titulo: `Reserva "${reserva.nome}" quase no fim`,
        detalhe: `Restam ${formatarReais(reserva.restanteCentavos)}.`
      })
    }
  }
  return alertas
}

function alertaParcelas(ocorrencias: Ocorrencia[], mes: string): Insight | null {
  const limite = somarMeses(mes, 3)
  const terminando = ocorrencias
    .filter(
      (o) =>
        o.tipo === 'compromisso' &&
        o.repeticao === 'parcelado' &&
        o.ultimoMes !== null &&
        o.ultimoMes <= limite
    )
    .sort((a, b) => a.ultimoMes!.localeCompare(b.ultimoMes!))
  const primeira = terminando[0]
  if (!primeira) return null

  const fim = primeira.ultimoMes!
  const noMesmoFim = terminando.filter((o) => o.ultimoMes === fim)
  const liberado = noMesmoFim.reduce((t, o) => t + o.previstoCentavos, 0)
  const nomes = noMesmoFim.map((o) => o.nome).join(', ')
  return {
    id: 'parcelas',
    nivel: 'bom',
    titulo: `Parcela termina em ${formatarMesCurto(fim)}`,
    detalhe: `${nomes}: libera ${formatarReais(liberado)} por mês a partir de ${formatarMesCurto(
      somarMeses(fim, 1)
    )}.`
  }
}

function alertaMesFuturo(meses: PanoramaMes[], mes: string): Insight | null {
  const limite = somarMeses(mes, 6)
  const apertado = meses.find(
    (m) => m.mes > mes && m.mes <= limite && m.resumo.restanteLivreCentavos < 0
  )
  if (!apertado) return null
  return {
    id: 'mes-futuro',
    nivel: 'atencao',
    titulo: `${formatarMesCurto(apertado.mes)} fica no negativo`,
    detalhe: `O que já está planejado passa da renda em ${formatarReais(
      -apertado.resumo.restanteLivreCentavos
    )}.`
  }
}

/** Observações objetivas sobre o mês; só aparecem quando há algo a dizer. */
export function gerarInsights(entrada: {
  mes: string
  hoje: string
  ocorrencias: Ocorrencia[]
  meses: PanoramaMes[]
  nomeCategoria: (id: number | null) => string
}): Insight[] {
  const { mes, hoje, ocorrencias, meses, nomeCategoria } = entrada
  const atual = meses.find((m) => m.mes === mes)
  if (!atual) return []
  const r = atual.resumo
  const insights: Insight[] = []

  if (r.orcamentoLivreCentavos < 0) {
    insights.push({
      id: 'planejamento',
      nivel: 'critico',
      titulo: 'Planejamento acima da renda',
      detalhe: `Compromissos e reservas passam da renda em ${formatarReais(-r.orcamentoLivreCentavos)}.`
    })
  } else if (r.restanteLivreCentavos < 0) {
    insights.push({
      id: 'orcamento',
      nivel: 'critico',
      titulo: 'Orçamento livre estourado',
      detalhe: `Os gastos passaram do orçamento em ${formatarReais(-r.restanteLivreCentavos)}.`
    })
  }

  const contas = contasDoMes(ocorrencias, hoje).atrasadas.filter((o) => o.tipo !== 'receita')
  if (contas.length > 0) {
    const total = contas.reduce((t, o) => t + o.previstoCentavos, 0)
    insights.push({
      id: 'atrasadas',
      nivel: 'critico',
      titulo: contas.length === 1 ? '1 conta sem pagamento registrado' : `${contas.length} contas sem pagamento registrado`,
      detalhe: `Já venceram e somam ${formatarReais(total)}. Se já pagou, registre para o resumo ficar certo.`
    })
  }

  const ritmo = alertaRitmo(r, ocorrencias, hoje)
  if (ritmo) insights.push(ritmo)
  insights.push(...alertasReserva(r))
  insights.push(...alertasCategoria(atual, meses, nomeCategoria))
  const futuro = alertaMesFuturo(meses, mes)
  if (futuro) insights.push(futuro)
  const parcelas = alertaParcelas(ocorrencias, mes)
  if (parcelas) insights.push(parcelas)

  return insights
    .sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel])
    .slice(0, MAXIMO_INSIGHTS)
}

export interface PlanoCompra {
  mesInicial: string
  /** Valor de cada parcela, ou o valor total quando há uma só. */
  valorCentavos: number
  parcelas: number
}

export interface MesSimulado {
  mes: string
  antesCentavos: number
  depoisCentavos: number
}

export type Veredito = 'cabe' | 'aperta' | 'nao_cabe'

export interface Simulacao {
  meses: MesSimulado[]
  veredito: Veredito
  /** Mês em que sobra menos depois da compra. */
  piorMes: MesSimulado
  /** Parte da compra que passa do que temos no horizonte consultado. */
  parcelasForaDoHorizonte: number
}

/** Abaixo de 10% da renda livre, o mês é considerado apertado. */
const FOLGA_MINIMA = 0.1

export function simularCompra(meses: PanoramaMes[], plano: PlanoCompra): Simulacao | null {
  const ultimaParcela = somarMeses(plano.mesInicial, plano.parcelas - 1)
  const fimExibicao = somarMeses(plano.mesInicial, Math.max(plano.parcelas - 1, 2))
  const visiveis = meses.filter((m) => m.mes >= plano.mesInicial && m.mes <= fimExibicao)
  if (visiveis.length === 0) return null

  const simulados = visiveis.map((m): MesSimulado => {
    const antes = m.resumo.restanteLivreCentavos
    const incide = m.mes <= ultimaParcela
    return {
      mes: m.mes,
      antesCentavos: antes,
      depoisCentavos: incide ? antes - plano.valorCentavos : antes
    }
  })

  const piorMes = simulados.reduce((pior, m) =>
    m.depoisCentavos < pior.depoisCentavos ? m : pior
  )
  const renda = visiveis.find((m) => m.mes === piorMes.mes)!.resumo.renda.consideradoCentavos
  const veredito: Veredito =
    piorMes.depoisCentavos < 0
      ? 'nao_cabe'
      : piorMes.depoisCentavos < renda * FOLGA_MINIMA
        ? 'aperta'
        : 'cabe'

  const ultimoVisivel = simulados[simulados.length - 1]!.mes
  const fora = ultimaParcela > ultimoVisivel
    ? plano.parcelas - simulados.filter((m) => m.mes <= ultimaParcela).length
    : 0

  return { meses: simulados, veredito, piorMes, parcelasForaDoHorizonte: fora }
}
