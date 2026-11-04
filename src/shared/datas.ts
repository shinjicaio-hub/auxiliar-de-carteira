// Datas de calendário como texto (AAAA-MM-DD) e meses como AAAA-MM.
// Nada aqui usa fuso horário, então uma data nunca "volta um dia".

const NOMES_MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]

function partesMes(mes: string): [number, number] {
  return [Number(mes.slice(0, 4)), Number(mes.slice(5, 7))]
}

function montarMes(ano: number, mes: number): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`
}

export function mesValido(mes: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(mes)) return false
  const [ano, m] = partesMes(mes)
  return ano >= 1900 && ano <= 2200 && m >= 1 && m <= 12
}

export function ultimoDiaDoMes(mes: string): number {
  const [ano, m] = partesMes(mes)
  if (m === 2) {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
    return bissexto ? 29 : 28
  }
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

export function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const mes = data.slice(0, 7)
  const dia = Number(data.slice(8, 10))
  return mesValido(mes) && dia >= 1 && dia <= ultimoDiaDoMes(mes)
}

export function mesDaData(data: string): string {
  return data.slice(0, 7)
}

export function diaDaData(data: string): number {
  return Number(data.slice(8, 10))
}

export function somarMeses(mes: string, quantidade: number): string {
  const [ano, m] = partesMes(mes)
  const total = ano * 12 + (m - 1) + quantidade
  return montarMes(Math.floor(total / 12), (total % 12 + 12) % 12 + 1)
}

/** Quantos meses vão de `inicio` até `fim` (negativo se `fim` vier antes). */
export function diferencaMeses(inicio: string, fim: string): number {
  const [a1, m1] = partesMes(inicio)
  const [a2, m2] = partesMes(fim)
  return (a2 - a1) * 12 + (m2 - m1)
}

/** Data no mês usando o último dia válido quando o dia não existe naquele mês. */
export function dataNoMes(mes: string, dia: number): string {
  const diaValido = Math.min(dia, ultimoDiaDoMes(mes))
  return `${mes}-${String(diaValido).padStart(2, '0')}`
}

export function hojeLocal(agora: Date = new Date()): string {
  const mes = montarMes(agora.getFullYear(), agora.getMonth() + 1)
  return `${mes}-${String(agora.getDate()).padStart(2, '0')}`
}

export function formatarData(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
}

export function formatarMes(mes: string): string {
  const [ano, m] = partesMes(mes)
  return `${NOMES_MESES[m - 1]} de ${ano}`
}

/** Rótulo curto para eixos de gráfico: "nov/26". */
export function formatarMesEixo(mes: string): string {
  const [, m] = partesMes(mes)
  return `${NOMES_MESES[m - 1]!.slice(0, 3)}/${mes.slice(2, 4)}`
}

export function formatarMesCurto(mes: string): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`
}
