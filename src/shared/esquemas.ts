import { z } from 'zod'
import { dataValida, mesValido } from './datas'
import { MAXIMO_CENTAVOS } from './dinheiro'
import { ehReserva, FORMAS_PAGAMENTO, REPETICOES, reservaAceitaPor, TIPOS } from './tipos'

export const esquemaMes = z.string().refine(mesValido, 'Mês inválido.')
const esquemaData = z.string().refine(dataValida, 'Informe uma data válida.')
const esquemaId = z.number().int().positive()
const esquemaValor = z
  .number({ error: 'Informe um valor válido.' })
  .int('Informe um valor válido.')
  .positive('Informe um valor maior que zero.')
  .max(MAXIMO_CENTAVOS, 'Valor alto demais.')

function textoOpcional(maximo: number, rotulo: string) {
  return z
    .string()
    .trim()
    .max(maximo, `${rotulo} deve ter no máximo ${maximo} caracteres.`)
    .nullable()
    .transform((v) => v || null)
}

const camposLancamento = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(120, 'Nome muito longo.'),
  valorCentavos: esquemaValor,
  categoriaId: esquemaId.nullable(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).nullable(),
  fatura: textoOpcional(80, 'A fatura'),
  reservaSerieId: esquemaId.nullable(),
  observacao: textoOpcional(500, 'A observação')
})

const quantidadeParcelas = z
  .number({ error: 'Informe o número de parcelas.' })
  .int('Informe um número inteiro de parcelas.')
  .min(1, 'Informe ao menos 1 parcela.')
  .max(600, 'Máximo de 600 parcelas.')

const esquemaDia = z
  .number({ error: 'Informe o dia.' })
  .int('Informe um dia entre 1 e 31.')
  .min(1, 'Informe um dia entre 1 e 31.')
  .max(31, 'Informe um dia entre 1 e 31.')

export const esquemaCriarLancamento = camposLancamento
  .extend({
    tipo: z.enum(TIPOS),
    repeticao: z.enum(REPETICOES),
    data: esquemaData,
    /** Dia original, quando difere da data (ex.: dia 31 começando em fevereiro). */
    dia: esquemaDia.nullable().optional(),
    parcelaInicial: quantidadeParcelas.nullable(),
    parcelasTotal: quantidadeParcelas.nullable(),
    jaRealizado: z.boolean()
  })
  .superRefine((v, ctx) => {
    const erro = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (v.repeticao === 'parcelado') {
      if (v.parcelasTotal === null) erro('Informe o total de parcelas.')
      if (v.parcelaInicial === null) erro('Informe a parcela do primeiro mês.')
      if (v.parcelasTotal !== null && v.parcelaInicial !== null && v.parcelaInicial > v.parcelasTotal) {
        erro('A parcela do primeiro mês não pode ser maior que o total de parcelas.')
      }
    } else if (v.parcelasTotal !== null || v.parcelaInicial !== null) {
      erro('Parcelas só se aplicam a lançamentos parcelados.')
    }
    if (ehReserva(v.tipo) && v.jaRealizado) {
      erro('Reservas não têm valor realizado. Registre o uso com um gasto ou aporte.')
    }
    if (v.reservaSerieId !== null && reservaAceitaPor(v.tipo) === null) {
      erro('Este tipo de lançamento não pode usar uma reserva.')
    }
  })

export const esquemaEditarOcorrencia = camposLancamento.extend({
  serieId: esquemaId,
  mes: esquemaMes,
  data: esquemaData
})

export const esquemaEditarAPartirDe = camposLancamento.extend({
  serieId: esquemaId,
  aPartirDe: esquemaMes,
  dia: esquemaDia,
  parcelasTotal: quantidadeParcelas.nullable(),
  confirmarRealizadas: z.boolean()
})

export const esquemaRegistrarRealizado = z
  .object({
    serieId: esquemaId,
    mes: esquemaMes,
    realizadoCentavos: z
      .number({ error: 'Informe um valor válido.' })
      .int('Informe um valor válido.')
      .min(0, 'O valor não pode ser negativo.')
      .max(MAXIMO_CENTAVOS, 'Valor alto demais.')
      .nullable(),
    dataRealizacao: esquemaData.nullable()
  })
  .refine((v) => v.realizadoCentavos === null || v.dataRealizacao !== null, {
    message: 'Informe a data em que o valor foi realizado.'
  })

export const esquemaExcluirOcorrencia = z.object({
  serieId: esquemaId,
  mes: esquemaMes,
  escopo: z.enum(['esta', 'esta_e_futuras']),
  confirmarRealizadas: z.boolean()
})

export const esquemaEncerrarSerie = z.object({
  serieId: esquemaId,
  ultimoMes: esquemaMes,
  confirmarRealizadas: z.boolean()
})

const nomeCategoria = z.string().trim().min(1, 'Informe o nome da categoria.').max(60, 'Nome muito longo.')

export const esquemaCriarCategoria = z.object({ nome: nomeCategoria })
export const esquemaRenomearCategoria = z.object({ id: esquemaId, nome: nomeCategoria })
export const esquemaCategoriaAtiva = z.object({ id: esquemaId, ativa: z.boolean() })
export const esquemaIdCategoria = z.object({ id: esquemaId })
export const esquemaVazio = z.undefined()

export type CriarLancamento = z.output<typeof esquemaCriarLancamento>
export type EditarOcorrencia = z.output<typeof esquemaEditarOcorrencia>
export type EditarAPartirDe = z.output<typeof esquemaEditarAPartirDe>
export type RegistrarRealizado = z.output<typeof esquemaRegistrarRealizado>
export type ExcluirOcorrencia = z.output<typeof esquemaExcluirOcorrencia>
export type EncerrarSerie = z.output<typeof esquemaEncerrarSerie>

/** Primeira mensagem de erro de uma validação, para mostrar ao usuário. */
export function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? 'Dados inválidos.'
}
