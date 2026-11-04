import type {
  Ocorrencia,
  ResumoMensal,
  TotaisFluxo,
  TotaisReserva,
  UsoReserva
} from './tipos'

function somarFluxo(itens: Ocorrencia[]): TotaisFluxo {
  const totais: TotaisFluxo = {
    previstoCentavos: 0,
    realizadoCentavos: 0,
    consideradoCentavos: 0,
    pendenteCentavos: 0
  }
  for (const item of itens) {
    totais.previstoCentavos += item.previstoCentavos
    totais.consideradoCentavos += item.consideradoCentavos
    if (item.realizadoCentavos === null) totais.pendenteCentavos += item.previstoCentavos
    else totais.realizadoCentavos += item.realizadoCentavos
  }
  return totais
}

function somarReservas(reservas: UsoReserva[]): TotaisReserva {
  const totais: TotaisReserva = {
    reservadoCentavos: 0,
    utilizadoCentavos: 0,
    restanteCentavos: 0,
    excedenteCentavos: 0
  }
  for (const reserva of reservas) {
    totais.reservadoCentavos += reserva.reservadoCentavos
    totais.utilizadoCentavos += reserva.utilizadoCentavos
    totais.restanteCentavos += reserva.restanteCentavos
    totais.excedenteCentavos += reserva.excedenteCentavos
  }
  return totais
}

/**
 * Orçamento livre = renda − compromissos − investimento reservado − lazer reservado.
 * Restante = orçamento livre − gastos livres sem reserva − excedente de reservas
 *            − aportes sem reserva.
 *
 * Um uso ligado a uma reserva já está descontado pela própria reserva, então só o
 * que passar do valor reservado reduz o restante. Um uso cuja reserva não existe
 * naquele mês é tratado como uso sem reserva, para nenhum valor sumir das contas.
 */
export function calcularResumo(mes: string, ocorrencias: Ocorrencia[]): ResumoMensal {
  const usos = new Map<number, number>()
  const reservasDoMes = new Map<number, Ocorrencia>()
  for (const o of ocorrencias) {
    if (o.tipo === 'lazer' || o.tipo === 'investimento') reservasDoMes.set(o.serieId, o)
  }

  let gastosLivres = 0
  let aportesSemReserva = 0
  for (const o of ocorrencias) {
    if (o.tipo !== 'gasto_livre' && o.tipo !== 'aporte') continue
    const reserva = o.reservaSerieId === null ? undefined : reservasDoMes.get(o.reservaSerieId)
    if (reserva) {
      usos.set(reserva.serieId, (usos.get(reserva.serieId) ?? 0) + o.consideradoCentavos)
    } else if (o.tipo === 'gasto_livre') {
      gastosLivres += o.consideradoCentavos
    } else {
      aportesSemReserva += o.consideradoCentavos
    }
  }

  const reservas: UsoReserva[] = [...reservasDoMes.values()].map((o) => {
    const reservado = o.previstoCentavos
    const utilizado = usos.get(o.serieId) ?? 0
    return {
      serieId: o.serieId,
      nome: o.nome,
      tipo: o.tipo as UsoReserva['tipo'],
      reservadoCentavos: reservado,
      utilizadoCentavos: utilizado,
      restanteCentavos: Math.max(reservado - utilizado, 0),
      excedenteCentavos: Math.max(utilizado - reservado, 0)
    }
  })

  const renda = somarFluxo(ocorrencias.filter((o) => o.tipo === 'receita'))
  const compromissos = somarFluxo(ocorrencias.filter((o) => o.tipo === 'compromisso'))
  const investimento = somarReservas(reservas.filter((r) => r.tipo === 'investimento'))
  const lazer = somarReservas(reservas.filter((r) => r.tipo === 'lazer'))

  const orcamentoLivre =
    renda.consideradoCentavos -
    compromissos.consideradoCentavos -
    investimento.reservadoCentavos -
    lazer.reservadoCentavos

  const restanteLivre =
    orcamentoLivre -
    gastosLivres -
    investimento.excedenteCentavos -
    lazer.excedenteCentavos -
    aportesSemReserva

  return {
    mes,
    renda,
    compromissos,
    investimento,
    lazer,
    aportesSemReservaCentavos: aportesSemReserva,
    orcamentoLivreCentavos: orcamentoLivre,
    gastosLivresCentavos: gastosLivres,
    restanteLivreCentavos: restanteLivre,
    reservas
  }
}
