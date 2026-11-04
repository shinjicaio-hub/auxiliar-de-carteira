import { dataNoMes, diferencaMeses, somarMeses } from './datas'
import type { Ocorrencia, RegistroOcorrencia, Serie, VersaoSerie } from './tipos'

/** Último mês em que a série aparece; null quando não tem fim definido. */
export function ultimoMesDaSerie(serie: Serie): string | null {
  let fimNatural: string | null = null
  if (serie.repeticao === 'unico') fimNatural = serie.mesInicial
  if (serie.repeticao === 'parcelado') {
    fimNatural = somarMeses(serie.mesInicial, serie.parcelasTotal! - serie.parcelaInicial!)
  }
  if (fimNatural && serie.mesEncerramento) {
    return fimNatural < serie.mesEncerramento ? fimNatural : serie.mesEncerramento
  }
  return fimNatural ?? serie.mesEncerramento
}

export function serieAtivaNoMes(serie: Serie, mes: string): boolean {
  const ultimo = ultimoMesDaSerie(serie)
  return mes >= serie.mesInicial && (ultimo === null || mes <= ultimo)
}

/** Versão em vigor no mês: a mais recente cujo início não passa do mês. */
export function versaoDoMes(versoes: VersaoSerie[], mes: string): VersaoSerie | null {
  let escolhida: VersaoSerie | null = null
  for (const versao of versoes) {
    if (versao.aPartirDe > mes) continue
    if (!escolhida || versao.aPartirDe > escolhida.aPartirDe) escolhida = versao
  }
  return escolhida
}

export function montarOcorrencia(
  serie: Serie,
  versoes: VersaoSerie[],
  registro: RegistroOcorrencia | undefined,
  mes: string
): Ocorrencia | null {
  if (!serieAtivaNoMes(serie, mes) || registro?.excluida) return null
  const versao = versaoDoMes(versoes, mes)
  if (!versao) return null

  const edicao = registro?.edicao ?? null
  const campos = edicao ?? versao
  const previsto = campos.valorCentavos
  const realizado = registro?.realizadoCentavos ?? null
  const parcelado = serie.repeticao === 'parcelado'

  return {
    serieId: serie.id,
    mes,
    tipo: serie.tipo,
    repeticao: serie.repeticao,
    nome: campos.nome,
    categoriaId: campos.categoriaId,
    formaPagamento: campos.formaPagamento,
    fatura: campos.fatura,
    reservaSerieId: campos.reservaSerieId,
    observacao: campos.observacao,
    data: edicao?.data ?? dataNoMes(mes, versao.dia),
    diaOriginal: versao.dia,
    previstoCentavos: previsto,
    realizadoCentavos: realizado,
    dataRealizacao: registro?.dataRealizacao ?? null,
    consideradoCentavos: realizado ?? previsto,
    parcelaAtual: parcelado ? serie.parcelaInicial! + diferencaMeses(serie.mesInicial, mes) : null,
    parcelasTotal: parcelado ? serie.parcelasTotal : null,
    totalCompraCentavos: parcelado ? versao.valorCentavos * serie.parcelasTotal! : null,
    mesInicial: serie.mesInicial,
    ultimoMes: ultimoMesDaSerie(serie),
    mesEncerramento: serie.mesEncerramento,
    editadaNoMes: edicao !== null,
    demo: serie.demo
  }
}

export function ocorrenciasDoMes(
  series: Serie[],
  versoes: VersaoSerie[],
  registros: RegistroOcorrencia[],
  mes: string
): Ocorrencia[] {
  const versoesPorSerie = new Map<number, VersaoSerie[]>()
  for (const versao of versoes) {
    const lista = versoesPorSerie.get(versao.serieId)
    if (lista) lista.push(versao)
    else versoesPorSerie.set(versao.serieId, [versao])
  }
  const registrosDoMes = new Map(
    registros.filter((r) => r.mes === mes).map((r) => [r.serieId, r] as const)
  )

  const resultado: Ocorrencia[] = []
  for (const serie of series) {
    const ocorrencia = montarOcorrencia(
      serie,
      versoesPorSerie.get(serie.id) ?? [],
      registrosDoMes.get(serie.id),
      mes
    )
    if (ocorrencia) resultado.push(ocorrencia)
  }
  return resultado.sort(
    (a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR')
  )
}
