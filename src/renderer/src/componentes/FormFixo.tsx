import { useState, type FormEvent } from 'react'
import { dataNoMes, mesValido } from '../../../shared/datas'
import { reaisParaCentavos } from '../../../shared/dinheiro'
import {
  esquemaCriarCategoria,
  esquemaCriarLancamento,
  primeiraMensagem
} from '../../../shared/esquemas'
import {
  FORMAS_PAGAMENTO,
  ROTULOS_FORMA,
  type Categoria,
  type FormaPagamento
} from '../../../shared/tipos'
import { chamar, mensagemDe } from '../api'
import { Aviso, Dialogo } from './Basicos'

const NOVA_CATEGORIA = 'nova'

/** Cadastro direto de um valor que se repete todo mês: salário ou conta fixa. */
export function FormFixo({
  tipo,
  mes,
  categorias,
  faturas,
  aoFechar,
  aoSalvar
}: {
  tipo: 'receita' | 'compromisso'
  mes: string
  categorias: Categoria[]
  faturas: string[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const renda = tipo === 'receita'
  const salario = categorias.find((c) => c.nome === 'Salário' && c.ativa)

  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [dia, setDia] = useState('')
  const [mesInicial, setMesInicial] = useState(mes)
  const [categoriaId, setCategoriaId] = useState(renda && salario ? String(salario.id) : '')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [forma, setForma] = useState('')
  const [fatura, setFatura] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const categoriaEscolhida = categorias.find((c) => String(c.id) === categoriaId)
  const credito = forma === 'credito'

  async function resolverCategoria(): Promise<number | null> {
    if (categoriaId !== NOVA_CATEGORIA) return categoriaId ? Number(categoriaId) : null
    await chamar('criarCategoria', { nome: novaCategoria.trim() })
    const lista = await chamar('listarCategorias')
    const alvo = novaCategoria.trim().toLocaleLowerCase('pt-BR')
    return lista.find((c) => c.nome.toLocaleLowerCase('pt-BR') === alvo)?.id ?? null
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const valorCentavos = reaisParaCentavos(valor)
    if (valorCentavos === null) return setErro('Informe o valor em reais, por exemplo 1.234,56.')
    const numeroDia = Number(dia)
    if (!Number.isInteger(numeroDia) || numeroDia < 1 || numeroDia > 31) {
      return setErro('Informe um dia entre 1 e 31.')
    }
    if (!mesValido(mesInicial)) return setErro('Informe o mês de início.')
    if (categoriaId === NOVA_CATEGORIA) {
      const r = esquemaCriarCategoria.safeParse({ nome: novaCategoria })
      if (!r.success) return setErro(primeiraMensagem(r.error))
    }

    const base = {
      tipo,
      repeticao: 'recorrente' as const,
      nome,
      valorCentavos,
      data: dataNoMes(mesInicial, numeroDia),
      dia: numeroDia,
      formaPagamento: (forma || null) as FormaPagamento | null,
      fatura: credito ? fatura || null : null,
      reservaSerieId: null,
      observacao: null,
      parcelaInicial: null,
      parcelasTotal: null,
      jaRealizado: false
    }
    const previa = esquemaCriarLancamento.safeParse({ ...base, categoriaId: null })
    if (!previa.success) return setErro(primeiraMensagem(previa.error))

    setSalvando(true)
    try {
      const id = await resolverCategoria()
      await chamar('criarLancamento', { ...previa.data, categoriaId: id })
      aoSalvar()
    } catch (falha) {
      setErro(mensagemDe(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialogo titulo={renda ? 'Nova renda fixa' : 'Nova despesa fixa'} aoFechar={aoFechar} largo>
      <form onSubmit={salvar} noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="grade-form">
          <div className="campo campo-inteiro">
            <label htmlFor="fixo-nome">Nome</label>
            <input
              id="fixo-nome"
              autoFocus
              maxLength={120}
              placeholder={renda ? 'Ex.: Salário' : 'Ex.: Conta de luz'}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="fixo-valor">Valor mensal (R$)</label>
            <input
              id="fixo-valor"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            {!renda && <small>Em contas que variam, use uma média. O valor real entra ao pagar.</small>}
          </div>

          <div className="campo">
            <label htmlFor="fixo-dia">{renda ? 'Dia do recebimento' : 'Dia do vencimento'}</label>
            <input
              id="fixo-dia"
              type="number"
              min={1}
              max={31}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            />
            <small>Em meses mais curtos, vale o último dia do mês.</small>
          </div>

          <div className="campo">
            <label htmlFor="fixo-inicio">Começa em</label>
            <input
              id="fixo-inicio"
              type="month"
              value={mesInicial}
              onChange={(e) => setMesInicial(e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="fixo-categoria">Categoria</label>
            <select
              id="fixo-categoria"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categorias
                .filter((c) => c.ativa)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              <option value={NOVA_CATEGORIA}>Criar nova categoria…</option>
            </select>
            {categoriaEscolhida?.nome === 'Cartão de crédito' && (
              <small>
                Use para custos do cartão, como anuidade. Não cadastre o total da fatura aqui se
                também registrar as compras dela: o valor contaria duas vezes.
              </small>
            )}
          </div>

          {categoriaId === NOVA_CATEGORIA && (
            <div className="campo campo-inteiro">
              <label htmlFor="fixo-nova-categoria">Nome da nova categoria</label>
              <input
                id="fixo-nova-categoria"
                maxLength={60}
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
              />
            </div>
          )}

          {!renda && (
            <div className="campo">
              <label htmlFor="fixo-forma">Forma de pagamento</label>
              <select id="fixo-forma" value={forma} onChange={(e) => setForma(e.target.value)}>
                <option value="">Não informar</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULOS_FORMA[f]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {credito && (
            <div className="campo">
              <label htmlFor="fixo-fatura">Fatura (opcional)</label>
              <input
                id="fixo-fatura"
                list="fixo-faturas"
                maxLength={80}
                placeholder="Ex.: Cartão Nubank"
                value={fatura}
                onChange={(e) => setFatura(e.target.value)}
              />
              <datalist id="fixo-faturas">
                {faturas.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
          )}
        </div>

        <div className="acoes-dialogo">
          <button type="button" className="botao" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialogo>
  )
}
