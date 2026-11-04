/** Teto de valor aceito: R$ 100 bilhões, bem abaixo do limite seguro de inteiros. */
export const MAXIMO_CENTAVOS = 10_000_000_000_000

/**
 * Converte um texto digitado em centavos, sem passar por números decimais.
 * Aceita "1.234,56", "1234,56", "1234.56", "1234" e "R$ 12,50".
 * Retorna null quando o texto não é um valor válido.
 */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '')
  let inteiro: string
  let decimal: string

  const comMilhar = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(limpo)
  const comVirgula = /^(\d+)(?:,(\d{1,2}))?$/.exec(limpo)
  const comPonto = /^(\d+)\.(\d{1,2})$/.exec(limpo)

  if (comMilhar) {
    inteiro = comMilhar[1]!.replace(/\./g, '')
    decimal = comMilhar[2] ?? ''
  } else if (comVirgula) {
    inteiro = comVirgula[1]!
    decimal = comVirgula[2] ?? ''
  } else if (comPonto) {
    inteiro = comPonto[1]!
    decimal = comPonto[2]!
  } else {
    return null
  }

  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'))
  return Number.isSafeInteger(centavos) && centavos <= MAXIMO_CENTAVOS ? centavos : null
}

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Texto para um campo de formulário, sem símbolo: 123456 vira "1.234,56". */
export function centavosParaCampo(centavos: number): string {
  const absoluto = Math.abs(centavos)
  const reais = Math.floor(absoluto / 100)
  const resto = String(absoluto % 100).padStart(2, '0')
  return `${agruparMilhar(String(reais))},${resto}`
}

/** Valor para exibição. Negativos sempre levam o sinal, além de qualquer cor. */
export function formatarReais(centavos: number): string {
  const sinal = centavos < 0 ? '−' : ''
  return `${sinal}R$ ${centavosParaCampo(centavos)}`
}
